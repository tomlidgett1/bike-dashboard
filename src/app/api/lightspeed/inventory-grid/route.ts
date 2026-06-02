import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLightspeedClient } from '@/lib/services/lightspeed'

type InventoryCellValue = string | number | boolean | null

interface InventoryRow {
  id: string
  user_id: string
  lightspeed_item_id: string
  lightspeed_account_id: string | null
  system_sku: string | null
  description: string | null
  model_year: string | null
  upc: string | null
  category_id: string | null
  manufacturer_id: string | null
  stock_data: unknown
  total_qoh: number | null
  total_sellable: number | null
  last_synced_at: string | null
  sync_batch_id: string | null
  created_at: string | null
  updated_at: string | null
  price: number | string | null
  default_cost: number | string | null
  avg_cost: number | string | null
  images: unknown
  primary_image_url: string | null
  [key: string]: unknown
}

const INVENTORY_COLUMNS = [
  'lightspeed_item_id',
  'lightspeed_account_id',
  'system_sku',
  'description',
  'model_year',
  'upc',
  'category_id',
  'manufacturer_id',
  'price',
  'default_cost',
  'avg_cost',
  'total_qoh',
  'total_sellable',
  'stock_data',
  'images',
  'primary_image_url',
  'sync_batch_id',
  'last_synced_at',
  'created_at',
  'updated_at',
] as const

const EDITABLE_FIELD_MAP = {
  description: 'description',
  model_year: 'modelYear',
  upc: 'upc',
  category_id: 'categoryID',
  manufacturer_id: 'manufacturerID',
  default_cost: 'defaultCost',
} as const

type EditableField = keyof typeof EDITABLE_FIELD_MAP

function isEditableField(field: string): field is EditableField {
  return field in EDITABLE_FIELD_MAP
}

function toLightspeedValue(field: EditableField, value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value).trim()

  if (field === 'default_cost') {
    if (text === '') return '0'
    const amount = Number(text)
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('Default cost must be a positive number')
    }
    return amount.toFixed(2)
  }

  if (field === 'upc' && text && !/^\d{11,14}$/.test(text)) {
    throw new Error('UPC must be 11 to 14 digits')
  }

  if ((field === 'category_id' || field === 'manufacturer_id') && text && !/^\d+$/.test(text)) {
    throw new Error(`${field} must be a numeric Lightspeed ID`)
  }

  if (field === 'model_year' && text && !/^\d{4}$/.test(text)) {
    throw new Error('Model year must be a four digit year')
  }

  return text
}

function toCacheValue(field: EditableField, value: string): InventoryCellValue {
  if (field === 'default_cost') return Number(value)
  return value || null
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorised. Please log in first.' },
        { status: 401 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const page = Math.max(Number(searchParams.get('page') || '1'), 1)
    const pageSize = Math.min(Math.max(Number(searchParams.get('pageSize') || '250'), 1), 1000)
    const search = (searchParams.get('search') || '').replace(/[%(),]/g, ' ').trim()
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('products_all_ls')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('description', { ascending: true, nullsFirst: false })
      .range(from, to)

    if (search) {
      query = query.or(
        [
          `description.ilike.%${search}%`,
          `system_sku.ilike.%${search}%`,
          `lightspeed_item_id.ilike.%${search}%`,
          `upc.ilike.%${search}%`,
          `category_id.ilike.%${search}%`,
          `manufacturer_id.ilike.%${search}%`,
        ].join(',')
      )
    }

    const { data, error, count } = await query

    if (error) {
      console.error('[Inventory Grid] Fetch error:', error)
      return NextResponse.json({ error: 'Failed to load inventory' }, { status: 500 })
    }

    const rows = (data || []) as InventoryRow[]
    const discoveredColumns = new Set<string>(INVENTORY_COLUMNS)

    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (key !== 'id' && key !== 'user_id') discoveredColumns.add(key)
      }
    }

    return NextResponse.json({
      rows,
      columns: Array.from(discoveredColumns),
      editableFields: Object.keys(EDITABLE_FIELD_MAP),
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
    })
  } catch (error) {
    console.error('[Inventory Grid] GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load inventory' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorised. Please log in first.' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const itemId = String(body.itemId || '')
    const field = String(body.field || '')

    if (!itemId) {
      return NextResponse.json({ error: 'Lightspeed item ID is required' }, { status: 400 })
    }

    if (!isEditableField(field)) {
      return NextResponse.json(
        { error: `${field || 'This field'} cannot be edited from this grid yet` },
        { status: 400 }
      )
    }

    const { data: existing, error: existingError } = await supabase
      .from('products_all_ls')
      .select('id, lightspeed_item_id')
      .eq('user_id', user.id)
      .eq('lightspeed_item_id', itemId)
      .single()

    if (existingError || !existing) {
      return NextResponse.json({ error: 'Inventory row not found' }, { status: 404 })
    }

    const lightspeedValue = toLightspeedValue(field, body.value)
    const lightspeedField = EDITABLE_FIELD_MAP[field]
    const client = createLightspeedClient(user.id)
    const updatedItem = await client.updateItem(itemId, {
      [lightspeedField]: lightspeedValue,
    })

    const cacheValue = toCacheValue(field, lightspeedValue)
    const cachePatch: Record<string, unknown> = {
      [field]: cacheValue,
      last_synced_at: new Date().toISOString(),
    }

    const { error: cacheError } = await supabase
      .from('products_all_ls')
      .update(cachePatch)
      .eq('user_id', user.id)
      .eq('lightspeed_item_id', itemId)

    if (cacheError) {
      console.error('[Inventory Grid] Cache update error:', cacheError)
    }

    const productPatch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (field === 'description') productPatch.description = cacheValue
    if (field === 'model_year') productPatch.model_year = cacheValue
    if (field === 'upc') productPatch.upc = cacheValue
    if (field === 'category_id') productPatch.lightspeed_category_id = cacheValue
    if (field === 'manufacturer_id') productPatch.manufacturer_id = cacheValue
    if (field === 'default_cost') productPatch.default_cost = cacheValue

    if (Object.keys(productPatch).length > 1) {
      const { error: productError } = await supabase
        .from('products')
        .update(productPatch)
        .eq('user_id', user.id)
        .eq('lightspeed_item_id', itemId)

      if (productError) {
        console.error('[Inventory Grid] Synced product update error:', productError)
      }
    }

    return NextResponse.json({
      success: true,
      itemId,
      field,
      value: cacheValue,
      lightspeedItem: updatedItem,
    })
  } catch (error) {
    console.error('[Inventory Grid] PATCH error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update inventory' },
      { status: 500 }
    )
  }
}
