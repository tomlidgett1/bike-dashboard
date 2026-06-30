import { NextResponse, type NextRequest } from 'next/server'
import { SITE_URL, storePath } from '@/lib/seo/site'

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
 * Permanent redirects for traffic still hitting the old Ashburton domain.
 * `/products/:slug` is left to the page handler so we can look up the product.
 */
export function getAshburtonLegacyRedirect(request: NextRequest): NextResponse | null {
  if (!isAshburtonLegacyHost(request.headers.get('host'))) return null

  const { pathname } = request.nextUrl
  // Old Shopify product URLs (`/products/{handle}`) resolve to an exact Yellow
  // Jersey product in the /products/[slug] route handler — let them through.
  if (pathname.startsWith('/products/') && pathname.length > '/products/'.length) {
    return null
  }

  // Everything else (homepage, /collections, /pages, singular /product, etc.)
  // forwards permanently to the Ashburton storefront rather than the generic
  // marketplace, so Google maps the old site onto the shop's own landing page.
  const destination = new URL(storePath(ASHBURTON_STORE_SLUG), SITE_URL)
  return NextResponse.redirect(destination, 308)
}
