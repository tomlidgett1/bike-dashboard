import Link from 'next/link'
import { BadgeCheck, Zap } from 'lucide-react'
import type { MarketplaceProduct } from '@/lib/types/marketplace'
import { resolveLivePrice, formatPriceAUD, formatPriceAUDFull } from '@/lib/marketplace/pricing'
import { cardImage } from '../_lib/images'
import { cn } from '@/lib/utils'

// ============================================================
// V2 product card — a Server Component. Ships zero JavaScript:
// hover states are CSS, the whole card is one <a>, and images
// are plain <img> tags with server-built Cloudinary srcsets.
// ============================================================

const NEW_WINDOW_MS = 48 * 60 * 60 * 1000

interface V2ProductCardProps {
  product: MarketplaceProduct
  /** Above-the-fold cards: eager-load + high fetch priority. */
  eager?: boolean
  /** `sizes` hint matching the card's rendered width. */
  sizes?: string
  className?: string
}

function productName(product: MarketplaceProduct): string {
  return product.display_name || product.description || 'Listing'
}

function sellerLabel(product: MarketplaceProduct): { label: string; verified: boolean } {
  if (product.listing_type === 'private_listing') {
    const first = product.first_name?.trim()
    return { label: first ? `Rider · ${first}` : 'Rider listing', verified: false }
  }
  return {
    label: product.store_name || 'Bike store',
    verified: product.store_account_type === 'bicycle_store' || product.store_bicycle_store === true,
  }
}

export function V2ProductCard({ product, eager = false, sizes, className }: V2ProductCardProps) {
  const image = cardImage(product)
  const live = resolveLivePrice(product)
  const seller = sellerLabel(product)
  const isNew =
    Boolean(product.created_at) &&
    Date.now() - new Date(product.created_at).getTime() < NEW_WINDOW_MS
  const express =
    product.uber_delivery_enabled === true && product.listing_type === 'store_inventory'

  return (
    <Link
      href={`/marketplace/product/${product.id}`}
      className={cn(
        'group block min-w-0 select-none outline-none',
        'focus-visible:rounded-2xl focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2',
        className,
      )}
    >
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-[#f4f4f2] ring-1 ring-black/[0.04]">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.src}
            srcSet={image.srcSet}
            sizes={sizes ?? '(min-width: 1024px) 240px, 45vw'}
            alt={productName(product)}
            width={512}
            height={512}
            loading={eager ? 'eager' : 'lazy'}
            fetchPriority={eager ? 'high' : 'auto'}
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-300">
            <Zap className="h-8 w-8" />
          </div>
        )}

        {/* Top-left: sale beats condition (max one chip per corner) */}
        {live.onSale ? (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-zinc-950 px-2 py-1 text-[11px] font-bold leading-none text-[#ffde59]">
            −{live.percentOff}%
          </span>
        ) : product.condition_rating ? (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-white/90 px-2 py-1 text-[11px] font-semibold leading-none text-zinc-700 backdrop-blur">
            {product.condition_rating}
          </span>
        ) : null}

        {isNew && (
          <span className="absolute right-2.5 top-2.5 rounded-full bg-[#ffde59] px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide leading-none text-zinc-950">
            New
          </span>
        )}

        {express && (
          <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-zinc-950/85 px-2 py-1 text-[10px] font-bold leading-none text-white backdrop-blur">
            <Zap className="h-3 w-3 fill-[#ffde59] text-[#ffde59]" />
            1-hr delivery
          </span>
        )}
      </div>

      <div className="mt-2.5 space-y-1 px-0.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-semibold tracking-tight text-zinc-950">
            {live.onSale ? formatPriceAUDFull(live.price) : formatPriceAUD(live.price)}
          </span>
          {live.onSale && live.originalPrice != null && (
            <span className="text-xs text-zinc-400 line-through">
              {formatPriceAUDFull(live.originalPrice)}
            </span>
          )}
        </div>
        <p className="truncate text-[13px] leading-snug text-zinc-600" title={productName(product)}>
          {productName(product)}
        </p>
        <p className="flex items-center gap-1 text-xs text-zinc-400">
          {seller.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-zinc-900" aria-label="Verified store" />}
          <span className="truncate">{seller.label}</span>
        </p>
      </div>
    </Link>
  )
}
