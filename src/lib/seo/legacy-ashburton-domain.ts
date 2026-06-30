import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  SITE_URL,
  productPath,
  productSlugId,
  slugify,
  storePath,
} from '@/lib/seo/site'

/** Ashburton Cycles store owner — legacy Shopify URLs resolve against this catalogue. */
export const ASHBURTON_CYCLES_USER_ID = '3acef09d-8b28-46e8-a0c3-45ce59c61972'

/** Public storefront slug — legacy traffic with no matching product lands here. */
export const ASHBURTON_STORE_SLUG = 'ashburton-cycles'

const ASHBURTON_LEGACY_HOSTS = new Set([
  'ashburtoncycles.com.au',
  'www.ashburtoncycles.com.au',
])

export function isAshburtonLegacyHost(host: string | null | undefined): boolean {
  if (!host) return false
  const normalised = host.toLowerCase().split(':')[0]
  return ASHBURTON_LEGACY_HOSTS.has(normalised)
}

/**
 * Edge-safe lookup of an old Shopify `/products/{handle}` slug against the live
 * Ashburton catalogue. Mirrors `resolveLegacyShopifyProduct` but creates its own
 * supabase-js client and avoids the Node-only image-resolver imports, so it can
 * run inside middleware. Returns the Yellow Jersey product path, or null.
 */
async function resolveLegacyProductPath(shopifySlug: string): Promise<string | null> {
  const slug = shopifySlug.trim().toLowerCase()
  if (!slug) return null

  const searchToken = slug.split('-').find((part) => part.length > 2)
  if (!searchToken) return null

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  const { data, error } = await supabase
    .from('public_marketplace_cards')
    .select('id, display_name, description')
    .eq('user_id', ASHBURTON_CYCLES_USER_ID)
    .or(`display_name.ilike.%${searchToken}%,description.ilike.%${searchToken}%`)
    .limit(80)

  if (error || !data?.length) return null

  const match =
    data.find((row) => slugify(row.display_name || row.description) === slug) ??
    // Shopify handles occasionally truncate long titles — accept a prefix match.
    data.find((row) => {
      const candidate = slugify(row.display_name || row.description)
      return candidate.startsWith(slug) || slug.startsWith(candidate)
    })

  if (!match) return null
  return productPath(productSlugId(match.id, match.display_name || match.description))
}

/**
 * Permanent (308) redirects for traffic still hitting the old Ashburton domain.
 * Done entirely in middleware so every legacy URL is a hard edge redirect —
 * resolving `/products/{handle}` here (rather than the /products/[slug] page)
 * avoids the soft client-side redirect the /products `loading.tsx` Suspense
 * boundary would otherwise produce, which doesn't pass SEO ranking signals.
 */
export async function getAshburtonLegacyRedirect(
  request: NextRequest,
): Promise<NextResponse | null> {
  if (!isAshburtonLegacyHost(request.headers.get('host'))) return null

  const { pathname } = request.nextUrl
  const storefront = storePath(ASHBURTON_STORE_SLUG)

  // Old Shopify product URLs → the exact Yellow Jersey product when we can match
  // it, otherwise the storefront. Never errors: a failed lookup falls back too.
  if (pathname.startsWith('/products/') && pathname.length > '/products/'.length) {
    let target = storefront
    try {
      target = (await resolveLegacyProductPath(pathname.slice('/products/'.length))) ?? storefront
    } catch {
      // Fall back to the storefront on any lookup failure.
    }
    return NextResponse.redirect(new URL(target, SITE_URL), 308)
  }

  // Everything else (homepage, /collections, /pages, singular /product, etc.)
  // forwards to the Ashburton storefront rather than the generic marketplace,
  // so Google maps the old site onto the shop's own landing page.
  return NextResponse.redirect(new URL(storefront, SITE_URL), 308)
}
