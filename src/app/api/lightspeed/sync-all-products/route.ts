/**
 * Sync All Lightspeed Products API
 * 
 * POST /api/lightspeed/sync-all-products
 * 
 * Triggers the edge function to fetch all Lightspeed items with stock
 * and store them in products_all_ls table
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
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

    console.log('[Sync All Products] Triggering edge function for user:', user.id)

    // Get Supabase URL
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: 'Supabase configuration missing' },
        { status: 500 }
      )
    }

    // Get session token
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json(
        { error: 'No active session' },
        { status: 401 }
      )
    }

    // Call the edge function
    const functionUrl = `${supabaseUrl}/functions/v1/sync-all-lightspeed-products`
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        userId: user.id,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('[Sync All Products] Edge function error:', errorData)
      return NextResponse.json(
        { error: errorData.error || 'Failed to sync products' },
        { status: response.status }
      )
    }

    const result = await response.json()

    console.log('[Sync All Products] Sync complete:', result)

    return NextResponse.json({
      success: true,
      ...result,
    })

  } catch (error) {
    console.error('[Sync All Products] Error:', error)
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    )
  }
}

