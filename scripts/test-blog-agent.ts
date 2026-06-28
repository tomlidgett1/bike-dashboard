/**
 * End-to-end test for the blog writer agent.
 * Usage: npx tsx --env-file=.env.local scripts/test-blog-agent.ts
 */
import { createClient } from '@supabase/supabase-js';
import { runBlogAgent } from '../src/lib/blog/agent';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!url || !key || !openaiKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or OPENAI_API_KEY');
  }

  console.log('[test-blog-agent] Starting agent with a short test topic…');

  const supabase = createClient(url, key);
  const result = await runBlogAgent({
    supabase,
    trigger: 'manual',
    customTopic: 'Why Melbourne cyclists are obsessed with café stops',
  });

  console.log('[test-blog-agent] Success!');
  console.log('  slug:', result.slug);
  console.log('  postId:', result.postId);
  console.log('  topic:', result.run.resolved_topic);
  console.log('  duration:', result.run.duration_ms, 'ms');
}

main().catch((err) => {
  console.error('[test-blog-agent] Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
