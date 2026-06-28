/**
 * Daily autonomous cycling blog agent.
 * GET /api/cron/blog-agent — runs at 7:00am Melbourne time, 7 days a week.
 *
 * Vercel cron is UTC-only, so we fire at 20:00 and 21:00 UTC and gate on
 * Australia/Melbourne local hour to handle AEST/AEDT automatically.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { runBlogAgent } from '@/lib/blog/agent';
import { syncAllPublishedBlogPostsToSeo } from '@/lib/blog/seo-register';
import { isMelbourne7amWindow, melbourneDayKey } from '@/lib/blog/melbourne-time';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function verifyCron(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  return request.headers.get('x-vercel-cron') === '1';
}

async function hasPublishedTodayMelbourne(supabase: SupabaseClient): Promise<boolean> {
  const todayKey = melbourneDayKey();
  const { data, error } = await supabase
    .from('blog_posts')
    .select('published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(3);

  if (error) {
    console.warn('[CRON BLOG-AGENT] Could not check today\'s posts:', error.message);
    return false;
  }

  return (data ?? []).some(
    (row) => row.published_at && melbourneDayKey(new Date(row.published_at)) === todayKey,
  );
}

export async function GET(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Register published blog posts in seo_pages for sitemap/GSC/admin visibility.
  await syncAllPublishedBlogPostsToSeo(supabase).catch((err) => {
    console.warn('[CRON BLOG-AGENT] SEO sync failed:', err);
  });

  if (!isMelbourne7amWindow()) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'Outside 7:00am Melbourne window',
    });
  }

  if (await hasPublishedTodayMelbourne(supabase)) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'Post already published today (Melbourne)',
    });
  }

  try {
    const result = await runBlogAgent({ supabase, trigger: 'cron' });
    return NextResponse.json({
      success: true,
      slug: result.slug,
      postId: result.postId,
      runId: result.run.id,
    });
  } catch (err) {
    console.error('[CRON BLOG-AGENT]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Blog agent failed' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
