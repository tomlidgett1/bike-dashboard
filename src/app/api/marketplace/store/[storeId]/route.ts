import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  fetchCachedPublicStoreProfile,
  PUBLIC_STORE_PROFILE_CACHE_CONTROL,
} from '@/lib/marketplace/public-store-profile'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> },
) {
  try {
    const { storeId } = await params
    const searchQuery = request.nextUrl.searchParams.get('search')

    if (!storeId) {
      return NextResponse.json(
        { error: 'Store ID is required' },
        { status: 400 },
      )
    }

    const store = await fetchCachedPublicStoreProfile(storeId, searchQuery)

    if (!store) {
      return NextResponse.json(
        { error: 'Store not found' },
        {
          status: 404,
          headers: {
            'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
          },
        },
      )
    }

    return NextResponse.json(
      { store },
      {
        headers: {
          'Cache-Control': PUBLIC_STORE_PROFILE_CACHE_CONTROL,
          'CDN-Cache-Control': PUBLIC_STORE_PROFILE_CACHE_CONTROL,
          'Vercel-CDN-Cache-Control': PUBLIC_STORE_PROFILE_CACHE_CONTROL,
        },
      },
    )
  } catch (error) {
    console.error('Error in GET /api/marketplace/store/[storeId]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

// PATCH /api/marketplace/store/[storeId]
// Update a category's logo_url (authenticated owner only).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> },
) {
  try {
    const supabase = await createClient()
    const { storeId } = await params

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user || user.id !== storeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { categoryId, logo_url } = body

    if (!categoryId) {
      return NextResponse.json({ error: 'categoryId is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('store_categories')
      .update({ logo_url: logo_url ?? null })
      .eq('id', categoryId)
      .eq('user_id', storeId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in PATCH /api/marketplace/store/[storeId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
