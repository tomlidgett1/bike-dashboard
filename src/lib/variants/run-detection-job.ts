// ============================================================
// Variant detection job worker (chunked, resumable)
// ============================================================
// Phase 1 (preparing): fetch the scope products, pre-filter into buckets,
// store them on the run. Phases 2+ (analysing): process a few buckets per
// invocation through the AI, write detection candidates, and self-chain
// until every bucket is done. A failed AI call skips its bucket without
// failing the whole run.

import OpenAI from "openai";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { buildVariantBuckets, countBucketedProducts } from "@/lib/variants/prefilter";
import { mapRawGroupsToCandidates, collectOptionValues } from "@/lib/variants/grouping";
import { detectVariantGroupsForBucket } from "@/lib/ai/detect-product-variants";
import type { VariantBucket, VariantCandidateProduct } from "@/lib/variants/types";

export type VariantDetectionScope = {
  categories: string[];
  brands: string[];
  all_products: boolean;
};

type RunMetadata = {
  buckets?: VariantBucket[];
  processedBucketKeys?: string[];
};

const PRODUCT_PAGE_SIZE = 1000;
const MAX_PRODUCTS = 10_000;

function supabase() {
  return createServiceRoleClient();
}

async function updateRun(runId: string, patch: Record<string, unknown>) {
  const { error } = await supabase()
    .from("product_variant_detection_runs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", runId);
  if (error) console.error("[variant-detection] run update failed", runId, error.message);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toCandidateProduct(row: any): VariantCandidateProduct {
  return {
    product_id: row.id,
    lightspeed_item_id: row.lightspeed_item_id ?? null,
    title: (row.display_name || row.description || "").trim(),
    // Raw Lightspeed listing text — kept separate from the cleaned title so the
    // detector can recover a size/colour the Yellow Jersey name may have dropped.
    lightspeed_description: (row.description ?? "").trim() || null,
    brand: row.brand || row.manufacturer_name || null,
    category_name: row.category_name ?? null,
    marketplace_category: row.marketplace_category ?? null,
    system_sku: row.system_sku ?? null,
    custom_sku: row.custom_sku ?? null,
    // products has no manufacturer_sku column (it lives on the Lightspeed mirror);
    // system/custom SKU + the raw description already cover size recovery.
    manufacturer_sku: null,
    upc: row.upc ?? null,
    price: typeof row.price === "number" ? row.price : row.price ? Number(row.price) : null,
    qoh: typeof row.qoh === "number" ? row.qoh : row.qoh ? Number(row.qoh) : null,
    model_year: row.model_year ?? null,
    size: row.size ?? null,
    frame_size: row.frame_size ?? null,
    wheel_size: row.wheel_size ?? null,
    color_primary: row.color_primary ?? null,
    color_secondary: row.color_secondary ?? null,
    image_url: row.primary_image_url ?? null,
  };
}

function matchesScope(p: VariantCandidateProduct, scope: VariantDetectionScope): boolean {
  if (scope.all_products) return true;
  const cats = scope.categories.map((c) => c.toLowerCase());
  const brands = scope.brands.map((b) => b.toLowerCase());
  const inCategory = !!p.category_name && cats.includes(p.category_name.toLowerCase());
  const inBrand = !!p.brand && brands.includes(p.brand.toLowerCase());
  return inCategory || inBrand;
}

async function fetchScopeProducts(userId: string, scope: VariantDetectionScope): Promise<VariantCandidateProduct[]> {
  const db = supabase();
  const products: VariantCandidateProduct[] = [];

  for (let page = 0; page * PRODUCT_PAGE_SIZE < MAX_PRODUCTS; page++) {
    const from = page * PRODUCT_PAGE_SIZE;
    const { data, error } = await db
      .from("products")
      .select(
        "id, lightspeed_item_id, display_name, description, brand, manufacturer_name, category_name, marketplace_category, system_sku, custom_sku, upc, price, qoh, model_year, size, frame_size, wheel_size, color_primary, color_secondary, primary_image_url",
      )
      .eq("user_id", userId)
      .eq("is_active", true)
      .is("variant_group_id", null) // never re-group products already in a group
      .range(from, from + PRODUCT_PAGE_SIZE - 1);

    if (error) throw new Error(`Failed to load products: ${error.message}`);
    const rows = data ?? [];
    for (const row of rows) {
      const p = toCandidateProduct(row);
      if (p.title && matchesScope(p, scope)) products.push(p);
    }
    if (rows.length < PRODUCT_PAGE_SIZE) break;
  }

  return products;
}

async function prepareBuckets(runId: string, userId: string, scope: VariantDetectionScope): Promise<VariantBucket[]> {
  await updateRun(runId, { status: "running", phase: "preparing", message: "Preparing products…", started_at: new Date().toISOString() });

  const products = await fetchScopeProducts(userId, scope);
  const buckets = buildVariantBuckets(products);

  const metadata: RunMetadata = { buckets, processedBucketKeys: [] };
  await updateRun(runId, {
    metadata,
    products_total: products.length,
    buckets_total: buckets.length,
    buckets_done: 0,
    phase: buckets.length ? "analysing" : "ready",
    message: buckets.length
      ? `Analysing ${countBucketedProducts(buckets)} products in ${buckets.length} possible groups…`
      : "No likely variant groups found",
    ...(buckets.length ? {} : { status: "ready", completed_at: new Date().toISOString() }),
  });

  return buckets;
}

async function persistCandidate(
  userId: string,
  runId: string,
  bucket: VariantBucket,
  openai: OpenAI,
): Promise<number> {
  const { groups, refToProductId } = await detectVariantGroupsForBucket(openai, bucket);
  const candidates = mapRawGroupsToCandidates(bucket, groups, refToProductId);
  const db = supabase();
  let written = 0;

  for (const candidate of candidates) {
    const { data: row, error } = await db
      .from("product_variant_detection_candidates")
      .insert({
        run_id: runId,
        user_id: userId,
        status: "pending",
        proposed_master_title: candidate.proposed_master_title,
        base_title: candidate.base_title,
        brand: candidate.brand,
        category_name: candidate.category_name,
        option_types: candidate.option_types,
        items: candidate.items,
        confidence: candidate.confidence,
        explanation: candidate.explanation,
        warnings: candidate.warnings,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[variant-detection] candidate insert failed", error.message);
      continue;
    }
    written++;
    await db.from("product_variant_audit_logs").insert({
      user_id: userId,
      candidate_id: row.id,
      run_id: runId,
      action: "detected",
      detail: {
        master_title: candidate.proposed_master_title,
        item_count: candidate.items.length,
        confidence: candidate.confidence,
        option_values: collectOptionValues(candidate),
      },
    });
  }

  return written;
}

/**
 * Returns true when the run is fully complete. Returns false when more
 * buckets remain (the caller should chain the next chunk).
 */
export async function runVariantDetectionJob(params: {
  runId: string;
  userId: string;
  maxBuckets?: number;
}): Promise<boolean> {
  const { runId, userId, maxBuckets = 6 } = params;
  const db = supabase();

  try {
    const { data: run } = await db
      .from("product_variant_detection_runs")
      .select("status, scope, metadata, candidates_total")
      .eq("id", runId)
      .maybeSingle();

    if (!run) throw new Error("Detection run not found");
    if (run.status === "cancelled") return true;

    const scope = (run.scope ?? { categories: [], brands: [], all_products: false }) as VariantDetectionScope;
    let metadata = (run.metadata ?? {}) as RunMetadata;

    // Phase 1: build buckets on the first chunk.
    if (!metadata.buckets) {
      const buckets = await prepareBuckets(runId, userId, scope);
      if (buckets.length === 0) return true;
      metadata = { buckets, processedBucketKeys: [] };
    }

    const buckets = metadata.buckets ?? [];
    const processed = new Set(metadata.processedBucketKeys ?? []);
    const pending = buckets.filter((b) => !processed.has(b.key));

    if (pending.length === 0) {
      await updateRun(runId, { status: "ready", phase: "ready", message: "Ready for review", completed_at: new Date().toISOString() });
      return true;
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    let candidatesTotal = (run.candidates_total as number) ?? 0;
    let processedThisChunk = 0;

    for (const bucket of pending) {
      if (processedThisChunk >= maxBuckets) break;

      try {
        candidatesTotal += await persistCandidate(userId, runId, bucket, openai);
      } catch (error) {
        // A failed AI call must not fail the whole run — skip this bucket.
        console.error("[variant-detection] bucket failed", bucket.key, error instanceof Error ? error.message : error);
      }

      processed.add(bucket.key);
      processedThisChunk++;

      await updateRun(runId, {
        phase: "building",
        metadata: { ...metadata, processedBucketKeys: [...processed] },
        buckets_done: processed.size,
        candidates_total: candidatesTotal,
        message: `Building suggested groups (${processed.size} of ${buckets.length})…`,
      });
    }

    const allDone = processed.size >= buckets.length;
    if (allDone) {
      await updateRun(runId, { status: "ready", phase: "ready", message: "Ready for review", completed_at: new Date().toISOString() });
      return true;
    }
    return false;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Variant detection failed";
    console.error("[variant-detection]", runId, message);
    await updateRun(runId, { status: "failed", error_message: message, message, completed_at: new Date().toISOString() });
    return true;
  }
}
