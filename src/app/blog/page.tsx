import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Clock, PenLine } from 'lucide-react';
import { MarketingShell } from '@/components/marketing/marketing-chrome';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbSchema, itemListSchema } from '@/lib/seo/structured-data';
import { getPublishedPosts } from '@/lib/blog/agent';
import { sanitizeBlogText } from '@/lib/blog/sanitize';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { SITE_NAME, SITE_URL, absoluteUrl } from '@/lib/seo/site';
import type { BlogPost } from '@/lib/blog/types';

const TITLE = 'The Yellow Jersey Blog';
const DESCRIPTION =
  'Opinionated takes on cycling — races, gear, culture, and whatever is making the peloton talk today.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/blog' },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: `${TITLE} · ${SITE_NAME}`,
    description: DESCRIPTION,
    url: absoluteUrl('/blog'),
    locale: 'en_AU',
  },
  twitter: { card: 'summary_large_image', title: `${TITLE} · ${SITE_NAME}`, description: DESCRIPTION },
};

export const revalidate = 300;

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function PostCard({ post, featured }: { post: BlogPost; featured?: boolean }) {
  if (featured) {
    return (
      <Link
        href={`/blog/${post.slug}`}
        className="group grid overflow-hidden rounded-md border border-black/[0.07] bg-white transition-shadow hover:shadow-md lg:grid-cols-2"
      >
        {post.hero_image_url && (
          <div className="relative aspect-[16/10] overflow-hidden lg:aspect-auto lg:min-h-[320px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.hero_image_url}
              alt={post.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              referrerPolicy="no-referrer"
            />
          </div>
        )}
        <div className="flex flex-col justify-center p-6 sm:p-8 lg:p-10">
          <p className="text-xs font-medium uppercase tracking-wider text-[#b07b00]">Latest dispatch</p>
          <h2 className="mt-3 text-2xl font-medium leading-tight tracking-tight text-zinc-950 transition-colors group-hover:text-zinc-700 sm:text-3xl">
            {sanitizeBlogText(post.title)}
          </h2>
          <p className="mt-3 line-clamp-3 text-[15px] leading-relaxed text-zinc-500">{sanitizeBlogText(post.excerpt)}</p>
          <div className="mt-5 flex items-center gap-4 text-xs text-zinc-400">
            <time>{formatDate(post.published_at)}</time>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {post.reading_time_minutes} min
            </span>
          </div>
          <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-800">
            Read article
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex flex-col overflow-hidden rounded-md border border-black/[0.07] bg-white transition-shadow hover:shadow-sm"
    >
      {post.hero_image_url && (
        <div className="relative aspect-[16/10] overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.hero_image_url}
            alt={post.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            referrerPolicy="no-referrer"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col p-5">
        {post.tags[0] && (
          <span className="mb-2 w-fit rounded-md border border-black/[0.08] bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-500">
            {post.tags[0]}
          </span>
        )}
        <h3 className="text-lg font-medium leading-snug tracking-tight text-zinc-900 group-hover:text-zinc-700">
          {sanitizeBlogText(post.title)}
        </h3>
        <p className="mt-2 line-clamp-2 flex-1 text-sm leading-relaxed text-zinc-500">{sanitizeBlogText(post.excerpt)}</p>
        <div className="mt-4 flex items-center justify-between text-xs text-zinc-400">
          <time>{formatDate(post.published_at)}</time>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {post.reading_time_minutes} min
          </span>
        </div>
      </div>
    </Link>
  );
}

export default async function BlogIndexPage() {
  const supabase = createServiceRoleClient();
  let posts: BlogPost[] = [];
  try {
    posts = (await getPublishedPosts(supabase)) as BlogPost[];
  } catch {
    posts = [];
  }

  const [featured, ...rest] = posts;

  return (
    <MarketingShell>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Yellow Jersey', url: SITE_URL },
            { name: 'Blog', url: absoluteUrl('/blog') },
          ]),
          ...(posts.length > 0
            ? [
                itemListSchema(
                  posts.map((post) => ({
                    url: absoluteUrl(`/blog/${post.slug}`),
                    name: sanitizeBlogText(post.title),
                  })),
                ),
              ]
            : []),
        ]}
      />

      <section className="mx-auto max-w-[1340px] px-5 pb-10 pt-12 sm:px-6 sm:pb-12 sm:pt-20">
        <div className="flex items-center gap-2">
          <PenLine className="h-5 w-5 text-zinc-400" />
          <p className="text-sm font-medium text-[#b07b00]">Editorial</p>
        </div>
        <h1 className="mt-3 max-w-4xl text-[2.6rem] font-medium leading-[1.06] tracking-tight text-zinc-950 sm:text-[3.4rem]">
          The Yellow Jersey Blog.
        </h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-zinc-500 sm:text-lg sm:leading-relaxed">
          Sharp, opinionated cycling journalism — what&apos;s happening in the sport, the industry, and the
          culture. Written daily by our autonomous editor, grounded in what&apos;s actually topical right now.
        </p>
      </section>

      <section className="mx-auto max-w-[1340px] px-5 pb-16 sm:px-6 sm:pb-24">
        {posts.length === 0 ? (
          <div className="rounded-md border border-black/[0.07] bg-white px-6 py-16 text-center">
            <p className="text-lg font-medium text-zinc-800">The dispatch is warming up.</p>
            <p className="mt-2 text-sm text-zinc-500">
              Our daily cycling columnist is researching today&apos;s angle. Check back soon.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {featured && <PostCard post={featured} featured />}
            {rest.length > 0 && (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </MarketingShell>
  );
}
