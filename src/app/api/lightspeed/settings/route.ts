/**
 * Lightspeed Sync Settings Endpoint
 * 
 * GET /api/lightspeed/settings - Get sync settings
 * PUT /api/lightspeed/settings - Update sync settings
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getConnection } from '@/lib/services/lightspeed'

/**
 * Get sync settings
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorised. Please log in first.' },
        { status: 401 }
      )
    }

    const { data: settings, error } = await supabase
      .from('lightspeed_sync_settings')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error && error.code !== 'PGRST116') {
      throw error
    }

    return NextResponse.json({
      settings: settings || null,
    })
  } catch (error) {
    console.error('Error fetching sync settings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sync settings' },
      { status: 500 }
    )
  }
}

/**
 * Update sync settings
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorised. Please log in first.' },
        { status: 401 }
      )
    }

    // Get connection to ensure user has one
    const connection = await getConnection(user.id)
    
    if (!connection) {
      return NextResponse.json(
        { error: 'No Lightspeed connection found. Please connect first.' },
        { status: 400 }
      )
    }

    const body = await request.json()

    // Validate settings
    const validSettings = {
      sync_products: typeof body.sync_products === 'boolean' ? body.sync_products : undefined,
      sync_orders: typeof body.sync_orders === 'boolean' ? body.sync_orders : undefined,
      sync_customers: typeof body.sync_customers === 'boolean' ? body.sync_customers : undefined,
      sync_inventory: typeof body.sync_inventory === 'boolean' ? body.sync_inventory : undefined,
      auto_sync_enabled: typeof body.auto_sync_enabled === 'boolean' ? body.auto_sync_enabled : undefined,
      auto_sync_interval_minutes: typeof body.auto_sync_interval_minutes === 'number' 
        ? Math.max(5, Math.min(60, body.auto_sync_interval_minutes)) 
        : undefined,
      overwrite_local_changes: typeof body.overwrite_local_changes === 'boolean' ? body.overwrite_local_changes : undefined,
    }

    // Filter out undefined values
    const updateData = Object.fromEntries(
      Object.entries(validSettings).filter(([, value]) => value !== undefined)
    )

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid settings provided' },
        { status: 400 }
      )
    }

    // Upsert settings
    const { data: settings, error } = await supabase
      .from('lightspeed_sync_settings')
      .upsert({
        user_id: user.id,
        connection_id: connection.id,
        ...updateData,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      settings,
    })
  } catch (error) {
    console.error('Error updating sync settings:', error)
    return NextResponse.json(
      { error: 'Failed to update sync settings' },
      { status: 500 }
    )
  }
}











