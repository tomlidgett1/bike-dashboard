import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_FIELD_MAPPING,
  type FieldMapping,
} from "@/lib/scrapers/fesports-field-mapping";
import { requireSupplierScraperManager } from "@/lib/scrapers/supplier-auth";
import { runSupplierScraper } from "@/lib/scrapers/supplier-engine";
import { fetchAlternatePhotosForProducts } from "@/lib/scrapers/supplier-alternate-photos";
import {
  createSupplierSseStream,
  SupplierScraperLogger,
} from "@/lib/scrapers/supplier-logger";
import { materialiseSupplierImportItems } from "@/lib/scrapers/supplier-product-items";
import { decryptSupplierCredentials } from "@/lib/scrapers/supplier-security";
import { loadSupplierScraperRow } from "@/lib/scrapers/supplier-storage";
import type {
  AlternatePhotoSourceConfig,
  SupplierBrowseMode,
  SupplierProductMatches,
  SupplierScrapedProduct,
  SupplierScrapeTarget,
} from "@/lib/scrapers/supplier-types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface ExistingProductRow {
  id: string;
  supplier_product_id: string | null;
  display_name: string | null;
  brand: string | null;
  price: number | null;
  qoh: number | null;
  system_sku: string | null;
  product_description: string | null;
  product_specs: string | null;
  marketplace_category: string | null;
  marketplace_subcategory: string | null;
}

function normalise(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function valuesDiffer(current: unknown, next: unknown): boolean {
  if (typeof current === "number" || typeof next === "number") {
    const currentNumber = Number(current);
    const nextNumber = Number(next);
    if (Number.isFinite(currentNumber) && Number.isFinite(nextNumber)) {
      return Math.abs(currentNumber - nextNumber) > 0.001;
    }
  }
  return normalise(current) !== normalise(next);
}

function buildMatches(
  products: SupplierScrapedProduct[],
  mapping: FieldMapping,
  existingRows: ExistingProductRow[],
): SupplierProductMatches {
  const existingBySourceId = new Map(
    existingRows
      .filter((row) => row.supplier_product_id)
      .map((row) => [row.supplier_product_id as string, row]),
  );
  const matches: SupplierProductMatches = {};

  for (const product of products) {
    const items = materialiseSupplierImportItems(product, mapping);
    const existingProductIds: string[] = [];
    const changes = new Set<string>();
    let existingCount = 0;

    for (const item of items) {
      const existing = existingBySourceId.get(item.sourceId);
      if (!existing) {
        if (items.length > 1) changes.add(`New variant: ${item.optionValue ?? item.display_name}`);
        continue;
      }

      existingCount += 1;
      existingProductIds.push(existing.id);
      const comparisons: Array<[string, unknown, unknown]> = [
        ["Product name", existing.display_name, item.display_name],
        ["Brand", existing.brand, item.brand],
        ["Price", existing.price, item.price],
        ["Stock", existing.qoh, item.qoh],
        ["SKU", existing.system_sku, item.system_sku],
        ["Description", existing.product_description, item.product_description],
        ["Specifications", existing.product_specs, item.product_specs],
        ["Category", existing.marketplace_category, item.marketplace_category],
        ["Subcategory", existing.marketplace_subcategory, item.marketplace_subcategory],
      ];
      for (const [label, current, next] of comparisons) {
        if (valuesDiffer(current, next)) changes.add(label);
      }
    }

    matches[product.productId] = {
      status:
        existingCount === 0
          ? "new"
          : changes.size > 0 || existingCount < items.length
            ? "changed"
            : "unchanged",
      existingProductIds,
      changes: [...changes],
    };
  }

  return matches;
}

function normaliseAlternatePhotoConfig(
  value: unknown,
): AlternatePhotoSourceConfig | null {
  if (!value || typeof value !== "object") return null;
  const config = value as Record<string, unknown>;
  const websiteUrl = typeof config.websiteUrl === "string" ? config.websiteUrl.trim() : "";
  if (!websiteUrl) return null;
  return {
    enabled: config.enabled !== false,
    websiteUrl,
    sourceName:
      typeof config.sourceName === "string" && config.sourceName.trim()
        ? config.sourceName.trim().slice(0, 120)
        : new URL(websiteUrl).hostname,
    searchUrlTemplate:
      typeof config.searchUrlTemplate === "string" && config.searchUrlTemplate.trim()
        ? config.searchUrlTemplate.trim()
        : null,
  };
}

function normaliseScrapeTargets(value: unknown): SupplierScrapeTarget[] {
  if (!Array.isArray(value)) return [];
  const targets: SupplierScrapeTarget[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    const name = typeof row.name === "string" ? row.name : "";
    const url = typeof row.url === "string" ? row.url : "";
    if (!id || !url) continue;
    targets.push({
      id,
      name: name || id,
      url,
      parentId: typeof row.parentId === "string" ? row.parentId : null,
    });
  }
  return targets;
}

async function executeSupplierRun(
  auth: Awaited<ReturnType<typeof requireSupplierScraperManager>> & object,
  scraperId: string,
  body: {
    mode?: unknown;
    optionIds?: unknown;
    maxProducts?: unknown;
    scrapeTargets?: unknown;
    alternatePhotoSource?: unknown;
  },
  logger: SupplierScraperLogger,
  send?: (payload: Record<string, unknown>) => void,
) {
  if ("error" in auth) throw new Error("Unauthorised.");

  const scraper = await loadSupplierScraperRow(auth, scraperId);
  const mode: SupplierBrowseMode = body.mode === "brand" ? "brand" : "category";
  if (!scraper.config.browseModes.includes(mode)) {
    throw new Error(`This scraper does not support browsing by ${mode}.`);
  }
  const optionIds = Array.isArray(body.optionIds)
    ? body.optionIds.filter((value): value is string => typeof value === "string")
    : [];
  const scrapeTargets = normaliseScrapeTargets(body.scrapeTargets);
  const parsedLimit = Number(body.maxProducts);
  const maxProducts =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(Math.floor(parsedLimit), 5000)
      : null;

  await auth.supabase
    .from("store_supplier_scrapers")
    .update({
      last_run_at: new Date().toISOString(),
      last_run_status: "running",
      last_error: null,
    })
    .eq("id", scraperId)
    .eq("owner_user_id", auth.user.id);

  const credentials = decryptSupplierCredentials(scraper.credential_ciphertext);
  let products = await runSupplierScraper({
    config: scraper.config,
    credentials,
    mode,
    optionIds,
    scrapeTargets: scrapeTargets.length > 0 ? scrapeTargets : undefined,
    maxProducts,
    logger,
    onScrapeStarted: send
      ? (total) => {
          send({ event: "scrape_started", total });
        }
      : undefined,
    onProductScraped: send
      ? (product, progress) => {
          send({ event: "product", product, progress });
        }
      : undefined,
  });

  const alternatePhotoSource =
    normaliseAlternatePhotoConfig(body.alternatePhotoSource) ||
    scraper.config.alternatePhotoSource ||
    null;

  if (alternatePhotoSource?.enabled && alternatePhotoSource.websiteUrl && products.length > 0) {
    send?.({ event: "alternate_photos_started", total: products.length });
    logger.step("alternate-photo", "Matching official photos during scrape", {
      websiteUrl: alternatePhotoSource.websiteUrl,
      products: products.length,
    });
    const batchSize = 100;
    const enrichedAll: SupplierScrapedProduct[] = [];
    for (let start = 0; start < products.length; start += batchSize) {
      const batch = products.slice(start, start + batchSize);
      const enriched = await fetchAlternatePhotosForProducts({
        products: batch,
        config: alternatePhotoSource,
        logger,
        onProductMatched: send
          ? (product, progress) => {
              send({
                event: "product",
                product,
                progress: {
                  index: start + progress.index,
                  total: products.length,
                },
                photoMatch: true,
              });
            }
          : undefined,
      });
      enrichedAll.push(...enriched);
    }
    products = enrichedAll;
  }

  const mapping =
    scraper.field_mapping && Object.keys(scraper.field_mapping).length > 0
      ? scraper.field_mapping
      : DEFAULT_FIELD_MAPPING;
  const sourceIds = products.flatMap((product) =>
    materialiseSupplierImportItems(product, mapping).map((item) => item.sourceId),
  );
  const { data: existingRows, error: existingError } = sourceIds.length
    ? await auth.supabase
        .from("products")
        .select(
          "id, supplier_product_id, display_name, brand, price, qoh, system_sku, product_description, product_specs, marketplace_category, marketplace_subcategory",
        )
        .eq("user_id", auth.user.id)
        .eq("supplier_scraper_id", scraperId)
        .in("supplier_product_id", sourceIds)
    : { data: [], error: null };
  if (existingError) throw new Error(existingError.message);

  const matches = buildMatches(
    products,
    mapping,
    (existingRows ?? []) as ExistingProductRow[],
  );
  const summary = {
    products: products.length,
    images: products.reduce((sum, product) => sum + product.imageUrls.length, 0),
    officialPhotoMatches: products.filter(
      (product) => product.alternatePhoto?.status === "matched",
    ).length,
    new: Object.values(matches).filter((match) => match.status === "new").length,
    changed: Object.values(matches).filter((match) => match.status === "changed").length,
    unchanged: Object.values(matches).filter((match) => match.status === "unchanged").length,
    mode,
  };

  await auth.supabase
    .from("store_supplier_scrapers")
    .update({
      last_run_status: "succeeded",
      last_run_summary: summary,
      last_error: null,
      ...(alternatePhotoSource
        ? {
            config: {
              ...scraper.config,
              alternatePhotoSource,
            },
          }
        : {}),
    })
    .eq("id", scraperId)
    .eq("owner_user_id", auth.user.id);

  return {
    success: true,
    products,
    matches,
    summary,
    fieldMapping: mapping,
    logs: logger.getEntries(),
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSupplierScraperManager();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = (await request.json()) as {
    mode?: unknown;
    optionIds?: unknown;
    maxProducts?: unknown;
  };
  const wantsStream = request.headers.get("accept")?.includes("text/event-stream");

  if (wantsStream) {
    return createSupplierSseStream(async (send, logger) => {
      try {
        const result = await executeSupplierRun(auth, id, body, logger, send);
        send({ event: "result", ...result });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "The supplier scrape failed.";
        await auth.supabase
          .from("store_supplier_scrapers")
          .update({
            last_run_status: "failed",
            last_error: message.slice(0, 1_000),
          })
          .eq("id", id)
          .eq("owner_user_id", auth.user.id);
        throw error;
      }
    });
  }

  try {
    const logger = new SupplierScraperLogger();
    const result = await executeSupplierRun(auth, id, body, logger);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[supplier-scrapers/run]", error);
    const message =
      error instanceof Error ? error.message : "The supplier scrape failed.";
    if (id) {
      await auth.supabase
        .from("store_supplier_scrapers")
        .update({
          last_run_status: "failed",
          last_error: message.slice(0, 1_000),
        })
        .eq("id", id)
        .eq("owner_user_id", auth.user.id);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
