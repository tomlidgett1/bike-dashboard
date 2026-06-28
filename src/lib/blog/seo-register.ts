import type { SupabaseClient } from '@supabase/supabase-js';
import { absoluteUrl, SITE_URL } from '@/lib/seo/site';
import type { BlogPost } from './types';

type BlogSeoRow = Pick<
  BlogPost,
  'id' | 'slug' | 'title' | 'excerpt' | 'meta_description' | 'topic' | 'published_at'
>;

/** Register a published blog post in seo_pages for the Search Dominance control plane. */
export async function registerBlogPostForSeo(
  supabase: SupabaseClient,
  post: BlogSeoRow,
): Promise<void> {
  const url = `/blog/${post.slug}`;
  const publishedAt = post.published_at ?? new Date().toISOString();

  const { error } = await supabase.from('seo_pages').upsert(
    {
      url,
      page_type: 'blog',
      target_keyword: post.topic || post.title,
      title: post.title,
      meta_description: post.meta_description || post.excerpt,
      h1: post.title,
      status: 'published',
      indexability: 'index',
      canonical_url: absoluteUrl(url),
      quality_score: 1,
      spam_risk_score: 0,
      supply_count: 0,
      params: { blog_post_id: post.id, slug: post.slug, source: 'blog_agent' },
      content: { source: 'blog_agent', blog_post_id: post.id },
      last_published_at: publishedAt,
      last_refreshed_at: publishedAt,
    },
    { onConflict: 'url' },
  );

  if (error) {
    console.error('[Blog SEO] seo_pages upsert failed:', error.message);
  }
}

/** Backfill seo_pages for any published blog posts not yet registered. */
export async function syncAllPublishedBlogPostsToSeo(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase
    .from('blog_posts')
    .select('id, slug, title, excerpt, meta_description, topic, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(100);

  if (error || !data?.length) return 0;

  let synced = 0;
  for (const post of data as BlogSeoRow[]) {
    await registerBlogPostForSeo(supabase, post);
    synced += 1;
  }
  return synced;
}

/**
 * Push freshly published content to Google NOW instead of waiting for the daily
 * SEO run: enqueue a sitemap re-submit + URL inspection (blog posts are inspected
 * first) and kick the seo-worker so it processes immediately. Best-effort — it
 * never blocks publishing, and the daily run is the fallback.
 */
export async function nudgeSeoAfterBlogPublish(supabase: SupabaseClient): Promise<void> {
  try {
    await supabase.from('seo_tasks').insert([
      { task_type: 'sitemap', priority: 1, payload: { source: 'blog-publish' } },
      { task_type: 'url-inspection', priority: 1, payload: { source: 'blog-publish' } },
    ]);

    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (base && key) {
      // Kick the worker; it runs to completion on Supabase even though we only
      // wait long enough to dispatch the request.
      await fetch(`${base}/functions/v1/seo-worker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ trigger: 'blog-publish' }),
        signal: AbortSignal.timeout(3000),
      }).catch(() => {});
    }
  } catch (err) {
    console.error('[Blog SEO] nudge failed:', err instanceof Error ? err.message : String(err));
  }
}

export function blogPostCanonical(slug: string): string {
  return absoluteUrl(`/blog/${slug}`);
}

export { SITE_URL };
