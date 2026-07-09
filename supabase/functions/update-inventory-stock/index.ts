// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

/**
 * Marketplace SOH reconciliation.
 *
 * Source of truth: lightspeed_inventory (kept fresh by the inventory mirror cron).
 * Writes: products.qoh / sellable / is_active, plus products_all_ls totals.
 *
 * Matching is always by lightspeed_item_id — never SKU or title.
 *
 * Implementation: SQL function reconcile_marketplace_soh_from_mirror so the full
 * backlog can finish inside the edge-function wall clock (row-by-row PostgREST
 * updates timed out on ~800 drifted products).
 */

interface ReconcileResultRow {
  user_id: string
  products_updated: number
  delisted: number
  relisted: number
  cache_updated: number
}

console.log('Function "update-inventory-stock" up and running!')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    console.log('🔄 Starting marketplace SOH reconciliation from lightspeed_inventory...')

    // Cap per run keeps each invocation well under the edge timeout while still
    // clearing the current backlog in one or two cron ticks.
    const { data, error } = await supabaseAdmin.rpc(
      'reconcile_marketplace_soh_from_mirror',
      {
        p_user_id: null,
        p_limit: 5000,
      },
    )

    if (error) {
      throw new Error(`reconcile_marketplace_soh_from_mirror failed: ${error.message}`)
    }

    const rows = (data ?? []) as ReconcileResultRow[]
    const productsUpdated = rows.reduce(
      (sum, row) => sum + (Number(row.products_updated) || 0),
      0,
    )
    const delisted = rows.reduce((sum, row) => sum + (Number(row.delisted) || 0), 0)
    const relisted = rows.reduce((sum, row) => sum + (Number(row.relisted) || 0), 0)
    const cacheUpdated = rows.reduce(
      (sum, row) => sum + (Number(row.cache_updated) || 0),
      0,
    )

    for (const row of rows) {
      console.log(
        `✅ User ${row.user_id}: updated=${row.products_updated}, ` +
          `delisted=${row.delisted}, relisted=${row.relisted}, cache=${row.cache_updated}`,
      )
    }

    console.log(
      `\n✅ Marketplace SOH reconcile complete: ${productsUpdated} products updated ` +
        `(delisted=${delisted}, relisted=${relisted}) across ${rows.length} users`,
    )

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Marketplace SOH reconcile complete',
        reconcileSource: 'lightspeed_inventory',
        matchKey: 'lightspeed_item_id',
        connectionsProcessed: rows.length,
        productsUpdated,
        delisted,
        relisted,
        cacheUpdated,
        users: rows,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('❌ Update error:', error)

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Update failed',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
