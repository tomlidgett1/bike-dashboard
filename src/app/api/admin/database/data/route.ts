/**
 * Admin Database Data API
 * 
 * GET /api/admin/database/data - Fetch data from a table
 * POST /api/admin/database/data - Update a row
 * PATCH /api/admin/database/data - Bulk update multiple rows
 * DELETE /api/admin/database/data - Delete rows
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorised. Please log in first.' },
        { status: 401 }
      )
    }

    const serviceClient = createServiceRoleClient()
    const searchParams = request.nextUrl.searchParams
    
    const tableName = searchParams.get('table')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '50')
    const sortBy = searchParams.get('sortBy') || ''
    const sortOrder = (searchParams.get('sortOrder') || 'asc') as 'asc' | 'desc'
    const search = searchParams.get('search') || ''
    const searchColumn = searchParams.get('searchColumn') || ''
    const filters = searchParams.get('filters') || '' // JSON string of filters

    if (!tableName) {
      return NextResponse.json(
        { error: 'Table name is required' },
        { status: 400 }
      )
    }

    // Calculate offset
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    // Build query
    let query = serviceClient
      .from(tableName)
      .select('*', { count: 'exact' })

    // Apply search filter
    if (search && searchColumn) {
      query = query.ilike(searchColumn, `%${search}%`)
    }

    // Apply additional filters
    if (filters) {
      try {
        const filterArray = JSON.parse(filters) as Array<{
          column: string
          operator: string
          value: string
        }>
        
        for (const filter of filterArray) {
          switch (filter.operator) {
            case 'eq':
              query = query.eq(filter.column, filter.value)
              break
            case 'neq':
              query = query.neq(filter.column, filter.value)
              break
            case 'gt':
              query = query.gt(filter.column, filter.value)
              break
            case 'gte':
              query = query.gte(filter.column, filter.value)
              break
            case 'lt':
              query = query.lt(filter.column, filter.value)
              break
            case 'lte':
              query = query.lte(filter.column, filter.value)
              break
            case 'like':
              query = query.like(filter.column, `%${filter.value}%`)
              break
            case 'ilike':
              query = query.ilike(filter.column, `%${filter.value}%`)
              break
            case 'is':
              if (filter.value === 'null') {
                query = query.is(filter.column, null)
              } else if (filter.value === 'true') {
                query = query.is(filter.column, true)
              } else if (filter.value === 'false') {
                query = query.is(filter.column, false)
              }
              break
            case 'in':
              query = query.in(filter.column, filter.value.split(',').map(v => v.trim()))
              break
          }
        }
      } catch (e) {
        console.error('Failed to parse filters:', e)
      }
    }

    // Apply sorting
    if (sortBy) {
      query = query.order(sortBy, { ascending: sortOrder === 'asc' })
    }

    // Apply pagination
    query = query.range(from, to)

    const { data, count, error } = await query

    if (error) {
      return NextResponse.json(
        { error: `Failed to fetch data: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize)
    })

  } catch (error) {
    console.error('Database data GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorised. Please log in first.' },
        { status: 401 }
      )
    }

    const serviceClient = createServiceRoleClient()
    const body = await request.json()
    
    const { table, id, idColumn = 'id', data } = body

    if (!table || !id || !data) {
      return NextResponse.json(
        { error: 'Table, id, and data are required' },
        { status: 400 }
      )
    }

    // @ts-ignore - Dynamic table name prevents type inference
    const result = await serviceClient
      .from(table)
      .update(data)
      .eq(idColumn, id)
      .select()
      .single()
    
    const updated = result.data as Record<string, unknown> | null
    const error = result.error as { message: string } | null

    if (error) {
      return NextResponse.json(
        { error: `Failed to update: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: updated
    })

  } catch (error) {
    console.error('Database data POST error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    // Check authentication
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorised. Please log in first.' },
        { status: 401 }
      )
    }

    const serviceClient = createServiceRoleClient()
    const body = await request.json()
    
    const { table, ids, idColumn = 'id', data } = body

    if (!table || !ids || !Array.isArray(ids) || ids.length === 0 || !data) {
      return NextResponse.json(
        { error: 'Table, ids array, and data are required' },
        { status: 400 }
      )
    }

    // @ts-ignore - Dynamic table name prevents type inference
    const result = await serviceClient
      .from(table)
      .update(data)
      .in(idColumn, ids)
      .select()
    
    const updated = result.data as Record<string, unknown>[] | null
    const error = result.error as { message: string } | null

    if (error) {
      return NextResponse.json(
        { error: `Failed to bulk update: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      updatedCount: updated?.length || 0
    })

  } catch (error) {
    console.error('Database data PATCH error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Check authentication
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorised. Please log in first.' },
        { status: 401 }
      )
    }

    const serviceClient = createServiceRoleClient()
    const body = await request.json()
    
    const { table, ids, idColumn = 'id' } = body

    if (!table || !ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'Table and ids array are required' },
        { status: 400 }
      )
    }

    // @ts-ignore - Dynamic table name prevents type inference
    const result = await serviceClient
      .from(table)
      .delete()
      .in(idColumn, ids)
    
    const error = result.error as { message: string } | null

    if (error) {
      return NextResponse.json(
        { error: `Failed to delete: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      deletedCount: ids.length
    })

  } catch (error) {
    console.error('Database data DELETE error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

