// ============================================================
// Generate Listing Description Edge Function
// Uses OpenAI Responses API with web search to generate product descriptions
// ============================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateDescriptionRequest {
  title: string;
  brand?: string;
  model?: string;
  itemType?: 'bike' | 'part' | 'apparel';
  bikeType?: string;
  frameSize?: string;
  frameMaterial?: string;
  groupset?: string;
  wheelSize?: string;
  conditionRating?: string;
  partTypeDetail?: string;
  size?: string;
  genderFit?: string;
}

interface DescriptionResult {
  description: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    
    if (!OPENAI_API_KEY) {
      console.error('❌ [GEN DESC] OPENAI_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: GenerateDescriptionRequest = await req.json();
    console.log('🔍 [GEN DESC] Request:', JSON.stringify(body));

    const { 
      title, brand, model, itemType, bikeType, 
      frameSize, frameMaterial, groupset, wheelSize, conditionRating,
      partTypeDetail, size, genderFit
    } = body;

    if (!title) {
      return new Response(
        JSON.stringify({ error: 'Title is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build search context
    const searchTerms: string[] = [];
    if (brand) searchTerms.push(brand);
    if (model) searchTerms.push(model);
    if (!brand && !model) searchTerms.push(title);
    
    const searchContext = searchTerms.join(' ');
    const productType = bikeType || (itemType === 'part' ? 'cycling component' : itemType === 'apparel' ? 'cycling apparel' : 'bicycle');

    // Build additional context for the prompt
    const specs: string[] = [];
    if (frameSize) specs.push(`Frame Size: ${frameSize}`);
    if (frameMaterial) specs.push(`Frame Material: ${frameMaterial}`);
    if (groupset) specs.push(`Groupset: ${groupset}`);
    if (wheelSize) specs.push(`Wheel Size: ${wheelSize}`);
    if (partTypeDetail) specs.push(`Part Type: ${partTypeDetail}`);
    if (size) specs.push(`Size: ${size}`);
    if (genderFit) specs.push(`Fit: ${genderFit}`);
    if (conditionRating) specs.push(`Condition: ${conditionRating}`);

    const specsText = specs.length > 0 ? `\nKnown specifications:\n${specs.map(s => `- ${s}`).join('\n')}` : '';

    const prompt = `You are writing product copy for an e-commerce product page (not seller notes).

PRODUCT TO DESCRIBE:
- Title: ${title}
- Brand: ${brand || 'Unknown'}
- Model: ${model || 'Unknown'}
- Type: ${productType}${specsText}

TASK:
Search the web for information about "${searchContext}" and write a concise, scannable product description suitable for an e-commerce website.

PRIORITISE these authoritative cycling sources:
- Official brand websites (shimano.com, sram.com, giant-bicycles.com, specialized.com, trek.com, etc.)
- Australian cycling retailers (99bikes.com.au, pushys.com.au, bicyclesonline.com.au)
- International cycling retailers (chainreactioncycles.com, wiggle.com)
- Cycling review sites (bikeradar.com, cyclingtips.com, road.cc)

DESCRIPTION REQUIREMENTS:
- Make it suitable for an e-commerce website product page
- Keep it short and informative: target 70–110 words total
- Start with a 1–2 sentence overview (what it is + who it’s for)
- Then add 4–7 dot points (use "•") covering the most important specs/benefits/compatibility
- If a key detail is unknown, omit it (don’t invent)
- Use Australian English (colour, tyre, etc.)
- Write in third person and avoid hype
- Do NOT mention price, condition, shipping, warranty, or seller-related information
- Do NOT use phrases like "for sale" or "available now"
- Do NOT cite, mention, or include sources or URLs in the output

Return ONLY valid JSON (no markdown code blocks):
{
  "description": "Your e-commerce description here (short overview + dot points)..."
}`;

    console.log('🤖 [GEN DESC] Calling OpenAI Responses API with web search...');

    const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: prompt,
        tools: [{ 
          type: 'web_search_preview',
          search_context_size: 'medium',
          user_location: { type: 'approximate', country: 'AU' }
        }],
        tool_choice: 'auto',
        temperature: 0.4,
        store: false,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('❌ [GEN DESC] OpenAI error:', openaiResponse.status, errorText);
      throw new Error(`OpenAI API error: ${openaiResponse.status}`);
    }

    const openaiData = await openaiResponse.json();
    console.log('✅ [GEN DESC] OpenAI response received');

    // Extract the response text from Responses API structure
    let outputText = '';
    let webSearchExecuted = false;
    
    if (Array.isArray(openaiData.output) && openaiData.output.length > 0) {
      for (const item of openaiData.output) {
        if (item && item.type === 'web_search_call') {
          console.log(`🔍 [GEN DESC] Web search executed: ${item.status || 'unknown'}`);
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
      console.error('❌ [GEN DESC] No output text found in response');
      throw new Error('No output text in OpenAI response');
    }

    console.log('✓ [GEN DESC] Output text length:', outputText.length);

    // Parse the JSON response
    let result: DescriptionResult;
    try {
      result = JSON.parse(outputText);
    } catch (parseError) {
      console.log('⚠️ [GEN DESC] Direct JSON parse failed, trying extraction...');
      
      const jsonMatch = outputText.match(/```(?:json)?\s*([\s\S]*?)```/) || outputText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          result = JSON.parse(jsonMatch[jsonMatch.length === 2 ? 1 : 0]);
          console.log('✓ [GEN DESC] Successfully extracted JSON from text');
        } catch (e) {
          console.error('❌ [GEN DESC] Failed to parse extracted JSON');
          // Fallback: use the raw text as description
          result = {
            description: outputText.replace(/```[\s\S]*?```/g, '').trim(),
          };
        }
      } else {
        // Use raw text as description
        result = {
          description: outputText.trim(),
        };
      }
    }

    // Validate
    if (!result.description) {
      throw new Error('No description in response');
    }

    console.log(`✅ [GEN DESC] Generated description (${result.description.length} chars)`);

    return new Response(
      JSON.stringify({
        success: true,
        description: result.description,
        meta: {
          model: openaiData.model,
          tokensUsed: openaiData.usage?.total_tokens,
          webSearchExecuted,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ [GEN DESC] Error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to generate description',
        details: error.message,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

