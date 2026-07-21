import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertSafeSupplierUrl,
  encryptSupplierCredentials,
  type SupplierCredentials,
} from "@/lib/scrapers/supplier-security";
import type {
  SupplierScrapeTarget,
  SupplierScraperConfig,
} from "@/lib/scrapers/supplier-types";
import {
  cancelActiveCatalogueRuns,
  type CrawlCheckpoint,
} from "@/lib/supplier-catalogue/advance";

export interface CreateCatalogueInput {
  admin: SupabaseClient;
  name?: string | null;
  baseUrl: string;
  loginUrl?: string | null;
  username: string;
  password: string;
  startCrawl?: boolean;
  discoverOnly?: boolean;
  maxProductsPerTarget?: number | null;
}

export interface CatalogueRow {
  id: string;
  name: string;
  base_url: string;
  login_url: string;
  credential_ciphertext: string;
  scrape_config: SupplierScraperConfig | Record<string, unknown>;
  status: string;
}

export interface EnqueueCatalogueCrawlOptions {
  maxProductsPerTarget?: number | null;
  /** Discover layout then pause for brand/category selection. */
  pauseAfterDiscover?: boolean;
  mode?: "brand" | "category";
  targets?: SupplierScrapeTarget[];
  /** Limit crawl to selected targets (no sitemap / browse expansion / coverage). */
  scoped?: boolean;
  skipCoverage?: boolean;
}

async function updateCatalogue(
  admin: SupabaseClient,
  catalogueId: string,
  patch: Record<string, unknown>,
) {
  await admin.from("supplier_catalogues").update(patch).eq("id", catalogueId);
}

export async function createSupplierCatalogue(
  input: CreateCatalogueInput,
): Promise<{ catalogueId: string; runId: string | null }> {
  const baseUrl = await assertSafeSupplierUrl(input.baseUrl);
  const loginUrl = await assertSafeSupplierUrl(
    input.loginUrl?.trim() || baseUrl.toString(),
    baseUrl.hostname,
  );
  const credentials: SupplierCredentials = {
    username: input.username.trim(),
    password: input.password,
  };
  if (!credentials.username || !credentials.password) {
    throw new Error("Username and password are required.");
  }

  const name =
    input.name?.trim() ||
    baseUrl.hostname.replace(/^www\./, "") ||
    "Supplier";

  const ciphertext = encryptSupplierCredentials(credentials);

  const { data: existing } = await input.admin
    .from("supplier_catalogues")
    .select("id")
    .ilike("base_url", baseUrl.toString())
    .maybeSingle();

  let catalogueId: string;
  if (existing?.id) {
    catalogueId = existing.id;
    await updateCatalogue(input.admin, catalogueId, {
      name,
      login_url: loginUrl.toString(),
      credential_ciphertext: ciphertext,
      status: "pending",
      last_error: null,
    });
  } else {
    const { data, error } = await input.admin
      .from("supplier_catalogues")
      .insert({
        name,
        base_url: baseUrl.toString(),
        login_url: loginUrl.toString(),
        credential_ciphertext: ciphertext,
        status: "pending",
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(error?.message || "Failed to create supplier catalogue");
    }
    catalogueId = data.id;
  }

  const discoverOnly = input.discoverOnly === true;
  const startCrawl = input.startCrawl === true;

  if (!discoverOnly && !startCrawl) {
    return { catalogueId, runId: null };
  }

  const runId = await enqueueCatalogueCrawl(input.admin, catalogueId, {
    maxProductsPerTarget: input.maxProductsPerTarget ?? null,
    pauseAfterDiscover: discoverOnly,
  });
  return { catalogueId, runId };
}

export async function enqueueCatalogueCrawl(
  admin: SupabaseClient,
  catalogueId: string,
  options?: EnqueueCatalogueCrawlOptions,
): Promise<string> {
  await cancelActiveCatalogueRuns(admin, catalogueId);

  const targets = Array.isArray(options?.targets) ? options.targets : [];
  const hasTargets = targets.length > 0;
  const scoped = options?.scoped ?? hasTargets;
  const pauseAfterDiscover =
    options?.pauseAfterDiscover === true && !hasTargets;
  const skipCoverage = options?.skipCoverage ?? scoped;

  const checkpoint: CrawlCheckpoint = {
    phase: hasTargets ? "collecting_urls" : "queued",
    mode: options?.mode,
    targets,
    maxProductsPerTarget: options?.maxProductsPerTarget ?? null,
    targetIndex: 0,
    productQueue: [],
    nextProductIndex: 0,
    enrichOffset: 0,
    pauseAfterDiscover,
    scoped,
    skipCoverage,
    // Scoped runs skip sitemap seeding entirely.
    sitemapSeeded: scoped,
  };

  const { data, error } = await admin
    .from("supplier_catalogue_scrape_runs")
    .insert({
      catalogue_id: catalogueId,
      status: hasTargets ? "crawling" : "queued",
      phase: checkpoint.phase,
      coverage_status: skipCoverage ? "unknown" : "verifying",
      checkpoint,
      progress: {
        message: pauseAfterDiscover
          ? "Queued for layout discovery"
          : hasTargets
            ? `Queued scoped crawl (${targets.length} targets)`
            : "Queued for durable crawl",
        scoped,
        awaitingSelection: false,
      },
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to enqueue scrape run");
  }

  await updateCatalogue(admin, catalogueId, {
    last_run_at: new Date().toISOString(),
    last_run_status: "running",
    status: hasTargets ? "crawling" : "discovering",
    coverage_status: skipCoverage ? "unknown" : "verifying",
    authoritative_total: null,
    authoritative_source: null,
    coverage_summary: {},
    coverage_verified_at: null,
    last_error: null,
  });

  return data.id;
}

/** Prefer advanceCatalogueCrawlChunk; this loops chunks to completion (scripts). */
export { runCatalogueCrawlToCompletion as runCatalogueCrawl } from "@/lib/supplier-catalogue/advance";
