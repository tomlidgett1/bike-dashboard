import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/server'

/** Point the listing at its primary approved image so marketplace_ready_products resolves it. */
export async function finalizeListingForMarketplace(
  supabase: SupabaseClient,
  productId: string,
  insertedImages: Array<{ id: string; is_primary?: boolean | null }>,
  options?: { displayName?: string },
) {
  if (insertedImages.length === 0) return

  const primary =
    insertedImages.find((img) => img.is_primary) ?? insertedImages[0]

  const update: Record<string, unknown> = {
    has_displayable_image: true,
    selected_product_image_id: primary.id,
  }

  if (options?.displayName?.trim()) {
    update.display_name = options.displayName.trim()
  }

  await supabase.from('products').update(update).eq('id', productId)
}

/** Repair older private listings that never got selected_product_image_id set. */
async function backfillMissingListingImageSelections(supabase: SupabaseClient) {
  const { data: products, error } = await supabase
    .from('products')
    .select('id, display_name, description')
    .eq('listing_type', 'private_listing')
    .eq('is_active', true)
    .eq('listing_status', 'active')
    .is('selected_product_image_id', null)
    .limit(100)

  if (error || !products?.length) return

  for (const product of products) {
    const { data: images } = await supabase
      .from('product_images')
      .select('id, is_primary, sort_order')
      .eq('product_id', product.id)
      .eq('approval_status', 'approved')
      .order('is_primary', { ascending: false })
      .order('sort_order', { ascending: true })
      .limit(1)

    const primary = images?.[0]
    if (!primary) continue

    const displayName =
      product.display_name?.trim() || product.description?.trim() || null

    await supabase
      .from('products')
      .update({
        selected_product_image_id: primary.id,
        has_displayable_image: true,
        ...(displayName ? { display_name: displayName } : {}),
      })
      .eq('id', product.id)
  }
}

export async function refreshPublicMarketplaceAfterMutation() {
  try {
    const supabase = createServiceRoleClient()
    await backfillMissingListingImageSelections(supabase)
    const { error } = await supabase.rpc('refresh_public_marketplace_cards')

    if (error) {
      console.warn('[public-marketplace] Card feed refresh failed:', error.message)
    }
  } catch (error) {
    console.warn('[public-marketplace] Card feed refresh skipped:', error)
  }

  revalidatePath('/marketplace')
  revalidatePath('/api/marketplace/products')
  revalidatePath('/api/marketplace/stores')
  revalidatePath('/api/marketplace/store-categories')
}
