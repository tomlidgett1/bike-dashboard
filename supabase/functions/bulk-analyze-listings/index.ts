// ============================================================
// Bulk Listing Analysis - Supabase Edge Function
// Analyses multiple products in parallel using OpenAI
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_LISTING_MODEL = 'gpt-5.4-mini';

const MAX_CONCURRENT_ANALYSIS = 3;

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

type JsonObject = Record<string, unknown>;

type ResponsesPayload = {
  output?: unknown[];
  usage?: {
    total_tokens?: number;
  };
};

interface AnalysisResult {
  groupId: string;
  success: boolean;
  data?: JsonObject;
  error?: string;
}

// ============================================================
// System Prompt (reused from analyze-listing-ai)
// ============================================================

const SYSTEM_PROMPT = `You are an experienced cyclist selling second-hand cycling gear on an Australian marketplace. Write output that sounds like a real human seller, not AI or a product catalogue.

RULES:
- Use web search to verify clean product titles, descriptions, and used AUD pricing
- Assume products are second-hand unless there is strong evidence they are new
- Prefer Australian used/sold/private listing evidence for value
- If only RRP/new pricing is found, discount for age, condition, and normal cycling resale behaviour
- Product descriptions should be 2-4 short, natural sentences with no links or source names
- Condition details should be first person and conversational
- Use Australian English (colour, tyre, aluminium)
- Never include URLs, domains, markdown citations, or source names in description fields.`;

const LISTING_SCHEMA = {
  item_type: "string (bike/part/apparel)",
  overall_confidence: "number 0-100",
  brand: "string",
  model: "string",
  clean_title: "string - clean marketplace title",
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
} as const;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractResponsesText(data: unknown): string | null {
  if (!isJsonObject(data) || !Array.isArray(data.output)) return null;

  for (const item of data.output) {
    if (!isJsonObject(item) || item.type !== 'message' || !Array.isArray(item.content)) continue;

    const textContent = item.content.find((content): content is { text: string } => (
      isJsonObject(content) &&
      content.type === 'output_text' &&
      typeof content.text === 'string'
    ));
    if (textContent) return textContent.text;
  }

  return null;
}

function parseJsonFromText(text: string): JsonObject {
  const parseJsonObject = (candidate: string): JsonObject => {
    const parsed = JSON.parse(candidate) as unknown;
    if (!isJsonObject(parsed)) throw new Error('AI response JSON was not an object');
    return parsed;
  };

  try {
    return parseJsonObject(text);
  } catch {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object found in AI response');
    return parseJsonObject(jsonMatch.length === 2 ? jsonMatch[1] : jsonMatch[0]);
  }
}

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

    const imageContent = imageUrls.map(url => ({
      type: "input_image" as const,
      image_url: url,
    }));

    const userPrompt = `Analyse this ${suggestedName ? `${suggestedName}` : 'cycling product'} from the photos provided, then use web search to verify the clean title, natural product description, and realistic second-hand AUD value.

${suggestedName ? `Suggested product: ${suggestedName}` : ''}

Requirements:
- clean_title must be a buyer-friendly product title, not keyword-stuffed
- description must be human-like and factual, with no URLs/source names
- price_estimate must be second-hand AUD value for an Australian private sale
- use web search for title, product facts, and pricing context

Return ONLY valid JSON matching this schema:
${JSON.stringify(LISTING_SCHEMA, null, 2)}`;

    // Call OpenAI Responses API with web search.
    const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_LISTING_MODEL,
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: SYSTEM_PROMPT }],
          },
          {
            role: 'user',
            content: [
              {
                type: "input_text",
                text: userPrompt,
              },
              ...imageContent,
            ],
          },
        ],
        tools: [{
          type: 'web_search_preview',
          search_context_size: 'high',
          user_location: { type: 'approximate', country: 'AU' },
        }],
        tool_choice: 'auto',
        temperature: 0.3,
        store: false,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error(`❌ [BULK ANALYSIS] OpenAI API error for ${groupId}:`, errorText);
      throw new Error(`OpenAI API error: ${openaiResponse.status}`);
    }

    const openaiData = await openaiResponse.json() as ResponsesPayload;
    const content = extractResponsesText(openaiData);
    if (!content) throw new Error('No output text in OpenAI response');

    const parsed = parseJsonFromText(content);

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
