import Link from 'next/link'
import { ArrowUpRight, Bike, Cog, Shirt, Zap } from 'lucide-react'
import type { MarketplaceProduct } from '@/lib/types/marketplace'
import { cardImage } from '../_lib/images'

// ============================================================
// Category tiles — image-backed entry points into the catalogue.
// Each tile's image is a real product from that category picked
// server-side, so the navigation *is* the inventory.
// ============================================================

interface CategoryTile {
  key: string
  label: string
  matchCategories: string[]
  href: string
  icon: React.ComponentType<{ className?: string }>
}

const TILES: CategoryTile[] = [
  {
    key: 'Bicycles',
    label: 'Bicycles',
    matchCategories: ['Bicycles', 'Bikes'],
    href: '/marketplace?space=stores&level1=Bicycles',
    icon: Bike,
  },
  {
    key: 'Parts',
    label: 'Parts & components',
    matchCategories: ['Parts'],
    href: '/marketplace?space=stores&level1=Parts',
    icon: Cog,
  },
  {
    key: 'Apparel',
    label: 'Apparel & helmets',
    matchCategories: ['Apparel'],
    href: '/marketplace?space=stores&level1=Apparel',
    icon: Shirt,
  },
  {
    key: 'Nutrition',
    label: 'Nutrition',
    matchCategories: ['Nutrition'],
    href: '/marketplace?space=stores&level1=Nutrition',
    icon: Zap,
  },
]

/** Pick a representative product image per category from the fetched pool. */
function tileImage(tile: CategoryTile, pool: MarketplaceProduct[]) {
  const candidates = pool.filter(
    (p) => tile.matchCategories.includes(p.marketplace_category) && (p.cloudinary_public_id || p.card_url),
  )
  // Prefer products from bike stores over generic/test sellers for the visual.
  const preferred =
    candidates.find((p) => p.store_bicycle_store === true) ??
    candidates.find((p) => p.listing_type === 'private_listing') ??
    candidates[0]
  return preferred ? cardImage(preferred) : null
}

export function CategoryTiles({
  pool,
  counts,
}: {
  pool: MarketplaceProduct[]
  counts: Record<string, number>
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {TILES.map((tile) => {
        const image = tileImage(tile, pool)
        const count = counts[tile.key] ?? 0
        const Icon = tile.icon
        return (
          <Link
            key={tile.key}
            href={tile.href}
            className="group relative block overflow-hidden rounded-3xl bg-zinc-100 ring-1 ring-black/[0.04] outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
          >
            <div className="relative aspect-[4/3] sm:aspect-[5/4]">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={image.src}
                  srcSet={image.srcSet}
                  sizes="(min-width: 1024px) 300px, 45vw"
                  alt=""
                  width={512}
                  height={512}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200">
                  <Icon className="h-10 w-10 text-zinc-300" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/75 via-zinc-950/15 to-transparent" />
            </div>

            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-4">
              <div>
                <p className="text-[15px] font-bold tracking-tight text-white sm:text-base">{tile.label}</p>
                {count > 0 && (
                  <p className="mt-0.5 text-xs font-medium text-zinc-300">
                    {count.toLocaleString('en-AU')} live
                  </p>
                )}
              </div>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition-all duration-300 group-hover:bg-[#ffde59] group-hover:text-zinc-950">
                <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:rotate-45" />
              </span>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
