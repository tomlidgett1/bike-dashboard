import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { runBlogAgent } from '@/lib/blog/agent';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// POST /api/admin/blog/run — manually trigger the blog writer agent.
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
    // empty body is fine — agent picks topical angle
  }

  const service = createServiceRoleClient();

  try {
    const result = await runBlogAgent({
      supabase: service,
      trigger: 'manual',
      customTopic,
    });
    return NextResponse.json({
      ok: true,
      slug: result.slug,
      postId: result.postId,
      runId: result.run.id,
      topic: result.run.resolved_topic,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Blog agent failed' },
      { status: 500 },
    );
  }
}
