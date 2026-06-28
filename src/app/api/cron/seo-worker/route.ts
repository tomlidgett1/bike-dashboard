import { NextRequest, NextResponse } from "next/server";

// Vercel Cron → every 5 min. Drains the seo_tasks queue by invoking the
// seo-worker edge function (handles the orchestrator's staggered pipeline,
// page-generator/validator fan-out, and retries). The worker self-bounds to a
// time budget; if this route times out first, the worker keeps running on
// Supabase and the next tick continues — safe either way.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return NextResponse.json({ error: "Supabase env missing" }, { status: 500 });

  try {
    const res = await fetch(`${base}/functions/v1/seo-worker`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ trigger: "cron" }),
    });
    const body = await res.json().catch(() => ({}));
    return NextResponse.json({ ok: res.ok, status: res.status, ...body });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed to reach worker" }, { status: 502 });
  }
}
