import { cloudinaryCardLoader } from '@/lib/utils/cloudinary-transforms'
import type { MarketplaceProduct } from '@/lib/types/marketplace'

// ============================================================
// Server-side image URL building for /v2.
//
// /v2 deliberately skips next/image: URLs (with full srcsets)
// are computed during server render and shipped as plain <img>
// tags pointing straight at the Cloudinary CDN. No proxy hop
// through /_next/image, no hydration cost, AVIF negotiated via
// f_auto — the fastest path available with the existing pipeline.
// ============================================================

const CARD_WIDTHS = [256, 384, 512, 768] as const

export interface ResolvedCardImage {
  src: string
  srcSet?: string
}

function hasCloudName(): boolean {
  return Boolean(
    (process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME)?.trim(),
  )
}

/**
 * Square card crop. Returns a 1:1 `c_fill` URL set built from the
 * product's cloudinary public_id, falling back to the pre-resolved
 * card URL for legacy/external images.
 */
export function cardImage(product: MarketplaceProduct): ResolvedCardImage | null {
  const publicId = product.cloudinary_public_id
  if (publicId && hasCloudName()) {
    return {
      src: cloudinaryCardLoader({ src: publicId, width: 512 }),
      srcSet: CARD_WIDTHS.map(
        (w) => `${cloudinaryCardLoader({ src: publicId, width: w })} ${w}w`,
      ).join(', '),
    }
  }
  const fallback = product.card_url || product.primary_image_url
  return fallback ? { src: fallback } : null
}
