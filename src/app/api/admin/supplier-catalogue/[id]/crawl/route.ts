import { NextResponse } from "next/server";
import { after } from "next/server";
import type { SupplierBrowseMode, SupplierScrapeTarget } from "@/lib/scrapers/supplier-types";
import { requireSupplierCatalogueManager } from "@/lib/supplier-catalogue/auth";
import { buildCatalogueTargets } from "@/lib/supplier-catalogue/advance";
import { enqueueCatalogueCrawl } from "@/lib/supplier-catalogue/ingest";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { SupplierScraperConfig } from "@/lib/scrapers/supplier-types";

export const runtime = "nodejs";
export const maxDuration = 60;

function isValidTarget(value: unknown): value is SupplierScrapeTarget {
  if (!value || typeof value !== "object") return false;
  const target = value as Partial<SupplierScrapeTarget>;
  return (
    typeof target.id === "string" &&
    typeof target.name === "string" &&
    typeof target.url === "string" &&
    target.url.length > 0
  );
}

/**
 * POST /api/admin/supplier-catalogue/[id]/crawl
 * Start a crawl for an existing catalogue.
 * Body:
 * - entireCatalogue: true → all discovered brands/categories (slow, full)
 * - scrapeTargets + mode → scoped selection (fast path)
 * - discoverOnly: true → layout discovery only
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const auth = await requireSupplierCatalogueManager(supabase);
    if (!auth.authorized) return auth.response;

    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      maxProductsPerTarget?: number | null;
      entireCatalogue?: boolean;
      discoverOnly?: boolean;
      mode?: SupplierBrowseMode;
      scrapeTargets?: unknown;
    };

    const admin = createServiceRoleClient();
    const { data: catalogue } = await admin
      .from("supplier_catalogues")
      .select("id, scrape_config")
      .eq("id", id)
      .maybeSingle();

    if (!catalogue) {
      return NextResponse.json({ error: "Catalogue not found" }, { status: 404 });
    }

    const config = catalogue.scrape_config as SupplierScraperConfig | null;
    const hasConfig = Boolean(
      config &&
        typeof config === "object" &&
        config.productLinkSelector,
    );

    if (body.discoverOnly) {
      const runId = await enqueueCatalogueCrawl(admin, id, {
        pauseAfterDiscover: true,
        maxProductsPerTarget: body.maxProductsPerTarget ?? null,
      });
      kickAdvance(request, runId);
      return NextResponse.json({
        success: true,
        catalogueId: id,
        runId,
        message: "Layout discovery queued.",
      });
    }

    if (body.entireCatalogue) {
      if (!hasConfig) {
        const runId = await enqueueCatalogueCrawl(admin, id, {
          maxProductsPerTarget: body.maxProductsPerTarget ?? null,
          scoped: false,
          skipCoverage: false,
        });
        kickAdvance(request, runId);
        return NextResponse.json({
          success: true,
          catalogueId: id,
          runId,
          message:
            "Full catalogue crawl queued (will discover layout first, then crawl everything).",
        });
      }

      const { mode, targets } = buildCatalogueTargets(config!);
      const runId = await enqueueCatalogueCrawl(admin, id, {
        mode,
        targets,
        scoped: false,
        skipCoverage: false,
        maxProductsPerTarget: body.maxProductsPerTarget ?? null,
      });
      kickAdvance(request, runId);
      return NextResponse.json({
        success: true,
        catalogueId: id,
        runId,
        message: `Full catalogue crawl queued (${targets.length} targets). This can take hours.`,
      });
    }

    const scrapeTargets = Array.isArray(body.scrapeTargets)
      ? body.scrapeTargets.filter(isValidTarget)
      : [];

    if (scrapeTargets.length === 0) {
      return NextResponse.json(
        {
          error:
            "Select at least one brand/category, or pass entireCatalogue: true.",
        },
        { status: 400 },
      );
    }

    if (!hasConfig) {
      return NextResponse.json(
        {
          error:
            "Layout has not been discovered yet. Run Discover layout first.",
        },
        { status: 400 },
      );
    }

    const mode: SupplierBrowseMode =
      body.mode === "brand" || body.mode === "category"
        ? body.mode
        : config!.browseModes.includes("brand")
          ? "brand"
          : "category";

    const runId = await enqueueCatalogueCrawl(admin, id, {
      mode,
      targets: scrapeTargets,
      scoped: true,
      skipCoverage: true,
      maxProductsPerTarget: body.maxProductsPerTarget ?? null,
    });

    kickAdvance(request, runId);

    return NextResponse.json({
      success: true,
      catalogueId: id,
      runId,
      message: `Scoped crawl queued for ${scrapeTargets.length} selected targets.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to start crawl",
      },
      { status: 500 },
    );
  }
}

function kickAdvance(request: Request, runId: string) {
  const cronSecret = process.env.CRON_SECRET;
  const origin = new URL(request.url).origin;
  if (!cronSecret) return;
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
      console.error("[supplier-catalogue] re-crawl kick failed", error);
    }
  });
}
