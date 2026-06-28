import { NextRequest, NextResponse } from "next/server";

// Vercel Cron → hourly. Seeds a fresh Search Dominance Agent run: invokes the
// seo-orchestrator edge function, which opens a run and enqueues the pipeline
// (the seo-worker cron drains it). Replaces pg_cron so activation needs no DB
// SQL — just this route + a vercel.json entry.
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
    const res = await fetch(`${base}/functions/v1/seo-orchestrator`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ source: "cron", cadence: "hourly" }),
    });
    const body = await res.json().catch(() => ({}));
    return NextResponse.json({ ok: res.ok, status: res.status, ...body });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed to reach orchestrator" }, { status: 502 });
  }
}
