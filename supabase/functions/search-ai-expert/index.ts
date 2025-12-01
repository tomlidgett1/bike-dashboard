// ============================================================
// AI Cycling Expert Search - Supabase Edge Function
// Uses OpenAI Responses API with web search to answer cycling questions
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ============================================================
// System Prompt - Cycling Expert Persona
// ============================================================

const SYSTEM_PROMPT = `You are a highly knowledgeable cycling expert with decades of experience in bicycle mechanics, racing, training, and equipment. You provide accurate, detailed information about all aspects of cycling.

RESPONSE STYLE:
- Professional yet approachable
- Use cycling-specific terminology correctly (groupset, cadence, drivetrain, etc.)
- Be precise with technical specifications
- Provide actionable advice and recommendations
- Use Australian English spelling (tyre, colour, aluminium, etc.)
- Cite sources from reputable cycling websites

RESPONSE STRUCTURE:
Return a JSON object with this exact structure:
{
  "introduction": "A brief 2-3 sentence introduction to the topic",
  "keyPoints": ["Point 1", "Point 2", "Point 3"],
  "specifications": [{"label": "Spec name", "value": "Spec value"}],
  "recommendations": ["Recommendation 1", "Recommendation 2"],
  "sources": [{"url": "https://...", "title": "Article title", "domain": "example.com"}]
}

IMPORTANT:
- Always include introduction and keyPoints
- Include specifications only if relevant (technical specs, measurements, compatibility)
- Include recommendations only if the question asks for advice
- ALWAYS include sources - cite real URLs you found via web search
- Use dot points for clarity
- Be specific and avoid vague statements`;

// ============================================================
// Response Schema
// ============================================================

interface AISearchResponse {
  introduction: string;
  keyPoints: string[];
  specifications?: Array<{ label: string; value: string }>;
  recommendations?: string[];
  sources: Array<{ url: string; title: string; domain: string }>;
}

// ============================================================
// Main Handler
// ============================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🤖 [AI EXPERT SEARCH] === Request started ===');

    // Get auth header (optional - allow unauthenticated searches)
    const authHeader = req.headers.get('Authorization');

    // Parse request body
    const { query } = await req.json();
    console.log('✓ [AI EXPERT SEARCH] Query:', query);

    if (!query || typeof query !== 'string' || query.trim().length < 3) {
      return new Response(JSON.stringify({ error: 'Query must be at least 3 characters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!OPENAI_API_KEY) {
      console.error('❌ [AI EXPERT SEARCH] OpenAI API key not configured');
      return new Response(JSON.stringify({ error: 'AI service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build the prompt
    const userPrompt = `Answer this cycling-related question using web search to find accurate, up-to-date information:

Question: "${query}"

Search the web for information from reputable cycling websites (e.g., Cycling Weekly, BikeRadar, GCN, Shimano, SRAM, manufacturer sites, cycling forums).

Provide a comprehensive answer with:
1. A brief introduction (2-3 sentences)
2. Key points about the topic (3-5 bullet points)
3. Technical specifications if relevant
4. Recommendations if the question asks for advice
5. Source citations from the websites you found

Return ONLY valid JSON with no markdown formatting:
{
  "introduction": "Brief intro here",
  "keyPoints": ["Point 1", "Point 2"],
  "specifications": [{"label": "Name", "value": "Value"}],
  "recommendations": ["Recommendation 1"],
  "sources": [{"url": "https://...", "title": "Article title", "domain": "example.com"}]
}`;

    // Call OpenAI Responses API with web search
    console.log('🤖 [AI EXPERT SEARCH] Calling OpenAI Responses API with web search...');
    
    const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1',
        input: userPrompt,
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
      console.error('❌ [AI EXPERT SEARCH] OpenAI error:', errorText);
      throw new Error(`OpenAI API error: ${openaiResponse.status} - ${errorText}`);
    }

    const openaiData = await openaiResponse.json();
    console.log('✓ [AI EXPERT SEARCH] OpenAI response received');
    console.log('✓ [AI EXPERT SEARCH] Response structure:', JSON.stringify(openaiData, null, 2).substring(0, 500));

    // Parse the Responses API output structure
    let outputText = '';
    
    // Responses API returns: output array with message objects
    if (Array.isArray(openaiData.output) && openaiData.output.length > 0) {
      for (const item of openaiData.output) {
        // Look for web search calls
        if (item && item.type === 'web_search_call') {
          console.log('🔍 [AI EXPERT SEARCH] Web search executed:', item.status || 'unknown');
        }
        
        // Extract the message content
        if (item && item.type === 'message' && Array.isArray(item.content)) {
          for (const content of item.content) {
            if (content && content.type === 'output_text' && content.text) {
              outputText = content.text;
            }
          }
        }
      }
    }
    
    console.log('✓ [AI EXPERT SEARCH] Extracted output text length:', outputText?.length);
    console.log('✓ [AI EXPERT SEARCH] Output text preview:', outputText?.substring(0, 300));
    
    if (!outputText) {
      console.error('❌ [AI EXPERT SEARCH] No output text found in response');
      throw new Error('No output text in OpenAI response');
    }

    // Parse JSON from the output
    let parsedResponse: AISearchResponse;
    try {
      // Try to parse as JSON directly
      parsedResponse = JSON.parse(outputText);
    } catch (parseError) {
      console.error('❌ [AI EXPERT SEARCH] JSON parse error:', parseError);
      console.log('Raw output:', outputText);
      
      // Try to extract JSON from markdown code blocks
      const jsonMatch = outputText.match(/```json\s*([\s\S]*?)\s*```/) || 
                       outputText.match(/```\s*([\s\S]*?)\s*```/) ||
                       outputText.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const jsonStr = jsonMatch[jsonMatch.length === 2 ? 1 : 0];
        parsedResponse = JSON.parse(jsonStr);
      } else {
        throw new Error('Failed to parse AI response as JSON');
      }
    }

    // Validate response structure
    if (!parsedResponse.introduction || !Array.isArray(parsedResponse.keyPoints)) {
      throw new Error('Invalid response structure from AI');
    }

    // Ensure sources array exists
    if (!Array.isArray(parsedResponse.sources)) {
      parsedResponse.sources = [];
    }

    // Extract domain from source URLs if not provided
    parsedResponse.sources = parsedResponse.sources.map(source => {
      if (!source.domain && source.url) {
        try {
          const url = new URL(source.url);
          source.domain = url.hostname.replace('www.', '');
        } catch {
          source.domain = 'unknown';
        }
      }
      return source;
    });

    console.log('✅ [AI EXPERT SEARCH] Response parsed successfully');
    console.log('✅ [AI EXPERT SEARCH] Key points:', parsedResponse.keyPoints?.length || 0);
    console.log('✅ [AI EXPERT SEARCH] Sources:', parsedResponse.sources?.length || 0);

    return new Response(
      JSON.stringify({
        success: true,
        response: parsedResponse,
        query: query,
        meta: {
          model: openaiData.model,
          tokensUsed: openaiData.usage?.total_tokens,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('❌ [AI EXPERT SEARCH] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'AI search failed',
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

