/**
 * POST /api/lightspeed/backfill-manufacturer-names
 *
 * Fetches all manufacturers and categories from Lightspeed and updates existing
 * products that have manufacturer_id/lightspeed_category_id but are missing
 * manufacturer_name or category_name.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLightspeedClient } from '@/lib/services/lightspeed'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const client = createLightspeedClient(user.id)

    // Fetch manufacturers and categories from Lightspeed in parallel
    const [manufacturers, categories] = await Promise.all([
      client.getAllManufacturers(),
      client.getAllCategories({ archived: 'false' }),
    ])

    const manufacturerMap = new Map<string, string>()
    manufacturers.forEach((m) => {
      if (m.manufacturerID && m.name) manufacturerMap.set(String(m.manufacturerID), m.name)
    })

    const categoryMap = new Map<string, { name: string; fullPath: string }>()
    categories.forEach((c) => {
      categoryMap.set(String(c.categoryID), { name: c.name, fullPath: c.fullPathName })
    })

    console.log(`[Backfill] ${manufacturerMap.size} manufacturers, ${categoryMap.size} categories`)

    // Fetch all products with missing manufacturer_name or category_name
    const { data: products, error: fetchError } = await supabase
      .from('products')
      .select('id, manufacturer_id, manufacturer_name, lightspeed_category_id, category_name')
      .eq('user_id', user.id)

    if (fetchError) throw fetchError
    if (!products || products.length === 0) {
      return NextResponse.json({ success: true, updated: 0 })
    }

    // Build update batches — group products that need the same update
    type Update = { manufacturer_name?: string; category_name?: string; full_category_path?: string }
    const updatesById = new Map<string, Update>()

    for (const product of products) {
      const update: Update = {}

      if (product.manufacturer_id && !product.manufacturer_name) {
        const name = manufacturerMap.get(String(product.manufacturer_id))
        if (name) update.manufacturer_name = name
      }

      if (product.lightspeed_category_id && !product.category_name) {
        const cat = categoryMap.get(String(product.lightspeed_category_id))
        if (cat) {
          update.category_name = cat.name
          update.full_category_path = cat.fullPath
        }
      }

      if (Object.keys(update).length > 0) {
        updatesById.set(product.id, update)
      }
    }

    if (updatesById.size === 0) {
      return NextResponse.json({ success: true, updated: 0, message: 'All products already have brand and category' })
    }

    // Execute updates in batches grouped by identical update payloads
    // (avoids N individual updates — groups products with same manufacturer together)
    let updated = 0
    const batchSize = 500

    // Group product IDs by serialized update payload
    const payloadGroups = new Map<string, string[]>()
    for (const [id, update] of updatesById) {
      const key = JSON.stringify(update)
      if (!payloadGroups.has(key)) payloadGroups.set(key, [])
      payloadGroups.get(key)!.push(id)
    }

    for (const [key, ids] of payloadGroups) {
      const update = JSON.parse(key) as Update
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize)
        const { error: updateError } = await supabase
          .from('products')
          .update(update)
          .eq('user_id', user.id)
          .in('id', batch)

        if (updateError) {
          console.error(`[Backfill] Update error:`, updateError)
        } else {
          updated += batch.length
        }
      }
    }

    console.log(`[Backfill] Updated ${updated} products`)

    return NextResponse.json({
      success: true,
      updated,
      manufacturersFound: manufacturerMap.size,
      categoriesFound: categoryMap.size,
      productsChecked: products.length,
    })
  } catch (error) {
    console.error('[Backfill] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Backfill failed' },
      { status: 500 }
    )
  }
}
