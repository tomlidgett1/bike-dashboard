import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Clock } from 'lucide-react';
import { MarketingShell } from '@/components/marketing/marketing-chrome';
import { BlogArticleBody, BlogExternalImage } from '@/components/blog/blog-article-body';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbSchema, articleSchema } from '@/lib/seo/structured-data';
import { getPostBySlug } from '@/lib/blog/agent';
import { sanitizeBlogText } from '@/lib/blog/sanitize';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { SITE_NAME, SITE_URL, absoluteUrl } from '@/lib/seo/site';
import type { BlogPost } from '@/lib/blog/types';
import { notFound } from 'next/navigation';

export const revalidate = 300;

interface PageProps {
  params: Promise<{ slug: string }>;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createServiceRoleClient();
  const post = (await getPostBySlug(supabase, slug)) as BlogPost | null;
  if (!post) return { title: 'Post not found' };

  const title = post.title;
  const description = post.meta_description || post.excerpt;

  return {
    title,
    description,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      type: 'article',
      siteName: SITE_NAME,
      title: `${title} · ${SITE_NAME}`,
      description,
      url: absoluteUrl(`/blog/${slug}`),
      locale: 'en_AU',
      publishedTime: post.published_at ?? undefined,
      images: post.hero_image_url ? [{ url: post.hero_image_url }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} · ${SITE_NAME}`,
      description,
      images: post.hero_image_url ? [post.hero_image_url] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = createServiceRoleClient();
  const post = (await getPostBySlug(supabase, slug)) as BlogPost | null;
  if (!post) notFound();

  const publishedLabel = formatDate(post.published_at);

  return (
    <MarketingShell>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Yellow Jersey', url: SITE_URL },
            { name: 'Blog', url: absoluteUrl('/blog') },
            { name: post.title, url: absoluteUrl(`/blog/${slug}`) },
          ]),
          articleSchema({
            title: post.title,
            description: post.excerpt,
            url: absoluteUrl(`/blog/${slug}`),
            datePublished: post.published_at ?? post.created_at,
            dateModified: post.updated_at,
            image: post.hero_image_url ?? undefined,
          }),
        ]}
      />

      <article>
        {post.hero_image_url && (
          <div className="relative mx-auto max-w-[1340px] px-5 pt-8 sm:px-6 sm:pt-12">
            <div className="relative aspect-[21/9] w-full overflow-hidden rounded-md">
              <BlogExternalImage
                src={post.hero_image_url}
                alt={post.hero_image_caption || post.title}
                caption={post.hero_image_caption ?? undefined}
                credit={post.hero_image_credit ?? undefined}
                className="h-full [&_img]:h-full [&_img]:object-cover"
              />
            </div>
          </div>
        )}

        <header className="mx-auto max-w-[720px] px-5 pb-6 pt-10 sm:px-6 sm:pt-14">
          <Link
            href="/blog"
            className="mb-8 inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to blog
          </Link>

          {post.tags.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-black/[0.08] bg-white px-2.5 py-1 text-xs font-medium text-zinc-600"
                >
                  {sanitizeBlogText(tag)}
                </span>
              ))}
            </div>
          )}

          <h1 className="text-[2.2rem] font-medium leading-[1.08] tracking-tight text-zinc-950 sm:text-[2.8rem]">
            {sanitizeBlogText(post.title)}
          </h1>

          <p className="mt-5 text-lg leading-relaxed text-zinc-500">{sanitizeBlogText(post.excerpt)}</p>

          <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-zinc-400">
            {publishedLabel && <time dateTime={post.published_at ?? undefined}>{publishedLabel}</time>}
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {post.reading_time_minutes} min read
            </span>
            <span>Yellow Jersey Editorial</span>
          </div>
        </header>

        <div className="mx-auto max-w-[720px] px-5 pb-20 sm:px-6 sm:pb-28">
          <BlogArticleBody sections={post.body} />
        </div>
      </article>
    </MarketingShell>
  );
}
