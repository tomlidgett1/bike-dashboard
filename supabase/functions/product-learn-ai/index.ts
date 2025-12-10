// ============================================================
// Product Learn AI - Supabase Edge Function
// Uses OpenAI Responses API with web search to research products
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

interface ProductLearnRequest {
  productName: string;
  brand?: string;
  model?: string;
  category?: string;
  subcategory?: string;
  price?: number;
  condition?: string;
  bikeType?: string;
  frameSize?: string;
  groupset?: string;
}

interface LearnResult {
  summary: string;
  keyFeatures: string[];
  pros: string[];
  cons: string[];
  priceAnalysis: {
    verdict: 'great_deal' | 'fair_price' | 'above_market' | 'unknown';
    explanation: string;
    marketRange?: {
      min: number;
      max: number;
    };
  };
  buyerTips: string[];
  sources: Array<{
    title: string;
    url: string;
  }>;
}

// ============================================================
// Main Handler
// ============================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🔍 [PRODUCT LEARN] === Request started ===');

    // Validate OpenAI API key
    if (!OPENAI_API_KEY) {
      console.error('❌ [PRODUCT LEARN] OPENAI_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: ProductLearnRequest = await req.json();
    console.log('✓ [PRODUCT LEARN] Request body:', JSON.stringify(body));

    const { productName, brand, model, category, subcategory, price, condition, bikeType, frameSize, groupset } = body;

    if (!productName) {
      return new Response(
        JSON.stringify({ error: 'Product name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build search context
    const searchTerms: string[] = [];
    if (brand) searchTerms.push(brand);
    if (model) searchTerms.push(model);
    if (!brand && !model) searchTerms.push(productName);
    
    const searchContext = searchTerms.join(' ');
    const productType = bikeType || subcategory || category || 'cycling product';

    // Build the prompt
    const prompt = `You are a cycling expert helping someone research a product they're considering buying on a second-hand marketplace.

PRODUCT BEING RESEARCHED:
- Name: ${productName}
- Brand: ${brand || 'Unknown'}
- Model: ${model || 'Unknown'}
- Category: ${category || 'Unknown'}${subcategory ? ` > ${subcategory}` : ''}${bikeType ? ` (${bikeType})` : ''}
- Listed Price: ${price ? `$${price} AUD` : 'Unknown'}
- Condition: ${condition || 'Unknown'}
${frameSize ? `- Frame Size: ${frameSize}` : ''}
${groupset ? `- Groupset: ${groupset}` : ''}

TASK:
Search the web for comprehensive information about "${searchContext}" to help a buyer make an informed decision. Focus on cycling-specific sources (BikeRadar, CyclingTips, manufacturer sites, cycling forums, review sites).

RESEARCH AREAS:
1. Product overview and what makes it special
2. Key features and specifications
3. Pros and cons based on reviews
4. Current market value (especially in Australia) - is the listed price fair?
5. What buyers should look out for with this product

Return ONLY valid JSON (no markdown code blocks) with this exact structure:
{
  "summary": "2-3 sentence overview of what this product is and who it's for",
  "keyFeatures": ["feature 1", "feature 2", "feature 3", "feature 4", "feature 5"],
  "pros": ["pro 1", "pro 2", "pro 3"],
  "cons": ["con 1", "con 2", "con 3"],
  "priceAnalysis": {
    "verdict": "great_deal|fair_price|above_market|unknown",
    "explanation": "Brief explanation of why this price is good/fair/high",
    "marketRange": { "min": 1000, "max": 1500 }
  },
  "buyerTips": ["tip 1", "tip 2", "tip 3"],
  "sources": [
    { "title": "Source Name", "url": "https://..." }
  ]
}

IMPORTANT:
- Be honest and helpful, not salesy
- If you can't find reliable information, say so
- Use Australian English (colour, tyre, etc.)
- For price analysis, consider the condition and age
- Include 3-6 sources that you actually referenced`;

    console.log('🤖 [PRODUCT LEARN] Calling OpenAI Responses API with web search...');

    // Call OpenAI Responses API with web search
    const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1',
        input: prompt,
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

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('❌ [PRODUCT LEARN] OpenAI error:', openaiResponse.status, errorText);
      throw new Error(`OpenAI API error: ${openaiResponse.status} - ${errorText}`);
    }

    const openaiData = await openaiResponse.json();
    console.log('✅ [PRODUCT LEARN] OpenAI response received');
    console.log('✓ [PRODUCT LEARN] Response structure:', JSON.stringify(openaiData, null, 2).substring(0, 500));

    // Extract the response text from Responses API structure
    let outputText = '';
    let webSearchExecuted = false;
    
    if (Array.isArray(openaiData.output) && openaiData.output.length > 0) {
      for (const item of openaiData.output) {
        if (item && item.type === 'web_search_call') {
          console.log(`🔍 [PRODUCT LEARN] Web search executed: ${item.status || 'unknown'}`);
          webSearchExecuted = true;
        }
        if (item && item.type === 'message' && Array.isArray(item.content)) {
          for (const content of item.content) {
            if (content && content.type === 'output_text' && content.text) {
              outputText = content.text;
            }
          }
        }
      }
    }

    if (!outputText) {
      console.error('❌ [PRODUCT LEARN] No output text found in response');
      throw new Error('No output text in OpenAI response');
    }

    console.log('✓ [PRODUCT LEARN] Output text length:', outputText.length);

    // Parse the JSON response
    let result: LearnResult;
    try {
      // Try direct JSON parse first
      result = JSON.parse(outputText);
    } catch (parseError) {
      console.log('⚠️ [PRODUCT LEARN] Direct JSON parse failed, trying extraction...');
      
      // Try to extract JSON from markdown code blocks
      const jsonMatch = outputText.match(/```(?:json)?\s*([\s\S]*?)```/) || outputText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          result = JSON.parse(jsonMatch[jsonMatch.length === 2 ? 1 : 0]);
          console.log('✓ [PRODUCT LEARN] Successfully extracted JSON from text');
        } catch (e) {
          console.error('❌ [PRODUCT LEARN] Failed to parse extracted JSON:', e);
          throw new Error('Failed to parse AI response as JSON');
        }
      } else {
        throw new Error('Failed to find JSON in AI response');
      }
    }

    // Validate required fields
    if (!result.summary || !result.keyFeatures || !result.pros || !result.cons) {
      console.error('❌ [PRODUCT LEARN] Missing required fields in response');
      throw new Error('AI response missing required fields');
    }

    console.log('✅ [PRODUCT LEARN] Successfully parsed result');
    console.log(`   - Summary: ${result.summary.substring(0, 100)}...`);
    console.log(`   - Features: ${result.keyFeatures.length}`);
    console.log(`   - Pros: ${result.pros.length}, Cons: ${result.cons.length}`);
    console.log(`   - Sources: ${result.sources?.length || 0}`);

    return new Response(
      JSON.stringify({
        success: true,
        result,
        meta: {
          model: openaiData.model,
          tokensUsed: openaiData.usage?.total_tokens,
          webSearchExecuted,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('❌ [PRODUCT LEARN] Error:', error);
    return new Response(
      JSON.stringify({
        error: 'Product research failed',
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
