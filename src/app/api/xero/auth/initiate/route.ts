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

    return NextResponse.redirect(authUrl)
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
