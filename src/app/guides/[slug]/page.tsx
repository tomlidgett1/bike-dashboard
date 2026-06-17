import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-chrome";
import { UsedGrid } from "@/components/marketing/used-grid";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema, faqSchema } from "@/lib/seo/structured-data";
import {
  getAllLandingSlugs,
  getLandingPage,
  type LandingPage,
} from "@/lib/seo/landing-pages";
import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo/site";
import { fetchLandingProducts } from "@/lib/server/fetch-landing-products";

export const revalidate = 300;

// Index once there's enough inventory to avoid a thin doorway page.
const MIN_FOR_INDEX = 4;

export function generateStaticParams() {
  return getAllLandingSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = getLandingPage(slug);
  if (!page) return { title: "Guide", robots: { index: false, follow: true } };

  const { products } = await fetchLandingProducts(page.filters, {
    location: page.location,
    limit: 24,
  });
  const indexable = products.length >= MIN_FOR_INDEX;

  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: `/guides/${page.slug}` },
    robots: indexable ? undefined : { index: false, follow: true },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: `${page.title} · ${SITE_NAME}`,
      description: page.description,
      url: absoluteUrl(`/guides/${page.slug}`),
      locale: "en_AU",
    },
    twitter: {
      card: "summary_large_image",
      title: `${page.title} · ${SITE_NAME}`,
      description: page.description,
    },
  };
}

function DarkPill({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
    >
      {children}
    </Link>
  );
}

function RelatedGuides({ page }: { page: LandingPage }) {
  const related = page.related
    .map((slug) => getLandingPage(slug))
    .filter((p): p is LandingPage => !!p);

  if (related.length === 0) return null;

  return (
    <section className="mx-auto max-w-[1340px] px-5 py-8 sm:px-6 sm:py-12">
      <h2 className="text-[1.5rem] font-medium tracking-tight text-zinc-950 sm:text-[1.9rem]">
        Related guides
      </h2>
      <div className="mt-5 flex flex-wrap gap-2.5">
        {related.map((r) => (
          <Link
            key={r.slug}
            href={`/guides/${r.slug}`}
            className="rounded-full border border-black/[0.08] bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-black/20 hover:text-zinc-900"
          >
            {r.title}
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getLandingPage(slug);
  if (!page) notFound();

  const { products, hasLocalMatch } = await fetchLandingProducts(page.filters, {
    location: page.location,
    limit: 24,
  });

  const gridTitle =
    page.location && !hasLocalMatch
      ? page.fallbackGridHeading ?? page.gridHeading
      : page.gridHeading;

  const canonical = `/guides/${page.slug}`;

  return (
    <MarketingShell>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: "Yellow Jersey", url: SITE_URL },
            { name: "Guides", url: absoluteUrl("/guides") },
            { name: page.title, url: absoluteUrl(canonical) },
          ]),
          faqSchema(page.faqs),
        ]}
      />

      <section className="mx-auto max-w-[1340px] px-5 pb-8 pt-12 sm:px-6 sm:pb-10 sm:pt-20">
        <p className="text-sm font-medium text-[#b07b00]">{page.eyebrow}</p>
        <h1 className="mt-3 max-w-4xl text-[2.4rem] font-medium leading-[1.07] tracking-tight text-zinc-950 sm:text-[3.2rem]">
          {page.headline}
        </h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-zinc-500 sm:text-lg sm:leading-relaxed">
          {page.intro}
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <DarkPill href={page.ctaHref}>
            {page.ctaLabel}
            <ArrowRight className="h-4 w-4" />
          </DarkPill>
          {page.secondaryHref && page.secondaryLabel ? (
            <Link
              href={page.secondaryHref}
              className="inline-flex items-center gap-2 rounded-full bg-black/[0.06] px-5 py-2.5 text-sm font-medium text-zinc-800 transition-colors hover:bg-black/[0.1]"
            >
              {page.secondaryLabel}
            </Link>
          ) : null}
        </div>
      </section>

      <section className="mx-auto max-w-[1340px] px-5 py-6 sm:px-6 sm:py-8">
        <div className="mb-5 flex items-end justify-between">
          <h2 className="text-[1.5rem] font-medium tracking-tight text-zinc-950 sm:text-[1.9rem]">
            {gridTitle}
          </h2>
          <Link
            href={page.browseHref}
            className="inline-flex items-center gap-1 text-sm font-medium text-[#b07b00] hover:text-[#8a6000]"
          >
            {page.browseLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {products.length > 0 ? (
          <UsedGrid products={products} />
        ) : (
          <p className="text-sm text-zinc-500">New listings are added daily — check back soon.</p>
        )}
      </section>

      <section className="mx-auto max-w-[1340px] px-5 py-8 sm:px-6 sm:py-12">
        <h2 className="text-[1.5rem] font-medium tracking-tight text-zinc-950 sm:text-[1.9rem]">
          Common questions
        </h2>
        <div className="mt-8 grid gap-x-10 gap-y-8 lg:grid-cols-2">
          {page.faqs.map((f) => (
            <div key={f.q}>
              <h3 className="text-[15px] font-medium text-zinc-900">{f.q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <RelatedGuides page={page} />

      <section className="border-t border-black/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-[1340px] px-5 text-center sm:px-6">
          <h2 className="text-3xl font-medium tracking-tight text-zinc-950 sm:text-[2.5rem]">
            {page.intent === "sell" ? "Ready to list your bike?" : "Find your next bike on Yellow Jersey"}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-zinc-500">
            {page.intent === "sell"
              ? "List in two minutes and reach riders across Australia."
              : "Secure payment, delivery or local pickup — built for cyclists."}
          </p>
          <div className="mt-8 flex justify-center">
            <DarkPill href={page.ctaHref}>
              {page.ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </DarkPill>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
