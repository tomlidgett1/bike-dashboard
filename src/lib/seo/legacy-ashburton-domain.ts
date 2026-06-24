import { NextResponse, type NextRequest } from 'next/server'
import { SITE_URL } from '@/lib/seo/site'

/** Ashburton Cycles store owner — legacy Shopify URLs resolve against this catalogue. */
export const ASHBURTON_CYCLES_USER_ID = '3acef09d-8b28-46e8-a0c3-45ce59c61972'

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
  if (pathname.startsWith('/products/') && pathname.length > '/products/'.length) {
    return null
  }

  const destination = new URL('/marketplace', SITE_URL)
  destination.search = request.nextUrl.search
  return NextResponse.redirect(destination, 308)
}
