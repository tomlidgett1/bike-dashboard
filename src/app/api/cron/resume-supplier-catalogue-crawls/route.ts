import { NextRequest, NextResponse } from "next/server";
import { enrichProductImages } from "@/lib/supplier-catalogue/images";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Resume crawls that went quiet (self-chain dropped, deploy, timeout). */
const STALE_MINUTES = 4;
/** Drain a few ready catalogues that still need hero CDN hosting. */
const HERO_DRAIN_LIMIT = 40;
const HERO_CATALOGUE_LIMIT = 3;

/**
 * GET /api/cron/resume-supplier-catalogue-crawls
 * Runs every few minutes via vercel.json.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const staleThreshold = new Date(
    Date.now() - STALE_MINUTES * 60 * 1000,
  ).toISOString();

  const { data: staleRuns, error } = await admin
    .from("supplier_catalogue_scrape_runs")
    .select("id")
    .in("status", ["queued", "discovering", "crawling", "enriching"])
    .lt("updated_at", staleThreshold)
    .limit(20);

  if (error) {
    console.error("[resume-supplier-catalogue-crawls] DB error", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const origin = request.nextUrl.origin;
  let resumed = 0;

  if (staleRuns?.length) {
    const results = await Promise.allSettled(
      staleRuns.map((run) =>
        fetch(`${origin}/api/admin/supplier-catalogue/advance`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": cronSecret,
          },
          body: JSON.stringify({ runId: run.id }),
        }),
      ),
    );
    resumed = results.filter((result) => result.status === "fulfilled").length;
  }

  // Background-drain hero images for ready catalogues (URL-only scrape → CDN later)
  const { data: pendingProducts } = await admin
    .from("supplier_catalogue_products")
    .select("catalogue_id")
    .in("image_enrichment_status", ["pending", "failed"])
    .lt("image_enrichment_attempts", 3)
    .limit(200);

  const catalogueIds = [
    ...new Set(
      (pendingProducts ?? [])
        .map((row) => row.catalogue_id as string)
        .filter(Boolean),
    ),
  ].slice(0, HERO_CATALOGUE_LIMIT);

  let heroesProcessed = 0;
  for (const catalogueId of catalogueIds) {
    const result = await enrichProductImages({
      admin,
      catalogueId,
      limit: HERO_DRAIN_LIMIT,
    });
    heroesProcessed += result.processed;
  }

  console.log(
    `[resume-supplier-catalogue-crawls] resumed ${resumed}/${staleRuns?.length ?? 0}, heroes ${heroesProcessed}`,
  );

  return NextResponse.json({
    ok: true,
    resumed,
    total: staleRuns?.length ?? 0,
    heroesProcessed,
    heroCatalogues: catalogueIds.length,
  });
}
