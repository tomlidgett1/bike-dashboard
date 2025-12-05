/**
 * Lightspeed OAuth Initiation Endpoint
 * 
 * GET /api/lightspeed/auth/initiate
 * 
 * Generates a secure state token, stores it in the database,
 * and redirects the user to Lightspeed's OAuth authorization page.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateOAuthState, buildAuthUrl } from '@/lib/services/lightspeed'

export async function GET() {
  try {
    // Get authenticated user
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorised. Please log in first.' },
        { status: 401 }
      )
    }

    // Generate and store OAuth state token
    const state = await generateOAuthState(user.id)

    // Build authorization URL
    const authUrl = buildAuthUrl(state)

    // Redirect to Lightspeed OAuth
    return NextResponse.redirect(authUrl)
  } catch (error) {
    console.error('Error initiating OAuth:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    // If it's a config error, return JSON response
    if (errorMessage.includes('environment variable')) {
      return NextResponse.json(
        { error: 'Lightspeed integration is not configured. Please contact support.' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to initiate Lightspeed connection' },
      { status: 500 }
    )
  }
}







