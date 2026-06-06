import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveThumbnailUrlsByLightspeedItemIds } from '@/lib/services/product-images'
import { buildCloudinaryImageUrl, extractCloudinaryPublicId } from '@/lib/utils/cloudinary-transforms'

export interface GenieStoreProductPreview {
  id: string
  name: string
  category: string | null
  price: number | null
  image: string | null
  product_url: string | null
  in_stock: boolean | null
  sku: string | null
}

const MAX_PREVIEW_COUNT = 6

const ANALYTICS_QUERY =
  /\b(top\s*\d+|how many|total|rank|ranking|aggregate|all products|every product|breakdown|trend|revenue|margin analysis|stale stock|cash tied|sold last|units sold|gross profit)\b/i

interface InventoryMatchLike {
  item_id: string
  name: string
  price?: number
  category?: string | null
  brand?: string | null
  primary_image_url?: string | null
  total_qoh?: number
  is_in_stock?: boolean | null
  confidence?: string
  system_sku?: string | null
  custom_sku?: string | null
}

export function shouldEmitStoreProductPreviews(
  query: string,
  count: number,
  withImageCount: number,
  showProductImages?: boolean,
): boolean {
  if (!showProductImages) return false
  if (count === 0 || withImageCount === 0) return false
  if (count > MAX_PREVIEW_COUNT) return false

  const cleaned = query.trim()
  if (cleaned.length < 2) return false
  if (ANALYTICS_QUERY.test(cleaned)) return false

  return true
}

function resolveImageUrl(
  cloudinaryPublicId: string | null | undefined,
  cloudinaryUrl: string | null | undefined,
  externalUrl: string | null | undefined,
): string | null {
  const fromCloudinary = buildCloudinaryImageUrl(
    cloudinaryPublicId ?? extractCloudinaryPublicId(cloudinaryUrl),
    'thumbnail',
  )
  return fromCloudinary ?? externalUrl ?? cloudinaryUrl ?? null
}

/** Resolve Cloudinary thumbnail URLs for Lightspeed items (homepage + products admin pipeline). */
export async function resolveInventoryItemImageUrls(
  supabase: SupabaseClient,
  userId: string,
  lightspeedItemIds: string[],
): Promise<Map<string, string | null>> {
  return resolveThumbnailUrlsByLightspeedItemIds(supabase, userId, lightspeedItemIds)
}

export async function buildInventoryProductPreviews(
  supabase: SupabaseClient,
  userId: string,
  matches: InventoryMatchLike[],
): Promise<GenieStoreProductPreview[]> {
  const itemIds = matches.map(match => String(match.item_id)).filter(Boolean)
  if (itemIds.length === 0) return []

  const { data: inventoryRows } = await supabase
    .from('lightspeed_inventory')
    .select('lightspeed_item_id, product_uuid')
    .eq('user_id', userId)
    .in('lightspeed_item_id', itemIds)

  const inventoryByItem = new Map(
    (inventoryRows ?? []).map(row => [String(row.lightspeed_item_id), row]),
  )

  const productIds = [...new Set(
    (inventoryRows ?? [])
      .map(row => row.product_uuid)
      .filter((id): id is string => Boolean(id)),
  )]

  const [imageByItem, activeProductIds] = await Promise.all([
    resolveInventoryItemImageUrls(supabase, userId, itemIds),
    (async () => {
      const ids = new Set<string>()
      if (productIds.length === 0) return ids
      const { data: products } = await supabase
        .from('products')
        .select('id, is_active')
        .eq('user_id', userId)
        .in('id', productIds)
      for (const product of products ?? []) {
        if (product.is_active !== false) ids.add(String(product.id))
      }
      return ids
    })(),
  ])

  return matches.slice(0, MAX_PREVIEW_COUNT).map(match => {
    const inventory = inventoryByItem.get(String(match.item_id))
    const productId = inventory?.product_uuid ? String(inventory.product_uuid) : null
    const image = imageByItem.get(String(match.item_id)) ?? null
    const hasListing = productId != null && activeProductIds.has(productId)

    return {
      id: productId ?? String(match.item_id),
      name: match.name || 'Unnamed product',
      category: match.category ?? match.brand ?? null,
      price: Number.isFinite(match.price) ? Number(match.price) : null,
      image,
      product_url: hasListing ? `/marketplace/product/${productId}` : null,
      in_stock: match.is_in_stock ?? (match.total_qoh != null ? match.total_qoh > 0 : null),
      sku: match.custom_sku ?? match.system_sku ?? null,
    }
  }).filter(preview => Boolean(preview.image))
}

interface StorefrontProductRow {
  id: string
  display_name: string | null
  description: string | null
  price: number | string | null
  category_name: string | null
  manufacturer_name: string | null
  is_active: boolean | null
  product_images?: Array<{
    cloudinary_public_id: string | null
    cloudinary_url: string | null
    external_url: string | null
    is_primary: boolean | null
    approval_status: string | null
    sort_order: number | null
  }> | null
}

export async function buildStorefrontProductPreviews(
  supabase: SupabaseClient,
  userId: string,
  productIds: string[],
): Promise<GenieStoreProductPreview[]> {
  if (productIds.length === 0) return []

  const { data } = await supabase
    .from('products')
    .select(`
      id,
      display_name,
      description,
      price,
      category_name,
      manufacturer_name,
      is_active,
      product_images!product_id (
        cloudinary_public_id,
        cloudinary_url,
        external_url,
        is_primary,
        approval_status,
        sort_order
      )
    `)
    .eq('user_id', userId)
    .in('id', productIds.slice(0, MAX_PREVIEW_COUNT))

  const rows = (data ?? []) as StorefrontProductRow[]
  const order = new Map(productIds.map((id, index) => [id, index]))

  return rows
    .sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999))
    .map(row => {
      const images = [...(row.product_images ?? [])]
        .filter(img => img.approval_status === 'approved')
        .sort((a, b) => {
          if (a.is_primary && !b.is_primary) return -1
          if (!a.is_primary && b.is_primary) return 1
          return (a.sort_order ?? 0) - (b.sort_order ?? 0)
        })
      const primary = images[0]
      const image = resolveImageUrl(
        primary?.cloudinary_public_id,
        primary?.cloudinary_url,
        primary?.external_url,
      )
      const isActive = row.is_active !== false

      return {
        id: row.id,
        name: row.display_name || row.description || 'Unnamed product',
        category: row.category_name ?? row.manufacturer_name ?? null,
        price: row.price != null ? Number(row.price) : null,
        image,
        product_url: isActive ? `/marketplace/product/${row.id}` : null,
        in_stock: null,
        sku: null,
      }
    })
    .filter(preview => Boolean(preview.image))
}

export function inventoryMatchesForPreview(matches: InventoryMatchLike[]): InventoryMatchLike[] {
  const strong = matches.filter(match => match.confidence === 'strong')
  const pool = strong.length > 0 ? strong : matches
  return pool.slice(0, MAX_PREVIEW_COUNT)
}
