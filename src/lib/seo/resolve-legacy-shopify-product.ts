import { createPublicSupabaseClient } from '@/lib/marketplace/public-card-feed'
import { ASHBURTON_CYCLES_USER_ID } from '@/lib/seo/legacy-ashburton-domain'
import { slugify } from '@/lib/seo/site'

interface LegacyProductMatch {
  id: string
  display_name: string | null
  description: string | null
}

/**
 * Map an old Shopify `/products/{handle}` slug to a live Ashburton catalogue row.
 * We search by the first slug token, then exact-match slugify(display_name|description).
 */
export async function resolveLegacyShopifyProduct(
  shopifySlug: string,
): Promise<LegacyProductMatch | null> {
  const slug = shopifySlug.trim().toLowerCase()
  if (!slug) return null

  const searchToken = slug.split('-').find((part) => part.length > 2)
  if (!searchToken) return null

  const supabase = createPublicSupabaseClient()
  const { data, error } = await supabase
    .from('public_marketplace_cards')
    .select('id, display_name, description')
    .eq('user_id', ASHBURTON_CYCLES_USER_ID)
    .or(`display_name.ilike.%${searchToken}%,description.ilike.%${searchToken}%`)
    .limit(80)

  if (error || !data?.length) return null

  const exact = data.find(
    (row) => slugify(row.display_name || row.description) === slug,
  )
  if (exact) return exact

  // Shopify handles occasionally truncate long titles — accept a prefix match.
  const prefix = data.find((row) => {
    const candidate = slugify(row.display_name || row.description)
    return candidate.startsWith(slug) || slug.startsWith(candidate)
  })
  return prefix ?? null
}
