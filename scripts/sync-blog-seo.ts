/** Backfill blog_posts into seo_pages. Usage: npx tsx --env-file=.env.local scripts/sync-blog-seo.ts */
import { createClient } from '@supabase/supabase-js';
import { syncAllPublishedBlogPostsToSeo } from '../src/lib/blog/seo-register';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  const supabase = createClient(url, key);
  const count = await syncAllPublishedBlogPostsToSeo(supabase);
  console.log(`Synced ${count} blog post(s) to seo_pages`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
