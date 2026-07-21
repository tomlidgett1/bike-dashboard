import type { SupabaseClient } from "@supabase/supabase-js";
import { hashSourceImageUrl } from "@/lib/supplier-catalogue/url-queue";

const CLOUDINARY_RE = /res\.cloudinary\.com\//i;
const MAX_ATTEMPTS = 3;
const DEFAULT_LIMIT = 60;
const UPLOAD_CONCURRENCY = 6;

function isHosted(url: string | null | undefined): boolean {
  return Boolean(url && CLOUDINARY_RE.test(url));
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]);
    }
  }

  const runners = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    () => run(),
  );
  await Promise.all(runners);
  return results;
}

async function lookupCachedCdnUrl(
  admin: SupabaseClient,
  sourceUrl: string,
): Promise<string | null> {
  const hash = hashSourceImageUrl(sourceUrl);
  const { data } = await admin
    .from("supplier_catalogue_image_assets")
    .select("cdn_url")
    .eq("source_url_hash", hash)
    .maybeSingle();
  return (data?.cdn_url as string | undefined) ?? null;
}

async function storeCachedCdnUrl(
  admin: SupabaseClient,
  sourceUrl: string,
  cdnUrl: string,
): Promise<void> {
  const hash = hashSourceImageUrl(sourceUrl);
  await admin.from("supplier_catalogue_image_assets").upsert(
    {
      source_url_hash: hash,
      source_url: sourceUrl,
      cdn_url: cdnUrl,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "source_url_hash" },
  );
}

async function uploadHeroToCloudinary(input: {
  supabaseUrl: string;
  token: string;
  productId: string;
  imageUrl: string;
}): Promise<string | null> {
  const response = await fetch(
    `${input.supabaseUrl}/functions/v1/upload-to-cloudinary`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        imageUrl: input.imageUrl,
        // Deterministic-ish folder key; edge fn still adds a timestamp suffix.
        listingId: `supplier-hero-${hashSourceImageUrl(input.imageUrl).slice(0, 24)}`,
        index: 0,
      }),
    },
  );

  if (!response.ok) return null;
  const payload = (await response.json()) as {
    success?: boolean;
    data?: { url?: string };
  };
  return payload.data?.url || null;
}

/**
 * Re-host hero images only (not full galleries) via Cloudinary.
 * Dedupes by source URL hash so identical images across products share one CDN asset.
 * Continues across crawl chunks until pending/failed (retryable) rows are exhausted.
 */
export async function enrichProductImages(input: {
  admin: SupabaseClient;
  catalogueId: string;
  accessToken?: string | null;
  limit?: number;
}): Promise<{ processed: number; remaining: number }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    null;
  const token = input.accessToken || serviceKey;
  if (!supabaseUrl || !token) {
    return { processed: 0, remaining: 0 };
  }

  const limit = input.limit ?? DEFAULT_LIMIT;

  // Recover rows stuck in processing after a crashed enrich chunk
  await input.admin
    .from("supplier_catalogue_products")
    .update({
      image_enrichment_status: "pending",
      updated_at: new Date().toISOString(),
    })
    .eq("catalogue_id", input.catalogueId)
    .eq("image_enrichment_status", "processing")
    .lt("image_enrichment_attempts", MAX_ATTEMPTS);

  const { data: rows, error } = await input.admin
    .from("supplier_catalogue_products")
    .select(
      "id, hero_image_url, hero_image_source_url, image_urls, image_enrichment_status, image_enrichment_attempts",
    )
    .eq("catalogue_id", input.catalogueId)
    .in("image_enrichment_status", ["pending", "failed"])
    .lt("image_enrichment_attempts", MAX_ATTEMPTS)
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (error || !rows?.length) {
    const remaining = await countPendingHeroImages(
      input.admin,
      input.catalogueId,
    );
    return { processed: 0, remaining };
  }

  const ids = rows.map((row) => row.id as string);
  await input.admin
    .from("supplier_catalogue_products")
    .update({
      image_enrichment_status: "processing",
      updated_at: new Date().toISOString(),
    })
    .in("id", ids)
    .in("image_enrichment_status", ["pending", "failed"]);

  let processed = 0;

  await mapPool(rows, UPLOAD_CONCURRENCY, async (row) => {
    const sourceUrl =
      (row.hero_image_source_url as string | null) ||
      (row.hero_image_url as string | null) ||
      (Array.isArray(row.image_urls)
        ? (row.image_urls as string[]).find(Boolean) || null
        : null);

    const attempts = Number(row.image_enrichment_attempts ?? 0) + 1;

    if (!sourceUrl) {
      await input.admin
        .from("supplier_catalogue_products")
        .update({
          image_enrichment_status: "skipped",
          image_enrichment_attempts: attempts,
          image_enrichment_error: null,
          image_enriched_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      processed += 1;
      return;
    }

    if (isHosted(sourceUrl) || isHosted(row.hero_image_url as string | null)) {
      await input.admin
        .from("supplier_catalogue_products")
        .update({
          hero_image_source_url: sourceUrl,
          hero_image_url: isHosted(row.hero_image_url as string | null)
            ? row.hero_image_url
            : sourceUrl,
          image_enrichment_status: "hosted",
          image_enrichment_attempts: attempts,
          image_enrichment_error: null,
          image_enriched_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      processed += 1;
      return;
    }

    try {
      const cached = await lookupCachedCdnUrl(input.admin, sourceUrl);
      const cdnUrl =
        cached ||
        (await uploadHeroToCloudinary({
          supabaseUrl,
          token,
          productId: row.id as string,
          imageUrl: sourceUrl,
        }));

      if (!cdnUrl) {
        throw new Error("Cloudinary upload returned no URL");
      }

      if (!cached) {
        await storeCachedCdnUrl(input.admin, sourceUrl, cdnUrl);
      }

      const existingImages = Array.isArray(row.image_urls)
        ? (row.image_urls as string[])
        : [];
      const nextImages = [
        cdnUrl,
        ...existingImages.filter((url) => url && url !== sourceUrl && url !== cdnUrl),
      ].slice(0, 8);

      await input.admin
        .from("supplier_catalogue_products")
        .update({
          hero_image_source_url: sourceUrl,
          hero_image_url: cdnUrl,
          image_urls: nextImages,
          image_enrichment_status: "hosted",
          image_enrichment_attempts: attempts,
          image_enrichment_error: null,
          image_enriched_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      processed += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Hero image upload failed";
      const status = attempts >= MAX_ATTEMPTS ? "failed" : "pending";
      await input.admin
        .from("supplier_catalogue_products")
        .update({
          hero_image_source_url: sourceUrl,
          image_enrichment_status: status,
          image_enrichment_attempts: attempts,
          image_enrichment_error: message.slice(0, 500),
        })
        .eq("id", row.id);
    }
  });

  const remaining = await countPendingHeroImages(
    input.admin,
    input.catalogueId,
  );
  return { processed, remaining };
}

export async function countPendingHeroImages(
  admin: SupabaseClient,
  catalogueId: string,
): Promise<number> {
  const { count, error } = await admin
    .from("supplier_catalogue_products")
    .select("id", { count: "exact", head: true })
    .eq("catalogue_id", catalogueId)
    .in("image_enrichment_status", ["pending", "failed", "processing"])
    .lt("image_enrichment_attempts", MAX_ATTEMPTS);

  if (error) return 0;
  return count ?? 0;
}

/**
 * Lightweight enrichment for audience/product_type when still unknown.
 * Uses the same heuristics as the normaliser (no LLM round-trip).
 */
export async function enrichSparseProductFields(input: {
  admin: SupabaseClient;
  catalogueId: string;
  limit?: number;
}): Promise<number> {
  const { inferAudience, inferProductType } = await import(
    "@/lib/supplier-catalogue/normalise"
  );

  const { data: rows, error } = await input.admin
    .from("supplier_catalogue_products")
    .select("id, name, brand, description, category_path, audience, product_type")
    .eq("catalogue_id", input.catalogueId)
    .or("audience.eq.unknown,product_type.is.null")
    .limit(input.limit ?? 500);

  if (error || !rows?.length) return 0;

  let updated = 0;
  for (const row of rows) {
    const text = [row.name, row.brand, row.description, ...(row.category_path ?? [])]
      .filter(Boolean)
      .join(" ");
    const { audience } = inferAudience(text);
    const productType =
      row.product_type ||
      inferProductType(
        row.name as string,
        (row.category_path as string[]) ?? [],
        row.description as string | null,
      );

    const patch: Record<string, unknown> = {};
    if (row.audience === "unknown" && audience !== "unknown") {
      patch.audience = audience;
    }
    if (!row.product_type && productType) {
      patch.product_type = productType;
    }
    if (Object.keys(patch).length === 0) continue;

    const { error: updateError } = await input.admin
      .from("supplier_catalogue_products")
      .update(patch)
      .eq("id", row.id);
    if (!updateError) updated += 1;
  }

  return updated;
}
