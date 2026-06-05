import { createClient } from '@supabase/supabase-js'
import { resolveProductImage } from '@/lib/services/image-resolver'
import { toCurrentHeroPublicId } from '@/lib/utils/cloudinary-transforms'
import type { MarketplaceProduct } from '@/lib/types/marketplace'

export const PUBLIC_MARKETPLACE_CARD_FIELDS = `
  id,
  canonical_product_id,
  resolved_image_id,
  resolved_image_source,
  resolved_external_url,
  resolved_cloudinary_url,
  resolved_cloudinary_public_id,
  display_name,
  description,
  price,
  discount_percent,
  discount_active,
  discount_ends_at,
  sale_price,
  marketplace_category,
  marketplace_subcategory,
  marketplace_level_3_category,
  category_name,
  qoh,
  created_at,
  user_id,
  brand,
  listing_type,
  listing_source,
  listing_status,
  uber_delivery_enabled,
  model_year,
  condition_rating,
  pickup_location,
  store_name,
  store_logo_url,
  store_account_type,
  store_bicycle_store,
  first_name,
  last_name,
  is_verified_bike_store
`

export interface PublicMarketplaceCardRow {
  id: string
  canonical_product_id: string | null
  resolved_image_id: string | null
  resolved_image_source: string | null
  resolved_external_url: string | null
  resolved_cloudinary_url: string | null
  resolved_cloudinary_public_id: string | null
  display_name: string | null
  description: string | null
  price: string | number | null
  discount_percent: string | number | null
  discount_active: boolean | null
  discount_ends_at: string | null
  sale_price: string | number | null
  marketplace_category: string | null
  marketplace_subcategory: string | null
  marketplace_level_3_category: string | null
  category_name: string | null
  qoh: number | null
  created_at: string | null
  user_id: string | null
  brand: string | null
  listing_type: MarketplaceProduct['listing_type'] | null
  listing_source: MarketplaceProduct['listing_source'] | null
  listing_status: MarketplaceProduct['listing_status'] | null
  uber_delivery_enabled: boolean | null
  model_year: string | null
  condition_rating: MarketplaceProduct['condition_rating'] | null
  pickup_location: string | null
  store_name: string | null
  store_logo_url: string | null
  store_account_type: string | null
  store_bicycle_store: boolean | null
  first_name: string | null
  last_name: string | null
  is_verified_bike_store: boolean | null
}

export function createPublicSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  )
}

export function numberFromDb(value: string | number | null): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return parseFloat(value) || 0
  return 0
}

export function transformPublicMarketplaceCard(row: PublicMarketplaceCardRow): MarketplaceProduct {
  const effectivePublicId = toCurrentHeroPublicId(
    row.resolved_cloudinary_public_id,
    row.resolved_image_source,
  )
  const resolved = resolveProductImage({
    id: row.resolved_image_id,
    cloudinary_public_id: effectivePublicId,
    cloudinary_url: row.resolved_cloudinary_url,
    external_url: row.resolved_external_url,
    approval_status: 'approved',
  })

  const primaryImageUrl = resolved?.card_url ?? resolved?.original_url ?? null
  const thumbnailUrl = resolved?.thumbnail_url ?? primaryImageUrl
  const allImages = [resolved?.gallery_url, resolved?.detail_url, primaryImageUrl]
    .filter((url): url is string => !!url)
    .filter((url, index, arr) => arr.indexOf(url) === index)

  return {
    id: row.id,
    canonical_product_id: row.canonical_product_id,
    description: row.description ?? '',
    display_name: row.display_name ?? undefined,
    price: numberFromDb(row.price),
    discount_percent: row.discount_percent != null ? numberFromDb(row.discount_percent) : null,
    discount_active: row.discount_active ?? false,
    discount_ends_at: row.discount_ends_at ?? null,
    sale_price: row.sale_price != null ? numberFromDb(row.sale_price) : null,
    marketplace_category: row.marketplace_category ?? '',
    marketplace_subcategory: row.marketplace_subcategory ?? '',
    marketplace_level_3_category: row.marketplace_level_3_category ?? null,
    category_name: row.category_name ?? null,
    primary_image_url: primaryImageUrl,
    image_variants: null,
    all_images: allImages,
    images: [],
    cloudinary_public_id: effectivePublicId,
    card_url: primaryImageUrl,
    mobile_card_url: resolved?.mobile_card_url ?? primaryImageUrl,
    thumbnail_url: thumbnailUrl,
    detail_url: resolved?.detail_url ?? resolved?.gallery_url ?? primaryImageUrl,
    qoh: row.qoh || 0,
    model_year: row.model_year,
    created_at: row.created_at ?? '',
    user_id: row.user_id ?? '',
    store_name: row.store_name ?? 'Bike Store',
    store_logo_url: row.store_logo_url ?? null,
    store_account_type: row.store_account_type ?? null,
    store_bicycle_store: row.store_bicycle_store ?? null,
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    brand: row.brand ?? null,
    listing_type: row.listing_type ?? undefined,
    listing_source: row.listing_source ?? undefined,
    listing_status: row.listing_status ?? undefined,
    uber_delivery_enabled: row.uber_delivery_enabled ?? false,
    condition_rating: row.condition_rating ?? undefined,
    pickup_location: row.pickup_location ?? undefined,
  }
}

export function hasMissingPublicCardFeedError(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.message?.includes('public_marketplace_cards') ||
    error.message?.includes('public_marketplace_space_counts') ||
    false
  )
}
