import type { MarketplaceProduct } from '@/lib/types/marketplace'
import { MARKETPLACE_INITIAL_PAGE_SIZE } from '@/lib/marketplace-constants'
import { resolveProductImage } from '@/lib/services/image-resolver'
import { toCurrentHeroPublicId } from '@/lib/utils/cloudinary-transforms'
import {
  createPublicSupabaseClient,
  hasMissingPublicCardFeedError,
  numberFromDb,
  PUBLIC_MARKETPLACE_CARD_FIELDS,
  transformPublicMarketplaceCard,
  type PublicMarketplaceCardRow,
} from '@/lib/marketplace/public-card-feed'

// Uses the plain (cookie-free) Supabase client so this fetch is compatible
// with ISR / static caching — no dynamic functions like cookies() are called.

const FAST_FIELDS = `
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
  qoh,
  created_at,
  user_id,
  listing_type,
  listing_status,
  model_year,
  condition_rating,
  pickup_location
`

interface InitialMarketplaceProductRow {
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
  qoh: number | null
  created_at: string | null
  user_id: string | null
  listing_type: MarketplaceProduct['listing_type'] | null
  listing_status: string | null
  model_year: string | null
  condition_rating: MarketplaceProduct['condition_rating'] | null
  pickup_location: string | null
}

interface InitialMarketplaceUserRow {
  user_id: string
  business_name: string | null
  logo_url: string | null
  account_type: string | null
  first_name: string | null
  last_name: string | null
}

export interface InitialMarketplacePagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
  hasMore: boolean
  nextCursor?: {
    createdAt: string
    id: string
  } | null
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
    const supabase = createPublicSupabaseClient()

    const { data: cardRows, error: cardError } = await supabase
      .from('public_marketplace_cards')
      .select(PUBLIC_MARKETPLACE_CARD_FIELDS)
      .eq('listing_type', 'private_listing')
      .or('listing_status.is.null,listing_status.eq.active')
      .not('resolved_image_id', 'is', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(MARKETPLACE_INITIAL_PAGE_SIZE + 1)

    if (!cardError && cardRows) {
      const rows = (cardRows as PublicMarketplaceCardRow[]).slice(0, MARKETPLACE_INITIAL_PAGE_SIZE)
      const products = rows.map(transformPublicMarketplaceCard)
      const { data: countData } = await supabase
        .from('public_marketplace_space_counts')
        .select('total')
        .eq('space', 'marketplace')
        .maybeSingle()
      const total = Number(countData?.total ?? products.length + (cardRows.length > MARKETPLACE_INITIAL_PAGE_SIZE ? 1 : 0))

      return {
        products,
        pagination: {
          page: 1,
          pageSize: MARKETPLACE_INITIAL_PAGE_SIZE,
          total,
          totalPages: Math.ceil(total / MARKETPLACE_INITIAL_PAGE_SIZE),
          hasMore: cardRows.length > MARKETPLACE_INITIAL_PAGE_SIZE,
          nextCursor: products.length > 0
            ? {
                createdAt: products[products.length - 1].created_at,
                id: products[products.length - 1].id,
              }
            : null,
        },
      }
    }

    if (cardError && !hasMissingPublicCardFeedError(cardError)) {
      console.warn('[initial-marketplace] public card feed failed, falling back:', cardError.message)
    }

    const { data, error, count } = await supabase
      .from('marketplace_ready_products')
      .select(FAST_FIELDS, { count: 'exact', head: false })
      .eq('listing_type', 'private_listing')
      .or('listing_status.is.null,listing_status.eq.active')
      .not('resolved_image_id', 'is', null)
      .order('created_at', { ascending: false })
      .range(0, MARKETPLACE_INITIAL_PAGE_SIZE - 1)

    if (error || !data) return EMPTY
    const rows = data as InitialMarketplaceProductRow[]

    // Enrich with seller info in parallel — same pattern as the products API route
    const userIds = [...new Set(rows.map((p) => p.user_id).filter((id): id is string => Boolean(id)))]
    const { data: usersData } = userIds.length > 0
      ? await supabase
          .from('users')
          .select('user_id, business_name, logo_url, account_type, first_name, last_name')
          .in('user_id', userIds)
      : { data: [] as InitialMarketplaceUserRow[] }

    const users = (usersData ?? []) as InitialMarketplaceUserRow[]
    const usersById = new Map(users.map((u) => [u.user_id, u]))

    const products: MarketplaceProduct[] = rows.map((product) => {
      const user = product.user_id ? usersById.get(product.user_id) : null
      // Normalise hero PIDs to the current HERO_NORMALIZE_TRANSFORM.
      const effectivePublicId = toCurrentHeroPublicId(
        product.resolved_cloudinary_public_id,
        product.resolved_image_source
      )
      const resolved = resolveProductImage({
        id: product.resolved_image_id,
        cloudinary_public_id: effectivePublicId,
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
        description: product.description ?? '',
        display_name: product.display_name ?? undefined,
        price: numberFromDb(product.price),
        discount_percent: product.discount_percent != null ? numberFromDb(product.discount_percent) : null,
        discount_active: product.discount_active ?? false,
        discount_ends_at: product.discount_ends_at ?? null,
        sale_price: product.sale_price != null ? numberFromDb(product.sale_price) : null,
        marketplace_category: product.marketplace_category ?? '',
        marketplace_subcategory: product.marketplace_subcategory ?? '',
        primary_image_url: primaryImageUrl,
        image_variants: null,
        all_images: allImages,
        images: [],
        cloudinary_public_id: effectivePublicId,
        card_url: primaryImageUrl,
        mobile_card_url: resolved?.mobile_card_url ?? primaryImageUrl,
        thumbnail_url: thumbnailUrl,
        detail_url: resolved?.detail_url ?? resolved?.gallery_url ?? primaryImageUrl,
        qoh: product.qoh || 0,
        model_year: product.model_year,
        created_at: product.created_at ?? '',
        user_id: product.user_id ?? '',
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
