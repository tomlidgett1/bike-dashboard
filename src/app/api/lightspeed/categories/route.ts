/**
 * Lightspeed Categories API
 * 
 * GET /api/lightspeed/categories
 * 
 * Fetches all categories from Lightspeed
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLightspeedClient } from '@/lib/services/lightspeed'

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

    // Create Lightspeed client
    const client = createLightspeedClient(user.id)

    // Fetch all categories
    const categories = await client.getCategories({ archived: 'false' })

    return NextResponse.json({
      success: true,
      categories: categories.map(cat => ({
        categoryID: cat.categoryID,
        name: cat.name,
        fullPathName: cat.fullPathName,
        nodeDepth: cat.nodeDepth,
      })),
    })

  } catch (error) {
    console.error('[Categories API] Error:', error)
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    )
  }
}
