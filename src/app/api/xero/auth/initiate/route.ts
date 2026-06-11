/**
 * Xero OAuth Initiation Endpoint
 *
 * GET /api/xero/auth/initiate
 *
 * Generates a secure state token, stores it in the database,
 * and redirects the user to Xero's OAuth authorization page.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateXeroOAuthState, buildXeroAuthUrl } from '@/lib/services/xero'

// Never cache: every click must mint a fresh OAuth state and a redirect built
// from the current scope set. A cached redirect would replay a stale authorize
// URL (e.g. the old app.connections scope) and break the flow.
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

    const state = await generateXeroOAuthState(user.id)
    const authUrl = buildXeroAuthUrl(state)

    const response = NextResponse.redirect(authUrl)
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    return response
  } catch (error) {
    console.error('[Xero Initiate] Error initiating OAuth:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    if (errorMessage.includes('environment variable')) {
      return NextResponse.json(
        { error: 'Xero integration is not configured. Please contact support.' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to initiate Xero connection' },
      { status: 500 }
    )
  }
}
