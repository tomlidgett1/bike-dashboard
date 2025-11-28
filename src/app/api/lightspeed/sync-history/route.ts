/**
 * Lightspeed Sync History Endpoint
 * 
 * GET /api/lightspeed/sync-history
 * 
 * Returns sync logs and current sync statistics
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

    // Get sync logs (last 10)
    const { data: logs, error: logsError } = await supabase
      .from('lightspeed_sync_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(10)

    if (logsError) {
      console.error('Error fetching logs:', logsError)
    }

    // Get total product count
    const { count: totalProducts, error: totalError } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true)

    // Get in-stock product count (qoh > 0)
    const { count: inStockProducts, error: stockError } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true)
      .gt('qoh', 0)

    if (totalError || stockError) {
      console.error('Error fetching product counts:', totalError || stockError)
    }

    // Get products for category breakdown
    const { data: products } = await supabase
      .from('products')
      .select('category_name, lightspeed_category_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
    
    // Group by category - count unique categories
    const categorySet = new Set<string>()
    const categoryStats: Record<string, number> = {}
    
    products?.forEach(product => {
      const catName = product.category_name || 'Uncategorized'
      const catId = product.lightspeed_category_id || '__UNCATEGORIZED__'
      
      categorySet.add(catId)
      categoryStats[catName] = (categoryStats[catName] || 0) + 1
    })

    const categoriesWithProducts = Object.entries(categoryStats)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count) // Sort by count descending

    return NextResponse.json({
      logs: logs || [],
      stats: {
        totalProducts: totalProducts || 0,
        inStockProducts: inStockProducts || 0,
        categories: categoriesWithProducts,
        totalCategories: categorySet.size, // Count unique category IDs
      },
    })
  } catch (error) {
    console.error('Error fetching sync history:', error)
    
    return NextResponse.json(
      { error: 'Failed to fetch sync history' },
      { status: 500 }
    )
  }
}

