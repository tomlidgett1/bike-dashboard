import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-chrome";
import { UsedGrid } from "@/components/marketing/used-grid";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/lib/seo/structured-data";
import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo/site";
import { fetchUsedProducts } from "@/lib/server/fetch-used-products";

export const revalidate = 300;

const TITLE = "Used bikes for sale across Australia";
const DESCRIPTION =
  "Buy quality used and second-hand bikes from riders across Australia on Yellow Jersey. Road, mountain, gravel and e-bikes, with secure payment and delivery or local pickup.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/used-bikes" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${TITLE} · ${SITE_NAME}`,
    description: DESCRIPTION,
    url: absoluteUrl("/used-bikes"),
    locale: "en_AU",
  },
  twitter: { card: "summary_large_image", title: `${TITLE} · ${SITE_NAME}`, description: DESCRIPTION },
};

const SEARCHES = [
  "road bike",
  "mountain bike",
  "gravel bike",
  "e-bike",
  "wheels",
  "groupset",
];

const CITIES = [
  { name: "Melbourne", slug: "melbourne" },
  { name: "Sydney", slug: "sydney" },
  { name: "Brisbane", slug: "brisbane" },
  { name: "Perth", slug: "perth" },
  { name: "Adelaide", slug: "adelaide" },
];

export default async function UsedBikesPage() {
  const products = await fetchUsedProducts({ limit: 24 });

  return (
    <MarketingShell>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: "Yellow Jersey", url: SITE_URL },
            { name: "Used bikes", url: absoluteUrl("/used-bikes") },
          ]),
        ]}
      />

      {/* Hero */}
      <section className="mx-auto max-w-[1340px] px-5 pb-10 pt-12 sm:px-6 sm:pb-12 sm:pt-20">
        <p className="text-sm font-medium text-[#b07b00]">Used bikes</p>
        <h1 className="mt-3 max-w-4xl text-[2.6rem] font-medium leading-[1.06] tracking-tight text-zinc-950 sm:text-[3.4rem] lg:text-[3.6rem]">
          Used bikes for sale across Australia.
        </h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-zinc-500 sm:text-lg sm:leading-relaxed">
          Second-hand road, mountain, gravel and e-bikes from riders around the country — bought
          safely, with secure payment and delivery or local pickup.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/marketplace/used-products"
            className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            Browse all used bikes
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

      {/* Latest used listings */}
      <section className="mx-auto max-w-[1340px] px-5 py-6 sm:px-6 sm:py-8">
        <div className="mb-5 flex items-end justify-between">
          <h2 className="text-[1.5rem] font-medium tracking-tight text-zinc-950 sm:text-[1.9rem]">
            Just listed
          </h2>
          <Link
            href="/marketplace/used-products"
            className="inline-flex items-center gap-1 text-sm font-medium text-[#b07b00] hover:text-[#8a6000]"
          >
            See all
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {products.length > 0 ? (
          <UsedGrid products={products} />
        ) : (
          <p className="text-sm text-zinc-500">New listings are added daily — check back soon.</p>
        )}
      </section>

      {/* Browse by type */}
      <section className="mx-auto max-w-[1340px] px-5 py-8 sm:px-6 sm:py-12">
        <h2 className="text-[1.5rem] font-medium tracking-tight text-zinc-950 sm:text-[1.9rem]">
          Browse by type
        </h2>
        <div className="mt-5 flex flex-wrap gap-2.5">
          {SEARCHES.map((s) => (
            <Link
              key={s}
              href={`/marketplace?search=${encodeURIComponent(`used ${s}`)}`}
              className="rounded-full border border-black/[0.08] bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-black/20 hover:text-zinc-900"
            >
              Used {s}s
            </Link>
          ))}
        </div>
      </section>

      {/* Browse by city */}
      <section className="mx-auto max-w-[1340px] px-5 py-8 sm:px-6 sm:py-12">
        <h2 className="text-[1.5rem] font-medium tracking-tight text-zinc-950 sm:text-[1.9rem]">
          Used bikes near you
        </h2>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {CITIES.map((c) => (
            <Link
              key={c.slug}
              href={`/used-bikes/${c.slug}`}
              className="flex items-center gap-2 rounded-[14px] border border-black/[0.07] bg-white px-4 py-3.5 text-sm font-medium text-zinc-800 transition-colors hover:border-black/20"
            >
              <MapPin className="h-4 w-4 text-zinc-400" />
              {c.name}
            </Link>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-black/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-[1340px] px-5 text-center sm:px-6">
          <h2 className="text-3xl font-medium tracking-tight text-zinc-950 sm:text-[2.5rem]">
            Got a bike to sell?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-zinc-500">
            List it in two minutes and reach riders looking for exactly what you have.
          </p>
          <Link
            href="/marketplace/sell"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            Sell your bike
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
