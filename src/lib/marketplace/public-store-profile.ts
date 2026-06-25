/* eslint-disable @typescript-eslint/no-explicit-any */

import { unstable_cache } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveProductImage } from '@/lib/services/image-resolver'
import { resolveLivePrice } from '@/lib/marketplace/pricing'
import { toCurrentHeroPublicId } from '@/lib/utils/cloudinary-transforms'
import type {
  StoreCategoryWithProducts,
  StoreProfile,
  StoreRental,
  StoreSectionWithCategories,
} from '@/lib/types/store'
import { createPublicSupabaseClient } from '@/lib/marketplace/public-card-feed'

export const PUBLIC_STORE_PROFILE_CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300'

interface FetchPublicStoreProfileOptions {
  searchQuery?: string | null
  productLimitPerCategory?: number | null
  /**
   * Lean storefront-home payload: include products only for what the Home tab
   * actually renders — the configured featured carousels and on-sale items (for
   * Weekly Specials) — while keeping full category metadata + counts. The heavy
   * full catalog (every category's products) is loaded separately for the
   * Products/Bikes tabs. This keeps the initial store page payload small on
   * shops with many categories instead of shipping 12×N products up front.
   */
  homeContentOnly?: boolean
}

const STORE_COLUMNS_FULL =
  'user_id, business_name, logo_url, store_type, address, phone, opening_hours, homepage_config, cover_image_url, bio, website, social_links, store_slug'
const STORE_COLUMNS_BASE =
  'user_id, business_name, logo_url, store_type, address, phone, opening_hours, cover_image_url, bio, website, social_links'

function defaultOpeningHours() {
  return {
    monday: { open: '09:00', close: '17:00', closed: false },
    tuesday: { open: '09:00', close: '17:00', closed: false },
    wednesday: { open: '09:00', close: '17:00', closed: false },
    thursday: { open: '09:00', close: '17:00', closed: false },
    friday: { open: '09:00', close: '17:00', closed: false },
    saturday: { open: '10:00', close: '16:00', closed: false },
    sunday: { open: '10:00', close: '16:00', closed: true },
  }
}

async function fetchSearchProductIds(
  supabase: SupabaseClient,
  searchQuery: string | null,
): Promise<string[] | null> {
  const query = searchQuery?.trim()
  if (!query) return null

  const { data, error } = await supabase.rpc('search_marketplace_products', {
    search_query: query,
    similarity_threshold: 0.15,
  })

  if (error) {
    console.error('[Store profile] Search failed:', error)
    return null
  }

  return (data ?? []).map((row: any) => row.product_id)
}

export async function fetchPublicStoreProfile(
  storeId: string,
  options: FetchPublicStoreProfileOptions = {},
): Promise<StoreProfile | null> {
  const supabase = createPublicSupabaseClient()
  const searchQuery = options.searchQuery ?? null
  const productLimitPerCategory = options.productLimitPerCategory ?? null
  const homeContentOnly = options.homeContentOnly === true

  let { data: storeUser, error: storeError } = await supabase
    .from('users')
    .select(STORE_COLUMNS_FULL)
    .eq('user_id', storeId)
    .eq('account_type', 'bicycle_store')
    .eq('bicycle_store', true)
    .single()

  if (storeError) {
    const fallback = await supabase
      .from('users')
      .select(STORE_COLUMNS_BASE)
      .eq('user_id', storeId)
      .eq('account_type', 'bicycle_store')
      .eq('bicycle_store', true)
      .single()
    storeUser = fallback.data ? { ...fallback.data, homepage_config: null, store_slug: null } : null
    storeError = fallback.error
  }

  if (storeError || !storeUser) {
    return null
  }

  const [
    servicesResult,
    rentalsResult,
    brandsResult,
    displayOverridesResult,
    searchProductIds,
  ] = await Promise.all([
    supabase
      .from('store_services')
      .select('*')
      .eq('user_id', storeId)
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    supabase
      .from('store_rentals')
      .select('id, product_id, description, price_per_hour, price_per_day, is_available, display_order')
      .eq('user_id', storeId)
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    supabase
      .from('store_brands')
      .select('*')
      .eq('user_id', storeId)
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    supabase
      .from('store_categories')
      .select('lightspeed_category_id, name')
      .eq('user_id', storeId)
      .eq('source', 'display_override'),
    fetchSearchProductIds(supabase, searchQuery),
  ])

  if (servicesResult.error) {
    console.error('[Store profile] Services query failed:', servicesResult.error)
  }
  if (rentalsResult.error) {
    console.error('[Store profile] Rentals query failed:', rentalsResult.error)
  }
  if (brandsResult.error) {
    console.error('[Store profile] Brands query failed:', brandsResult.error)
  }

  const displayNamesMap = new Map(
    displayOverridesResult.data?.map((override: any) => [
      override.lightspeed_category_id,
      override.name,
    ]) ?? [],
  )

  let productsQuery = supabase
    .from('marketplace_ready_products')
    .select(`
      id,
      description,
      display_name,
      price,
      discount_percent,
      discount_active,
      discount_ends_at,
      sale_price,
      marketplace_category,
      marketplace_subcategory,
      category_name,
      manufacturer_name,
      qoh,
      model_year,
      created_at,
      user_id,
      listing_type,
      listing_source,
      uber_delivery_enabled,
      lightspeed_category_id,
      canonical_product_id,
      resolved_image_id,
      resolved_external_url,
      resolved_cloudinary_url,
      resolved_cloudinary_public_id,
      resolved_image_source
    `)
    .eq('user_id', storeId)
    .gt('qoh', 0)

  if (searchQuery && searchProductIds) {
    productsQuery = searchProductIds.length
      ? productsQuery.in('id', searchProductIds)
      : productsQuery.in('id', ['00000000-0000-0000-0000-000000000000'])
  }

  const [
    productsResult,
    categoriesResult,
    sectionsResult,
  ] = await Promise.all([
    productsQuery.limit(10000),
    supabase
      .from('store_categories')
      .select('id, name, source, lightspeed_category_id, brand_name, product_ids, display_order, carousel_size, section_id, logo_url, logo_max_width, hide_title, subtitle, store_page')
      .eq('user_id', storeId)
      .eq('is_active', true)
      .neq('source', 'display_override')
      .order('display_order', { ascending: true }),
    supabase
      .from('store_sections')
      .select('id, name, description, display_order')
      .eq('user_id', storeId)
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
  ])

  if (productsResult.error) {
    console.error('[Store profile] Products query failed:', productsResult.error)
  }

  let customCategories = categoriesResult.data
  if (categoriesResult.error) {
    console.warn(
      '[Store profile] Categories query failed; retrying without section_id:',
      categoriesResult.error.message,
    )
    const fallback = await supabase
      .from('store_categories')
      .select('id, name, source, lightspeed_category_id, brand_name, product_ids, display_order, carousel_size, logo_url, logo_max_width, hide_title')
      .eq('user_id', storeId)
      .eq('is_active', true)
      .neq('source', 'display_override')
      .order('display_order', { ascending: true })

    customCategories = fallback.data
      ? fallback.data.map((category: any) => ({
          ...category,
          section_id: null,
          store_page: 'products',
        }))
      : null
  }

  const storeSections = sectionsResult.error ? null : sectionsResult.data
  const allProducts = productsResult.data ?? []
  let sortedProducts = allProducts

  if (searchQuery && searchProductIds && searchProductIds.length > 0) {
    const orderMap = new Map(searchProductIds.map((id, index) => [id, index]))
    sortedProducts = [...allProducts].sort((a, b) => {
      const orderA = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER
      const orderB = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER
      return orderA - orderB
    })
  }

  const toMarketplaceProduct = (product: any) => {
    const effectivePublicId = toCurrentHeroPublicId(
      product.resolved_cloudinary_public_id,
      product.resolved_image_source,
    )
    const resolved = resolveProductImage({
      id: product.resolved_image_id,
      cloudinary_public_id: effectivePublicId,
      cloudinary_url: product.resolved_cloudinary_url,
      external_url: product.resolved_external_url,
      approval_status: 'approved',
    })
    const primaryImageUrl = resolved?.card_url || resolved?.original_url
    if (!primaryImageUrl) return null

    return {
      id: product.id,
      description: product.description,
      display_name: product.display_name,
      price: parseFloat(product.price),
      discount_percent:
        product.discount_percent != null ? parseFloat(product.discount_percent) : null,
      discount_active: product.discount_active ?? false,
      discount_ends_at: product.discount_ends_at ?? null,
      sale_price: product.sale_price != null ? parseFloat(product.sale_price) : null,
      marketplace_category: product.marketplace_category || null,
      marketplace_subcategory: product.marketplace_subcategory || null,
      primary_image_url: primaryImageUrl,
      card_url: primaryImageUrl,
      cloudinary_public_id: effectivePublicId,
      thumbnail_url: resolved?.thumbnail_url || primaryImageUrl,
      detail_url: resolved?.detail_url || resolved?.gallery_url || primaryImageUrl,
      store_name: storeUser.business_name,
      store_logo_url: storeUser.logo_url,
      store_account_type: 'bicycle_store',
      store_bicycle_store: true,
      store_id: storeId,
      category_name: product.category_name || null,
      category: product.category_name,
      brand: product.manufacturer_name || null,
      qoh: product.qoh,
      model_year: product.model_year,
      created_at: product.created_at,
      user_id: product.user_id,
      listing_type: 'store_inventory' as const,
      uber_delivery_enabled: product.uber_delivery_enabled ?? false,
    }
  }

  // Transform only the products we'll actually return. On the homepage we keep
  // up to `productLimitPerCategory` per category, so image-resolving the entire
  // catalog just to slice it away afterwards is the main cost we cut here: a
  // store with thousands of SKUs now transforms ~12×categories instead of all.
  const limit = productLimitPerCategory
  type BuiltProduct = NonNullable<ReturnType<typeof toMarketplaceProduct>>

  // Lean-home mode: only the configured featured carousels need full products,
  // and Weekly Specials needs on-sale items. Everything else ships as metadata
  // only (count preserved) and is hydrated later by the full-feed fetch.
  const featuredCarousels = (storeUser as any).homepage_config?.featured_carousels
  const featuredSlotIds = new Set<string>(
    [featuredCarousels?.slot1, featuredCarousels?.slot2].filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    ),
  )
  const featuredPerRow = featuredCarousels?.per_row === 8 ? 8 : 6

  const buildCategoryProducts = (
    raw: any[],
    categoryId?: string,
  ): { products: BuiltProduct[]; count: number } => {
    if (homeContentOnly) {
      const picked: any[] = []
      const seen = new Set<string>()
      if (categoryId && featuredSlotIds.has(categoryId)) {
        for (const product of raw.slice(0, featuredPerRow)) {
          if (!seen.has(product.id)) {
            seen.add(product.id)
            picked.push(product)
          }
        }
      }
      for (const product of raw) {
        if (seen.has(product.id)) continue
        if (resolveLivePrice(product).onSale) {
          seen.add(product.id)
          picked.push(product)
        }
      }
      const products = picked
        .map(toMarketplaceProduct)
        .filter((p): p is BuiltProduct => Boolean(p))
      return { products, count: raw.length }
    }
    if (limit == null) {
      const products = raw
        .map(toMarketplaceProduct)
        .filter((p): p is BuiltProduct => Boolean(p))
      return { products, count: products.length }
    }
    const products: BuiltProduct[] = []
    for (const product of raw) {
      if (products.length >= limit) break
      const mp = toMarketplaceProduct(product)
      if (mp) products.push(mp)
    }
    return { products, count: raw.length }
  }

  const categoriesWithProducts: StoreCategoryWithProducts[] = []

  if (customCategories && customCategories.length > 0 && sortedProducts.length > 0) {
    const productById = new Map<string, any>(sortedProducts.map((product) => [product.id, product]))
    const matchedIds = new Set<string>()

    for (const category of customCategories) {
      let categoryProducts: any[]

      if (category.source === 'lightspeed' && category.lightspeed_category_id) {
        categoryProducts = sortedProducts.filter(
          (product) => product.lightspeed_category_id === category.lightspeed_category_id,
        )
      } else if (category.source === 'brand' && category.brand_name) {
        const brandLower = category.brand_name.toLowerCase()
        categoryProducts = sortedProducts.filter(
          (product) => (product.manufacturer_name ?? '').toLowerCase() === brandLower,
        )
      } else if (category.source === 'uber') {
        categoryProducts = sortedProducts.filter(
          (product) => product.uber_delivery_enabled === true,
        )
      } else {
        categoryProducts = (category.product_ids ?? [])
          .map((id: string) => productById.get(id))
          .filter(Boolean)
      }

      categoryProducts.forEach((product) => matchedIds.add(product.id))
      const { products: marketplaceProducts, count } = buildCategoryProducts(categoryProducts, category.id)

      const specialsAnchor = category.source === 'specials'
      const productIdCount = (category.product_ids ?? []).length
      const shouldInclude =
        marketplaceProducts.length > 0 || (specialsAnchor && productIdCount > 0)

      if (shouldInclude) {
        const displayName =
          displayNamesMap.get(category.lightspeed_category_id ?? category.name) ?? category.name
        categoriesWithProducts.push({
          id: category.id,
          name: displayName,
          source: category.source,
          display_order: category.display_order,
          carousel_size: category.carousel_size ?? 'normal',
          section_id: category.section_id ?? null,
          logo_url: category.logo_url ?? null,
          logo_max_width: category.logo_max_width ?? null,
          hide_title: category.hide_title ?? false,
          subtitle: category.subtitle ?? null,
          store_page: category.store_page === 'bikes' ? 'bikes' : 'products',
          products: marketplaceProducts,
          product_count: specialsAnchor ? Math.max(count, productIdCount) : count,
        })
      }
    }

    const otherRaw = sortedProducts.filter((product) => !matchedIds.has(product.id))
    const { products: otherProducts, count: otherCount } = buildCategoryProducts(otherRaw)

    if (otherProducts.length > 0) {
      categoriesWithProducts.push({
        id: 'category-other',
        name: 'Other',
        display_order: 9999,
        products: otherProducts,
        product_count: otherCount,
      })
    }
  } else if (sortedProducts.length > 0) {
    const productsByCategory = new Map<string, any[]>()
    sortedProducts.forEach((product) => {
      const key = product.category_name || 'Uncategorized'
      if (!productsByCategory.has(key)) productsByCategory.set(key, [])
      productsByCategory.get(key)!.push(product)
    })

    Array.from(productsByCategory.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .forEach(([categoryName, products], index) => {
        const { products: marketplaceProducts, count } = buildCategoryProducts(products)

        if (marketplaceProducts.length > 0) {
          categoriesWithProducts.push({
            id: `category-${index}`,
            name: displayNamesMap.get(categoryName) || categoryName,
            display_order: index,
            products: marketplaceProducts,
            product_count: count,
          })
        }
      })
  }

  // Per-category limiting already happened in buildCategoryProducts
  // (transform-before-slice), so no second pass is needed here.
  const categoriesForResponse = categoriesWithProducts

  const sectionsWithCategories: StoreSectionWithCategories[] = (storeSections ?? [])
    .map((section: any) => ({
      id: section.id,
      name: section.name,
      description: section.description ?? null,
      display_order: section.display_order,
      categories: categoriesForResponse.filter((category) => category.section_id === section.id),
    }))
    .filter((section) => section.categories.length > 0)

  const productLookup = new Map(sortedProducts.map((product) => [product.id, product]))
  const rentals: StoreRental[] = (rentalsResult.data ?? []).flatMap((rental: any) => {
    const product = productLookup.get(rental.product_id)
    if (!product) return []

    const effectivePublicId = toCurrentHeroPublicId(
      product.resolved_cloudinary_public_id,
      product.resolved_image_source,
    )
    const resolved = resolveProductImage({
      id: product.resolved_image_id,
      cloudinary_public_id: effectivePublicId,
      cloudinary_url: product.resolved_cloudinary_url,
      external_url: product.resolved_external_url,
      approval_status: 'approved',
    })
    const imageUrl = resolved?.card_url || resolved?.original_url || null

    return [{
      id: rental.id,
      product_id: rental.product_id,
      name: product.display_name || product.description,
      description: rental.description || null,
      price_per_hour:
        rental.price_per_hour != null ? parseFloat(rental.price_per_hour) : null,
      price_per_day:
        rental.price_per_day != null ? parseFloat(rental.price_per_day) : null,
      image_url: imageUrl,
      is_available: rental.is_available ?? true,
      category: product.category_name || null,
      display_order: rental.display_order,
    } satisfies StoreRental]
  })

  return {
    id: storeId,
    slug: (storeUser as any).store_slug ?? null,
    store_name: storeUser.business_name,
    logo_url: storeUser.logo_url,
    store_type: storeUser.store_type,
    address: storeUser.address,
    phone: storeUser.phone,
    opening_hours: storeUser.opening_hours || defaultOpeningHours(),
    categories: categoriesForResponse,
    sections: sectionsWithCategories,
    services: servicesResult.data || [],
    rentals,
    brands: brandsResult.data || [],
    cover_image_url: storeUser.cover_image_url || null,
    description: storeUser.bio || null,
    website: storeUser.website || null,
    social_links: storeUser.social_links || null,
    homepage_config: storeUser.homepage_config || null,
    product_feed_complete: !homeContentOnly && productLimitPerCategory == null,
  }
}

export const PUBLIC_STORE_PROFILE_CACHE_TAG = 'public-store-profile'

export const fetchCachedPublicStoreProfile = unstable_cache(
  async (storeId: string, searchQuery: string | null = null) =>
    fetchPublicStoreProfile(storeId, { searchQuery }),
  ['public-store-profile-v2'],
  { revalidate: 60, tags: [PUBLIC_STORE_PROFILE_CACHE_TAG] },
)

export const fetchCachedPublicStoreHomepageProfile = unstable_cache(
  async (storeId: string) =>
    fetchPublicStoreProfile(storeId, { homeContentOnly: true }),
  ['public-store-homepage-profile-v3'],
  { revalidate: 60, tags: [PUBLIC_STORE_PROFILE_CACHE_TAG] },
)

const STORE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Resolve a storefront URL segment — either a UUID user_id or a store_slug — to
 * the owning user_id. Returns null when no matching public store exists.
 * Degrades gracefully (returns null) before the store_slug column exists.
 */
export const resolveStoreUserId = unstable_cache(
  async (param: string): Promise<string | null> => {
    if (!param) return null
    if (STORE_UUID_RE.test(param)) return param

    const supabase = createPublicSupabaseClient()
    const { data, error } = await supabase
      .from('users')
      .select('user_id')
      .eq('store_slug', param)
      .eq('account_type', 'bicycle_store')
      .eq('bicycle_store', true)
      .maybeSingle()

    if (error) {
      console.warn('[store slug] resolve failed:', error.message)
      return null
    }
    return (data as { user_id?: string } | null)?.user_id ?? null
  },
  ['resolve-store-user-id-v1'],
  { revalidate: 300 },
)
