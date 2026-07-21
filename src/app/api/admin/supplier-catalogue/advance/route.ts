import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { advanceCatalogueCrawlChunk } from "@/lib/supplier-catalogue/advance";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/admin/supplier-catalogue/advance
 * Internal: process one crawl chunk, then self-chain if more work remains.
 * Auth: x-internal-secret === CRON_SECRET
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }

  const internalSecret = request.headers.get("x-internal-secret");
  if (internalSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    runId?: string;
  };
  const runId = body.runId;
  if (!runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  const { data: run } = await admin
    .from("supplier_catalogue_scrape_runs")
    .select("id, status")
    .eq("id", runId)
    .maybeSingle();

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  if (
    run.status === "succeeded" ||
    run.status === "coverage_unverified" ||
    run.status === "incomplete" ||
    run.status === "failed" ||
    run.status === "cancelled"
  ) {
    return NextResponse.json({ ok: true, skipped: true, status: run.status });
  }

  const origin = request.nextUrl.origin;

  after(async () => {
    try {
      const result = await advanceCatalogueCrawlChunk({
        admin,
        runId,
      });

      if (!result.complete) {
        await fetch(`${origin}/api/admin/supplier-catalogue/advance`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": cronSecret,
          },
          body: JSON.stringify({ runId }),
        });
      }
    } catch (error) {
      console.error("[supplier-catalogue/advance] chunk failed", runId, error);
    }
  });

  return NextResponse.json({ ok: true, runId });
}
