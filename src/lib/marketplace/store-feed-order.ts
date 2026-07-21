import type { PublicMarketplaceCardRow } from '@/lib/marketplace/public-card-feed'

/** Pool sizes for the browse feed — specials are over-fetched so the grid can fill. */
export const STORE_FEED_SPECIALS_POOL = 36
export const STORE_FEED_REGULAR_POOL = 72

/** Rotate shuffle every 6 hours so the grid feels fresh without jumping on every refresh. */
export function getStoreFeedShuffleSeed(): string {
  const bucket = Math.floor(Date.now() / (6 * 60 * 60 * 1000))
  return `store-feed-${bucket}`
}

function hashSeed(seed: string): number {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function seededShuffle<T>(items: T[], seed: string): T[] {
  const copy = [...items]
  let state = hashSeed(seed)

  const random = () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }

  return copy
}

export function isStoreFeedSpecial(row: Pick<PublicMarketplaceCardRow, 'discount_active'>): boolean {
  return row.discount_active === true
}

/** Specials first, then the rest — each group shuffled with a stable seed. */
export function composeStoreBrowseRows(
  specials: PublicMarketplaceCardRow[],
  regular: PublicMarketplaceCardRow[],
  seed: string,
  pageSize: number,
): PublicMarketplaceCardRow[] {
  const shuffledSpecials = seededShuffle(specials, `${seed}:specials`)
  const seen = new Set(shuffledSpecials.map((row) => row.id))
  const regularDeduped = regular.filter((row) => !seen.has(row.id))
  const shuffledRegular = seededShuffle(regularDeduped, `${seed}:regular`)

  return [...shuffledSpecials, ...shuffledRegular].slice(0, pageSize)
}

export function shouldApplyStoreFeedBrowseOrder(options: {
  isStoreFeed: boolean
  sortBy: string
  page: number
  canUseCursor: boolean
  search?: string | null
  minPrice?: string | null
  maxPrice?: string | null
  createdAfter?: string | null
  condition?: string | null
  brand?: string | null
  level1?: string | null
  level2?: string | null
  level3?: string | null
  lsCategory?: string | null
}): boolean {
  if (!options.isStoreFeed) return false
  if (options.sortBy !== 'newest') return false
  if (options.page !== 1) return false
  if (options.canUseCursor) return false
  if (options.search?.trim()) return false
  if (options.minPrice || options.maxPrice) return false
  if (options.createdAfter) return false
  if (options.condition) return false
  if (options.brand) return false
  if (options.level1 || options.level2 || options.level3 || options.lsCategory) return false
  return true
}
