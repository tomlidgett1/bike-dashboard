import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/admin/seo/run — manually trigger the SEO orchestrator (admin only).
// Invokes the seo-orchestrator edge function with the service-role JWT.
export const dynamic = 'force-dynamic';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== 'tom@lidgett.net') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) {
    return NextResponse.json({ error: 'Supabase env not configured' }, { status: 500 });
  }

  try {
    const res = await fetch(`${base}/functions/v1/seo-orchestrator`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ source: 'manual', cadence: 'manual', force: true }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: `orchestrator ${res.status}`, detail: body }, { status: 502 });
    }
    return NextResponse.json({ ok: true, ...body });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'failed to reach orchestrator' }, { status: 502 });
  }
}
