import Link from 'next/link'
import { ArrowRight, ShieldCheck, Sparkles } from 'lucide-react'
import type { MarketplaceProduct } from '@/lib/types/marketplace'
import { V2ProductCard } from './v2-product-card'

// ============================================================
// Rider-to-rider feature — private listings get an editorial
// block instead of drowning in the store feed. Server Component.
// ============================================================

export function RiderFeature({ listings }: { listings: MarketplaceProduct[] }) {
  if (listings.length === 0) return null

  return (
    <section className="border-y border-zinc-100 bg-[#fafaf8] [content-visibility:auto] [contain-intrinsic-size:auto_560px]">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-16 lg:px-10">
        {/* Copy */}
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-zinc-950 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[#ffde59]">
            Rider to rider
          </p>
          <h2 className="mt-5 text-3xl font-black tracking-tight text-zinc-950 sm:text-4xl">
            Straight from
            <br />
            the bunch.
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-zinc-500">
            Real bikes and gear from real riders — photographed in garages, not
            studios. Every listing gets an AI-written spec sheet so you know
            exactly what you&apos;re buying.
          </p>

          <ul className="mt-6 space-y-3 text-sm text-zinc-600">
            <li className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-zinc-900" />
              Secure checkout — money moves when you say so
            </li>
            <li className="flex items-start gap-2.5">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-zinc-900" />
              AI-graded condition and model identification
            </li>
          </ul>

          <Link
            href="/marketplace"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-zinc-950 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-zinc-800"
          >
            Browse rider listings
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Listings */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {listings.slice(0, 3).map((product, i) => (
            <V2ProductCard
              key={product.id}
              product={product}
              sizes="(min-width: 1024px) 240px, 45vw"
              className={i === 2 ? 'max-lg:hidden' : undefined}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
