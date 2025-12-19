import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Check if this is a public route that doesn't require authentication
  const isPublicRoute = 
    request.nextUrl.pathname.startsWith('/auth') ||
    request.nextUrl.pathname === '/marketplace' ||
    request.nextUrl.pathname.startsWith('/marketplace/product') ||
    request.nextUrl.pathname.startsWith('/marketplace/store') ||
    request.nextUrl.pathname.startsWith('/marketplace/used-products') ||
    request.nextUrl.pathname.startsWith('/marketplace/new-products') ||
    request.nextUrl.pathname.startsWith('/api/marketplace') ||
    request.nextUrl.pathname.startsWith('/api/stripe') ||  // Stripe webhooks
    request.nextUrl.pathname.startsWith('/api/cron')       // Cron jobs
  
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
