import type { MarketplaceProduct } from '@/lib/types/marketplace'
import {
  createPublicSupabaseClient,
  PUBLIC_MARKETPLACE_CARD_FIELDS,
  transformPublicMarketplaceCard,
  type PublicMarketplaceCardRow,
} from '@/lib/marketplace/public-card-feed'
import { filterVisibleMarketplaceStores } from '@/lib/marketplace/hidden-stores'

// ============================================================
// /v2 homepage data — one parallel fan-out, ISR-cacheable.
//
// Everything reads through the anon public client (no cookies),
// so the whole page can be statically cached and revalidated.
// Every query is independent and failure-isolated: a single
// failed rail degrades to an empty list, never a broken page.
// ============================================================

export interface V2Store {
  id: string
  name: string
  type: string
  logoUrl: string | null
  productCount: number
}

export interface V2Counts {
  /** All live listings across both spaces. */
  live: number
  /** Verified / active stores with stock. */
  stores: number
  /** Items eligible for 1-hr Uber delivery. */
  express: number
}

export interface V2HomeData {
  /** Newest listings across stores + riders, diversity-interleaved. */
  justListed: MarketplaceProduct[]
  /** Private (rider-to-rider) listings. */
  riderListings: MarketplaceProduct[]
  /** Uber 1-hr delivery eligible items. */
  expressItems: MarketplaceProduct[]
  /** Live discounted items. */
  deals: MarketplaceProduct[]
  stores: V2Store[]
  counts: V2Counts
  categoryCounts: Record<string, number>
  /** Curated, real brands present in the live inventory. */
  brands: string[]
  /** Three visually distinct products for the hero collage. */
  heroPicks: MarketplaceProduct[]
}

const ACTIVE_FILTER = 'listing_status.is.null,listing_status.eq.active'

// Cycling brands worth putting on the marquee — intersected with what is
// actually live so the strip never lies about supply.
const KNOWN_CYCLING_BRANDS = new Set([
  'Shimano', 'SRAM', 'Campagnolo', 'KASK', 'Lazer', 'Giro', 'WAHOO', 'Wahoo',
  'Garmin', 'BMC', 'Trek', 'Specialized', 'Giant', 'Cannondale', 'Scott',
  'Cervelo', 'Cervélo', 'Pinarello', 'Canyon', 'Merida', 'Focus', 'Orbea',
  'Muc-Off', 'CLIF', 'SIS', 'Maxxis', 'Continental', 'Schwalbe', 'Pirelli',
  'Tifosi', 'Oakley', 'ZEFAL', 'Zefal', 'JetBlack', 'Azur', 'ADURA',
  'Styrkr', 'Fizik', 'Brooks', 'Selle Italia', 'DT Swiss', 'Zipp', 'ENVE',
  'Fox', 'RockShox', 'Park Tool', 'Topeak', 'Lezyne', 'Knog', 'Bontrager',
])

function uniqueById(products: MarketplaceProduct[]): MarketplaceProduct[] {
  const seen = new Set<string>()
  return products.filter((p) => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })
}

/**
 * Seller-diversity interleave: round-robins listings across sellers so a
 * single store's bulk sync can't monopolise a rail. Order within each
 * seller is preserved (newest first).
 */
function interleaveBySeller(products: MarketplaceProduct[]): MarketplaceProduct[] {
  const bySeller = new Map<string, MarketplaceProduct[]>()
  for (const p of products) {
    const key = p.user_id || 'unknown'
    const list = bySeller.get(key)
    if (list) list.push(p)
    else bySeller.set(key, [p])
  }
  const queues = [...bySeller.values()]
  const out: MarketplaceProduct[] = []
  let drained = false
  while (!drained) {
    drained = true
    for (const queue of queues) {
      const next = queue.shift()
      if (next) {
        out.push(next)
        drained = false
      }
    }
  }
  return out
}

function isKnownCyclingBrand(brand: string | null | undefined): boolean {
  if (!brand) return false
  const lower = brand.trim().toLowerCase()
  for (const known of KNOWN_CYCLING_BRANDS) {
    if (known.toLowerCase() === lower) return true
  }
  return false
}

/**
 * True for listings we'd proudly put in the hero: rider listings, or store
 * stock that is recognisably cycling product (known brand / bike category).
 * Keeps test/off-vertical inventory out of the shop window.
 */
function isHeroQuality(p: MarketplaceProduct): boolean {
  if (p.listing_type === 'private_listing') return true
  if (p.marketplace_category === 'Bicycles' || p.marketplace_category === 'Bikes') return true
  return isKnownCyclingBrand(p.brand)
}

/** Pick up to three visually distinct hero products, preferring distinct categories/sellers. */
function pickHeroProducts(pool: MarketplaceProduct[]): MarketplaceProduct[] {
  const withImage = pool.filter((p) => p.cloudinary_public_id || p.card_url)
  const quality = withImage.filter(isHeroQuality)
  const picks: MarketplaceProduct[] = []
  const usedCategories = new Set<string>()
  const usedSellers = new Set<string>()
  // "Bikes" and "Bicycles" are the same shelf for diversity purposes.
  const categoryKey = (p: MarketplaceProduct) =>
    p.marketplace_category === 'Bikes' ? 'Bicycles' : p.marketplace_category
  const take = (p: MarketplaceProduct) => {
    picks.push(p)
    usedCategories.add(categoryKey(p))
    usedSellers.add(p.user_id)
  }

  // Pass 1: a real bicycle first — it's a cycling marketplace.
  const bike = quality.find((p) => p.marketplace_category === 'Bicycles' || p.marketplace_category === 'Bikes')
  if (bike) take(bike)

  // Pass 2: quality items, distinct category + distinct seller.
  for (const p of quality) {
    if (picks.length >= 3) break
    if (picks.some((x) => x.id === p.id)) continue
    if (usedCategories.has(categoryKey(p)) || usedSellers.has(p.user_id)) continue
    take(p)
  }

  // Pass 3: quality items, distinct category only (sellers may repeat).
  for (const p of quality) {
    if (picks.length >= 3) break
    if (picks.some((x) => x.id === p.id)) continue
    if (usedCategories.has(categoryKey(p))) continue
    take(p)
  }

  // Pass 4: any quality item, then anything with an image.
  for (const p of [...quality, ...withImage]) {
    if (picks.length >= 3) break
    if (!picks.some((x) => x.id === p.id)) picks.push(p)
  }

  return picks.slice(0, 3)
}

/**
 * Distinct cycling brands actually live in the catalogue, most-stocked first.
 * Reads the raw brand column (cheap, single-column scan of the card feed)
 * rather than the fetched card pools, so the marquee reflects the whole shop.
 */
function collectBrands(rows: Array<{ brand: string | null }>): string[] {
  const tally = new Map<string, { label: string; count: number }>()
  for (const row of rows) {
    const brand = row.brand?.trim()
    if (!brand) continue
    const canonical = [...KNOWN_CYCLING_BRANDS].find(
      (k) => k.toLowerCase() === brand.toLowerCase(),
    )
    if (!canonical) continue
    const key = canonical.toLowerCase()
    const entry = tally.get(key)
    if (entry) entry.count += 1
    else tally.set(key, { label: canonical, count: 1 })
  }
  return [...tally.values()].sort((a, b) => b.count - a.count).map((e) => e.label)
}

export async function fetchV2HomeData(): Promise<V2HomeData> {
  const supabase = createPublicSupabaseClient()

  const cardQuery = () =>
    supabase
      .from('public_marketplace_cards')
      .select(PUBLIC_MARKETPLACE_CARD_FIELDS)
      .or(ACTIVE_FILTER)
      .not('resolved_image_id', 'is', null)

  const categoryCount = (categories: string[]) =>
    supabase
      .from('public_marketplace_cards')
      .select('id', { count: 'exact', head: true })
      .or(ACTIVE_FILTER)
      .not('resolved_image_id', 'is', null)
      .in('marketplace_category', categories)

  const [
    newestRes,
    ridersRes,
    expressRes,
    dealsRes,
    storesRes,
    countsRes,
    bicyclesCount,
    partsCount,
    apparelCount,
    nutritionCount,
    brandsRes,
  ] = await Promise.allSettled([
    cardQuery().order('created_at', { ascending: false }).order('id', { ascending: false }).limit(36),
    cardQuery().eq('listing_type', 'private_listing').order('created_at', { ascending: false }).limit(6),
    cardQuery().eq('uber_delivery_enabled', true).order('created_at', { ascending: false }).limit(14),
    cardQuery().eq('discount_active', true).not('sale_price', 'is', null).order('created_at', { ascending: false }).limit(12),
    supabase.rpc('get_stores_with_product_counts'),
    supabase.from('public_marketplace_space_counts').select('space, total'),
    categoryCount(['Bicycles', 'Bikes']),
    categoryCount(['Parts']),
    categoryCount(['Apparel']),
    categoryCount(['Nutrition']),
    supabase
      .from('public_marketplace_cards')
      .select('brand')
      .or(ACTIVE_FILTER)
      .not('brand', 'is', null)
      .limit(600),
  ])

  const rows = (res: typeof newestRes): MarketplaceProduct[] => {
    if (res.status !== 'fulfilled' || res.value.error || !res.value.data) return []
    return (res.value.data as unknown as PublicMarketplaceCardRow[]).map(transformPublicMarketplaceCard)
  }

  const newest = rows(newestRes)
  const riderListings = rows(ridersRes)
  const expressItems = rows(expressRes)
  // Deals must be *live* right now — discount flags are checked at render
  // time too, but filter expired ones out of the rail entirely.
  const now = Date.now()
  const deals = rows(dealsRes).filter(
    (p) =>
      p.sale_price != null &&
      p.sale_price < p.price &&
      (!p.discount_ends_at || new Date(p.discount_ends_at).getTime() > now),
  )

  const justListed = interleaveBySeller(uniqueById(newest)).slice(0, 18)

  let stores: V2Store[] = []
  if (storesRes.status === 'fulfilled' && !storesRes.value.error && Array.isArray(storesRes.value.data)) {
    stores = filterVisibleMarketplaceStores(
      (storesRes.value.data as Array<Record<string, unknown>>)
        .map((s) => ({
          id: String(s.user_id ?? ''),
          name: String(s.business_name ?? '').trim(),
          type: String(s.store_type ?? '').trim(),
          logoUrl: (s.logo_url as string | null) ?? null,
          productCount: Number(s.product_count ?? 0),
        }))
        .filter((s) => s.id && s.name && s.productCount > 0)
        .sort((a, b) => b.productCount - a.productCount)
        .slice(0, 8),
    )
  }

  let live = 0
  let express = 0
  if (countsRes.status === 'fulfilled' && Array.isArray(countsRes.value.data)) {
    for (const row of countsRes.value.data as Array<{ space: string; total: number | string }>) {
      const total = Number(row.total ?? 0)
      if (row.space === 'marketplace' || row.space === 'stores') live += total
      if (row.space === 'uber') express = total
    }
  }
  if (live === 0) live = newest.length

  const count = (res: typeof bicyclesCount): number =>
    res.status === 'fulfilled' && typeof res.value.count === 'number' ? res.value.count : 0

  const categoryCounts: Record<string, number> = {
    Bicycles: count(bicyclesCount),
    Parts: count(partsCount),
    Apparel: count(apparelCount),
    Nutrition: count(nutritionCount),
  }

  const brandRows =
    brandsRes.status === 'fulfilled' && Array.isArray(brandsRes.value.data)
      ? (brandsRes.value.data as Array<{ brand: string | null }>)
      : []

  return {
    justListed,
    riderListings,
    expressItems,
    deals,
    stores,
    counts: { live, stores: stores.length, express },
    categoryCounts,
    brands: collectBrands(brandRows),
    heroPicks: pickHeroProducts(uniqueById([...riderListings, ...newest, ...expressItems])),
  }
}
