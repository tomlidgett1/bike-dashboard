import { NextResponse } from "next/server";
import { after } from "next/server";
import { requireSupplierCatalogueManager } from "@/lib/supplier-catalogue/auth";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { createSupplierCatalogue } from "@/lib/supplier-catalogue/ingest";
import type { SupplierScraperConfig } from "@/lib/scrapers/supplier-types";

export const runtime = "nodejs";
export const maxDuration = 60;

function kickAdvance(origin: string, runId: string) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[supplier-catalogue] CRON_SECRET missing; crawl will rely on cron resume only");
    return;
  }

  after(async () => {
    try {
      await fetch(`${origin}/api/admin/supplier-catalogue/advance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": cronSecret,
        },
        body: JSON.stringify({ runId }),
      });
    } catch (error) {
      console.error("[supplier-catalogue] failed to kick advance", error);
    }
  });
}

function summariseScrapeConfig(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const config = raw as Partial<SupplierScraperConfig>;
  const brandOptions = Array.isArray(config.brandOptions)
    ? config.brandOptions
    : [];
  const categoryOptions = Array.isArray(config.categoryOptions)
    ? config.categoryOptions
    : [];
  if (brandOptions.length === 0 && categoryOptions.length === 0) return null;
  return {
    supplierName: config.supplierName ?? null,
    browseModes: Array.isArray(config.browseModes) ? config.browseModes : [],
    brandOptions,
    categoryOptions,
  };
}

/**
 * POST /api/admin/supplier-catalogue
 * Body: { baseUrl, username, password, name?, loginUrl?, discoverOnly?, startCrawl? }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireSupplierCatalogueManager(supabase);
    if (!auth.authorized) return auth.response;

    const body = (await request.json()) as {
      baseUrl?: string;
      loginUrl?: string;
      username?: string;
      password?: string;
      name?: string;
      startCrawl?: boolean;
      discoverOnly?: boolean;
      maxProductsPerTarget?: number | null;
    };

    if (!body.baseUrl?.trim() || !body.username?.trim() || !body.password) {
      return NextResponse.json(
        { error: "baseUrl, username, and password are required." },
        { status: 400 },
      );
    }

    const admin = createServiceRoleClient();
    // Default to layout discovery so the user can select brands/categories.
    const discoverOnly = body.discoverOnly !== false && body.startCrawl !== true;
    const startCrawl = body.startCrawl === true;

    const { catalogueId, runId } = await createSupplierCatalogue({
      admin,
      name: body.name,
      baseUrl: body.baseUrl,
      loginUrl: body.loginUrl,
      username: body.username,
      password: body.password,
      discoverOnly,
      startCrawl,
      maxProductsPerTarget: body.maxProductsPerTarget ?? null,
    });

    if (runId) {
      const origin = new URL(request.url).origin;
      kickAdvance(origin, runId);
    }

    return NextResponse.json({
      success: true,
      catalogueId,
      runId,
      message: discoverOnly
        ? "Discovering layout in the background. You can select brands/categories when it finishes."
        : startCrawl
          ? "Catalogue created. Full crawl is running in the background."
          : "Catalogue created.",
    });
  } catch (error) {
    console.error("[supplier-catalogue] create failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create catalogue",
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/admin/supplier-catalogue
 * List platform catalogues (no credentials).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const auth = await requireSupplierCatalogueManager(supabase);
    if (!auth.authorized) return auth.response;

    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("supplier_catalogues")
      .select(
        "id, name, base_url, login_url, status, scrape_config, last_run_at, last_run_status, last_run_summary, product_count, last_error, coverage_status, authoritative_total, authoritative_source, coverage_summary, coverage_verified_at, created_at, updated_at",
      )
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const catalogueIds = (data ?? []).map((row) => row.id);
    const { data: activeRuns } = catalogueIds.length
      ? await admin
          .from("supplier_catalogue_scrape_runs")
          .select(
            "id, catalogue_id, status, phase, progress, products_found, products_upserted, images_processed, error_message, coverage_status, authoritative_total, discovered_url_count, ingested_url_count, failed_url_count, unresolved_url_count, coverage_summary, updated_at",
          )
          .in("catalogue_id", catalogueIds)
          .in("status", ["queued", "discovering", "crawling", "enriching"])
          .order("created_at", { ascending: false })
      : { data: [] as Array<{
          id: string;
          catalogue_id: string;
          status: string;
          phase: string;
          progress: Record<string, unknown> | null;
          products_found: number;
          products_upserted: number;
          images_processed: number;
          error_message: string | null;
          coverage_status: string;
          authoritative_total: number | null;
          discovered_url_count: number;
          ingested_url_count: number;
          failed_url_count: number;
          unresolved_url_count: number;
          coverage_summary: Record<string, unknown>;
          updated_at: string;
        }> };

    const { data: latestRuns } = catalogueIds.length
      ? await admin
          .from("supplier_catalogue_scrape_runs")
          .select(
            "id, catalogue_id, status, phase, progress, products_found, products_upserted, images_processed, error_message, coverage_status, authoritative_total, discovered_url_count, ingested_url_count, failed_url_count, unresolved_url_count, coverage_summary, updated_at",
          )
          .in("catalogue_id", catalogueIds)
          .order("created_at", { ascending: false })
      : { data: [] as Array<{
          id: string;
          catalogue_id: string;
          status: string;
          phase: string;
          progress: Record<string, unknown> | null;
          products_found: number;
          products_upserted: number;
          images_processed: number;
          error_message: string | null;
          coverage_status: string;
          authoritative_total: number | null;
          discovered_url_count: number;
          ingested_url_count: number;
          failed_url_count: number;
          unresolved_url_count: number;
          coverage_summary: Record<string, unknown>;
          updated_at: string;
        }> };

    type RunRow = {
      id: string;
      catalogue_id: string;
      status: string;
      phase: string;
      progress: Record<string, unknown> | null;
      products_found: number;
      products_upserted: number;
      images_processed: number;
      error_message: string | null;
      coverage_status: string;
      authoritative_total: number | null;
      discovered_url_count: number;
      ingested_url_count: number;
      failed_url_count: number;
      unresolved_url_count: number;
      coverage_summary: Record<string, unknown>;
      updated_at: string;
    };

    const activeByCatalogue = new Map<string, RunRow>();
    for (const run of (activeRuns ?? []) as RunRow[]) {
      if (!activeByCatalogue.has(run.catalogue_id)) {
        activeByCatalogue.set(run.catalogue_id, run);
      }
    }

    const latestByCatalogue = new Map<string, RunRow>();
    for (const run of (latestRuns ?? []) as RunRow[]) {
      if (!latestByCatalogue.has(run.catalogue_id)) {
        latestByCatalogue.set(run.catalogue_id, run);
      }
    }

    return NextResponse.json({
      catalogues: (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        baseUrl: row.base_url,
        loginUrl: row.login_url,
        status: row.status,
        scrapeConfig: summariseScrapeConfig(row.scrape_config),
        lastRunAt: row.last_run_at,
        lastRunStatus: row.last_run_status,
        lastRunSummary: row.last_run_summary,
        productCount: row.product_count,
        lastError: row.last_error,
        coverageStatus: row.coverage_status,
        authoritativeTotal: row.authoritative_total,
        authoritativeSource: row.authoritative_source,
        coverageSummary: row.coverage_summary,
        coverageVerifiedAt: row.coverage_verified_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        activeRun: activeByCatalogue.get(row.id) ?? null,
        latestRun: latestByCatalogue.get(row.id) ?? null,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to list catalogues",
      },
      { status: 500 },
    );
  }
}
