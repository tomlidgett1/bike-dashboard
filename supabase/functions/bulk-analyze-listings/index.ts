// ============================================================
// Bulk Listing Analysis - Supabase Edge Function
// Analyses multiple products in parallel using OpenAI
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MAX_CONCURRENT_ANALYSIS = 5;

// ============================================================
// CORS Headers
// ============================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================
// Types
// ============================================================

interface ProductGroup {
  groupId: string;
  imageUrls: string[];
  suggestedName?: string;
}

interface AnalysisResult {
  groupId: string;
  success: boolean;
  data?: any;
  error?: string;
}

// ============================================================
// System Prompt (reused from analyze-listing-ai)
// ============================================================

const SYSTEM_PROMPT = `You are an experienced cyclist selling your own gear on a marketplace. Write descriptions that sound natural and personal - like you're chatting with another cyclist about your bike.

WRITING STYLE FOR DESCRIPTIONS:
- Sound like a real person, not AI or a product catalogue
- Be casual and conversational
- Use natural phrasing: "It's in great condition", "Shifts perfectly", "A few light scratches but nothing major"
- Be honest without being negative: "Some normal wear on the crank arms from use" not "Significant deterioration"
- Skip flowery language - just be real
- Use Australian English (colour, tyre, aluminium)
- Avoid phrases like "I'm pleased to", "I'm happy to", "delighted to offer"
- Don't apologise for wear - it's expected on used gear

Just be real, honest, and helpful.`;

const LISTING_SCHEMA = {
  item_type: "string (bike/part/apparel)",
  overall_confidence: "number 0-100",
  brand: "string",
  model: "string",
  model_year: "string or null",
  
  // Bike fields
  bike_type: "string or null",
  frame_size: "string or null",
  frame_material: "string or null",
  groupset: "string or null",
  wheel_size: "string or null",
  suspension_type: "string or null",
  color_primary: "string or null",
  color_secondary: "string or null",
  
  // Part fields
  part_category: "string or null",
  part_type: "string or null",
  compatibility: "string or null",
  material: "string or null",
  weight: "string or null",
  
  // Apparel fields
  apparel_category: "string or null",
  size: "string or null",
  gender_fit: "string or null",
  apparel_material: "string or null",
  
  // Condition
  condition_rating: "string (New/Like New/Excellent/Good/Fair/Well Used)",
  condition_details: "string - natural, conversational description",
  wear_notes: "string - honest but casual tone",
  usage_estimate: "string",
  
  // Pricing
  price_min_aud: "number",
  price_max_aud: "number",
  price_reasoning: "string - brief, natural explanation",
  
  // Confidence scores
  brand_confidence: "number 0-100",
  model_confidence: "number 0-100",
  condition_confidence: "number 0-100",
};

// ============================================================
// Helper: Analyse Single Product
// ============================================================

async function analyseSingleProduct(
  groupId: string,
  imageUrls: string[],
  suggestedName?: string
): Promise<AnalysisResult> {
  try {
    console.log(`🔍 [BULK ANALYSIS] Analysing product: ${groupId} (${imageUrls.length} images)`);

    // Build image content
    const imageContent = imageUrls.map(url => ({
      type: "image_url" as const,
      image_url: {
        url: url,
        detail: "high" as const,
      }
    }));

    const userPrompt = `Analyse this ${suggestedName ? `${suggestedName}` : 'cycling product'} from the photos provided.

${suggestedName ? `Suggested product: ${suggestedName}` : ''}

Extract all visible details and provide pricing recommendations based on Australian market conditions.

Return ONLY valid JSON matching this schema:
${JSON.stringify(LISTING_SCHEMA, null, 2)}`;

    // Call OpenAI API
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: [
              {
                type: "text",
                text: userPrompt,
              },
              ...imageContent,
            ],
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2000,
        temperature: 0.3,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error(`❌ [BULK ANALYSIS] OpenAI API error for ${groupId}:`, errorText);
      throw new Error(`OpenAI API error: ${openaiResponse.status}`);
    }

    const openaiData = await openaiResponse.json();
    const content = openaiData.choices[0].message.content;
    const parsed = JSON.parse(content);

    console.log(`✅ [BULK ANALYSIS] Product ${groupId} analysed (${openaiData.usage?.total_tokens || '?'} tokens)`);

    return {
      groupId,
      success: true,
      data: parsed,
    };

  } catch (error) {
    console.error(`❌ [BULK ANALYSIS] Error analysing ${groupId}:`, error);
    return {
      groupId,
      success: false,
      error: error instanceof Error ? error.message : 'Analysis failed',
    };
  }
}

// ============================================================
// Helper: Analyse Products in Batches
// ============================================================

async function analyseProductsBatch(products: ProductGroup[]): Promise<AnalysisResult[]> {
  const results: AnalysisResult[] = [];
  
  // Process in batches of MAX_CONCURRENT_ANALYSIS
  for (let i = 0; i < products.length; i += MAX_CONCURRENT_ANALYSIS) {
    const batch = products.slice(i, i + MAX_CONCURRENT_ANALYSIS);
    console.log(`🔄 [BULK ANALYSIS] Processing batch ${Math.floor(i / MAX_CONCURRENT_ANALYSIS) + 1} (${batch.length} products)`);
    
    const batchResults = await Promise.all(
      batch.map(product => 
        analyseSingleProduct(product.groupId, product.imageUrls, product.suggestedName)
      )
    );
    
    results.push(...batchResults);
  }
  
  return results;
}

// ============================================================
// Main Handler
// ============================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🤖 [BULK ANALYSIS] === Request started ===');

    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user with Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('❌ [BULK ANALYSIS] Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('✓ [BULK ANALYSIS] User authenticated:', user.id);

    // Parse request body
    const body: { products: ProductGroup[] } = await req.json();
    const { products } = body;

    if (!products || products.length === 0) {
      return new Response(JSON.stringify({ error: 'No products provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📦 [BULK ANALYSIS] Processing ${products.length} products...`);

    // Analyse all products
    const results = await analyseProductsBatch(products);

    // Count successes and failures
    const successes = results.filter(r => r.success).length;
    const failures = results.filter(r => !r.success).length;

    console.log(`✅ [BULK ANALYSIS] Complete: ${successes} succeeded, ${failures} failed`);

    return new Response(
      JSON.stringify({
        results,
        summary: {
          total: products.length,
          succeeded: successes,
          failed: failures,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('❌ [BULK ANALYSIS] Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

