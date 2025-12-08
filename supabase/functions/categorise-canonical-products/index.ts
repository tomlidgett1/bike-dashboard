// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { categoriseProductBatch } from '../_shared/ai-categorisation.ts'

/**
 * Categorise Canonical Products Edge Function
 * 
 * Bulk categorises canonical products using AI.
 * Can process ALL canonical products or only uncategorised ones.
 * 
 * POST /functions/v1/categorise-canonical-products
 * Body: {
 *   processAll: boolean  // true = all products, false = only uncategorised
 *   limit?: number       // optional limit for testing
 * }
 */

const BATCH_SIZE = 20; // Products per AI request
const CONCURRENT_BATCHES = 3; // How many AI requests in parallel

interface RequestBody {
  processAll?: boolean;
  limit?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ============================================================
    // Setup & Authentication
    // ============================================================
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!
    
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY not configured')
    }
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey)
    
    // Optional authentication check
    // This function uses service role key internally so it's safe to call
    // You can add stricter auth checks here if needed
    const authHeader = req.headers.get('Authorization')
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '')
      const isServiceRole = token === supabaseKey
      
      if (!isServiceRole) {
        // Try to verify as user token
        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
        
        if (user) {
          console.log(`✅ [CATEGORISE CANONICAL] Authenticated user: ${user.id}`)
        } else {
          console.log(`⚠️ [CATEGORISE CANONICAL] Invalid token, but continuing (function uses service role)`)
        }
      } else {
        console.log(`✅ [CATEGORISE CANONICAL] Authenticated with service role key`)
      }
    } else {
      console.log(`⚠️ [CATEGORISE CANONICAL] No auth header provided, but continuing (function uses service role)`)
    }
    
    // ============================================================
    // Parse Request
    // ============================================================
    
    const body: RequestBody = await req.json()
    const processAll = body.processAll ?? false
    const limit = body.limit
    
    console.log(`🚀 [CATEGORISE CANONICAL] Starting categorisation...`)
    console.log(`   - Process all: ${processAll}`)
    console.log(`   - Limit: ${limit || 'none'}`)
    
    // ============================================================
    // Fetch Canonical Products to Process
    // ============================================================
    
    let query = supabaseAdmin
      .from('canonical_products')
      .select('id, normalized_name, category, manufacturer')
      .order('created_at', { ascending: true })
    
    // Filter by categorisation status
    if (!processAll) {
      query = query.or('cleaned.is.null,cleaned.eq.false,marketplace_category.is.null')
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
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    console.log(`📊 [CATEGORISE CANONICAL] Found ${products.length} products to categorise`)
    
    // ============================================================
    // Process in Batches
    // ============================================================
    
    const batches = []
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      batches.push(products.slice(i, i + BATCH_SIZE))
    }
    
    let succeeded = 0
    let failed = 0
    const errors: string[] = []
    
    // Process batches in parallel groups
    for (let i = 0; i < batches.length; i += CONCURRENT_BATCHES) {
      const batchGroup = batches.slice(i, i + CONCURRENT_BATCHES)
      console.log(`\n🔄 [CATEGORISE CANONICAL] Processing batch group ${Math.floor(i / CONCURRENT_BATCHES) + 1}/${Math.ceil(batches.length / CONCURRENT_BATCHES)}`)
      
      const batchPromises = batchGroup.map(async (batch, idx) => {
        const batchNum = i + idx + 1
        console.log(`   📦 Batch ${batchNum}/${batches.length}: ${batch.length} products`)
        
        try {
          // Run AI categorisation
          const results = await categoriseProductBatch(
            batch.map(p => ({
              id: p.id,
              normalized_name: p.normalized_name,
              category: p.category,
              manufacturer: p.manufacturer,
            })),
            openaiApiKey
          )
          
          // Update database
          for (const result of results) {
            if (result.success) {
              const { error: updateError } = await supabaseAdmin
                .from('canonical_products')
                .update({
                  marketplace_category: result.category,
                  marketplace_subcategory: result.subcategory,
                  marketplace_level_3_category: result.level3,
                  display_name: result.displayName,
                  cleaned: true,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', result.id)
              
              if (updateError) {
                console.error(`❌ Batch ${batchNum}: Failed to update ${result.id}: ${updateError.message}`)
                failed++
                errors.push(`Update failed for ${result.id}: ${updateError.message}`)
              } else {
                succeeded++
                console.log(`   ✅ Batch ${batchNum}: "${result.displayName}" → ${result.category} > ${result.subcategory}`)
              }
            } else {
              console.error(`❌ Batch ${batchNum}: AI failed for ${result.id}: ${result.error}`)
              failed++
              errors.push(`AI failed for ${result.id}: ${result.error}`)
            }
          }
        } catch (batchError) {
          console.error(`❌ Batch ${batchNum} failed:`, batchError)
          failed += batch.length
          errors.push(`Batch ${batchNum}: ${batchError instanceof Error ? batchError.message : 'Unknown error'}`)
        }
      })
      
      await Promise.all(batchPromises)
    }
    
    // ============================================================
    // Return Results
    // ============================================================
    
    const summary = {
      message: 'Categorisation complete',
      processed: products.length,
      succeeded,
      failed,
      successRate: succeeded / products.length,
      errors: errors.slice(0, 10), // Only return first 10 errors
    }
    
    console.log(`\n✅ [CATEGORISE CANONICAL] Complete:`)
    console.log(`   - Processed: ${products.length}`)
    console.log(`   - Succeeded: ${succeeded}`)
    console.log(`   - Failed: ${failed}`)
    console.log(`   - Success rate: ${(summary.successRate * 100).toFixed(1)}%`)
    
    return new Response(
      JSON.stringify(summary),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('❌ [CATEGORISE CANONICAL] Error:', error)
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : undefined,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

