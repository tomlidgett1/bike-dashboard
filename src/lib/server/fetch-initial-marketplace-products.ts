import { createClient } from '@supabase/supabase-js'
import { resolveProductImage } from '@/lib/services/image-resolver'
import type { MarketplaceProduct } from '@/lib/types/marketplace'
import { MARKETPLACE_INITIAL_PAGE_SIZE } from '@/lib/marketplace-constants'

// Uses the plain (cookie-free) Supabase client so this fetch is compatible
// with ISR / static caching — no dynamic functions like cookies() are called.

const FAST_FIELDS = `
  id,
  canonical_product_id,
  resolved_image_id,
  resolved_external_url,
  resolved_cloudinary_url,
  resolved_cloudinary_public_id,
  display_name,
  description,
  price,
  marketplace_category,
  marketplace_subcategory,
  marketplace_level_3_category,
  qoh,
  created_at,
  user_id,
  listing_type,
  listing_status,
  model_year,
  condition_rating,
  pickup_location
`

export interface InitialMarketplacePagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
  hasMore: boolean
}

export interface InitialMarketplaceData {
  products: MarketplaceProduct[]
  pagination: InitialMarketplacePagination
}

const EMPTY: InitialMarketplaceData = {
  products: [],
  pagination: {
    page: 1,
    pageSize: MARKETPLACE_INITIAL_PAGE_SIZE,
    total: 0,
    totalPages: 0,
    hasMore: false,
  },
}

export async function fetchInitialMarketplaceProducts(): Promise<InitialMarketplaceData> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    const { data, error, count } = await supabase
      .from('marketplace_ready_products')
      .select(FAST_FIELDS, { count: 'exact', head: false })
      .eq('listing_type', 'private_listing')
      .not('resolved_image_id', 'is', null)
      .order('created_at', { ascending: false })
      .range(0, MARKETPLACE_INITIAL_PAGE_SIZE - 1)

    if (error || !data) return EMPTY

    // Enrich with seller info in parallel — same pattern as the products API route
    const userIds = [...new Set(data.map((p: any) => p.user_id).filter(Boolean))]
    const { data: usersData } = userIds.length > 0
      ? await supabase
          .from('users')
          .select('user_id, business_name, logo_url, account_type, first_name, last_name')
          .in('user_id', userIds)
      : { data: [] as any[] }

    const usersById = new Map((usersData ?? []).map((u: any) => [u.user_id, u]))

    const products: MarketplaceProduct[] = data.map((product: any) => {
      const user = usersById.get(product.user_id)
      const resolved = resolveProductImage({
        id: product.resolved_image_id,
        cloudinary_public_id: product.resolved_cloudinary_public_id,
        cloudinary_url: product.resolved_cloudinary_url,
        external_url: product.resolved_external_url,
        approval_status: 'approved',
      })

      const primaryImageUrl = resolved?.card_url ?? resolved?.original_url ?? null
      const thumbnailUrl = resolved?.thumbnail_url ?? primaryImageUrl
      const allImages = [resolved?.gallery_url, resolved?.detail_url, primaryImageUrl]
        .filter((url): url is string => !!url)
        .filter((url, i, arr) => arr.indexOf(url) === i)

      return {
        id: product.id,
        canonical_product_id: product.canonical_product_id,
        description: product.description,
        display_name: product.display_name,
        price: parseFloat(product.price) || 0,
        marketplace_category: product.marketplace_category,
        marketplace_subcategory: product.marketplace_subcategory,
        primary_image_url: primaryImageUrl,
        image_variants: null,
        all_images: allImages,
        images: null,
        cloudinary_public_id: product.resolved_cloudinary_public_id ?? null,
        card_url: primaryImageUrl,
        mobile_card_url: resolved?.mobile_card_url ?? primaryImageUrl,
        thumbnail_url: thumbnailUrl,
        detail_url: resolved?.detail_url ?? resolved?.gallery_url ?? primaryImageUrl,
        qoh: product.qoh || 0,
        model_year: product.model_year,
        created_at: product.created_at,
        user_id: product.user_id,
        store_name: user?.business_name ?? 'Bike Store',
        store_logo_url: user?.logo_url ?? null,
        store_account_type: user?.account_type ?? null,
        first_name: user?.first_name ?? null,
        last_name: user?.last_name ?? null,
        listing_type: product.listing_type,
        listing_status: product.listing_status,
        condition_rating: product.condition_rating ?? null,
        pickup_location: product.pickup_location ?? null,
      } as MarketplaceProduct
    })

    const total = count ?? 0
    return {
      products,
      pagination: {
        page: 1,
        pageSize: MARKETPLACE_INITIAL_PAGE_SIZE,
        total,
        totalPages: Math.ceil(total / MARKETPLACE_INITIAL_PAGE_SIZE),
        hasMore: total > MARKETPLACE_INITIAL_PAGE_SIZE,
      },
    }
  } catch {
    return EMPTY
  }
}
