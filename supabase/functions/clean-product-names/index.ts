// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// ============================================================
// AI-Powered Product Name Cleaning
// ============================================================
// Uses GPT-4o-mini to transform raw Lightspeed descriptions 
// into clean, e-commerce-friendly display names
// ============================================================

interface Product {
  id: string;
  description: string;
  category_name?: string | null;
  manufacturer_name?: string | null;
}

interface CleaningResult {
  productId: string;
  originalName: string;
  cleanedName: string;
  category?: string;
  subcategory?: string;
  level3Category?: string | null;
  success: boolean;
  error?: string;
}

// Category taxonomy for AI classification
const CATEGORY_TAXONOMY = [
  { level1: "Bicycles", level2: "Road", level3: null },
  { level1: "Bicycles", level2: "Gravel", level3: null },
  { level1: "Bicycles", level2: "Mountain", level3: "XC" },
  { level1: "Bicycles", level2: "Mountain", level3: "Trail" },
  { level1: "Bicycles", level2: "Mountain", level3: "Enduro" },
  { level1: "Bicycles", level2: "Mountain", level3: "Downhill" },
  { level1: "Bicycles", level2: "Hybrid / Fitness", level3: null },
  { level1: "Bicycles", level2: "Commuter / City", level3: null },
  { level1: "Bicycles", level2: "Folding", level3: null },
  { level1: "Bicycles", level2: "Cargo", level3: null },
  { level1: "Bicycles", level2: "Touring", level3: null },
  { level1: "Bicycles", level2: "Track / Fixie", level3: null },
  { level1: "Bicycles", level2: "Cyclocross", level3: null },
  { level1: "Bicycles", level2: "Time Trial / Triathlon", level3: null },
  { level1: "Bicycles", level2: "BMX", level3: "Race" },
  { level1: "Bicycles", level2: "BMX", level3: "Freestyle" },
  { level1: "Bicycles", level2: "Kids", level3: "Balance" },
  { level1: "Bicycles", level2: "Kids", level3: "12–16 inch" },
  { level1: "Bicycles", level2: "Kids", level3: "20–24 inch" },
  { level1: "E-Bikes", level2: "E-Road", level3: null },
  { level1: "E-Bikes", level2: "E-Gravel", level3: null },
  { level1: "E-Bikes", level2: "E-MTB", level3: "Hardtail" },
  { level1: "E-Bikes", level2: "E-MTB", level3: "Full Suspension" },
  { level1: "E-Bikes", level2: "E-Commuter / City", level3: null },
  { level1: "E-Bikes", level2: "E-Hybrid", level3: null },
  { level1: "E-Bikes", level2: "E-Cargo", level3: null },
  { level1: "E-Bikes", level2: "E-Folding", level3: null },
  { level1: "Frames & Framesets", level2: "Road Frameset", level3: null },
  { level1: "Frames & Framesets", level2: "Gravel Frameset", level3: null },
  { level1: "Frames & Framesets", level2: "MTB Hardtail Frame", level3: null },
  { level1: "Frames & Framesets", level2: "MTB Full Suspension Frame", level3: null },
  { level1: "Frames & Framesets", level2: "E-Bike Frame", level3: null },
  { level1: "Frames & Framesets", level2: "Other Frames", level3: null },
  { level1: "Wheels & Tyres", level2: "Road Wheelsets", level3: null },
  { level1: "Wheels & Tyres", level2: "Gravel Wheelsets", level3: null },
  { level1: "Wheels & Tyres", level2: "MTB Wheelsets", level3: null },
  { level1: "Wheels & Tyres", level2: "Tyres", level3: "Road" },
  { level1: "Wheels & Tyres", level2: "Tyres", level3: "Gravel / CX" },
  { level1: "Wheels & Tyres", level2: "Tyres", level3: "MTB" },
  { level1: "Wheels & Tyres", level2: "Tubes", level3: null },
  { level1: "Wheels & Tyres", level2: "Tubeless", level3: "Sealant / Valves / Tape" },
  { level1: "Drivetrain", level2: "Groupsets", level3: null },
  { level1: "Drivetrain", level2: "Cranksets", level3: null },
  { level1: "Drivetrain", level2: "Cassettes", level3: null },
  { level1: "Drivetrain", level2: "Derailleurs", level3: "Front" },
  { level1: "Drivetrain", level2: "Derailleurs", level3: "Rear" },
  { level1: "Drivetrain", level2: "Chains", level3: null },
  { level1: "Drivetrain", level2: "Bottom Brackets", level3: null },
  { level1: "Drivetrain", level2: "Power Meters", level3: null },
  { level1: "Brakes", level2: "Disc Brakes", level3: "Complete Sets" },
  { level1: "Brakes", level2: "Disc Brakes", level3: "Calipers" },
  { level1: "Brakes", level2: "Disc Brakes", level3: "Rotors" },
  { level1: "Brakes", level2: "Brake Pads", level3: null },
  { level1: "Brakes", level2: "Levers", level3: null },
  { level1: "Cockpit", level2: "Handlebars", level3: "Road" },
  { level1: "Cockpit", level2: "Handlebars", level3: "MTB / DH" },
  { level1: "Cockpit", level2: "Handlebars", level3: "Gravel / Flared" },
  { level1: "Cockpit", level2: "Stems", level3: null },
  { level1: "Cockpit", level2: "Headsets", level3: null },
  { level1: "Cockpit", level2: "Bar Tape & Grips", level3: null },
  { level1: "Seat & Seatposts", level2: "Saddles", level3: null },
  { level1: "Seat & Seatposts", level2: "Seatposts", level3: null },
  { level1: "Seat & Seatposts", level2: "Dropper Posts", level3: null },
  { level1: "Pedals", level2: "Clipless Pedals", level3: null },
  { level1: "Pedals", level2: "Flat Pedals", level3: null },
  { level1: "Pedals", level2: "Pedal Accessories", level3: null },
  { level1: "Accessories", level2: "Helmets", level3: null },
  { level1: "Accessories", level2: "Lights", level3: "Front" },
  { level1: "Accessories", level2: "Lights", level3: "Rear" },
  { level1: "Accessories", level2: "Lights", level3: "Sets" },
  { level1: "Accessories", level2: "Pumps", level3: "Floor" },
  { level1: "Accessories", level2: "Pumps", level3: "Mini / Hand" },
  { level1: "Accessories", level2: "Locks", level3: null },
  { level1: "Accessories", level2: "Bags", level3: "On-Bike" },
  { level1: "Accessories", level2: "Bags", level3: "Off-Bike" },
  { level1: "Accessories", level2: "Racks & Panniers", level3: null },
  { level1: "Accessories", level2: "Mudguards / Fenders", level3: null },
  { level1: "Accessories", level2: "Bottles & Cages", level3: null },
  { level1: "Accessories", level2: "Child Seats & Trailers", level3: null },
  { level1: "Accessories", level2: "Car Racks", level3: null },
  { level1: "Apparel", level2: "Jerseys", level3: null },
  { level1: "Apparel", level2: "Shorts & Bibs", level3: null },
  { level1: "Apparel", level2: "Jackets & Gilets", level3: null },
  { level1: "Apparel", level2: "Gloves", level3: null },
  { level1: "Apparel", level2: "Shoes", level3: "Road" },
  { level1: "Apparel", level2: "Shoes", level3: "MTB / Gravel" },
  { level1: "Apparel", level2: "Casual Clothing", level3: null },
  { level1: "Protection", level2: "Knee & Elbow Pads", level3: null },
  { level1: "Protection", level2: "Body Armor", level3: null },
  { level1: "Maintenance & Workshop", level2: "Tools", level3: null },
  { level1: "Maintenance & Workshop", level2: "Cleaning", level3: null },
  { level1: "Maintenance & Workshop", level2: "Lubricants & Grease", level3: null },
  { level1: "Maintenance & Workshop", level2: "Repair Kits", level3: null },
  { level1: "Maintenance & Workshop", level2: "Workstands", level3: null },
  { level1: "Tech & Electronics", level2: "Bike Computers", level3: null },
  { level1: "Tech & Electronics", level2: "Smart Trainers", level3: null },
  { level1: "Tech & Electronics", level2: "Heart Rate Monitors", level3: null },
  { level1: "Tech & Electronics", level2: "Cameras", level3: null },
  { level1: "Tech & Electronics", level2: "E-Bike Batteries & Chargers", level3: null },
  { level1: "Nutrition", level2: "Energy Gels & Chews", level3: null },
  { level1: "Nutrition", level2: "Bars", level3: null },
  { level1: "Nutrition", level2: "Drink Mixes & Electrolytes", level3: null },
  { level1: "Shop Services", level2: "Bike Service", level3: "Basic / Bronze" },
  { level1: "Shop Services", level2: "Bike Service", level3: "Intermediate / Silver" },
  { level1: "Shop Services", level2: "Bike Service", level3: "Premium / Gold" },
  { level1: "Shop Services", level2: "Bike Fitting", level3: null },
  { level1: "Shop Services", level2: "Suspension Service", level3: null },
  { level1: "Marketplace Specials", level2: "Verified Bikes", level3: null },
  { level1: "Marketplace Specials", level2: "Certified Pre-Owned", level3: null },
  { level1: "Marketplace Specials", level2: "Clearance", level3: null }
]

console.log('Function "clean-product-names" running!')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
  
  const authHeader = req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing authorization' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured in Supabase secrets')
    }

    // Parse request body for options
    const { userId, batchSize = 75, limit = 500, concurrentBatches = 4 } = await req.json().catch(() => ({}))

    console.log(`🧹 [CLEAN] Starting product name cleaning job`)
    console.log(`📊 [CLEAN] Batch size: ${batchSize}, Concurrent batches: ${concurrentBatches}, Total limit: ${limit}`)

    // Fetch uncleaned products
    let query = supabaseAdmin
      .from('products')
      .select('id, description, category_name, manufacturer_name')
      .eq('cleaned', false)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(limit)

    // Filter by user if specified
    if (userId) {
      query = query.eq('user_id', userId)
    }

    const { data: products, error: fetchError } = await query

    if (fetchError) {
      throw new Error(`Failed to fetch products: ${fetchError.message}`)
    }

    if (!products || products.length === 0) {
      console.log(`✅ [CLEAN] No uncleaned products found`)
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No products to clean',
          stats: {
            total: 0,
            cleaned: 0,
            failed: 0,
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`📦 [CLEAN] Found ${products.length} products to clean`)

    const results: CleaningResult[] = []
    let successCount = 0
    let failCount = 0

    // Split products into batches
    const batches: Product[][] = []
    for (let i = 0; i < products.length; i += batchSize) {
      batches.push(products.slice(i, i + batchSize))
    }

    // Process batches in parallel chunks
    for (let i = 0; i < batches.length; i += concurrentBatches) {
      const batchGroup = batches.slice(i, i + concurrentBatches)
      console.log(`\n🔄 [CLEAN] Processing batch group ${Math.floor(i / concurrentBatches) + 1}/${Math.ceil(batches.length / concurrentBatches)} (${batchGroup.length} batches in parallel)`)

      // Process multiple batches concurrently
      const batchPromises = batchGroup.map(async (batch, idx) => {
        const batchNum = i + idx + 1
        console.log(`   📦 Batch ${batchNum}/${batches.length}: ${batch.length} products`)
        
        try {
          // Clean the batch with OpenAI
          const cleanedBatch = await cleanProductNamesBatch(batch, OPENAI_API_KEY)

          // Update database
          const batchResults: CleaningResult[] = []
          for (const result of cleanedBatch) {
            if (result.success) {
              const updateData: any = {
                display_name: result.cleanedName,
                cleaned: true,
                updated_at: new Date().toISOString(),
              }
              
              // Add categories if provided
              if (result.category) updateData.marketplace_category = result.category
              if (result.subcategory) updateData.marketplace_subcategory = result.subcategory
              if (result.level3Category !== undefined) updateData.marketplace_level_3_category = result.level3Category
              
              const { error: updateError } = await supabaseAdmin
                .from('products')
                .update(updateData)
                .eq('id', result.productId)

              if (updateError) {
                console.error(`❌ [CLEAN] Failed to update product ${result.productId}:`, updateError)
                result.success = false
                result.error = updateError.message
              } else {
                const catInfo = result.category 
                  ? ` | ${result.category} > ${result.subcategory}${result.level3Category ? ` > ${result.level3Category}` : ''}`
                  : ''
                console.log(`   ✅ Batch ${batchNum}: "${result.originalName}" → "${result.cleanedName}"${catInfo}`)
              }
            }
            batchResults.push(result)
          }

          return batchResults
        } catch (batchError) {
          console.error(`❌ [CLEAN] Batch ${batchNum} failed:`, batchError)
          
          // Mark all in batch as failed
          return batch.map(product => ({
            productId: product.id,
            originalName: product.description,
            cleanedName: '',
            success: false,
            error: batchError instanceof Error ? batchError.message : 'Unknown error',
          }))
        }
      })

      // Wait for all batches in this group to complete
      const groupResults = await Promise.all(batchPromises)
      
      // Flatten and count results
      for (const batchResults of groupResults) {
        for (const result of batchResults) {
          if (result.success && !result.error) {
            successCount++
          } else {
            failCount++
          }
          results.push(result)
        }
      }

      console.log(`   ✅ Batch group complete: ${successCount} cleaned, ${failCount} failed`)
    }

    console.log(`\n📊 [CLEAN] Completed!`)
    console.log(`   ✅ Cleaned: ${successCount}`)
    console.log(`   ❌ Failed: ${failCount}`)
    console.log(`   📦 Total processed: ${products.length}`)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Cleaned ${successCount} product names`,
        stats: {
          total: products.length,
          cleaned: successCount,
          failed: failCount,
        },
        results: results.slice(0, 50), // Return first 50 for inspection
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('❌ [CLEAN] Error:', error)
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * Clean a batch of product names using GPT-4o-mini
 */
async function cleanProductNamesBatch(
  products: Product[],
  apiKey: string
): Promise<CleaningResult[]> {
  const prompt = `You are an e-commerce product expert for a cycling marketplace. Your tasks:
1. Clean and format product names for customer display
2. Categorise products into our 3-level taxonomy

NAMING RULES:
1. Use proper capitalisation (first letter of each significant word capitalised)
2. Remove internal codes, SKU numbers, or excessive technical jargon
3. Fix abbreviations (e.g., "MTB" → "Mountain Bike", "RD" → "Rear Derailleur")
4. Remove excessive punctuation
5. Keep brand names, model numbers, and key specifications
6. Make it customer-friendly but accurate
7. Keep it concise (under 80 characters if possible)
8. Preserve Australian spelling (e.g., "colour" not "color")

CATEGORISATION:
Assign each product to the BEST matching category from this taxonomy (level1 > level2 > level3):

${JSON.stringify(CATEGORY_TAXONOMY, null, 2)}

IMPORTANT:
- level3 can be null if the category has no third level
- Choose the MOST SPECIFIC category that fits
- For complete bikes, use "Bicycles" or "E-Bikes" level1
- For components/parts, use appropriate component categories
- For apparel, use "Apparel" level1

Examples:
Input: "trek fuel ex 98 xt 29 mtb"
Output: {
  "displayName": "Trek Fuel EX 9.8 XT 29\\" Mountain Bike",
  "category": "Bicycles",
  "subcategory": "Mountain",
  "level3": "Trail"
}

Input: "SHIMANO DEORE XT M8100 12-SPD RD"
Output: {
  "displayName": "Shimano Deore XT M8100 12-Speed Rear Derailleur",
  "category": "Drivetrain",
  "subcategory": "Derailleurs",
  "level3": "Rear"
}

Input: "specialized s-works carbon helmet blk/red size L"
Output: {
  "displayName": "Specialized S-Works Carbon Helmet Black/Red - Large",
  "category": "Accessories",
  "subcategory": "Helmets",
  "level3": null
}

Products to process:
${JSON.stringify(products.map(p => ({
  id: p.id,
  name: p.description,
  category: p.category_name,
  manufacturer: p.manufacturer_name,
})), null, 2)}

Return ONLY valid JSON (no markdown, no code blocks):
{
  "cleaned": [
    {
      "id": "product-uuid",
      "displayName": "Cleaned Product Name",
      "category": "Level1Category",
      "subcategory": "Level2Category",
      "level3": "Level3Category or null"
    }
  ]
}

CRITICAL: Return ONLY the JSON object, no other text.`

  try {
    console.log(`🤖 [GPT-4o-mini] Sending ${products.length} products for cleaning...`)
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { 
            role: 'system', 
            content: 'You are an expert at formatting product names and categorising cycling products for e-commerce. You return ONLY valid JSON, no markdown.' 
          },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 12000,
        temperature: 0.3,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ [GPT-4o-mini] API error: ${response.status} - ${errorText}`)
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    const data = await response.json()
    
    if (!data || !data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid OpenAI API response structure')
    }

    console.log(`✅ [GPT-4o-mini] Received response (${data.usage?.total_tokens || '?'} tokens)`)

    const content = data.choices[0].message.content
    const parsed = JSON.parse(content)

    // Map results back to products
    const results: CleaningResult[] = []
    
    for (const product of products) {
      const cleaned = parsed.cleaned?.find((c: any) => c.id === product.id)
      
      if (cleaned && cleaned.displayName) {
        results.push({
          productId: product.id,
          originalName: product.description,
          cleanedName: cleaned.displayName,
          category: cleaned.category || undefined,
          subcategory: cleaned.subcategory || undefined,
          level3Category: cleaned.level3 !== undefined ? cleaned.level3 : undefined,
          success: true,
        })
      } else {
        // Fallback: basic cleaning (no categorisation)
        results.push({
          productId: product.id,
          originalName: product.description,
          cleanedName: basicCleanProductName(product.description),
          success: true,
          error: 'Used fallback cleaning',
        })
      }
    }

    return results
  } catch (error) {
    console.error(`❌ [GPT-4o-mini] Error:`, error)
    
    // Fallback: use basic cleaning for all
    return products.map(product => ({
      productId: product.id,
      originalName: product.description,
      cleanedName: basicCleanProductName(product.description),
      success: true,
      error: 'Used fallback cleaning due to API error',
    }))
  }
}

/**
 * Basic fallback cleaning (no AI)
 */
function basicCleanProductName(name: string): string {
  return name
    .trim()
    .split(' ')
    .map(word => {
      // Keep acronyms in uppercase
      if (word.match(/^[A-Z]{2,}$/)) {
        return word
      }
      // Capitalise first letter, lowercase rest
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .substring(0, 120) // Max 120 chars
}

