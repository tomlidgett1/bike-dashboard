/**
 * Lightspeed Manual Sync Endpoint
 * 
 * POST /api/lightspeed/sync
 * 
 * Triggers a manual sync with Lightspeed and logs the operation.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getConnection,
  createLightspeedClient,
  updateLastSyncTime,
} from '@/lib/services/lightspeed'

export async function POST() {
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

    // Get connection
    const connection = await getConnection(user.id)
    
    if (!connection || connection.status !== 'connected') {
      return NextResponse.json(
        { error: 'No active Lightspeed connection' },
        { status: 400 }
      )
    }

    // Get sync settings
    const { data: syncSettings } = await supabase
      .from('lightspeed_sync_settings')
      .select('*')
      .eq('user_id', user.id)
      .single()

    // Create sync log entry
    const { data: syncLog, error: logError } = await supabase
      .from('lightspeed_sync_logs')
      .insert({
        user_id: user.id,
        connection_id: connection.id,
        sync_type: 'manual',
        status: 'in_progress',
        entities_synced: [],
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (logError) {
      console.error('Error creating sync log:', logError)
    }

    // Perform sync
    const client = createLightspeedClient(user.id)
    const startTime = Date.now()

    try {
      const results = await client.performSync({
        products: syncSettings?.sync_products ?? true,
        orders: syncSettings?.sync_orders ?? true,
        customers: syncSettings?.sync_customers ?? false,
        inventory: syncSettings?.sync_inventory ?? true,
      })

      const duration = Date.now() - startTime
      const entitiesSynced: string[] = []
      let recordsProcessed = 0

      if (results.products) {
        entitiesSynced.push('products')
        recordsProcessed += results.products.length
      }
      if (results.sales) {
        entitiesSynced.push('orders')
        recordsProcessed += results.sales.length
      }
      if (results.customers) {
        entitiesSynced.push('customers')
        recordsProcessed += results.customers.length
      }
      if (results.shops) {
        entitiesSynced.push('shops')
        recordsProcessed += results.shops.length
      }

      // Update sync log
      if (syncLog) {
        await supabase
          .from('lightspeed_sync_logs')
          .update({
            status: 'completed',
            entities_synced: entitiesSynced,
            records_processed: recordsProcessed,
            completed_at: new Date().toISOString(),
            duration_ms: duration,
          })
          .eq('id', syncLog.id)
      }

      // Update last sync time
      await updateLastSyncTime(user.id)

      return NextResponse.json({
        success: true,
        message: 'Sync completed successfully',
        data: {
          entitiesSynced,
          recordsProcessed,
          durationMs: duration,
          products: results.products?.length || 0,
          orders: results.sales?.length || 0,
          customers: results.customers?.length || 0,
          shops: results.shops?.length || 0,
        },
      })
    } catch (syncError) {
      const duration = Date.now() - startTime
      const errorMessage = syncError instanceof Error ? syncError.message : 'Unknown sync error'

      // Update sync log with error
      if (syncLog) {
        await supabase
          .from('lightspeed_sync_logs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            duration_ms: duration,
            error_message: errorMessage,
          })
          .eq('id', syncLog.id)
      }

      throw syncError
    }
  } catch (error) {
    console.error('Error during sync:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Sync failed'
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

/**
 * Get sync history
 * 
 * GET /api/lightspeed/sync
 */
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

    // Get recent sync logs
    const { data: logs, error: logsError } = await supabase
      .from('lightspeed_sync_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(20)

    if (logsError) {
      throw logsError
    }

    return NextResponse.json({
      logs: logs || [],
    })
  } catch (error) {
    console.error('Error fetching sync history:', error)
    
    return NextResponse.json(
      { error: 'Failed to fetch sync history' },
      { status: 500 }
    )
  }
}





