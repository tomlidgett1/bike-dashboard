/**
 * Deputy OAuth Initiation Endpoint
 *
 * GET /api/deputy/auth/initiate
 *
 * Generates a secure state token, stores it, and redirects the user to Deputy's
 * OAuth authorization page (the shared once.deputy.com gateway).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateDeputyOAuthState, buildDeputyAuthUrl } from '@/lib/services/deputy'

// Never cache: every click must mint a fresh OAuth state and a redirect built
// from the current scope set. A cached redirect would replay a stale authorize URL.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorised. Please log in first.' },
        { status: 401 }
      )
    }

    const state = await generateDeputyOAuthState(user.id)
    const authUrl = buildDeputyAuthUrl(state)

    const response = NextResponse.redirect(authUrl)
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    return response
  } catch (error) {
    console.error('[Deputy Initiate] Error initiating OAuth:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    if (errorMessage.includes('environment variable')) {
      return NextResponse.json(
        { error: 'Deputy integration is not configured. Please contact support.' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to initiate Deputy connection' },
      { status: 500 }
    )
  }
}
