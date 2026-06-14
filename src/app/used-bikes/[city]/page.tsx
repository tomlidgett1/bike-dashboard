import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-chrome";
import { UsedGrid } from "@/components/marketing/used-grid";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/lib/seo/structured-data";
import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo/site";
import { fetchUsedProducts } from "@/lib/server/fetch-used-products";

export const revalidate = 300;

// Curated AU cities → the location fragment we match on (state code is the most
// reliable signal in free-text suburb-level pickup locations).
const CITIES: Record<string, { name: string; state: string; match: string }> = {
  melbourne: { name: "Melbourne", state: "Victoria", match: "VIC" },
  sydney: { name: "Sydney", state: "New South Wales", match: "NSW" },
  brisbane: { name: "Brisbane", state: "Queensland", match: "QLD" },
  perth: { name: "Perth", state: "Western Australia", match: "WA" },
  adelaide: { name: "Adelaide", state: "South Australia", match: "SA" },
};

// A city page only earns indexing once it has real local inventory — otherwise
// it would be a near-duplicate "doorway" page, which hurts SEO.
const MIN_LOCAL_FOR_INDEX = 4;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}): Promise<Metadata> {
  const { city } = await params;
  const c = CITIES[city?.toLowerCase()];
  if (!c) return { title: "Used bikes", robots: { index: false, follow: true } };

  const local = await fetchUsedProducts({ location: c.match, limit: 24 });
  const indexable = local.length >= MIN_LOCAL_FOR_INDEX;

  const title = `Used bikes for sale in ${c.name}`;
  const description = `Buy used and second-hand bikes in ${c.name}, ${c.state} on Yellow Jersey — road, mountain, gravel and e-bikes with secure payment and local pickup or delivery.`;

  return {
    title,
    description,
    alternates: { canonical: `/used-bikes/${city.toLowerCase()}` },
    // Don't index thin city pages until there's genuine local stock.
    robots: indexable ? undefined : { index: false, follow: true },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: `${title} · ${SITE_NAME}`,
      description,
      url: absoluteUrl(`/used-bikes/${city.toLowerCase()}`),
      locale: "en_AU",
    },
    twitter: { card: "summary_large_image", title: `${title} · ${SITE_NAME}`, description },
  };
}

export default async function CityUsedBikesPage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city } = await params;
  const c = CITIES[city?.toLowerCase()];
  if (!c) notFound();

  const local = await fetchUsedProducts({ location: c.match, limit: 24 });
  const hasLocal = local.length >= MIN_LOCAL_FOR_INDEX;
  // When a city has little/no local stock, show the national feed and frame it
  // honestly (deliverable Australia-wide) rather than an empty page.
  const products = hasLocal ? local : await fetchUsedProducts({ limit: 24 });

  return (
    <MarketingShell>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: "Yellow Jersey", url: SITE_URL },
            { name: "Used bikes", url: absoluteUrl("/used-bikes") },
            { name: c.name, url: absoluteUrl(`/used-bikes/${city.toLowerCase()}`) },
          ]),
        ]}
      />

      <section className="mx-auto max-w-[1340px] px-5 pb-8 pt-12 sm:px-6 sm:pb-10 sm:pt-20">
        <p className="text-sm font-medium text-[#b07b00]">Used bikes · {c.name}</p>
        <h1 className="mt-3 max-w-4xl text-[2.4rem] font-medium leading-[1.07] tracking-tight text-zinc-950 sm:text-[3.2rem]">
          Used bikes for sale in {c.name}.
        </h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-zinc-500 sm:text-lg sm:leading-relaxed">
          {hasLocal
            ? `Second-hand road, mountain, gravel and e-bikes from riders around ${c.name}. Buy safely with secure payment and local pickup or delivery.`
            : `Quality used bikes from riders across Australia, delivered to ${c.name} or available for pickup. New listings added daily.`}
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
            Sell your bike in {c.name}
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-[1340px] px-5 py-6 sm:px-6 sm:py-8">
        <h2 className="mb-5 text-[1.5rem] font-medium tracking-tight text-zinc-950 sm:text-[1.9rem]">
          {hasLocal ? `Used bikes in ${c.name}` : "Available across Australia"}
        </h2>
        {products.length > 0 ? (
          <UsedGrid products={products} />
        ) : (
          <p className="text-sm text-zinc-500">New listings are added daily — check back soon.</p>
        )}
      </section>

      <section className="border-t border-black/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-[1340px] px-5 text-center sm:px-6">
          <h2 className="text-3xl font-medium tracking-tight text-zinc-950 sm:text-[2.5rem]">
            Selling a bike in {c.name}?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-zinc-500">
            List it in two minutes and reach riders near you.
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
