import type { SupabaseClient } from '@supabase/supabase-js'
import {
  PUBLIC_MARKETPLACE_CARD_FIELDS,
  type PublicMarketplaceCardRow,
} from '@/lib/marketplace/public-card-feed'
import {
  composeStoreBrowseRows,
  getStoreFeedShuffleSeed,
  STORE_FEED_REGULAR_POOL,
  STORE_FEED_SPECIALS_POOL,
} from '@/lib/marketplace/store-feed-order'

export interface StoreFeedBrowseFilters {
  uberOnly?: boolean
  lsCategory?: string | null
  level1?: string | null
  level2?: string | null
  level3?: string | null
}

export async function fetchStoreFeedBrowseRows(
  supabase: SupabaseClient,
  filters: StoreFeedBrowseFilters,
  pageSize: number,
): Promise<{ rows: PublicMarketplaceCardRow[]; poolExhausted: boolean }> {
  const applyBaseFilters = () => {
    let query = supabase
      .from('public_marketplace_cards')
      .select(PUBLIC_MARKETPLACE_CARD_FIELDS)
      .eq('listing_type', 'store_inventory')
      .eq('is_verified_bike_store', true)
      .not('resolved_image_id', 'is', null)
      .or('listing_status.is.null,listing_status.eq.active')

    if (filters.uberOnly) {
      query = query.eq('uber_delivery_enabled', true)
    }

    if (filters.lsCategory) {
      query = query.eq('category_name', filters.lsCategory)
    } else {
      if (filters.level1) query = query.eq('marketplace_category', filters.level1)
      if (filters.level2) query = query.eq('marketplace_subcategory', filters.level2)
      if (filters.level3) query = query.eq('marketplace_level_3_category', filters.level3)
    }

    return query
  }

  const seed = getStoreFeedShuffleSeed()

  const [specialsResult, regularResult] = await Promise.all([
    applyBaseFilters().eq('discount_active', true).limit(STORE_FEED_SPECIALS_POOL),
    applyBaseFilters()
      .or('discount_active.is.null,discount_active.eq.false')
      .limit(STORE_FEED_REGULAR_POOL),
  ])

  if (specialsResult.error) throw specialsResult.error
  if (regularResult.error) throw regularResult.error

  const specials = (specialsResult.data || []) as PublicMarketplaceCardRow[]
  const regular = (regularResult.data || []) as PublicMarketplaceCardRow[]
  const rows = composeStoreBrowseRows(specials, regular, seed, pageSize)

  const poolExhausted =
    specials.length >= STORE_FEED_SPECIALS_POOL || regular.length >= STORE_FEED_REGULAR_POOL

  return { rows, poolExhausted }
}
