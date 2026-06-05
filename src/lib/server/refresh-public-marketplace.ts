import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function refreshPublicMarketplaceAfterMutation() {
  try {
    const supabase = createServiceRoleClient()
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
