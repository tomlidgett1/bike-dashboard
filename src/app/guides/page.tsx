import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-chrome";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/lib/seo/structured-data";
import {
  AUSTRALIA_GUIDES,
  MELBOURNE_GUIDES,
  LANDING_PAGES,
} from "@/lib/seo/landing-pages";
import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo/site";

const TITLE = "Bike buying & selling guides";
const DESCRIPTION =
  "Guides for buying and selling bikes in Melbourne and across Australia on Yellow Jersey — road, mountain, gravel, e-bikes, parts and more.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/guides" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${TITLE} · ${SITE_NAME}`,
    description: DESCRIPTION,
    url: absoluteUrl("/guides"),
    locale: "en_AU",
  },
  twitter: { card: "summary_large_image", title: `${TITLE} · ${SITE_NAME}`, description: DESCRIPTION },
};

function GuideLink({ slug, title }: { slug: string; title: string }) {
  return (
    <Link
      href={`/guides/${slug}`}
      className="flex items-center justify-between rounded-md border border-black/[0.07] bg-white px-4 py-3.5 text-sm font-medium text-zinc-800 transition-colors hover:border-black/20"
    >
      {title}
      <ArrowRight className="h-4 w-4 shrink-0 text-zinc-400" />
    </Link>
  );
}

export default function GuidesIndexPage() {
  return (
    <MarketingShell>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: "Yellow Jersey", url: SITE_URL },
            { name: "Guides", url: absoluteUrl("/guides") },
          ]),
        ]}
      />

      <section className="mx-auto max-w-[1340px] px-5 pb-10 pt-12 sm:px-6 sm:pb-12 sm:pt-20">
        <p className="text-sm font-medium text-[#b07b00]">Guides</p>
        <h1 className="mt-3 max-w-4xl text-[2.6rem] font-medium leading-[1.06] tracking-tight text-zinc-950 sm:text-[3.4rem]">
          Bike buying & selling guides.
        </h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-zinc-500 sm:text-lg sm:leading-relaxed">
          Everything you need to buy or sell bikes in Melbourne and across Australia — with live
          listings from Yellow Jersey&apos;s marketplace.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            Browse marketplace
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/sell-your-bike"
            className="inline-flex items-center gap-2 rounded-full bg-black/[0.06] px-5 py-2.5 text-sm font-medium text-zinc-800 transition-colors hover:bg-black/[0.1]"
          >
            Sell your bike
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-[1340px] px-5 py-8 sm:px-6 sm:py-12">
        <div className="mb-5 flex items-center gap-2">
          <MapPin className="h-5 w-5 text-zinc-400" />
          <h2 className="text-[1.5rem] font-medium tracking-tight text-zinc-950 sm:text-[1.9rem]">
            Melbourne
          </h2>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {MELBOURNE_GUIDES.map((g) => (
            <GuideLink key={g.slug} slug={g.slug} title={g.title} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1340px] px-5 py-8 sm:px-6 sm:py-12">
        <h2 className="text-[1.5rem] font-medium tracking-tight text-zinc-950 sm:text-[1.9rem]">
          Australia
        </h2>
        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {AUSTRALIA_GUIDES.map((g) => (
            <GuideLink key={g.slug} slug={g.slug} title={g.title} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1340px] px-5 py-8 sm:px-6 sm:py-12">
        <h2 className="text-[1.5rem] font-medium tracking-tight text-zinc-950 sm:text-[1.9rem]">
          Also popular
        </h2>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link
            href="/used-bikes"
            className="rounded-full border border-black/[0.08] bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-black/20"
          >
            Used bikes Australia
          </Link>
          <Link
            href="/used-bikes/melbourne"
            className="rounded-full border border-black/[0.08] bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-black/20"
          >
            Used bikes Melbourne
          </Link>
          <Link
            href="/sell-your-bike"
            className="rounded-full border border-black/[0.08] bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-black/20"
          >
            Sell your bike
          </Link>
        </div>
        <p className="mt-4 text-xs text-zinc-400">{LANDING_PAGES.length} guides · Updated daily</p>
      </section>
    </MarketingShell>
  );
}
