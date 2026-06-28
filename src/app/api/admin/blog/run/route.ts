import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { createBlogAgentRun, executeBlogAgentRun } from '@/lib/blog/agent';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 600;

// POST /api/admin/blog/run — queue the blog writer (returns immediately; poll status).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== 'tom@lidgett.net') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let customTopic: string | null = null;
  try {
    const body = await request.json();
    customTopic = typeof body?.topic === 'string' ? body.topic.trim() : null;
  } catch {
    // empty body is fine
  }

  const service = createServiceRoleClient();

  const { data: activeRun } = await service
    .from('blog_agent_runs')
    .select('id')
    .eq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeRun) {
    return NextResponse.json({
      ok: true,
      runId: activeRun.id,
      status: 'running',
      message: 'Agent already writing — polling existing run',
    });
  }

  try {
    const run = await createBlogAgentRun(service, 'manual', customTopic);

    const work = executeBlogAgentRun({
      supabase: service,
      runId: run.id,
      customTopic,
    }).catch((err) => {
      console.error('[Blog Agent] background run failed:', err);
    });

    after(() => work);

    return NextResponse.json({
      ok: true,
      runId: run.id,
      status: 'running',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to start blog agent' },
      { status: 500 },
    );
  }
}
