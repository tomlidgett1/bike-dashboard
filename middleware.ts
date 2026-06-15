import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/why-yellow-jersey') {
    const url = request.nextUrl.clone()
    url.pathname = '/home2/why-yellow-jersey'
    return NextResponse.redirect(url)
  }

  // OAuth sometimes lands on `/` if the provider redirect URI is wrong or not allowlisted.
  // Route to the correct handler:
  // - Lightspeed: state from our app is 64 hex chars (see generateOAuthState).
  // - Supabase: anything else with `code` → /auth/callback
  if (
    request.nextUrl.pathname === '/' &&
    request.nextUrl.searchParams.has('code')
  ) {
    const state = request.nextUrl.searchParams.get('state')
    const isLikelyLightspeedState =
      state !== null && /^[a-f0-9]{64}$/i.test(state)
    const callbackUrl = request.nextUrl.clone()
    callbackUrl.pathname = isLikelyLightspeedState
      ? '/api/lightspeed/auth/callback'
      : '/auth/callback'
    console.log(
      '[MIDDLEWARE] OAuth code on root — forwarding to',
      callbackUrl.pathname
    )
    return NextResponse.redirect(callbackUrl)
  }

  // Canonical homepage. The site's home experience permanently lives at
  // /marketplace, so the root domain must redirect there with a PERMANENT
  // (308) status — not the temporary (307) the generic auth fallback below
  // would emit. The root is the single most authoritative URL on the domain;
  // a temporary redirect tells Google not to consolidate its signals onto the
  // real home, leaking ranking equity. This dedicated branch runs before the
  // auth logic so it applies to logged-out crawlers and signed-in users alike.
  // (OAuth `?code=` on `/` is already handled above and returns first.)
  if (request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/marketplace'
    return NextResponse.redirect(url, 308)
  }

  // Check if this is a public route that doesn't require authentication
  const isPublicRoute =
    request.nextUrl.pathname.startsWith('/auth') ||
    request.nextUrl.pathname === '/login' ||
    // Lightspeed must reach the route handler: it validates session and redirects with a clear error.
    // If we blocked here, users get sent to /marketplace with ?code= still attached (broken flow).
    request.nextUrl.pathname === '/api/lightspeed/auth/callback' ||
    request.nextUrl.pathname === '/marketplace' ||
    request.nextUrl.pathname === '/for-you' ||               // Public personalised discovery feed
    request.nextUrl.pathname.startsWith('/api/for-you') ||   // Feed APIs resolve anonymous identity themselves
    request.nextUrl.pathname === '/api/tracking' ||          // Anonymous behavioural event ingestion
    // Text-upload handoff links land here logged out; the sell page shows the
    // login popup itself and resumes the listing after auth.
    (request.nextUrl.pathname === '/marketplace/sell' &&
      request.nextUrl.searchParams.has('textUploadToken')) ||
    request.nextUrl.pathname.startsWith('/marketplace/product') ||
    request.nextUrl.pathname.startsWith('/marketplace/store') ||
    request.nextUrl.pathname.startsWith('/marketplace/sell-prototypes') || // Mobile design prototypes (mock data, no auth)
    request.nextUrl.pathname.startsWith('/marketplace/mobile-prototypes') || // Mobile redesign prototypes (mock data, no auth)
    request.nextUrl.pathname.startsWith('/marketplace/used-products') ||
    request.nextUrl.pathname.startsWith('/marketplace/new-products') ||
    request.nextUrl.pathname === '/sell-your-bike' ||         // Public SEO content page
    request.nextUrl.pathname.startsWith('/used-bikes') ||     // Public SEO used-bike hubs
    request.nextUrl.pathname.startsWith('/api/marketplace') ||
    request.nextUrl.pathname === '/api/store/analytics' || // Public storefront tracking; GET still enforces auth in the route handler.
    request.nextUrl.pathname.startsWith('/api/stripe') ||  // Stripe webhooks
    request.nextUrl.pathname.startsWith('/api/cron') ||    // Cron jobs
    request.nextUrl.pathname === '/api/genie' ||           // Public marketplace Genie chat
    request.nextUrl.pathname === '/api/genie/product-question' ||
    request.nextUrl.pathname === '/api/genie/product-suggestions' ||
    request.nextUrl.pathname.startsWith('/mockup') ||      // Design mockup (no auth needed)
    request.nextUrl.pathname.startsWith('/preview-verify') || // TEMP sidebar check (no auth)
    request.nextUrl.pathname === '/home' ||
    request.nextUrl.pathname.startsWith('/home2') ||
    request.nextUrl.pathname === '/v2'
  
  if (isPublicRoute) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // If no user, redirect to marketplace
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/marketplace'
    return NextResponse.redirect(url)
  }

  // No onboarding check - users go directly to their destination
  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - robots.txt / sitemap.xml (+ other .txt/.xml/.ico metadata): these must be
     *   reachable by crawlers. Without excluding them the auth check below
     *   redirects logged-out requests (incl. Googlebot) to /marketplace, which
     *   silently breaks SEO indexing.
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|txt|xml|ico)$).*)',
  ],
}
