/**
 * Lightspeed Categories Endpoint
 * 
 * GET /api/lightspeed/categories
 * 
 * Fetches all categories from Lightspeed for sync selection
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
    
    // Fetch categories
    const categories = await client.getCategories({ archived: 'false' })

    // Transform categories into a tree structure
    const categoryMap = new Map()
    const rootCategories: any[] = []

    // First pass: create all nodes
    categories.forEach(cat => {
      categoryMap.set(cat.categoryID, {
        id: cat.categoryID,
        name: cat.name,
        fullPath: cat.fullPathName,
        depth: parseInt(cat.nodeDepth),
        parentId: cat.parentID === '0' ? null : cat.parentID,
        children: [],
      })
    })

    // Second pass: build tree
    categories.forEach(cat => {
      const node = categoryMap.get(cat.categoryID)
      if (cat.parentID === '0') {
        rootCategories.push(node)
      } else {
        const parent = categoryMap.get(cat.parentID)
        if (parent) {
          parent.children.push(node)
        }
      }
    })

    return NextResponse.json({
      categories: rootCategories,
      total: categories.length,
    })
  } catch (error) {
    console.error('Error fetching categories:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch categories'
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}








