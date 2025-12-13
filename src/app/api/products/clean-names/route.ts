/**
 * Clean Product Names API
 * 
 * POST /api/products/clean-names
 * 
 * Triggers the Edge Function to clean product display names using AI
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
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

    console.log(`🧹 Starting product name cleaning for user ${user.id}`)

    // Parse request body
    const body = await request.json().catch(() => ({}))
    const { batchSize = 20, limit = 100 } = body

    // Get Supabase URL from environment
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL not configured')
    }

    // Get user's session for authorization
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      throw new Error('No active session')
    }

    // Call Edge Function
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/clean-product-names`
    console.log(`📡 Calling Edge Function: ${edgeFunctionUrl}`)

    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: user.id,
        batchSize,
        limit,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ Edge Function error: ${response.status} - ${errorText}`)
      throw new Error(`Edge Function failed: ${response.status}`)
    }

    const result = await response.json()

    console.log(`✅ Cleaning completed:`, result.stats)

    return NextResponse.json({
      success: true,
      message: result.message,
      stats: result.stats,
      results: result.results,
    })
  } catch (error) {
    console.error('❌ Clean names error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Failed to clean product names'

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

/**
 * GET endpoint to check status
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorised' },
        { status: 401 }
      )
    }

    // Get stats about cleaned vs uncleaned products
    const { data: stats, error: statsError } = await supabase.rpc('get_cleaning_stats', {
      p_user_id: user.id,
    }).single()

    if (statsError) {
      // If RPC doesn't exist, query directly
      const { count: totalCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_active', true)

      const { count: cleanedCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_active', true)
        .eq('cleaned', true)

      return NextResponse.json({
        total: totalCount || 0,
        cleaned: cleanedCount || 0,
        uncleaned: (totalCount || 0) - (cleanedCount || 0),
      })
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error('❌ Stats error:', error)
    return NextResponse.json(
      { error: 'Failed to get stats' },
      { status: 500 }
    )
  }
}








