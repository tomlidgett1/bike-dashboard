import { MARKETPLACE_INITIAL_PAGE_SIZE } from '@/lib/marketplace-constants'
import {
  createPublicSupabaseClient,
  PUBLIC_MARKETPLACE_CARD_FIELDS,
  transformPublicMarketplaceCard,
  type PublicMarketplaceCardRow,
} from '@/lib/marketplace/public-card-feed'
import type { InitialMarketplaceData } from '@/lib/server/fetch-initial-marketplace-products'

// Server-side fetch for /marketplace/new-products. Mirrors that page's default
// view — newest listings across all types from the last 7 days — so the
// server-rendered grid seeds the client hook without a refetch flash.
// Cookie-free Supabase client → ISR-compatible (no dynamic cookies()).

const NEW_PRODUCTS_WINDOW_DAYS = 7

const EMPTY: InitialMarketplaceData = {
  products: [],
  pagination: { page: 1, pageSize: MARKETPLACE_INITIAL_PAGE_SIZE, total: 0, totalPages: 0, hasMore: false },
}

export async function fetchInitialNewProducts(): Promise<InitialMarketplaceData> {
  try {
    const supabase = createPublicSupabaseClient()
    const since = new Date(Date.now() - NEW_PRODUCTS_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const [{ data, error }, { count }] = await Promise.all([
      supabase
        .from('public_marketplace_cards')
        .select(PUBLIC_MARKETPLACE_CARD_FIELDS)
        .or('listing_status.is.null,listing_status.eq.active')
        .not('resolved_image_id', 'is', null)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(MARKETPLACE_INITIAL_PAGE_SIZE + 1),
      supabase
        .from('public_marketplace_cards')
        .select('id', { count: 'exact', head: true })
        .or('listing_status.is.null,listing_status.eq.active')
        .not('resolved_image_id', 'is', null)
        .gte('created_at', since),
    ])

    if (error || !data) return EMPTY

    const rows = (data as PublicMarketplaceCardRow[]).slice(0, MARKETPLACE_INITIAL_PAGE_SIZE)
    const products = rows.map(transformPublicMarketplaceCard)
    const total = count ?? products.length

    return {
      products,
      pagination: {
        page: 1,
        pageSize: MARKETPLACE_INITIAL_PAGE_SIZE,
        total,
        totalPages: Math.ceil(total / MARKETPLACE_INITIAL_PAGE_SIZE),
        hasMore: data.length > MARKETPLACE_INITIAL_PAGE_SIZE,
      },
    }
  } catch {
    return EMPTY
  }
}
