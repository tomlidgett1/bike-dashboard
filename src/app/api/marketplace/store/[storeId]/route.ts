import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  fetchCachedPublicStoreProfile,
  PUBLIC_STORE_PROFILE_CACHE_CONTROL,
  PUBLIC_STORE_PROFILE_CACHE_TAG,
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
// Update a category's logo_url or logo_max_width (authenticated owner only).
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
    const { categoryId, logo_url, logo_max_width } = body

    if (!categoryId) {
      return NextResponse.json({ error: 'categoryId is required' }, { status: 400 })
    }

    const updateData: { logo_url?: string | null; logo_max_width?: number | null } = {}
    if ('logo_url' in body) updateData.logo_url = logo_url ?? null
    if ('logo_max_width' in body) {
      if (logo_max_width == null) {
        updateData.logo_max_width = null
      } else {
        const width = Number(logo_max_width)
        if (!Number.isFinite(width) || width <= 0) {
          return NextResponse.json({ error: 'logo_max_width must be a positive number' }, { status: 400 })
        }
        updateData.logo_max_width = Math.round(width)
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { data: category, error } = await supabase
      .from('store_categories')
      .update(updateData)
      .eq('id', categoryId)
      .eq('user_id', storeId)
      .select('id, logo_url, logo_max_width')
      .maybeSingle()

    if (error) throw error
    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    revalidateTag(PUBLIC_STORE_PROFILE_CACHE_TAG, 'max')
    revalidatePath(`/marketplace/store/${storeId}`)
    revalidatePath(`/api/marketplace/store/${storeId}`)

    return NextResponse.json({ success: true, category })
  } catch (error) {
    console.error('Error in PATCH /api/marketplace/store/[storeId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
