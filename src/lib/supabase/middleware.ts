import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  // Check if this is an auth route
  const isAuthRoute = request.nextUrl.pathname.startsWith('/login') || 
                      request.nextUrl.pathname.startsWith('/auth')
  
  // For testing: log to console to see if middleware runs
  if (!isAuthRoute) {
    console.log('🔐 Middleware running for:', request.nextUrl.pathname)
  }
  
  if (isAuthRoute) {
    return NextResponse.next()
  }
  
  // TEST: Force redirect to see if middleware is working
  console.log('❌ Forcing redirect to /login')
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  return NextResponse.redirect(url)
  
  /* Original code - temporarily disabled for testing
  */

  let supabaseResponse = NextResponse.next({
    request,
  })

  try {
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
      error,
    } = await supabase.auth.getUser()

    console.log('🔐 Auth Check:', {
      path: request.nextUrl.pathname,
      hasUser: !!user,
      error: error?.message
    })

    // If no user, redirect to login
    if (!user) {
      console.log('❌ No user found, redirecting to /login')
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    console.log('✅ User authenticated:', user?.email)
    return supabaseResponse
    
  } catch (error) {
    console.error('❌ Middleware error:', error)
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely.

  return supabaseResponse
}

