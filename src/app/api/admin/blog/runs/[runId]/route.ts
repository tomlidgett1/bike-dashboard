import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getBlogAgentRun } from '@/lib/blog/agent';

export const dynamic = 'force-dynamic';

// GET /api/admin/blog/runs/[runId] — poll background blog agent status.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== 'tom@lidgett.net') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { runId } = await params;
  const service = createServiceRoleClient();
  const run = await getBlogAgentRun(service, runId);

  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  let slug: string | null = null;
  if (run.post_id) {
    const { data: post } = await service
      .from('blog_posts')
      .select('slug')
      .eq('id', run.post_id)
      .maybeSingle();
    slug = post?.slug ?? null;
  }

  return NextResponse.json({
    runId: run.id,
    status: run.status,
    topic: run.resolved_topic || run.custom_topic,
    error: run.error_message,
    slug,
    durationMs: run.duration_ms,
  });
}
