import Link from 'next/link'
import { Search, ArrowRight, Zap, BadgeCheck, Sparkles } from 'lucide-react'
import type { MarketplaceProduct } from '@/lib/types/marketplace'
import { resolveLivePrice, formatPriceAUD } from '@/lib/marketplace/pricing'
import type { V2Counts } from '../_lib/data'
import { cardImage } from '../_lib/images'

// ============================================================
// Hero — Server Component. The LCP element is text, so first
// paint never waits on imagery. The collage on the right is
// real, live inventory (clickable), not stock photography.
// The search bar is a plain GET form: it works before any
// JavaScript loads, then the ⌘K palette takes over on focus.
// ============================================================

const QUICK_CHIPS = [
  { label: 'Road bikes', href: '/marketplace?space=stores&level1=Bicycles' },
  { label: 'Parts', href: '/marketplace?space=stores&level1=Parts' },
  { label: 'Helmets', href: '/marketplace?space=stores&level1=Apparel' },
  { label: 'Nutrition', href: '/marketplace?space=stores&level1=Nutrition' },
  { label: 'Rider listings', href: '/marketplace' },
] as const

const COLLAGE_LAYOUT = [
  { tilt: '-7deg', className: 'left-0 top-6 z-20 w-[46%]', delay: '0s' },
  { tilt: '4deg', className: 'right-0 top-0 z-10 w-[42%]', delay: '-2.4s' },
  { tilt: '-2deg', className: 'bottom-0 left-[22%] z-30 w-[44%]', delay: '-4.8s' },
] as const

function CollageCard({
  product,
  layout,
  eager,
}: {
  product: MarketplaceProduct
  layout: (typeof COLLAGE_LAYOUT)[number]
  eager: boolean
}) {
  const image = cardImage(product)
  if (!image) return null
  const live = resolveLivePrice(product)
  const name = product.display_name || product.description || 'Listing'

  return (
    <Link
      href={`/marketplace/product/${product.id}`}
      className={`v2-float group absolute block ${layout.className}`}
      style={{ '--v2-tilt': layout.tilt, animationDelay: layout.delay } as React.CSSProperties}
      aria-label={`${name} — ${formatPriceAUD(live.price)}`}
    >
      <div className="overflow-hidden rounded-2xl bg-white p-2 shadow-2xl shadow-black/40 ring-1 ring-white/20 transition-transform duration-300 group-hover:scale-[1.04] group-hover:[transform:rotate(0deg)_scale(1.04)]">
        <div className="overflow-hidden rounded-xl bg-[#f4f4f2]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.src}
            srcSet={image.srcSet}
            sizes="(min-width: 1024px) 220px, 0px"
            alt={name}
            width={512}
            height={512}
            loading={eager ? 'eager' : 'lazy'}
            fetchPriority={eager ? 'high' : 'auto'}
            decoding="async"
            className="aspect-square w-full object-cover"
          />
        </div>
        <div className="flex items-center justify-between gap-2 px-1.5 pb-1 pt-2">
          <span className="truncate text-[11px] font-medium text-zinc-500">{name}</span>
          <span className="shrink-0 rounded-full bg-zinc-950 px-2 py-0.5 text-[11px] font-bold text-[#ffde59]">
            {formatPriceAUD(live.price)}
          </span>
        </div>
      </div>
    </Link>
  )
}

export function Hero({ counts, heroPicks }: { counts: V2Counts; heroPicks: MarketplaceProduct[] }) {
  return (
    <section className="v2-noise relative overflow-hidden bg-zinc-950 text-white">
      {/* Backdrop layers */}
      <div aria-hidden className="v2-grid-bg absolute inset-0" />
      <div
        aria-hidden
        className="absolute -left-40 -top-48 h-[560px] w-[560px] rounded-full bg-[#ffde59]/[0.13] blur-[140px]"
      />
      <div
        aria-hidden
        className="absolute -right-24 top-40 hidden h-[420px] w-[420px] rounded-full bg-[#ffde59]/[0.07] blur-[120px] lg:block"
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 sm:pb-24 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:px-10 lg:pb-28">
        {/* ── Left: message + search ─────────────────────── */}
        <div className="max-w-2xl">
          {counts.live > 0 && (
            <p className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.06] py-1.5 pl-3 pr-4 text-xs font-semibold tracking-wide text-zinc-300">
              <span className="v2-live-dot h-2 w-2 rounded-full bg-[#ffde59]" />
              {counts.live.toLocaleString('en-AU')} listings live right now
            </p>
          )}

          <h1 className="text-[clamp(2.6rem,6vw,4.6rem)] font-black leading-[0.98] tracking-tight">
            Every bike.
            <br />
            Every store.
            <br />
            <span className="text-[#ffde59]">One marketplace.</span>
          </h1>

          <p className="mt-6 max-w-lg text-base leading-relaxed text-zinc-400 sm:text-lg">
            New from Australia&apos;s best bike stores, used from riders like you —
            searched in one place, delivered in as little as an hour.
          </p>

          {/* Search — plain GET form, enhanced by the ⌘K palette */}
          <form action="/marketplace" method="get" role="search" className="mt-8 max-w-xl">
            <div className="flex items-center gap-2 rounded-full bg-white p-2 pl-5 shadow-[0_8px_40px_rgba(0,0,0,0.45)] ring-1 ring-white/20 transition-shadow focus-within:shadow-[0_8px_48px_rgba(255,222,89,0.25)]">
              <Search className="h-5 w-5 shrink-0 text-zinc-400" />
              <input
                type="search"
                name="search"
                data-v2-search-focus
                placeholder="Search bikes, parts, apparel, stores…"
                aria-label="Search the marketplace"
                autoComplete="off"
                className="h-10 w-full min-w-0 bg-transparent text-[15px] text-zinc-900 outline-none placeholder:text-zinc-400"
              />
              <kbd className="hidden shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-semibold text-zinc-400 md:block">
                ⌘K
              </kbd>
              <button
                type="submit"
                className="h-10 shrink-0 rounded-full bg-zinc-950 px-5 text-sm font-bold text-[#ffde59] transition-colors hover:bg-zinc-800"
              >
                Search
              </button>
            </div>
          </form>

          {/* Quick chips */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-zinc-500">Popular:</span>
            {QUICK_CHIPS.map((chip) => (
              <Link
                key={chip.href}
                href={chip.href}
                className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-[#ffde59]/50 hover:bg-[#ffde59]/10 hover:text-[#ffde59]"
              >
                {chip.label}
              </Link>
            ))}
          </div>

          {/* Trust stats */}
          <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4">
            <div>
              <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <BadgeCheck className="h-3.5 w-3.5 text-[#ffde59]" /> Verified stores
              </dt>
              <dd className="mt-1 text-2xl font-extrabold tracking-tight">
                {counts.stores > 0 ? counts.stores : '—'}
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <Zap className="h-3.5 w-3.5 text-[#ffde59]" /> 1-hr deliverable
              </dt>
              <dd className="mt-1 text-2xl font-extrabold tracking-tight">
                {counts.express.toLocaleString('en-AU')}
                <span className="ml-1 text-sm font-semibold text-zinc-500">items</span>
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <Sparkles className="h-3.5 w-3.5 text-[#ffde59]" /> List with AI
              </dt>
              <dd className="mt-1 text-2xl font-extrabold tracking-tight">
                60<span className="ml-1 text-sm font-semibold text-zinc-500">seconds</span>
              </dd>
            </div>
          </dl>
        </div>

        {/* ── Right: live inventory collage ───────────────── */}
        {heroPicks.length > 0 && (
          <div className="relative hidden aspect-[10/11] max-h-[540px] lg:block" aria-label="Featured live listings">
            <div
              aria-hidden
              className="absolute left-1/2 top-1/2 h-[88%] w-[88%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-white/10"
            />
            {heroPicks.map((product, i) => (
              <CollageCard
                key={product.id}
                product={product}
                layout={COLLAGE_LAYOUT[i]}
                eager={i === 0}
              />
            ))}
            <Link
              href="/marketplace?space=stores"
              className="absolute -bottom-2 right-2 z-40 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-zinc-950/80 px-3.5 py-2 text-xs font-semibold text-zinc-300 backdrop-blur transition-colors hover:border-[#ffde59]/50 hover:text-[#ffde59]"
            >
              Browse everything <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}
