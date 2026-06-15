import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { runVariantDetectionJob } from "@/lib/variants/run-detection-job";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[advance-detection] CRON_SECRET is not configured");
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const internalSecret = request.headers.get("x-internal-secret");
  if (internalSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const runId = body.runId as string | undefined;
  if (!runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { data: run } = await supabase
    .from("product_variant_detection_runs")
    .select("id, user_id, status")
    .eq("id", runId)
    .maybeSingle();

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  if (run.status === "cancelled" || run.status === "ready" || run.status === "failed") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const userId = run.user_id as string;
  const origin = request.nextUrl.origin;

  after(async () => {
    try {
      const complete = await runVariantDetectionJob({ runId, userId });
      if (!complete) {
        await fetch(`${origin}/api/optimize/variants/advance-detection`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-internal-secret": cronSecret },
          body: JSON.stringify({ runId }),
        });
      }
    } catch (error) {
      console.error("[advance-detection] chunk failed", runId, error);
    }
  });

  return NextResponse.json({ ok: true });
}
