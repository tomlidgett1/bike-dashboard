import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildSupplierScraper,
  collectSupplierProductUrls,
  scrapeSupplierProductUrls,
} from "@/lib/scrapers/supplier-engine";
import type {
  SupplierScrapeTarget,
  SupplierScraperConfig,
} from "@/lib/scrapers/supplier-types";
import {
  decryptSupplierCredentials,
  type SupplierCredentials,
} from "@/lib/scrapers/supplier-security";
import { SupplierScraperLogger } from "@/lib/scrapers/supplier-logger";
import type { SupplierDiscoveryEvidence } from "@/lib/scrapers/supplier-universal-discovery";
import {
  countPendingHeroImages,
  enrichProductImages,
  enrichSparseProductFields,
} from "@/lib/supplier-catalogue/images";
import { CrawlLogBuffer } from "@/lib/supplier-catalogue/crawl-logs";
import {
  claimScrapeUrls,
  countScrapeUrls,
  enqueueScrapeUrls,
  markScrapeUrlDoneByUrl,
  markScrapeUrlsDone,
  recordScrapeUrlFailures,
  requeueStaleScrapingUrls,
} from "@/lib/supplier-catalogue/url-queue";
import {
  getProductIdsBySourceUrl,
  refreshCatalogueProductCount,
  upsertFromScrapedProducts,
} from "@/lib/supplier-catalogue/upsert";
import {
  mergeDiscoveryEvidence,
  persistDiscoveryEvidence,
  reconcileCatalogueCoverage,
} from "@/lib/supplier-catalogue/reconciliation";

export type CrawlPhase =
  | "queued"
  | "discovering"
  | "collecting_urls"
  | "scraping"
  | "verifying_coverage"
  | "enriching"
  | "done"
  | "failed";

export interface CrawlCheckpoint {
  phase: CrawlPhase;
  mode?: "brand" | "category";
  targets?: SupplierScrapeTarget[];
  targetIndex?: number;
  /** @deprecated Prefer supplier_catalogue_scrape_urls table. Kept for in-flight legacy runs. */
  productQueue?: Array<{ url: string; categoryUrl: string }>;
  nextProductIndex?: number;
  maxProductsPerTarget?: number | null;
  enrichOffset?: number;
  queuedCount?: number;
  /** Consecutive coverage passes that found zero new product URLs. */
  coverageCleanPasses?: number;
  /** Whether sitemap seed has already been pulled for this run. */
  sitemapSeeded?: boolean;
  /** Sanitised source evidence; product URL arrays stay in the queue table. */
  discoveryEvidence?: SupplierDiscoveryEvidence[];
  /** Consecutive chunk-level infrastructure failures. */
  transientFailureCount?: number;
  /** Stop after layout discovery so the user can pick brands/categories. */
  pauseAfterDiscover?: boolean;
  /** User-selected targets only: skip sitemap + browse expansion. */
  scoped?: boolean;
  /** Skip the post-scrape coverage rediscovery pass (typical for scoped crawls). */
  skipCoverage?: boolean;
}

/** Browse targets discovered per chunk (one browser login). */
const TARGETS_PER_CHUNK = 12;
/** Streaming collect processes one target per advance tick for live product counts. */
const STREAM_TARGETS_PER_CHUNK = 1;
/** Product pages scraped per chunk (one browser login). */
const PRODUCTS_PER_CHUNK = 320;
/** Hero images + sparse field rows per enrich chunk. */
const ENRICH_PER_CHUNK = 60;
const ACTIVE_RUN_STATUSES = [
  "queued",
  "discovering",
  "crawling",
  "enriching",
] as const;

/** Set for the duration of advanceCatalogueCrawlChunk so progress writes include live logs. */
let activeCrawlLogBuffer: CrawlLogBuffer | null = null;

interface CatalogueRow {
  id: string;
  name: string;
  base_url: string;
  login_url: string;
  credential_ciphertext: string;
  scrape_config: SupplierScraperConfig | Record<string, unknown>;
  status: string;
}

interface RunRow {
  id: string;
  catalogue_id: string;
  status: string;
  phase: string;
  checkpoint: CrawlCheckpoint | Record<string, unknown> | null;
  progress: Record<string, unknown> | null;
  products_found: number;
  products_upserted: number;
  images_processed: number;
  started_at: string | null;
}

function asCheckpoint(raw: unknown): CrawlCheckpoint {
  if (!raw || typeof raw !== "object") {
    return { phase: "queued" };
  }
  const value = raw as CrawlCheckpoint;
  return {
    phase: value.phase || "queued",
    mode: value.mode,
    targets: Array.isArray(value.targets) ? value.targets : [],
    targetIndex: typeof value.targetIndex === "number" ? value.targetIndex : 0,
    productQueue: Array.isArray(value.productQueue) ? value.productQueue : [],
    nextProductIndex:
      typeof value.nextProductIndex === "number" ? value.nextProductIndex : 0,
    maxProductsPerTarget:
      value.maxProductsPerTarget === undefined
        ? null
        : value.maxProductsPerTarget,
    enrichOffset: typeof value.enrichOffset === "number" ? value.enrichOffset : 0,
    queuedCount: typeof value.queuedCount === "number" ? value.queuedCount : 0,
    coverageCleanPasses:
      typeof value.coverageCleanPasses === "number"
        ? value.coverageCleanPasses
        : 0,
    sitemapSeeded: Boolean(value.sitemapSeeded),
    discoveryEvidence: Array.isArray(value.discoveryEvidence)
      ? value.discoveryEvidence
      : [],
    transientFailureCount:
      typeof value.transientFailureCount === "number"
        ? value.transientFailureCount
        : 0,
    pauseAfterDiscover: Boolean(value.pauseAfterDiscover),
    scoped: Boolean(value.scoped),
    skipCoverage: Boolean(value.skipCoverage),
  };
}

function hasUsableConfig(
  config: SupplierScraperConfig | Record<string, unknown> | null,
): config is SupplierScraperConfig {
  return Boolean(
    config &&
      typeof config === "object" &&
      "productLinkSelector" in config &&
      Boolean((config as SupplierScraperConfig).productLinkSelector),
  );
}

export function buildCatalogueTargets(config: SupplierScraperConfig): {
  mode: "brand" | "category";
  targets: SupplierScrapeTarget[];
} {
  const isFesports = /fesports\.com\.au/i.test(config.baseUrl || config.catalogueUrl || "");
  // FE Sports brand landing pages (/Shop/C_123/Name) are not product grids.
  // Product listings live on category URLs (/Shop/c_230_123/Products/Name).
  const mode =
    isFesports && config.categoryOptions.length > 0
      ? "category"
      : config.browseModes.includes("brand") && config.brandOptions.length > 0
        ? "brand"
        : "category";
  const rawOptions =
    mode === "brand" ? config.brandOptions : config.categoryOptions;
  // Prefer leaf categories over parent "(All)" hubs when children exist.
  const parentUrls = new Set(
    rawOptions
      .map((option) => option.url.replace(/\/$/, "").toLowerCase())
      .filter((url, _index, all) =>
        all.some((other) => other !== url && other.startsWith(`${url}/`)),
      ),
  );
  const options = rawOptions.filter((option) => {
    const base = option.url.replace(/\/$/, "").toLowerCase();
    if (!parentUrls.has(base)) return true;
    return !/\(all\)\s*$/i.test(option.name);
  });
  const targets =
    options.length > 0
      ? options.map((option) => ({
          id: option.id,
          name: option.name,
          url: option.url,
          parentId: option.parentId ?? null,
        }))
      : [
          {
            id: "root",
            name: "Catalogue",
            url: config.catalogueUrl,
          },
        ];
  return { mode, targets };
}

/** @deprecated Use buildCatalogueTargets */
function buildTargets(config: SupplierScraperConfig) {
  return buildCatalogueTargets(config);
}

async function updateRun(
  admin: SupabaseClient,
  runId: string,
  patch: Record<string, unknown>,
  logBuffer?: CrawlLogBuffer,
): Promise<boolean> {
  return updateRunIfActive(admin, runId, patch, logBuffer);
}

/**
 * Only write progress / phase changes while the run is still active.
 * Prevents a finishing chunk from resurrecting a user-stopped crawl.
 */
async function updateRunIfActive(
  admin: SupabaseClient,
  runId: string,
  patch: Record<string, unknown>,
  logBuffer?: CrawlLogBuffer,
): Promise<boolean> {
  const buffer = logBuffer ?? activeCrawlLogBuffer;
  const nextPatch = { ...patch };
  if (buffer) {
    const progress =
      nextPatch.progress && typeof nextPatch.progress === "object"
        ? (nextPatch.progress as Record<string, unknown>)
        : {};
    nextPatch.progress = buffer.withProgress(progress);
  }

  const { data, error } = await admin
    .from("supplier_catalogue_scrape_runs")
    .update({ ...nextPatch, updated_at: new Date().toISOString() })
    .eq("id", runId)
    .in("status", [...ACTIVE_RUN_STATUSES])
    .select("id");

  if (error) {
    throw new Error(error.message || "Failed to update scrape run");
  }
  return (data?.length ?? 0) > 0;
}

async function isRunCancelled(
  admin: SupabaseClient,
  runId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("supplier_catalogue_scrape_runs")
    .select("status")
    .eq("id", runId)
    .maybeSingle();
  return data?.status === "cancelled";
}

async function updateCatalogue(
  admin: SupabaseClient,
  catalogueId: string,
  patch: Record<string, unknown>,
) {
  await admin.from("supplier_catalogues").update(patch).eq("id", catalogueId);
}

export async function cancelActiveCatalogueRuns(
  admin: SupabaseClient,
  catalogueId: string,
  exceptRunId?: string,
  options?: { reason?: string },
): Promise<number> {
  const reason = options?.reason ?? "Superseded by a newer crawl";
  let query = admin
    .from("supplier_catalogue_scrape_runs")
    .update({
      status: "cancelled",
      phase: "cancelled",
      coverage_status: "unverified",
      coverage_summary: {
        status: "unverified",
        reason,
      },
      finished_at: new Date().toISOString(),
      error_message: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("catalogue_id", catalogueId)
    .in("status", [...ACTIVE_RUN_STATUSES]);

  if (exceptRunId) {
    query = query.neq("id", exceptRunId);
  }

  const { data, error } = await query.select("id");
  if (error) {
    throw new Error(error.message || "Failed to cancel active runs");
  }

  const cancelledIds = (data ?? []).map((row) => row.id as string);
  if (cancelledIds.length > 0) {
    await admin
      .from("supplier_catalogue_scrape_urls")
      .update({
        status: "skipped",
        error_message: reason.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .in("run_id", cancelledIds)
      .in("status", ["pending", "scraping"]);
  }

  return cancelledIds.length;
}

/**
 * Stop the active crawl for a catalogue (user-initiated).
 * Self-chained advance workers exit on the next chunk once status is cancelled.
 */
export async function stopCatalogueCrawl(
  admin: SupabaseClient,
  catalogueId: string,
): Promise<{ cancelledRuns: number }> {
  const cancelledRuns = await cancelActiveCatalogueRuns(admin, catalogueId, undefined, {
    reason: "Stopped by user",
  });

  const productCount = await refreshCatalogueProductCount(admin, catalogueId);
  const cataloguePatch: Record<string, unknown> = {
    status: productCount > 0 ? "coverage_unverified" : "pending",
    coverage_status: "unverified",
    coverage_summary: {
      status: "unverified",
      reason: "Crawl stopped before coverage reconciliation",
      productCount,
    },
    last_run_at: new Date().toISOString(),
  };
  if (cancelledRuns > 0) {
    cataloguePatch.last_run_status = "failed";
    cataloguePatch.last_error = "Crawl stopped";
  }
  await updateCatalogue(admin, catalogueId, cataloguePatch);

  return { cancelledRuns };
}

/**
 * Process one durable crawl chunk (discover / collect URLs / scrape / enrich).
 * Returns whether the run is fully complete.
 */
export async function advanceCatalogueCrawlChunk(input: {
  admin: SupabaseClient;
  runId: string;
  accessToken?: string | null;
}): Promise<{ complete: boolean; phase: CrawlPhase }> {
  const { admin, runId } = input;
  const logger = new SupplierScraperLogger();

  const { data: run, error: runError } = await admin
    .from("supplier_catalogue_scrape_runs")
    .select(
      "id, catalogue_id, status, phase, checkpoint, progress, products_found, products_upserted, images_processed, started_at",
    )
    .eq("id", runId)
    .single();

  if (runError || !run) {
    throw new Error(runError?.message || "Scrape run not found");
  }

  const runRow = run as RunRow;
  if (
    runRow.status === "succeeded" ||
    runRow.status === "coverage_unverified" ||
    runRow.status === "incomplete" ||
    runRow.status === "failed" ||
    runRow.status === "cancelled"
  ) {
    return { complete: true, phase: "done" };
  }

  const logBuffer = new CrawlLogBuffer(runRow.progress?.logs);
  const stopWatchingLogs = logBuffer.watch(logger);
  activeCrawlLogBuffer = logBuffer;

  const { data: catalogue, error: catalogueError } = await admin
    .from("supplier_catalogues")
    .select(
      "id, name, base_url, login_url, credential_ciphertext, scrape_config, status",
    )
    .eq("id", runRow.catalogue_id)
    .single();

  if (catalogueError || !catalogue) {
    stopWatchingLogs();
    activeCrawlLogBuffer = null;
    throw new Error(catalogueError?.message || "Catalogue not found");
  }

  const row = catalogue as CatalogueRow;
  const credentials = decryptSupplierCredentials(row.credential_ciphertext);
  const checkpoint = asCheckpoint(runRow.checkpoint);

  try {
    if (!runRow.started_at) {
      const started = await updateRunIfActive(
        admin,
        runId,
        {
          started_at: new Date().toISOString(),
          status: "discovering",
          phase: "discovering",
        },
        logBuffer,
      );
      if (!started) return { complete: true, phase: "done" };
    }

    logger.step("advance", `Chunk start (${checkpoint.phase || "queued"})`);

    const priorProgress =
      runRow.progress && typeof runRow.progress === "object"
        ? (runRow.progress as Record<string, unknown>)
        : {};
    const heartbeat = await updateRunIfActive(
      admin,
      runId,
      {
        progress: {
          ...priorProgress,
          message:
            checkpoint.phase === "collecting_urls"
              ? priorProgress.message &&
                typeof priorProgress.message === "string" &&
                !String(priorProgress.message).startsWith("Working (")
                ? priorProgress.message
                : `Collecting product URLs (${checkpoint.targetIndex ?? 0}/${(checkpoint.targets ?? []).length} targets)`
              : `Working (${checkpoint.phase || "queued"})`,
          heartbeatAt: new Date().toISOString(),
        },
      },
      logBuffer,
    );
    if (!heartbeat) return { complete: true, phase: "done" };

    if (checkpoint.phase === "queued" || checkpoint.phase === "discovering") {
      return await runDiscoverChunk({
        admin,
        runId,
        row,
        credentials,
        checkpoint,
        logger,
        productsFound: runRow.products_found,
        productsUpserted: runRow.products_upserted,
      });
    }

    if (checkpoint.phase === "collecting_urls") {
      return await runCollectUrlsChunk({
        admin,
        runId,
        row,
        credentials,
        checkpoint,
        logger,
        productsFound: runRow.products_found,
        productsUpserted: runRow.products_upserted,
      });
    }

    if (checkpoint.phase === "scraping") {
      return await runScrapeChunk({
        admin,
        runId,
        row,
        credentials,
        checkpoint,
        logger,
        productsFound: runRow.products_found,
        productsUpserted: runRow.products_upserted,
      });
    }

    if (checkpoint.phase === "verifying_coverage") {
      return await runVerifyCoverageChunk({
        admin,
        runId,
        row,
        credentials,
        checkpoint,
        logger,
        productsFound: runRow.products_found,
        productsUpserted: runRow.products_upserted,
      });
    }

    if (checkpoint.phase === "enriching") {
      return await runEnrichChunk({
        admin,
        runId,
        catalogueId: row.id,
        checkpoint,
        accessToken: input.accessToken ?? null,
        imagesProcessed: runRow.images_processed,
        productsFound: runRow.products_found,
        productsUpserted: runRow.products_upserted,
      });
    }

    await finaliseRun({
      admin,
      runId,
      catalogueId: row.id,
      productsFound: runRow.products_found,
      productsUpserted: runRow.products_upserted,
      imagesProcessed: runRow.images_processed,
    });
    return { complete: true, phase: "done" };
  } catch (error) {
    if (await isRunCancelled(admin, runId)) {
      return { complete: true, phase: "done" };
    }
    const message =
      error instanceof Error ? error.message : "Supplier catalogue crawl failed";
    logger.step("error", message);
    const definitive =
      /invalid (?:username|password|credentials)|unauthori[sz]ed|forbidden|account (?:locked|disabled)|not authorised/i.test(
        message,
      );
    const transientFailureCount = (checkpoint.transientFailureCount ?? 0) + 1;

    if (!definitive && transientFailureCount < 8) {
      logger.warn("retry", "Chunk failed; durable worker will retry", {
        attempt: transientFailureCount,
        maxAttempts: 8,
      });
      await updateRunIfActive(admin, runId, {
        phase: checkpoint.phase,
        error_message: message,
        checkpoint: {
          ...checkpoint,
          transientFailureCount,
        },
        progress: {
          message: `Temporary crawl failure; retrying (${transientFailureCount}/8)`,
          retryError: message,
          retryAttempt: transientFailureCount,
        },
      });
      return { complete: false, phase: checkpoint.phase };
    }

    await updateRunIfActive(admin, runId, {
      status: "failed",
      phase: "failed",
      coverage_status: "incomplete",
      error_message: message,
      finished_at: new Date().toISOString(),
      checkpoint: { ...checkpoint, phase: "failed" },
    });
    await updateCatalogue(admin, row.id, {
      status: "error",
      last_run_status: "failed",
      coverage_status: "incomplete",
      coverage_summary: {
        status: "incomplete",
        reason: message,
      },
      last_error: message,
      last_run_at: new Date().toISOString(),
    });
    throw error;
  } finally {
    stopWatchingLogs();
    activeCrawlLogBuffer = null;
  }
}

async function runDiscoverChunk(input: {
  admin: SupabaseClient;
  runId: string;
  row: CatalogueRow;
  credentials: SupplierCredentials;
  checkpoint: CrawlCheckpoint;
  logger: SupplierScraperLogger;
  productsFound: number;
  productsUpserted: number;
}): Promise<{ complete: boolean; phase: CrawlPhase }> {
  const { admin, runId, row, credentials, logger } = input;
  await updateRun(admin, runId, {
    status: "discovering",
    phase: "discovering",
    progress: { message: "Discovering catalogue structure" },
  });
  if (await isRunCancelled(admin, runId)) {
    return { complete: true, phase: "done" };
  }
  await updateCatalogue(admin, row.id, {
    status: "discovering",
    last_run_status: "running",
    last_error: null,
  });

  let config = row.scrape_config as SupplierScraperConfig | null;
  let productsFound = input.productsFound;
  let productsUpserted = input.productsUpserted;

  if (!hasUsableConfig(config)) {
    if (await isRunCancelled(admin, runId)) {
      return { complete: true, phase: "done" };
    }
    logger.step("discover", "Building scraper config from site");
    const built = await buildSupplierScraper({
      websiteUrl: row.base_url,
      loginUrl: row.login_url,
      credentials,
      logger,
    });
    config = built.config;
    await updateCatalogue(admin, row.id, {
      scrape_config: config,
      name: row.name || config.supplierName || row.name,
    });

    if (built.sampleProducts.length > 0) {
      productsFound += built.sampleProducts.length;
      productsUpserted += await upsertFromScrapedProducts({
        admin,
        catalogueId: row.id,
        supplierName: config.supplierName || row.name,
        products: built.sampleProducts,
      });
    }
  }

  // Layout-only discover: pause so the user can pick brands/categories.
  if (input.checkpoint.pauseAfterDiscover) {
    const preview = buildCatalogueTargets(config);
    logger.success(
      "discover",
      `Layout ready: ${preview.targets.length} ${preview.mode} targets available to select`,
    );
    const finished = await updateRun(admin, runId, {
      status: "succeeded",
      phase: "done",
      products_found: productsFound,
      products_upserted: productsUpserted,
      finished_at: new Date().toISOString(),
      checkpoint: {
        ...input.checkpoint,
        phase: "done",
        mode: preview.mode,
        pauseAfterDiscover: true,
      },
      progress: {
        message: `Layout discovered. Select ${preview.mode === "brand" ? "brands" : "categories"} to crawl.`,
        awaitingSelection: true,
        browseMode: preview.mode,
        brandCount: config.brandOptions.length,
        categoryCount: config.categoryOptions.length,
        targetPreviewCount: preview.targets.length,
      },
      coverage_status: "unknown",
    });
    if (!finished) return { complete: true, phase: "done" };
    await updateCatalogue(admin, row.id, {
      status: "ready",
      last_run_status: "succeeded",
      last_run_summary: {
        awaitingSelection: true,
        brands: config.brandOptions.length,
        categories: config.categoryOptions.length,
      },
    });
    return { complete: true, phase: "done" };
  }

  const selectedTargets = input.checkpoint.targets ?? [];
  const { mode, targets } =
    selectedTargets.length > 0 && input.checkpoint.mode
      ? { mode: input.checkpoint.mode, targets: selectedTargets }
      : buildCatalogueTargets(config);
  const next: CrawlCheckpoint = {
    phase: "collecting_urls",
    mode,
    targets,
    targetIndex: 0,
    productQueue: [],
    nextProductIndex: 0,
    maxProductsPerTarget: input.checkpoint.maxProductsPerTarget ?? null,
    enrichOffset: 0,
    queuedCount: 0,
    scoped: input.checkpoint.scoped,
    skipCoverage: input.checkpoint.skipCoverage,
    sitemapSeeded: input.checkpoint.scoped
      ? true
      : input.checkpoint.sitemapSeeded,
    pauseAfterDiscover: false,
  };

  const continued = await updateRun(admin, runId, {
    status: "crawling",
    phase: "collecting_urls",
    products_found: productsFound,
    products_upserted: productsUpserted,
    checkpoint: next,
    progress: {
      message: `Collecting product URLs (0/${targets.length} targets)`,
      targets: targets.length,
      scoped: Boolean(next.scoped),
    },
  });
  if (!continued) return { complete: true, phase: "done" };
  await updateCatalogue(admin, row.id, { status: "crawling" });

  return { complete: false, phase: "collecting_urls" };
}

async function flushLiveCollectProgress(
  admin: SupabaseClient,
  runId: string,
  opts: {
    startIndex: number;
    sliceLength: number;
    targetsTotal: number;
    phaseLabel?: string;
  },
): Promise<(progress: {
  stage: string;
  message: string;
  urlsFound: number;
  productsScraped?: number;
  targetIndex?: number;
  targetTotal?: number;
  targetName?: string;
  pageIndex?: number;
  sampleUrls?: string[];
  lastProduct?: string;
}) => Promise<void>> {
  let lastProgressFlushAt = 0;
  let recentUrls: string[] = [];
  return async (detail) => {
    const now = Date.now();
    const force =
      detail.stage === "launch" ||
      detail.stage === "login" ||
      detail.stage === "sitemap" ||
      detail.stage === "export" ||
      detail.stage === "target_start" ||
      detail.stage === "target_done" ||
      detail.stage === "network" ||
      detail.stage === "product" ||
      detail.stage === "done" ||
      (detail.stage === "pagination" &&
        detail.pageIndex != null &&
        detail.pageIndex % 3 === 0);
    // Flush every product save; otherwise throttle UI writes.
    if (!force && now - lastProgressFlushAt < 1500) return;
    lastProgressFlushAt = now;

    if (detail.sampleUrls?.length) {
      for (const url of detail.sampleUrls) {
        if (!recentUrls.includes(url)) recentUrls.push(url);
      }
      while (recentUrls.length > 30) recentUrls.shift();
    }

    const absoluteTarget =
      typeof detail.targetIndex === "number"
        ? opts.startIndex + detail.targetIndex
        : opts.startIndex;
    const targetsTotal = Math.max(opts.targetsTotal, detail.targetTotal ?? 0);
    const prefix = opts.phaseLabel ? `${opts.phaseLabel}: ` : "";
    const urlHint =
      recentUrls.length > 0
        ? ` · latest ${recentUrls[recentUrls.length - 1]}`
        : "";

    await updateRun(admin, runId, {
      progress: {
        message: `${prefix}${detail.message}${urlHint}`.slice(0, 400),
        collectStage: detail.stage,
        urlsFoundSoFar: detail.urlsFound,
        productsScraped: detail.productsScraped ?? 0,
        lastProduct: detail.lastProduct ?? null,
        targetsDone: Math.max(
          0,
          absoluteTarget - (detail.stage === "target_done" ? 0 : 1),
        ),
        targetIndex: absoluteTarget,
        targetsTotal,
        targetName: detail.targetName,
        pageIndex: detail.pageIndex,
        chunkStart: opts.startIndex,
        chunkSize: opts.sliceLength,
        recentUrls: recentUrls.slice(-20),
      },
    });
  };
}

async function runCollectUrlsChunk(input: {
  admin: SupabaseClient;
  runId: string;
  row: CatalogueRow;
  credentials: SupplierCredentials;
  checkpoint: CrawlCheckpoint;
  logger: SupplierScraperLogger;
  productsFound: number;
  productsUpserted: number;
}): Promise<{ complete: boolean; phase: CrawlPhase }> {
  const { admin, runId, row, credentials, checkpoint, logger } = input;
  const config = row.scrape_config as SupplierScraperConfig;
  if (!hasUsableConfig(config)) {
    throw new Error("Scrape config missing during URL collection");
  }

  const targets = checkpoint.targets ?? [];
  const startIndex = checkpoint.targetIndex ?? 0;
  if (startIndex >= targets.length) {
    const queuedCount = await countScrapeUrls(admin, runId);
    const next: CrawlCheckpoint = {
      ...checkpoint,
      phase: "scraping",
      nextProductIndex: 0,
      productQueue: [],
      queuedCount,
    };
    const continued = await updateRun(admin, runId, {
      status: "crawling",
      phase: "scraping",
      products_found: Math.max(input.productsFound, queuedCount),
      checkpoint: next,
      progress: {
        message: `Scraping products (0/${queuedCount})`,
        queued: queuedCount,
      },
    });
    if (!continued) return { complete: true, phase: "done" };
    return { complete: false, phase: "scraping" };
  }

  if (await isRunCancelled(admin, runId)) {
    return { complete: true, phase: "done" };
  }

  const slice = targets.slice(
    startIndex,
    startIndex + STREAM_TARGETS_PER_CHUNK,
  );
  const includeSitemap =
    !checkpoint.scoped && !checkpoint.sitemapSeeded && startIndex === 0;
  logger.step(
    "collect",
    `Collecting URLs for targets ${startIndex + 1}-${Math.min(startIndex + slice.length, targets.length)} of ${targets.length}`,
  );
  await updateRun(admin, runId, {
    progress: {
      message: includeSitemap
        ? `Starting URL collection (sitemap + ${slice.length} targets)`
        : `Starting URL collection (${slice.length} targets from #${startIndex + 1})`,
      collectStage: "launch",
      urlsFoundSoFar: 0,
      productsScraped: input.productsUpserted,
      targetsDone: startIndex,
      targetsTotal: targets.length,
      chunkStart: startIndex,
      chunkSize: slice.length,
      scoped: Boolean(checkpoint.scoped),
    },
    status: "crawling",
    phase: "collecting_urls",
    products_upserted: input.productsUpserted,
  });
  await updateCatalogue(admin, row.id, { status: "crawling" });
  const onProgress = await flushLiveCollectProgress(admin, runId, {
    startIndex,
    sliceLength: slice.length,
    targetsTotal: targets.length,
  });

  let productsUpserted = input.productsUpserted;
  let productsFound = input.productsFound;

  const collected = await collectSupplierProductUrls({
    config,
    credentials,
    targets: slice,
    maxProductsPerTarget: checkpoint.maxProductsPerTarget ?? null,
    includeSitemap,
    expandBrowseLinks: !checkpoint.scoped,
    logger,
    onProgress,
    streamProducts: true,
    onStreamedProduct: async (product, progress) => {
      await enqueueScrapeUrls({
        admin,
        runId,
        catalogueId: row.id,
        entries: [
          {
            url: product.url,
            categoryUrl: product.categoryUrl,
            discoveredVia: ["page"],
            evidence: { streamed: true },
          },
        ],
      });
      const upserted = await upsertFromScrapedProducts({
        admin,
        catalogueId: row.id,
        supplierName: config.supplierName || row.name,
        products: [product],
      });
      productsUpserted += upserted;
      productsFound = Math.max(productsFound, progress.urlsFound);
      const productIds = await getProductIdsBySourceUrl({
        admin,
        catalogueId: row.id,
        sourceUrls: [product.url],
      });
      await markScrapeUrlDoneByUrl(
        admin,
        runId,
        product.url,
        productIds.get(product.url) ?? null,
      );
      // Keep the catalogue product badge in sync while streaming.
      if (productsUpserted === 1 || productsUpserted % 3 === 0) {
        await refreshCatalogueProductCount(admin, row.id);
      }
      await updateRun(admin, runId, {
        products_found: productsFound,
        products_upserted: productsUpserted,
        status: "crawling",
        phase: "collecting_urls",
        progress: {
          message: `Saved ${productsUpserted}: ${product.name}`.slice(0, 400),
          collectStage: "product",
          urlsFoundSoFar: progress.urlsFound,
          productsScraped: productsUpserted,
          lastProduct: product.name,
          targetsDone: startIndex,
          targetsTotal: targets.length,
          chunkStart: startIndex,
          chunkSize: slice.length,
          scoped: Boolean(checkpoint.scoped),
        },
      });
    },
  });

  if (await isRunCancelled(admin, runId)) {
    return { complete: true, phase: "done" };
  }

  // Persist self-learned selectors for future chunks / re-crawls
  if (config.productLinkSelector) {
    await updateCatalogue(admin, row.id, { scrape_config: config });
  }
  await persistDiscoveryEvidence({
    admin,
    catalogueId: row.id,
    runId,
    evidence: collected.discoveryEvidence,
  });
  const discoveryEvidence = mergeDiscoveryEvidence(
    checkpoint.discoveryEvidence,
    collected.discoveryEvidence,
  );

  // Enqueue any URLs that were discovered but not successfully streamed
  // (failed scrapes stay pending for the scrape phase to retry).
  await enqueueScrapeUrls({
    admin,
    runId,
    catalogueId: row.id,
    entries: collected.entries,
  });

  const existingTargets = checkpoint.targets ?? [];
  const known = new Set(
    existingTargets.map((target) => target.url.replace(/\/$/, "").toLowerCase()),
  );
  const mergedTargets = [...existingTargets];
  // Scoped crawls stay within the user's selection; do not grow the target list.
  if (!checkpoint.scoped) {
    for (const target of collected.newBrowseTargets) {
      const key = target.url.replace(/\/$/, "").toLowerCase();
      if (known.has(key)) continue;
      known.add(key);
      mergedTargets.push(target);
    }
  }

  const queuedCount = await countScrapeUrls(admin, runId);
  const pendingCount = await countScrapeUrls(admin, runId, "pending");
  const nextIndex = startIndex + slice.length;
  const collectingDone = nextIndex >= mergedTargets.length;
  const next: CrawlCheckpoint = {
    ...checkpoint,
    targets: mergedTargets,
    targetIndex: nextIndex,
    productQueue: [],
    queuedCount,
    sitemapSeeded: checkpoint.sitemapSeeded || includeSitemap,
    discoveryEvidence,
    phase: collectingDone ? "scraping" : "collecting_urls",
    nextProductIndex: collectingDone ? 0 : checkpoint.nextProductIndex ?? 0,
  };

  productsFound = Math.max(productsFound, queuedCount, collected.entries.length);
  await refreshCatalogueProductCount(admin, row.id);
  const continued = await updateRun(admin, runId, {
    status: "crawling",
    phase: next.phase,
    products_found: productsFound,
    products_upserted: productsUpserted,
    discovery_evidence: discoveryEvidence,
    checkpoint: next,
    progress: {
      message: collectingDone
        ? pendingCount > 0
          ? `Scraping remaining products (0/${pendingCount}) · ${productsUpserted} already saved`
          : `All products saved during discovery (${productsUpserted})`
        : `Collecting product URLs (${nextIndex}/${mergedTargets.length} targets) · ${productsUpserted} saved`,
      targetsDone: nextIndex,
      targetsTotal: mergedTargets.length,
      queued: queuedCount,
      pending: pendingCount,
      productsScraped: productsUpserted,
      newBrowseTargets: collected.newBrowseTargets.length,
    },
  });
  if (!continued) return { complete: true, phase: "done" };

  return { complete: false, phase: next.phase };
}

async function runScrapeChunk(input: {
  admin: SupabaseClient;
  runId: string;
  row: CatalogueRow;
  credentials: SupplierCredentials;
  checkpoint: CrawlCheckpoint;
  logger: SupplierScraperLogger;
  productsFound: number;
  productsUpserted: number;
}): Promise<{ complete: boolean; phase: CrawlPhase }> {
  const { admin, runId, row, credentials, checkpoint, logger } = input;
  const config = row.scrape_config as SupplierScraperConfig;
  if (!hasUsableConfig(config)) {
    throw new Error("Scrape config missing during product scrape");
  }

  // Legacy in-flight runs may still hold URLs in checkpoint JSONB
  const legacyQueue = checkpoint.productQueue ?? [];
  const useLegacyQueue = legacyQueue.length > 0;

  if (!useLegacyQueue) {
    await requeueStaleScrapingUrls(admin, runId);
  }

  const queuedTotal = useLegacyQueue
    ? legacyQueue.length
    : Math.max(
        checkpoint.queuedCount ?? 0,
        await countScrapeUrls(admin, runId),
      );

  let entries: Array<{
    id?: number;
    url: string;
    categoryUrl: string;
    attemptCount: number;
    maxAttempts: number;
  }> = [];

  if (useLegacyQueue) {
    const start = checkpoint.nextProductIndex ?? 0;
    if (start >= legacyQueue.length) {
      return transitionToCoverageCheck({
        admin,
        runId,
        checkpoint,
        productsFound: Math.max(input.productsFound, legacyQueue.length),
        productsUpserted: input.productsUpserted,
      });
    }
    entries = legacyQueue
      .slice(start, start + PRODUCTS_PER_CHUNK)
      .map((entry) => ({
        url: entry.url,
        categoryUrl: entry.categoryUrl,
        attemptCount: 1,
        maxAttempts: 1,
      }));
  } else {
    const claimed = await claimScrapeUrls({
      admin,
      runId,
      limit: PRODUCTS_PER_CHUNK,
    });
    if (claimed.length === 0) {
      const pending = await countScrapeUrls(admin, runId, "pending");
      if (pending === 0) {
        return transitionToCoverageCheck({
          admin,
          runId,
          checkpoint,
          productsFound: Math.max(input.productsFound, queuedTotal),
          productsUpserted: input.productsUpserted,
        });
      }
      // Another worker may have claimed; stay in scraping
      return { complete: false, phase: "scraping" };
    }
    entries = claimed.map((row) => ({
      id: row.id,
      url: row.url,
      categoryUrl: row.categoryUrl,
      attemptCount: row.attemptCount,
      maxAttempts: row.maxAttempts,
    }));
  }

  let batchResult;
  try {
    if (await isRunCancelled(admin, runId)) {
      return { complete: true, phase: "done" };
    }
    batchResult = await scrapeSupplierProductUrls({
      config,
      credentials,
      entries: entries.map((entry) => ({
        url: entry.url,
        categoryUrl: entry.categoryUrl,
      })),
      logger,
      onProductScraped: async (product, scrapeProgress) => {
        if (
          scrapeProgress.index === 1 ||
          scrapeProgress.index % 8 === 0 ||
          scrapeProgress.index === scrapeProgress.total
        ) {
          await updateRun(admin, runId, {
            progress: {
              message: `Scraping products (${scrapeProgress.index}/${scrapeProgress.total})`,
              scraped: scrapeProgress.index,
              queued: scrapeProgress.total,
              lastProduct: product.name,
            },
          });
        }
      },
    });
  } catch (error) {
    if (await isRunCancelled(admin, runId)) {
      return { complete: true, phase: "done" };
    }
    const message =
      error instanceof Error ? error.message : "Product scrape chunk failed";
    await recordScrapeUrlFailures({
      admin,
      failures: entries
        .filter(
          (entry): entry is typeof entry & { id: number } =>
            typeof entry.id === "number",
        )
        .map((entry) => ({
          id: entry.id,
          error: message,
          attemptCount: entry.attemptCount,
          maxAttempts: entry.maxAttempts,
        })),
    });
    throw error;
  }

  if (await isRunCancelled(admin, runId)) {
    return { complete: true, phase: "done" };
  }

  const upserted = await upsertFromScrapedProducts({
    admin,
    catalogueId: row.id,
    supplierName: config.supplierName || row.name,
    products: batchResult.products,
  });

  const productIds = await getProductIdsBySourceUrl({
    admin,
    catalogueId: row.id,
    sourceUrls: batchResult.succeededEntries.map(
      ({ product }) => product.url,
    ),
  });
  const queueByUrl = new Map(entries.map((entry) => [entry.url, entry]));
  const unresolvedSuccessfulEntries: Array<{
    id: number;
    error: string;
    attemptCount: number;
    maxAttempts: number;
  }> = [];
  await markScrapeUrlsDone(
    admin,
    batchResult.succeededEntries
      .map(({ entry }) => {
        const queued = queueByUrl.get(entry.url);
        if (!queued?.id) return null;
        const productId = productIds.get(entry.url);
        if (!productId) {
          unresolvedSuccessfulEntries.push({
            id: queued.id,
            error: "Product scraped but canonical row could not be reconciled",
            attemptCount: queued.attemptCount,
            maxAttempts: queued.maxAttempts,
          });
          return null;
        }
        return {
          id: queued.id,
          productId,
        };
      })
      .filter(
        (
          completion,
        ): completion is { id: number; productId: string } =>
          completion != null,
      ),
  );

  const failureRows = batchResult.failedEntries
    .map((failure) => {
      const queued = queueByUrl.get(failure.entry.url);
      if (!queued?.id) return null;
      return {
        id: queued.id,
        error: failure.error,
        attemptCount: queued.attemptCount,
        maxAttempts: queued.maxAttempts,
      };
    })
    .filter(
      (
        failure,
      ): failure is {
        id: number;
        error: string;
        attemptCount: number;
        maxAttempts: number;
      } => failure != null,
    );
  failureRows.push(...unresolvedSuccessfulEntries);
  const failureResult = await recordScrapeUrlFailures({
    admin,
    failures: failureRows,
  });
  if (failureRows.length > 0) {
    logger.warn("product", "Some product URLs will be retried", {
      retrying: failureResult.retrying,
      terminal: failureResult.terminal,
    });
  }

  const productsUpserted = input.productsUpserted + upserted;

  if (useLegacyQueue) {
    const start = checkpoint.nextProductIndex ?? 0;
    const nextIndex = start + entries.length;
    const scrapingDone = nextIndex >= legacyQueue.length;
    if (scrapingDone) {
      return transitionToCoverageCheck({
        admin,
        runId,
        checkpoint: {
          ...checkpoint,
          nextProductIndex: nextIndex,
          productQueue: [],
        },
        productsFound: Math.max(input.productsFound, legacyQueue.length),
        productsUpserted,
      });
    }

    const next: CrawlCheckpoint = {
      ...checkpoint,
      nextProductIndex: nextIndex,
      phase: "scraping",
    };
    const continued = await updateRun(admin, runId, {
      status: "crawling",
      phase: "scraping",
      products_found: Math.max(input.productsFound, legacyQueue.length),
      products_upserted: productsUpserted,
      checkpoint: next,
      progress: {
        message: `Scraping products (${nextIndex}/${legacyQueue.length})`,
        scraped: nextIndex,
        queued: legacyQueue.length,
      },
    });
    if (!continued) return { complete: true, phase: "done" };
    return { complete: false, phase: "scraping" };
  }

  const pending = await countScrapeUrls(admin, runId, "pending");
  const done = await countScrapeUrls(admin, runId, "done");
  const scraped = done;

  if (pending === 0) {
    return transitionToCoverageCheck({
      admin,
      runId,
      checkpoint: { ...checkpoint, queuedCount: queuedTotal, productQueue: [] },
      productsFound: Math.max(input.productsFound, queuedTotal, scraped),
      productsUpserted,
    });
  }

  const continued = await updateRun(admin, runId, {
    status: "crawling",
    phase: "scraping",
    products_found: Math.max(input.productsFound, queuedTotal, scraped),
    products_upserted: productsUpserted,
    checkpoint: {
      ...checkpoint,
      productQueue: [],
      queuedCount: queuedTotal,
      phase: "scraping",
    },
    progress: {
      message: `Scraping products (${scraped}/${queuedTotal || scraped + pending})`,
      scraped,
      queued: queuedTotal || scraped + pending,
      pending,
    },
  });
  if (!continued) return { complete: true, phase: "done" };

  return { complete: false, phase: "scraping" };
}

async function transitionToCoverageCheck(input: {
  admin: SupabaseClient;
  runId: string;
  checkpoint: CrawlCheckpoint;
  productsFound: number;
  productsUpserted: number;
}): Promise<{ complete: boolean; phase: CrawlPhase }> {
  if (input.checkpoint.skipCoverage || input.checkpoint.scoped) {
    return transitionToEnriching({
      admin: input.admin,
      runId: input.runId,
      checkpoint: input.checkpoint,
      productsFound: input.productsFound,
      productsUpserted: input.productsUpserted,
    });
  }

  const next: CrawlCheckpoint = {
    ...input.checkpoint,
    phase: "verifying_coverage",
    productQueue: [],
    // Re-walk every browse target for newly appeared products
    targetIndex: 0,
  };
  const active = await updateRun(input.admin, input.runId, {
    status: "crawling",
    phase: "verifying_coverage",
    products_found: input.productsFound,
    products_upserted: input.productsUpserted,
    checkpoint: next,
    progress: {
      message: "Verifying coverage (looking for any missed products)",
      coverageCleanPasses: input.checkpoint.coverageCleanPasses ?? 0,
    },
  });
  if (!active) return { complete: true, phase: "done" };
  return { complete: false, phase: "verifying_coverage" };
}

async function transitionToEnriching(input: {
  admin: SupabaseClient;
  runId: string;
  checkpoint: CrawlCheckpoint;
  productsFound: number;
  productsUpserted: number;
}): Promise<{ complete: boolean; phase: CrawlPhase }> {
  const next: CrawlCheckpoint = {
    ...input.checkpoint,
    phase: "enriching",
    enrichOffset: 0,
    productQueue: [],
  };
  const active = await updateRun(input.admin, input.runId, {
    status: "enriching",
    phase: "enriching",
    products_found: input.productsFound,
    products_upserted: input.productsUpserted,
    checkpoint: next,
    progress: { message: "Enriching hero images and fields" },
  });
  if (!active) return { complete: true, phase: "done" };
  return { complete: false, phase: "enriching" };
}

/**
 * Re-discover product URLs across all known targets (+ sitemap).
 * Only advances to enriching after a clean pass finds zero new URLs.
 */
async function runVerifyCoverageChunk(input: {
  admin: SupabaseClient;
  runId: string;
  row: CatalogueRow;
  credentials: SupplierCredentials;
  checkpoint: CrawlCheckpoint;
  logger: SupplierScraperLogger;
  productsFound: number;
  productsUpserted: number;
}): Promise<{ complete: boolean; phase: CrawlPhase }> {
  const { admin, runId, row, credentials, checkpoint, logger } = input;
  const config = row.scrape_config as SupplierScraperConfig;
  if (!hasUsableConfig(config)) {
    throw new Error("Scrape config missing during coverage verification");
  }

  const targets = checkpoint.targets ?? [];
  const startIndex = checkpoint.targetIndex ?? 0;

  // Empty target list: still try sitemap once, then decide
  if (targets.length === 0) {
    const onProgress = await flushLiveCollectProgress(admin, runId, {
      startIndex: 0,
      sliceLength: 1,
      targetsTotal: 1,
      phaseLabel: "Coverage",
    });
    const collected = await collectSupplierProductUrls({
      config,
      credentials,
      targets: [
        {
          id: "root",
          name: "Catalogue",
          url: config.catalogueUrl || row.base_url,
        },
      ],
      includeSitemap: true,
      expandBrowseLinks: true,
      logger,
      onProgress,
    });
    await persistDiscoveryEvidence({
      admin,
      catalogueId: row.id,
      runId,
      evidence: collected.discoveryEvidence,
    });
    const discoveryEvidence = mergeDiscoveryEvidence(
      checkpoint.discoveryEvidence,
      collected.discoveryEvidence,
    );
    const beforeCount = await countScrapeUrls(admin, runId);
    await enqueueScrapeUrls({
      admin,
      runId,
      catalogueId: row.id,
      entries: collected.entries,
    });
    const afterCount = await countScrapeUrls(admin, runId);
    const newlyQueued = Math.max(0, afterCount - beforeCount);
    const pending = await countScrapeUrls(admin, runId, "pending");
    if (pending > 0) {
      return transitionToScrapingAfterCoverage({
        admin,
        runId,
        checkpoint: {
          ...checkpoint,
          targets: [
            {
              id: "root",
              name: "Catalogue",
              url: config.catalogueUrl || row.base_url,
            },
            ...collected.newBrowseTargets,
          ],
          coverageCleanPasses: 0,
          discoveryEvidence,
        },
        productsFound: Math.max(input.productsFound, afterCount),
        productsUpserted: input.productsUpserted,
        newlyQueued,
      });
    }
    return transitionToEnriching({
      admin,
      runId,
      checkpoint,
      productsFound: input.productsFound,
      productsUpserted: input.productsUpserted,
    });
  }

  if (startIndex >= targets.length) {
    const pending = await countScrapeUrls(admin, runId, "pending");
    if (pending > 0) {
      return transitionToScrapingAfterCoverage({
        admin,
        runId,
        checkpoint: { ...checkpoint, coverageCleanPasses: 0 },
        productsFound: Math.max(input.productsFound, pending),
        productsUpserted: input.productsUpserted,
        newlyQueued: pending,
      });
    }

    const cleanPasses = (checkpoint.coverageCleanPasses ?? 0) + 1;
    logger.step(
      "coverage",
      `Coverage pass clean (${cleanPasses}/2) — no new product URLs found`,
    );

    // Require two consecutive clean passes before declaring complete.
    if (cleanPasses < 2) {
      const continued = await updateRun(admin, runId, {
        status: "crawling",
        phase: "verifying_coverage",
        checkpoint: {
          ...checkpoint,
          coverageCleanPasses: cleanPasses,
          targetIndex: 0,
          phase: "verifying_coverage",
        },
        progress: {
          message: `Coverage check ${cleanPasses}/2 clean — re-scanning to confirm`,
          coverageCleanPasses: cleanPasses,
        },
      });
      if (!continued) return { complete: true, phase: "done" };
      return { complete: false, phase: "verifying_coverage" };
    }

    return transitionToEnriching({
      admin,
      runId,
      checkpoint: { ...checkpoint, coverageCleanPasses: cleanPasses },
      productsFound: input.productsFound,
      productsUpserted: input.productsUpserted,
    });
  }

  if (await isRunCancelled(admin, runId)) {
    return { complete: true, phase: "done" };
  }

  const slice = targets.slice(startIndex, startIndex + TARGETS_PER_CHUNK);
  const onProgress = await flushLiveCollectProgress(admin, runId, {
    startIndex,
    sliceLength: slice.length,
    targetsTotal: targets.length,
    phaseLabel: "Coverage",
  });
  const collected = await collectSupplierProductUrls({
    config,
    credentials,
    targets: slice,
    maxProductsPerTarget: checkpoint.maxProductsPerTarget ?? null,
    includeSitemap: startIndex === 0,
    expandBrowseLinks: true,
    logger,
    onProgress,
  });
  await persistDiscoveryEvidence({
    admin,
    catalogueId: row.id,
    runId,
    evidence: collected.discoveryEvidence,
  });
  const discoveryEvidence = mergeDiscoveryEvidence(
    checkpoint.discoveryEvidence,
    collected.discoveryEvidence,
  );

  const beforeCount = await countScrapeUrls(admin, runId);
  await enqueueScrapeUrls({
    admin,
    runId,
    catalogueId: row.id,
    entries: collected.entries,
  });
  const afterCount = await countScrapeUrls(admin, runId);
  const newlyQueued = Math.max(0, afterCount - beforeCount);

  const existingTargets = checkpoint.targets ?? [];
  const known = new Set(
    existingTargets.map((target) => target.url.replace(/\/$/, "").toLowerCase()),
  );
  const mergedTargets = [...existingTargets];
  for (const target of collected.newBrowseTargets) {
    const key = target.url.replace(/\/$/, "").toLowerCase();
    if (known.has(key)) continue;
    known.add(key);
    mergedTargets.push(target);
  }

  const nextIndex = startIndex + slice.length;
  const continued = await updateRun(admin, runId, {
    status: "crawling",
    phase: "verifying_coverage",
    products_found: Math.max(input.productsFound, afterCount),
    discovery_evidence: discoveryEvidence,
    checkpoint: {
      ...checkpoint,
      targets: mergedTargets,
      targetIndex: nextIndex,
      queuedCount: afterCount,
      discoveryEvidence,
      // Any new URLs reset the clean-pass streak
      coverageCleanPasses:
        newlyQueued > 0 || collected.newBrowseTargets.length > 0
          ? 0
          : checkpoint.coverageCleanPasses ?? 0,
      phase: "verifying_coverage",
    },
    progress: {
      message:
        newlyQueued > 0
          ? `Coverage found ${newlyQueued} new products — will keep scraping`
          : `Verifying coverage (${nextIndex}/${mergedTargets.length} targets)`,
      targetsDone: nextIndex,
      targetsTotal: mergedTargets.length,
      newlyQueued,
    },
  });
  if (!continued) return { complete: true, phase: "done" };
  return { complete: false, phase: "verifying_coverage" };
}

async function transitionToScrapingAfterCoverage(input: {
  admin: SupabaseClient;
  runId: string;
  checkpoint: CrawlCheckpoint;
  productsFound: number;
  productsUpserted: number;
  newlyQueued: number;
}): Promise<{ complete: boolean; phase: CrawlPhase }> {
  const next: CrawlCheckpoint = {
    ...input.checkpoint,
    phase: "scraping",
    coverageCleanPasses: 0,
    productQueue: [],
  };
  const active = await updateRun(input.admin, input.runId, {
    status: "crawling",
    phase: "scraping",
    products_found: input.productsFound,
    products_upserted: input.productsUpserted,
    checkpoint: next,
    progress: {
      message: `Found ${input.newlyQueued} more products — resuming scrape`,
      newlyQueued: input.newlyQueued,
    },
  });
  if (!active) return { complete: true, phase: "done" };
  return { complete: false, phase: "scraping" };
}

async function runEnrichChunk(input: {
  admin: SupabaseClient;
  runId: string;
  catalogueId: string;
  checkpoint: CrawlCheckpoint;
  accessToken: string | null;
  imagesProcessed: number;
  productsFound: number;
  productsUpserted: number;
}): Promise<{ complete: boolean; phase: CrawlPhase }> {
  const { admin, runId, catalogueId, checkpoint } = input;

  const started = await updateRun(admin, runId, {
    status: "enriching",
    phase: "enriching",
    progress: { message: "Enriching hero images and fields" },
  });
  if (!started) return { complete: true, phase: "done" };
  await updateCatalogue(admin, catalogueId, { status: "crawling" });

  const imageResult = await enrichProductImages({
    admin,
    catalogueId,
    accessToken: input.accessToken,
    limit: ENRICH_PER_CHUNK,
  });

  if (await isRunCancelled(admin, runId)) {
    return { complete: true, phase: "done" };
  }

  await enrichSparseProductFields({
    admin,
    catalogueId,
    limit: ENRICH_PER_CHUNK,
  });

  const imagesProcessed = input.imagesProcessed + imageResult.processed;
  const remaining =
    imageResult.remaining > 0
      ? imageResult.remaining
      : await countPendingHeroImages(admin, catalogueId);

  if (remaining > 0) {
    const continued = await updateRun(admin, runId, {
      status: "enriching",
      phase: "enriching",
      images_processed: imagesProcessed,
      checkpoint: {
        ...checkpoint,
        phase: "enriching",
        enrichOffset: (checkpoint.enrichOffset ?? 0) + imageResult.processed,
      },
      progress: {
        message: `Hosting hero images (${imagesProcessed} done, ${remaining} left)`,
        imagesProcessed,
        imagesRemaining: remaining,
      },
    });
    if (!continued) return { complete: true, phase: "done" };
    return { complete: false, phase: "enriching" };
  }

  await finaliseRun({
    admin,
    runId,
    catalogueId,
    productsFound: input.productsFound,
    productsUpserted: input.productsUpserted,
    imagesProcessed,
  });

  return { complete: true, phase: "done" };
}

async function finaliseRun(input: {
  admin: SupabaseClient;
  runId: string;
  catalogueId: string;
  productsFound: number;
  productsUpserted: number;
  imagesProcessed: number;
}) {
  if (await isRunCancelled(input.admin, input.runId)) {
    return;
  }

  const productCount = await refreshCatalogueProductCount(
    input.admin,
    input.catalogueId,
  );
  const coverage = await reconcileCatalogueCoverage({
    admin: input.admin,
    catalogueId: input.catalogueId,
    runId: input.runId,
  });
  const finishedAt = new Date().toISOString();

  const finalised = await updateRun(input.admin, input.runId, {
    status: coverage.runStatus,
    phase: "done",
    coverage_status: coverage.status,
    authoritative_total: coverage.authoritativeTotal,
    authoritative_source: coverage.authoritativeSource,
    discovered_url_count: coverage.counts.discovered,
    ingested_url_count: coverage.counts.ingested,
    failed_url_count: coverage.counts.failed,
    unresolved_url_count: coverage.counts.unresolved,
    coverage_summary: coverage.summary,
    products_found: coverage.counts.discovered,
    products_upserted: input.productsUpserted,
    images_processed: input.imagesProcessed,
    finished_at: finishedAt,
    checkpoint: { phase: "done" },
    progress: {
      message:
        coverage.status === "verified"
          ? "Complete — coverage verified"
          : coverage.status === "unverified"
            ? "Crawl finished — coverage unverified"
            : "Crawl incomplete — unresolved products remain",
      productCount,
      coverage: coverage.summary,
    },
  });

  if (!finalised) return;

  await updateCatalogue(input.admin, input.catalogueId, {
    status: coverage.catalogueStatus,
    last_run_status: coverage.runStatus,
    coverage_status: coverage.status,
    authoritative_total: coverage.authoritativeTotal,
    authoritative_source: coverage.authoritativeSource,
    coverage_summary: coverage.summary,
    coverage_verified_at:
      coverage.status === "verified" ? finishedAt : null,
    last_run_at: finishedAt,
    last_run_summary: {
      found: coverage.counts.discovered,
      ingested: coverage.counts.ingested,
      failed: coverage.counts.failed,
      unresolved: coverage.counts.unresolved,
      upserted: input.productsUpserted,
      imagesProcessed: input.imagesProcessed,
      productCount,
      coverageStatus: coverage.status,
      authoritativeTotal: coverage.authoritativeTotal,
      coverageReason: coverage.reason,
    },
    product_count: productCount,
    last_error:
      coverage.status === "incomplete" ? coverage.reason : null,
  });
}

/**
 * Local/script helper: keep advancing until the run completes.
 */
export async function runCatalogueCrawlToCompletion(input: {
  admin: SupabaseClient;
  runId: string;
  accessToken?: string | null;
  maxChunks?: number;
}): Promise<void> {
  const maxChunks = input.maxChunks ?? 10_000;
  for (let i = 0; i < maxChunks; i += 1) {
    const result = await advanceCatalogueCrawlChunk({
      admin: input.admin,
      runId: input.runId,
      accessToken: input.accessToken,
    });
    if (result.complete) return;
  }
  throw new Error("Crawl exceeded maximum chunk iterations");
}
