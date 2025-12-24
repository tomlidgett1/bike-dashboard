// ============================================================
// Generate Product Descriptions Edge Function
// ============================================================
// Processes the description_generation_queue and generates detailed
// product specifications using OpenAI Responses API with web search.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QueueItem {
  id: string;
  canonical_product_id: string;
  status: string;
  retry_count: number;
}

interface CanonicalProduct {
  id: string;
  normalized_name: string;
  upc: string | null;
  manufacturer: string | null;
  category: string | null;
  marketplace_category: string | null;
  display_name: string | null;
}

interface DescriptionResult {
  description: string;
  bike_surface: string;
  sources: string[];
}

const VALID_BIKE_SURFACES = [
  'Road Bike',
  'Mountain Bike',
  'Kids Bike',
  'Triathlon',
  'Time Trial',
  'City/Commuter',
  'Electric Bike',
  'Gravel/CX',
  'BMX',
  'All',
];

/**
 * Generate product description using OpenAI Responses API with web search
 */
async function generateProductDescription(
  product: CanonicalProduct
): Promise<DescriptionResult> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const productName = product.display_name || product.normalized_name;
  const brand = product.manufacturer || 'Unknown brand';
  const category = product.marketplace_category || product.category || 'bicycle product';
  const upc = product.upc && !product.upc.startsWith('TEMP-') ? product.upc : null;

  console.log(`🔍 [DESC GEN] Generating description for: "${productName}"`);
  console.log(`   Brand: ${brand}, Category: ${category}, UPC: ${upc || 'N/A'}`);

  const inputPrompt = `Search the web for product specifications for this cycling/bicycle product:

Product: "${productName}"
Brand: ${brand}
Category: ${category}
${upc ? `UPC: ${upc}` : ''}

CRITICAL: This is a CYCLING/BICYCLE product (NOT motorcycle/motorbike).

PRIORITISE these authoritative cycling sources:
- Official brand websites (shimano.com, sram.com, giant-bicycles.com, specialized.com, trek.com, etc.)
- Australian cycling retailers (99bikes.com.au, pushys.com.au, bicyclesonline.com.au, bikeexchange.com.au)
- International cycling retailers (chainreactioncycles.com, wiggle.com, bike-discount.de, rei.com)
- Cycling review sites (bikeradar.com, cyclingtips.com, road.cc)

TASK 1 - DESCRIPTION:
Write a CONCISE product description (MAX 150 words, 2-3 sentences) covering:
- What the product is and its main purpose
- Key features or specifications (materials, sizes, compatibility)
- Any standout benefits

TASK 2 - BIKE SURFACE:
Determine which type of bike this product is designed for. Choose ONE from:
- "Road Bike" - road cycling, racing, endurance
- "Mountain Bike" - MTB, trail, downhill, XC
- "Kids Bike" - children's bikes and accessories
- "Triathlon" - tri-specific gear
- "Time Trial" - TT bikes and aero equipment
- "City/Commuter" - urban, hybrid, commuting
- "Electric Bike" - e-bike specific components
- "Gravel/CX" - gravel and cyclocross
- "BMX" - BMX bikes and parts
- "All" - universal accessories that work on any bike (tools, lights, bottles, general clothing, etc.)

Be factual and professional. Write in third person. DO NOT exceed 150 words for description.

Return JSON only (no markdown):
{
  "description": "Concise 2-3 sentence description here...",
  "bike_surface": "Road Bike",
  "sources": ["source1.com", "source2.com"]
}`;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1',
        input: inputPrompt,
        tools: [{ 
          type: 'web_search_preview',
          search_context_size: 'high',
          user_location: { type: 'approximate', country: 'AU' }
        }],
        tool_choice: 'auto',
        temperature: 0.3,
        store: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [DESC GEN] OpenAI API error: ${response.status} - ${errorText}`);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data) {
      throw new Error('OpenAI returned empty response');
    }

    console.log(`✅ [DESC GEN] Response received (${data.usage?.total_tokens || '?'} tokens)`);

    // Extract output text
    let outputText = '';
    if (data.output && Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item && item.type === 'web_search_call') {
          console.log(`🔍 [DESC GEN] Web search executed: ${item.status || 'unknown'}`);
        }
        if (item && item.type === 'message' && item.content && Array.isArray(item.content)) {
          for (const content of item.content) {
            if (content && content.type === 'output_text' && content.text) {
              outputText = content.text;
            }
          }
        }
      }
    }

    if (!outputText) {
      throw new Error('No output text found in OpenAI response');
    }

    // Parse JSON from response
    const jsonMatch = outputText.match(/```(?:json)?\s*([\s\S]*?)```/) || outputText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // If no JSON found, use the raw text as description
      console.log(`⚠️ [DESC GEN] No JSON found, using raw text`);
      return {
        description: outputText.trim(),
        bike_surface: 'All',
        sources: [],
      };
    }

    const parsed = JSON.parse(jsonMatch[jsonMatch.length === 2 ? 1 : 0]);
    
    const description = parsed.description || outputText.trim();
    const sources = Array.isArray(parsed.sources) ? parsed.sources : [];
    
    // Validate and extract bike_surface
    let bike_surface = parsed.bike_surface || 'All';
    if (!VALID_BIKE_SURFACES.includes(bike_surface)) {
      console.log(`⚠️ [DESC GEN] Invalid bike_surface "${bike_surface}", defaulting to "All"`);
      bike_surface = 'All';
    }

    console.log(`✅ [DESC GEN] Generated description (${description.length} chars), bike_surface: ${bike_surface}, from ${sources.length} sources`);

    return { description, bike_surface, sources };
  } catch (error) {
    console.error(`❌ [DESC GEN] Error:`, error);
    throw error;
  }
}

/**
 * Process a single queue item
 */
async function processQueueItem(
  supabase: any,
  queueItem: QueueItem
): Promise<{ success: boolean; error?: string }> {
  const { id, canonical_product_id, retry_count } = queueItem;

  console.log(`📝 [QUEUE] Processing item ${id} for canonical product ${canonical_product_id}`);

  try {
    // Mark as processing
    await supabase
      .from('description_generation_queue')
      .update({
        status: 'processing',
        processing_started_at: new Date().toISOString(),
      })
      .eq('id', id);

    // Fetch canonical product details
    const { data: product, error: productError } = await supabase
      .from('canonical_products')
      .select('id, normalized_name, upc, manufacturer, category, marketplace_category, display_name')
      .eq('id', canonical_product_id)
      .single();

    if (productError || !product) {
      throw new Error(`Failed to fetch canonical product: ${productError?.message || 'Not found'}`);
    }

    // Generate description
    const result = await generateProductDescription(product);

    // Update canonical product with description and bike_surface
    const { error: updateError } = await supabase
      .from('canonical_products')
      .update({
        product_description: result.description,
        bike_surface: result.bike_surface,
        description_generated_at: new Date().toISOString(),
      })
      .eq('id', canonical_product_id);

    if (updateError) {
      throw new Error(`Failed to update canonical product: ${updateError.message}`);
    }

    // Mark queue item as completed
    await supabase
      .from('description_generation_queue')
      .update({
        status: 'completed',
        processed_at: new Date().toISOString(),
      })
      .eq('id', id);

    console.log(`✅ [QUEUE] Successfully processed item ${id}`);

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ [QUEUE] Failed to process item ${id}:`, errorMessage);

    // Update queue item with error
    const newRetryCount = retry_count + 1;
    const newStatus = newRetryCount >= 3 ? 'failed' : 'pending';

    await supabase
      .from('description_generation_queue')
      .update({
        status: newStatus,
        error_message: errorMessage,
        retry_count: newRetryCount,
        processing_started_at: null,
      })
      .eq('id', id);

    return { success: false, error: errorMessage };
  }
}

/**
 * Main handler
 */
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role for queue processing
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    let limit = 5; // Default batch size
    let processAll = false;

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        limit = body.limit || 5;
        processAll = body.processAll || false;
      } catch {
        // Ignore JSON parse errors, use defaults
      }
    }

    console.log(`🚀 [DESC GEN] Starting queue processing (limit: ${limit}, processAll: ${processAll})`);

    // Reset stuck processing items (older than 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await supabase
      .from('description_generation_queue')
      .update({
        status: 'pending',
        processing_started_at: null,
      })
      .eq('status', 'processing')
      .lt('processing_started_at', tenMinutesAgo);

    // Fetch pending queue items
    const { data: queueItems, error: queueError } = await supabase
      .from('description_generation_queue')
      .select('id, canonical_product_id, status, retry_count')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(limit);

    if (queueError) {
      throw new Error(`Failed to fetch queue items: ${queueError.message}`);
    }

    if (!queueItems || queueItems.length === 0) {
      console.log(`📭 [DESC GEN] No pending items in queue`);
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No pending items in queue',
          processed: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 [DESC GEN] Found ${queueItems.length} pending items`);

    // Process items sequentially to avoid rate limits
    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const item of queueItems) {
      const result = await processQueueItem(supabase, item);
      results.push({ id: item.id, ...result });

      // Add small delay between items to avoid rate limits
      if (queueItems.indexOf(item) < queueItems.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`✅ [DESC GEN] Processing complete: ${successCount} success, ${failCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        successful: successCount,
        failed: failCount,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ [DESC GEN] Fatal error:`, errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

