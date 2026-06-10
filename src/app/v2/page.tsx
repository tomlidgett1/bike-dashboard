import Link from 'next/link'
import { ArrowRight, Tag, Zap } from 'lucide-react'
import { fetchV2HomeData } from './_lib/data'
import { V2Header } from './_components/v2-header'
import { Hero } from './_components/hero'
import { BrandMarquee } from './_components/brand-marquee'
import { CategoryTiles } from './_components/category-tiles'
import { Rail, RailItem } from './_components/rail'
import { V2ProductCard } from './_components/v2-product-card'
import { StoreCard, YourStoreCard } from './_components/store-cards'
import { RiderFeature } from './_components/rider-feature'
import { ValueProps, SellBanner, V2Footer } from './_components/closing-bands'

// ============================================================
// /v2 — the marketplace homepage, rebuilt server-first.
//
// One parallel data fan-out, fully ISR-cached, streamed as
// static HTML. Client JavaScript on this page is exactly two
// islands: the ⌘K search palette and the rail arrow buttons.
// Everything else — cards, hero, marquee, tiles — is HTML+CSS.
// ============================================================

export const revalidate = 60

/** Shared section header: title + optional kicker + "view all" link. */
function SectionHeader({
  kicker,
  title,
  href,
  hrefLabel,
  icon,
}: {
  kicker?: string
  title: string
  href: string
  hrefLabel: string
  icon?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        {kicker && (
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400">
            {icon}
            {kicker}
          </p>
        )}
        <h2 className="text-2xl font-black tracking-tight text-zinc-950 sm:text-[28px]">{title}</h2>
      </div>
      <Link
        href={href}
        className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 px-4 py-2 text-[13px] font-semibold text-zinc-700 transition-colors hover:border-zinc-950 hover:bg-zinc-950 hover:text-white"
      >
        {hrefLabel}
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
      </Link>
    </div>
  )
}

export default async function V2HomePage() {
  const data = await fetchV2HomeData()

  return (
    <>
      <V2Header />

      <main>
        <h1 className="sr-only">Yellow Jersey — the cycling marketplace</h1>
        <Hero counts={data.counts} heroPicks={data.heroPicks} />
        <BrandMarquee brands={data.brands} />

        {/* ── Shop by category ─────────────────────────────── */}
        <section className="mx-auto max-w-7xl px-4 pb-4 pt-16 sm:px-6 sm:pt-20 lg:px-10">
          <SectionHeader
            kicker="The catalogue"
            title="Shop the sport"
            href="/marketplace?space=stores"
            hrefLabel="All categories"
          />
          <CategoryTiles pool={data.justListed.concat(data.expressItems)} counts={data.categoryCounts} />
        </section>

        {/* ── Just listed ──────────────────────────────────── */}
        {data.justListed.length > 0 && (
          <section className="mx-auto max-w-7xl px-4 pt-14 sm:px-6 sm:pt-16 lg:px-10 [content-visibility:auto] [contain-intrinsic-size:auto_460px]">
            <SectionHeader
              kicker="Fresh stock"
              title="Just listed"
              href="/marketplace?space=stores"
              hrefLabel="View all"
            />
            <Rail ariaLabel="Just listed products">
              {data.justListed.map((product) => (
                <RailItem key={product.id}>
                  <V2ProductCard product={product} sizes="(min-width: 1024px) 236px, 46vw" />
                </RailItem>
              ))}
            </Rail>
          </section>
        )}

        {/* ── 1-hour delivery ──────────────────────────────── */}
        {data.expressItems.length >= 4 && (
          <section className="mx-auto max-w-7xl px-4 pt-14 sm:px-6 sm:pt-16 lg:px-10 [content-visibility:auto] [contain-intrinsic-size:auto_460px]">
            <SectionHeader
              kicker="Uber Express"
              icon={<Zap className="h-3.5 w-3.5 fill-[#ffde59] text-[#ffde59]" />}
              title="At your door in an hour"
              href="/marketplace?space=uber"
              hrefLabel={`All ${data.counts.express.toLocaleString('en-AU')} items`}
            />
            <Rail ariaLabel="One-hour delivery products">
              {data.expressItems.map((product) => (
                <RailItem key={product.id}>
                  <V2ProductCard product={product} sizes="(min-width: 1024px) 236px, 46vw" />
                </RailItem>
              ))}
            </Rail>
          </section>
        )}

        {/* ── Rider to rider ───────────────────────────────── */}
        <div className="pt-16 sm:pt-20">
          <RiderFeature listings={data.riderListings} />
        </div>

        {/* ── Deals (only when there's real depth) ─────────── */}
        {data.deals.length >= 4 && (
          <section className="mx-auto max-w-7xl px-4 pt-14 sm:px-6 sm:pt-16 lg:px-10 [content-visibility:auto] [contain-intrinsic-size:auto_460px]">
            <SectionHeader
              kicker="Limited time"
              icon={<Tag className="h-3.5 w-3.5 text-zinc-400" />}
              title="On sale right now"
              href="/marketplace?space=stores"
              hrefLabel="All deals"
            />
            <Rail ariaLabel="Discounted products">
              {data.deals.map((product) => (
                <RailItem key={product.id}>
                  <V2ProductCard product={product} sizes="(min-width: 1024px) 236px, 46vw" />
                </RailItem>
              ))}
            </Rail>
          </section>
        )}

        {/* ── Stores ───────────────────────────────────────── */}
        {data.stores.length > 0 && (
          <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6 sm:pt-20 lg:px-10 [content-visibility:auto] [contain-intrinsic-size:auto_320px]">
            <SectionHeader
              kicker="The supply side"
              title="The stores behind the stock"
              href="/marketplace?space=stores"
              hrefLabel="All stores"
            />
            <Rail ariaLabel="Bike stores">
              {data.stores.map((store) => (
                <RailItem key={store.id} className="w-[78vw] sm:w-[300px] lg:w-[320px]">
                  <StoreCard store={store} />
                </RailItem>
              ))}
              <RailItem className="w-[78vw] sm:w-[300px] lg:w-[320px]">
                <YourStoreCard />
              </RailItem>
            </Rail>
          </section>
        )}

        <ValueProps />
        <SellBanner />
      </main>

      <V2Footer />
    </>
  )
}
