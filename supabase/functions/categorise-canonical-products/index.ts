// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { batchCategoriseCanonicals } from '../_shared/canonical-service.ts'

/**
 * Categorise Canonical Products Edge Function
 *
 * Bulk categorises canonical products using deterministic rules then AI.
 *
 * POST /functions/v1/categorise-canonical-products
 * Body: {
 *   processAll: boolean  // true = all products, false = only uncategorised
 *   limit?: number       // optional limit for testing
 * }
 */

const BATCH_SIZE = 20

interface RequestBody {
  processAll?: boolean
  limit?: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!

    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY not configured')
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const token = authHeader.slice('Bearer '.length).trim()
    let authorised = token === supabaseKey
    if (!authorised) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1] || '')) as {
          role?: string
          ref?: string
        }
        authorised = payload.role === 'service_role'
      } catch {
        authorised = false
      }
    }
    if (!authorised) {
      const { data: { user } } = await supabaseAdmin.auth.getUser(token)
      if (!user) {
        return new Response(
          JSON.stringify({ error: 'Invalid authentication token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    const body: RequestBody = await req.json()
    const processAll = body.processAll ?? false
    const limit = body.limit

    console.log(`🚀 [CATEGORISE CANONICAL] Starting categorisation...`)
    console.log(`   - Process all: ${processAll}`)
    console.log(`   - Limit: ${limit || 'none'}`)

    let query = supabaseAdmin
      .from('canonical_products')
      .select('id')
      .order('created_at', { ascending: true })

    if (!processAll) {
      // Only fresh pending rows. needs_review stays held for manual/admin retry.
      query = query.eq('categorisation_status', 'pending')
    }

    if (limit) {
      query = query.limit(limit)
    }

    const { data: products, error: fetchError } = await query

    if (fetchError) {
      throw new Error(`Failed to fetch canonical products: ${fetchError.message}`)
    }

    if (!products || products.length === 0) {
      return new Response(
        JSON.stringify({
          message: 'No canonical products to process',
          processed: 0,
          succeeded: 0,
          failed: 0,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    console.log(`📊 [CATEGORISE CANONICAL] Found ${products.length} products to categorise`)

    const { success: succeeded, failed } = await batchCategoriseCanonicals(
      supabaseAdmin,
      products.map((product) => product.id),
      openaiApiKey,
      BATCH_SIZE,
    )

    const summary = {
      message: 'Categorisation complete',
      processed: products.length,
      succeeded,
      failed,
      successRate: products.length > 0 ? succeeded / products.length : 0,
    }

    console.log(`\n✅ [CATEGORISE CANONICAL] Complete:`)
    console.log(`   - Processed: ${products.length}`)
    console.log(`   - Succeeded: ${succeeded}`)
    console.log(`   - Failed: ${failed}`)
    console.log(`   - Success rate: ${(summary.successRate * 100).toFixed(1)}%`)

    return new Response(
      JSON.stringify(summary),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('❌ [CATEGORISE CANONICAL] Error:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : undefined,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
