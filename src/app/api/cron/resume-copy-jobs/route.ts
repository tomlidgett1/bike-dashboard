import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const STALE_MINUTES = 3;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const staleThreshold = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();

  const { data: staleJobs, error } = await supabase
    .from("optimize_background_jobs")
    .select("id")
    .in("status", ["queued", "running"])
    .eq("job_type", "copy_batch")
    .lt("updated_at", staleThreshold);

  if (error) {
    console.error("[resume-copy-jobs] DB error", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!staleJobs?.length) {
    return NextResponse.json({ ok: true, resumed: 0 });
  }

  const origin = request.nextUrl.origin;

  const results = await Promise.allSettled(
    staleJobs.map((job) =>
      fetch(`${origin}/api/optimize/advance-copy-batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": cronSecret,
        },
        body: JSON.stringify({ jobId: job.id }),
      }),
    ),
  );

  const resumed = results.filter((r) => r.status === "fulfilled").length;
  console.log(`[resume-copy-jobs] resumed ${resumed}/${staleJobs.length} stale jobs`);

  return NextResponse.json({ ok: true, resumed, total: staleJobs.length });
}
