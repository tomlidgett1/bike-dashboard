import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const error_param = searchParams.get('error')
  const error_description = searchParams.get('error_description')
  // if "next" is in param, use it as the redirect URL
  const next = searchParams.get('next') ?? '/'

  console.log('🔐 [AUTH CALLBACK] Starting auth callback')
  console.log('🔐 [AUTH CALLBACK] Code present:', !!code)
  console.log('🔐 [AUTH CALLBACK] Error param:', error_param)
  console.log('🔐 [AUTH CALLBACK] Error description:', error_description)
  console.log('🔐 [AUTH CALLBACK] Next:', next)
  console.log('🔐 [AUTH CALLBACK] Origin:', origin)
  console.log('🔐 [AUTH CALLBACK] Full URL:', request.url)

  // Determine the redirect URL
  const getRedirectUrl = () => {
    if (process.env.NEXT_PUBLIC_SITE_URL) {
      return process.env.NEXT_PUBLIC_SITE_URL
    }
    const forwardedHost = request.headers.get('x-forwarded-host')
    if (forwardedHost) {
      return `https://${forwardedHost}`
    }
    return origin
  }

  const redirectUrl = getRedirectUrl()
  console.log('🔐 [AUTH CALLBACK] Redirect URL:', redirectUrl)

  // Check for OAuth error
  if (error_param) {
    console.error('🔐 [AUTH CALLBACK] OAuth error:', error_param, error_description)
    return NextResponse.redirect(`${redirectUrl}/auth/auth-code-error?error=${error_param}`)
  }

  if (code) {
    const cookieStore = await cookies()
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          },
        },
      }
    )

    console.log('🔐 [AUTH CALLBACK] Exchanging code for session...')
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && data.user) {
      console.log('🔐 [AUTH CALLBACK] ✅ Session created for user:', data.user.id)
      console.log('🔐 [AUTH CALLBACK] ✅ User email:', data.user.email)
      console.log('🔐 [AUTH CALLBACK] ✅ Provider:', data.user.app_metadata?.provider)
      return NextResponse.redirect(`${redirectUrl}${next}`)
    }
    
    console.error('🔐 [AUTH CALLBACK] ❌ Error exchanging code:', error)
  } else {
    console.error('🔐 [AUTH CALLBACK] ❌ No code received')
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${redirectUrl}/auth/auth-code-error`)
}





