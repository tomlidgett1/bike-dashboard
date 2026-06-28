import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { slugify } from '@/lib/seo/site';
import { BLOG_POST_JSON_SCHEMA } from './schema';
import { sanitizeBlogCredit, sanitizeBlogTags, sanitizeBlogText } from './sanitize';
import { registerBlogPostForSeo, syncAllPublishedBlogPostsToSeo } from './seo-register';
import type { BlogAgentRun, GeneratedBlogPost } from './types';

const MODEL = 'gpt-5.5';

const WRITER_INSTRUCTIONS = `You are the lead cycling columnist for Yellow Jersey, Australia's most opinionated bike marketplace.
Write in Australian English. Your voice is sharp, knowledgeable, and occasionally provocative, like a brilliant cycling journalist who actually rides, fixes bikes, and argues in the peloton café.

RULES:
- Research current cycling news, races, gear launches, industry drama, and cultural moments using web search before writing.
- Be genuinely opinionated. Take a stance. Don't write bland SEO filler.
- Ground claims in what you find online. Name races, riders, brands, dates where relevant, but never paste URLs or "source" links into the article.
- NEVER use em dashes (the long — character). Use commas, full stops, or a simple hyphen instead.
- NEVER include hyperlinks, bare URLs, markdown links, or "Source:" / "Via:" citations in any text field.
- Write for cyclists who care: road, gravel, MTB, e-bikes, commuting, shop culture.
- Include at least one image section mid-article (type: image) with a real URL from your web search.
- Hero image must be a real, publicly accessible HTTPS image URL from cycling news, race photography, or manufacturer press. Never invent URLs.
- Image credits must be a short plain-text name only (e.g. "Getty Images", "ASO"), never a URL.
- 900 to 1400 words total across sections. Mix paragraph, heading, subheading, quote, and list blocks.
- reading_time_minutes should reflect actual length (roughly 200 wpm).
- excerpt: punchy 1 to 2 sentences that hook the reader.
- tags: lowercase cycling topics (e.g. "tour de france", "gravel", "industry").
- When given a list of already-published articles, never repeat those topics or near-duplicate angles.`;

type ResponseOutputItem = {
  type?: string;
  content?: Array<{ type?: string; text?: string }>;
};

function extractJson(text: string): GeneratedBlogPost | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as GeneratedBlogPost;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as GeneratedBlogPost;
    } catch {
      return null;
    }
  }
}

function extractOutputText(response: OpenAI.Responses.Response): string {
  let outputText = '';
  for (const item of response.output ?? []) {
    if (item.type === 'message') {
      for (const content of (item as ResponseOutputItem).content ?? []) {
        if (content.type === 'output_text' && content.text) outputText += content.text;
      }
    }
  }
  return outputText;
}

type PreviousBlogSummary = {
  title: string;
  topic: string | null;
  tags: string[];
  published_at: string | null;
};

async function getRecentPostSummaries(
  supabase: SupabaseClient,
  limit = 30,
): Promise<PreviousBlogSummary[]> {
  const { data, error } = await supabase
    .from('blog_posts')
    .select('title, topic, tags, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[Blog Agent] Could not load previous posts for dedup:', error.message);
    return [];
  }
  return data ?? [];
}

function formatPreviousPostsBlock(posts: PreviousBlogSummary[]): string {
  if (!posts.length) return '';

  const lines = posts.map((p, i) => {
    const date = p.published_at
      ? new Date(p.published_at).toLocaleDateString('en-AU')
      : 'unknown date';
    const tags = p.tags?.length ? ` · tags: ${p.tags.join(', ')}` : '';
    const topic = p.topic ? ` · topic: ${p.topic}` : '';
    return `${i + 1}. "${p.title}" (${date})${topic}${tags}`;
  });

  return `
ALREADY PUBLISHED on Yellow Jersey — do NOT repeat these topics, angles, or near-duplicate titles. Choose something meaningfully different:
${lines.join('\n')}
`;
}

function isTooSimilarToPrevious(
  generated: GeneratedBlogPost,
  previous: PreviousBlogSummary[],
): PreviousBlogSummary | null {
  const genTopic = slugify(generated.topic || generated.title);
  const genTitle = slugify(generated.title);

  for (const p of previous) {
    const prevTopic = slugify(p.topic || p.title);
    const prevTitle = slugify(p.title);

    if (!genTopic || !prevTopic) continue;
    if (genTopic === prevTopic || genTitle === prevTitle) return p;

    const shorter = genTopic.length < prevTopic.length ? genTopic : prevTopic;
    const longer = genTopic.length < prevTopic.length ? prevTopic : genTopic;
    if (shorter.length >= 24 && longer.includes(shorter)) return p;
  }

  return null;
}

function buildResearchPrompt(
  customTopic?: string | null,
  previousPosts: PreviousBlogSummary[] = [],
  retryAvoid?: string,
): string {
  const previousBlock = formatPreviousPostsBlock(previousPosts);
  const retryBlock = retryAvoid
    ? `\nYou previously picked something too close to "${retryAvoid}". Choose a clearly different angle.\n`
    : '';

  if (customTopic?.trim()) {
    return `Write an opinionated, world-class blog post about this topic:

"${customTopic.trim()}"
${previousBlock}${retryBlock}
Research the topic thoroughly on the web first. Find what's happening right now in cycling around this theme: races, products, debates, culture. Then write the article. Do not include URLs or source links in the copy.

If we have already published on this exact topic recently, find a fresh sub-angle or newer development rather than repeating the same take.

Return valid JSON matching the schema.`;
  }

  const today = new Date().toLocaleDateString('en-AU', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `Today is ${today}. Research what's topical in cycling RIGHT NOW: pro racing (Tour, Giro, classics, Worlds), gravel drama, MTB news, e-bike regulation, industry acquisitions, viral moments, gear launches, Australian cycling angles where possible.
${previousBlock}${retryBlock}
Pick ONE compelling angle that would make a cyclist stop scrolling. Write a fresh daily column, not a roundup of everything. It must not overlap with any topic we have already published above. Do not include URLs or source links in the copy.

Return valid JSON matching the schema.`;
}

async function generateBlogPost(
  openai: OpenAI,
  customTopic?: string | null,
  previousPosts: PreviousBlogSummary[] = [],
): Promise<GeneratedBlogPost> {
  let retryAvoid: string | undefined;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await openai.responses.create({
      model: MODEL,
      instructions: WRITER_INSTRUCTIONS,
      tools: [
        {
          type: 'web_search_preview' as const,
          search_context_size: 'high' as const,
          user_location: { type: 'approximate' as const, country: 'AU' },
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'blog_post',
          strict: true,
          schema: BLOG_POST_JSON_SCHEMA,
        },
      },
      input: buildResearchPrompt(customTopic, previousPosts, retryAvoid),
    });

    const outputText = extractOutputText(response);
    const parsed = extractJson(outputText);
    if (!parsed) {
      throw new Error('Failed to parse blog post from model output');
    }

    const sanitized = sanitizeGeneratedPost(parsed);
    const duplicate = isTooSimilarToPrevious(sanitized, previousPosts);
    if (!duplicate || attempt === 1) {
      return sanitized;
    }

    retryAvoid = duplicate.topic || duplicate.title;
    console.info('[Blog Agent] Topic too similar to previous post, retrying:', retryAvoid);
  }

  throw new Error('Failed to generate a distinct blog topic');
}

function sanitizeGeneratedPost(post: GeneratedBlogPost): GeneratedBlogPost {
  return {
    ...post,
    title: sanitizeBlogText(post.title),
    excerpt: sanitizeBlogText(post.excerpt),
    meta_description: sanitizeBlogText(post.meta_description),
    topic: sanitizeBlogText(post.topic),
    tags: sanitizeBlogTags(post.tags),
    hero_image: {
      ...post.hero_image,
      caption: sanitizeBlogText(post.hero_image.caption),
      credit: sanitizeBlogCredit(post.hero_image.credit) ?? '',
    },
    sections: post.sections.map((section) => ({
      ...section,
      content: sanitizeBlogText(section.content),
      items: section.items?.map((item) => sanitizeBlogText(item)),
      image: section.image
        ? {
            ...section.image,
            caption: sanitizeBlogText(section.image.caption),
            credit: sanitizeBlogCredit(section.image.credit) ?? '',
          }
        : section.image,
    })),
  };
}

function emptyOr(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeSections(sections: GeneratedBlogPost['sections']) {
  return sections.map((section) => {
    const content = emptyOr(section.content);
    const base = {
      type: section.type,
      ...(content ? { content: sanitizeBlogText(content) } : {}),
    };

    if (section.type === 'list' && section.items?.length) {
      return {
        ...base,
        items: section.items.map((item) => sanitizeBlogText(item)).filter(Boolean),
      };
    }

    if (section.type === 'image' && emptyOr(section.image?.url)) {
      const credit = sanitizeBlogCredit(section.image!.credit);
      return {
        ...base,
        image: {
          url: section.image!.url.trim(),
          ...(credit ? { credit } : {}),
          ...(emptyOr(section.image!.caption)
            ? { caption: sanitizeBlogText(section.image!.caption) }
            : {}),
        },
      };
    }

    return base;
  });
}

async function uniqueSlug(
  supabase: SupabaseClient,
  baseTitle: string,
): Promise<string> {
  const base = slugify(baseTitle) || 'cycling-dispatch';
  let slug = base;
  let attempt = 0;
  while (attempt < 20) {
    const { data } = await supabase
      .from('blog_posts')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (!data) return slug;
    attempt += 1;
    slug = `${base}-${attempt}`;
  }
  return `${base}-${Date.now()}`;
}

export interface RunBlogAgentOptions {
  supabase: SupabaseClient;
  trigger: 'cron' | 'manual';
  customTopic?: string | null;
}

export interface RunBlogAgentResult {
  run: BlogAgentRun;
  postId?: string;
  slug?: string;
}

export async function runBlogAgent({
  supabase,
  trigger,
  customTopic,
}: RunBlogAgentOptions): Promise<RunBlogAgentResult> {
  const startedAt = Date.now();
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const { data: run, error: runError } = await supabase
    .from('blog_agent_runs')
    .insert({
      status: 'running',
      trigger_source: trigger,
      custom_topic: customTopic?.trim() || null,
    })
    .select()
    .single();

  if (runError || !run) {
    throw new Error(runError?.message || 'Failed to create agent run');
  }

  const openai = new OpenAI({ apiKey: openaiKey });

  try {
    const previousPosts = await getRecentPostSummaries(supabase);
    const generated = await generateBlogPost(openai, customTopic, previousPosts);
    const slug = await uniqueSlug(supabase, generated.title);
    const now = new Date().toISOString();

    const { data: post, error: postError } = await supabase
      .from('blog_posts')
      .insert({
        slug,
        title: generated.title,
        excerpt: generated.excerpt,
        meta_description: generated.meta_description,
        topic: generated.topic,
        body: normalizeSections(generated.sections),
        hero_image_url: generated.hero_image.url,
        hero_image_credit: sanitizeBlogCredit(generated.hero_image.credit),
        hero_image_caption: emptyOr(generated.hero_image.caption),
        tags: generated.tags,
        reading_time_minutes: generated.reading_time_minutes,
        status: 'published',
        published_at: now,
      })
      .select()
      .single();

    if (postError || !post) {
      throw new Error(postError?.message || 'Failed to save blog post');
    }

    await registerBlogPostForSeo(supabase, {
      id: post.id,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      meta_description: post.meta_description,
      topic: post.topic,
      published_at: post.published_at,
    });
    await syncAllPublishedBlogPostsToSeo(supabase).catch(() => {});

    try {
      const { revalidatePath } = await import('next/cache');
      revalidatePath('/sitemap.xml');
      revalidatePath('/blog');
      revalidatePath(`/blog/${post.slug}`);
    } catch {
      // revalidatePath only works in Next server context
    }

    const durationMs = Date.now() - startedAt;
    const { data: updatedRun, error: updateError } = await supabase
      .from('blog_agent_runs')
      .update({
        status: 'completed',
        resolved_topic: generated.topic,
        post_id: post.id,
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
      })
      .eq('id', run.id)
      .select()
      .single();

    if (updateError) {
      console.error('[Blog Agent] Run update failed:', updateError);
    }

    return {
      run: (updatedRun ?? run) as BlogAgentRun,
      postId: post.id,
      slug: post.slug,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await supabase
      .from('blog_agent_runs')
      .update({
        status: 'error',
        error_message: message,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
      })
      .eq('id', run.id);
    throw err;
  }
}

export async function getPublishedPosts(supabase: SupabaseClient, limit = 50) {
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

export async function getPostBySlug(supabase: SupabaseClient, slug: string) {
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();

  if (error) throw error;
  return data;
}
