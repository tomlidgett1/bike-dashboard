import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
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

  // Check if this is a public route that doesn't require authentication
  const isPublicRoute =
    request.nextUrl.pathname.startsWith('/auth') ||
    // Lightspeed must reach the route handler: it validates session and redirects with a clear error.
    // If we blocked here, users get sent to /marketplace with ?code= still attached (broken flow).
    request.nextUrl.pathname === '/api/lightspeed/auth/callback' ||
    request.nextUrl.pathname === '/marketplace' ||
    request.nextUrl.pathname.startsWith('/marketplace/product') ||
    request.nextUrl.pathname.startsWith('/marketplace/store') ||
    request.nextUrl.pathname.startsWith('/marketplace/used-products') ||
    request.nextUrl.pathname.startsWith('/marketplace/new-products') ||
    request.nextUrl.pathname.startsWith('/api/marketplace') ||
    request.nextUrl.pathname.startsWith('/api/stripe') ||  // Stripe webhooks
    request.nextUrl.pathname.startsWith('/api/cron') ||    // Cron jobs
    request.nextUrl.pathname === '/api/genie'              // Public AI chat
  
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
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
