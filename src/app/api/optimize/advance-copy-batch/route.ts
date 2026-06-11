import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { runCopyBatchJob } from "@/lib/optimize/run-copy-batch-job";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CHUNK_SIZE = 4;

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[advance-copy-batch] CRON_SECRET is not configured");
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const internalSecret = request.headers.get("x-internal-secret");
  if (internalSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const jobId = body.jobId as string | undefined;

  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { data: job } = await supabase
    .from("optimize_background_jobs")
    .select("id, user_id, status")
    .eq("id", jobId)
    .maybeSingle();

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status === "cancelled" || job.status === "completed" || job.status === "failed") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const userId = job.user_id as string;
  const origin = request.nextUrl.origin;

  after(async () => {
    try {
      const complete = await runCopyBatchJob({
        jobId,
        origin,
        userId,
        internalSecret: cronSecret,
        maxProducts: CHUNK_SIZE,
      });

      if (!complete) {
        // More products remain — chain to the next chunk
        await fetch(`${origin}/api/optimize/advance-copy-batch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": cronSecret,
          },
          body: JSON.stringify({ jobId }),
        });
      }
    } catch (error) {
      console.error("[advance-copy-batch] chunk failed", jobId, error);
    }
  });

  return NextResponse.json({ ok: true });
}
