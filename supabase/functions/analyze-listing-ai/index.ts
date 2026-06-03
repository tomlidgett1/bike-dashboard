// ============================================================
// AI Listing Analyzer - Supabase Edge Function
// Analyzes cycling product photos using OpenAI Responses API
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_LISTING_MODEL = 'gpt-5.4-mini';

// ============================================================
// System Prompt - Human-like output style
// ============================================================

const SYSTEM_PROMPT = `You are an experienced cyclist selling second-hand cycling gear on an Australian marketplace. Your job is to turn human-uploaded photos into an honest, useful listing.

ABSOLUTE RULE - NO LINKS OR URLS EVER:
- Never include URLs, website links, or domain names in ANY field
- Never cite sources inline (no "according to...", no "source:", no footnotes)
- Never include "www.", "http", ".com", ".au" or any web reference in descriptions
- Product descriptions must read as plain prose with no citations

PRODUCT TITLE STYLE:
- Create clean marketplace titles from real product names: brand + model + key variant/spec + model year only when defensible
- Remove internal codes, all-caps POS style, vague words, keyword stuffing, and duplicated brand/model words
- Never invent a model. If the exact model is uncertain, use a conservative descriptive title

PRODUCT DESCRIPTION STYLE:
- Product descriptions should sound human, not like a manufacturer brochure
- Write 2-4 short sentences that explain what the item is, what it is good for, and any useful specs
- Keep product features separate from condition; condition belongs in seller_notes / condition_details
- Use Australian English and AUD pricing assumptions

CRITICAL - CONDITION DESCRIPTION STYLE:
- Write in FIRST PERSON - you own this item and are describing it
- Say "I've" not "it looks like" - you know this item personally
- Sound like a real person chatting with a potential buyer
- Be casual, honest, and conversational
- Use Australian English (colour, tyre, aluminium)

GOOD CONDITION EXAMPLES (FIRST PERSON):

Bike: "I've had this bike for about 2 years and looked after it really well. It's been regularly serviced and runs perfectly. There are a few minor scratches on the frame from normal use but nothing major. The drivetrain is clean, shifts are smooth, and the brakes are strong. I'm only selling because I'm upgrading."

Part: "This has been reliable for me - used but in good working order. There's some light wear on the finish but it's purely cosmetic and all the threads are clean."

Apparel: "I've only worn this a handful of times so it's still in excellent condition. No stains, tears, or issues. The fabric is still crisp and the zippers work perfectly."

BAD - DO NOT WRITE LIKE THIS:
- "This product appears to be in good condition" (sounds like you don't own it)
- "The bike looks well-maintained" (too detached)  
- "It seems to have been looked after" (sounds uncertain)
- "I'm pleased to present..." (too formal)
- "This exceptional piece..." (marketing speak)

CORRECT - WRITE LIKE THIS:
- "I've taken good care of this" (first person, owner)
- "It's in great condition" (confident, you know it)
- "Shifts perfectly and I've had no issues" (personal experience)
- "A few scratches from use but nothing major" (honest, casual)

USED PRICING STYLE:
- Assume the item is second-hand unless the photos and notes clearly show it is new
- Pricing must be AUD
- Prefer current or recent used-market evidence over new RRP
- If only new/RRP pricing is found, estimate a second-hand range using item age, condition, visible wear, and normal cycling resale discounts
- Avoid overpricing. Give a realistic private-sale range a buyer in Australia would actually consider

Just be real, honest, useful, and conservative where the evidence is weak.`;

// ============================================================
// Analysis Schema
// ============================================================

const LISTING_SCHEMA = {
  item_type: "string (bike/part/apparel)",
  overall_confidence: "number 0-100",
  brand: "string",
  model: "string",
  clean_title: "string - clean marketplace title, no keyword stuffing",
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
  
  // Condition (written naturally for customers)
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
    console.log('🤖 [AI EDGE FUNCTION] === Request started ===');

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
      console.error('❌ [AI EDGE FUNCTION] Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('✓ [AI EDGE FUNCTION] User authenticated:', user.id);

    // Parse request body
    const { imageUrls, userHints } = await req.json();
    console.log('✓ [AI EDGE FUNCTION] Analyzing', imageUrls.length, 'images');
    console.log('✓ [AI EDGE FUNCTION] Original URLs:', imageUrls);

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return new Response(JSON.stringify({ error: 'Image URLs required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Download images and convert to base64 for reliable OpenAI access
    console.log('✓ [AI EDGE FUNCTION] Downloading images as base64...');
    
    // Helper function to convert array buffer to base64 (more reliable than btoa for large files)
    const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const chunkSize = 8192; // Process in chunks to avoid stack overflow
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.slice(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, [...chunk]);
      }
      return btoa(binary);
    };
    
    const imageData = await Promise.all(
      imageUrls.map(async (url: string, index: number) => {
        try {
          // Check if it's a Supabase storage URL (listing-images or product-images)
          const supabaseMatch = url.match(/\/storage\/v1\/object\/public\/(listing-images|product-images)\/(.+)$/);
          if (supabaseMatch) {
            const bucket = supabaseMatch[1];
            const path = supabaseMatch[2];
            console.log(`✓ [AI EDGE FUNCTION] Downloading image ${index + 1} from Supabase (${bucket}):`, path);

            // Download from Supabase storage
            const { data, error } = await supabase.storage
              .from(bucket)
              .download(path);
            
            if (error) {
              console.error('❌ [AI EDGE FUNCTION] Download error:', error);
              throw error;
            }
            
            const arrayBuffer = await data.arrayBuffer();
            const base64 = arrayBufferToBase64(arrayBuffer);
            const mimeType = data.type || 'image/jpeg';
            
            console.log(`✓ [AI EDGE FUNCTION] Image ${index + 1} converted to base64, size:`, base64.length);
            
            return `data:${mimeType};base64,${base64}`;
          }
          
          // Check if it's a Cloudinary URL - download and convert to base64
          if (url.includes('cloudinary.com') || url.includes('res.cloudinary.com')) {
            console.log(`✓ [AI EDGE FUNCTION] Downloading image ${index + 1} from Cloudinary:`, url.substring(0, 80));
            
            const response = await fetch(url);
            if (!response.ok) {
              throw new Error(`Failed to fetch Cloudinary image: ${response.status}`);
            }
            
            const arrayBuffer = await response.arrayBuffer();
            const base64 = arrayBufferToBase64(arrayBuffer);
            const contentType = response.headers.get('content-type') || 'image/webp';
            
            console.log(`✓ [AI EDGE FUNCTION] Cloudinary image ${index + 1} converted to base64, size:`, base64.length);
            
            return `data:${contentType};base64,${base64}`;
          }
          
          // For other URLs (e.g., data URLs), return as-is
          console.log(`✓ [AI EDGE FUNCTION] Image ${index + 1} using URL directly`);
          return url;
        } catch (err) {
          console.error(`❌ [AI EDGE FUNCTION] Error processing image ${index + 1}:`, err);
          throw err;
        }
      })
    );

    console.log('✓ [AI EDGE FUNCTION] All images ready for OpenAI');

    // Build analysis prompt
    const prompt = `Analyze these ${imageUrls.length} photo(s) of a cycling product uploaded by a human seller.

Examine the photos carefully and provide:
1. Item type (bike, part, or apparel)
2. Brand, model, and a clean marketplace title
3. Specifications and details
4. Honest condition assessment (write naturally, like you're describing it to a buyer)
5. A preliminary second-hand AUD price range from the visible condition

${userHints?.itemType ? `The user thinks this is a ${userHints.itemType}.` : ''}

Title guidance:
- clean_title should read like a buyer-friendly second-hand listing title
- Do not include condition, price, location, "used", "for sale", or marketing fluff in the title
- If exact model is uncertain, keep the title conservative

For the condition_details field, write in FIRST PERSON as if YOU own and are selling this item:
- Use "I've" and "I" - you personally own this
- Say things like "I've looked after this really well" or "I've had no issues with it"
- Never say "it looks like" or "appears to be" - you know this item
- Be conversational, honest, and specific about condition
- Don't use "Condition:" as a prefix - just write naturally

Return your analysis as a JSON object with this structure:
${JSON.stringify(LISTING_SCHEMA, null, 2)}`;

    // Call OpenAI Responses API
    console.log('🤖 [AI EDGE FUNCTION] Calling OpenAI...');
    
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
              { type: 'input_text', text: prompt },
              ...imageData.map((dataUrl: string) => ({
                type: 'input_image',
                image_url: dataUrl,
              })),
            ],
          },
        ],
        store: false,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('❌ [AI EDGE FUNCTION] OpenAI error:', errorText);
      throw new Error(`OpenAI API error: ${openaiResponse.status} - ${errorText}`);
    }

    const openaiData = await openaiResponse.json();
    console.log('✓ [AI EDGE FUNCTION] OpenAI response received');
    console.log('✓ [AI EDGE FUNCTION] Full response structure:', JSON.stringify(openaiData, null, 2).substring(0, 1000));

    // Parse the Responses API output structure
    let outputText = null;
    
    // Responses API can include tool/reasoning items before the message; collect the message text.
    if (Array.isArray(openaiData.output) && openaiData.output.length > 0) {
      for (const message of openaiData.output) {
        if (message?.type === 'message' && Array.isArray(message.content)) {
          const textContent = message.content.find((item: unknown): item is { text: string } => (
            typeof item === 'object' &&
            item !== null &&
            (item as { type?: unknown }).type === 'output_text' &&
            typeof (item as { text?: unknown }).text === 'string'
          ));
          if (textContent?.text) {
            outputText = textContent.text;
            break;
          }
        }
      }
    }
    
    console.log('✓ [AI EDGE FUNCTION] Extracted output text length:', outputText?.length);
    console.log('✓ [AI EDGE FUNCTION] Output text preview:', outputText?.substring(0, 200));
    
    if (!outputText) {
      console.error('❌ [AI EDGE FUNCTION] No output text found in response');
      console.error('❌ [AI EDGE FUNCTION] Response structure:', JSON.stringify(openaiData, null, 2).substring(0, 500));
      throw new Error('No output text in OpenAI response');
    }

    let analysis;
    try {
      // Try to parse as JSON
      analysis = JSON.parse(outputText);
    } catch (parseError) {
      console.error('❌ [AI EDGE FUNCTION] JSON parse error:', parseError);
      console.log('Raw output:', outputText);
      
      // Try to extract JSON from markdown code blocks
      let jsonMatch = outputText.match(/```json\n([\s\S]*?)\n```/) || outputText.match(/```\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        try {
          analysis = JSON.parse(jsonMatch[1]);
        } catch (e) {
          console.error('❌ [AI EDGE FUNCTION] Failed to parse markdown JSON:', e);
        }
      }
      
      // If still no match, try to extract JSON object by finding first { and matching }
      if (!analysis) {
        console.log('✓ [AI EDGE FUNCTION] Attempting to extract JSON object from text...');
        const firstBrace = outputText.indexOf('{');
        if (firstBrace !== -1) {
          // Find the matching closing brace
          let braceCount = 0;
          let endIndex = -1;
          for (let i = firstBrace; i < outputText.length; i++) {
            if (outputText[i] === '{') braceCount++;
            if (outputText[i] === '}') braceCount--;
            if (braceCount === 0) {
              endIndex = i + 1;
              break;
            }
          }
          
          if (endIndex !== -1) {
            const jsonString = outputText.substring(firstBrace, endIndex);
            console.log('✓ [AI EDGE FUNCTION] Extracted JSON string length:', jsonString.length);
            try {
              analysis = JSON.parse(jsonString);
              console.log('✓ [AI EDGE FUNCTION] Successfully parsed extracted JSON');
            } catch (e) {
              console.error('❌ [AI EDGE FUNCTION] Failed to parse extracted JSON:', e);
              throw new Error('Failed to parse AI response as JSON');
            }
          } else {
            throw new Error('Failed to find complete JSON object in response');
          }
        } else {
          throw new Error('Failed to parse AI response as JSON');
        }
      }
    }

    console.log('✅ [AI EDGE FUNCTION] Analysis complete');
    console.log('✅ [AI EDGE FUNCTION] Detected:', analysis.item_type, '-', analysis.brand, analysis.model);

    // ============================================================
    // Restructure flat fields into nested objects
    // ============================================================
    if (analysis.item_type === 'bike') {
      analysis.bike_details = {
        bike_type: analysis.bike_type || null,
        frame_size: analysis.frame_size || null,
        frame_material: analysis.frame_material || null,
        groupset: analysis.groupset || null,
        wheel_size: analysis.wheel_size || null,
        suspension_type: analysis.suspension_type || null,
        color_primary: analysis.color_primary || null,
        color_secondary: analysis.color_secondary || null,
      };
      console.log('✅ [AI EDGE FUNCTION] Bike details:', analysis.bike_details);
    } else if (analysis.item_type === 'part') {
      analysis.part_details = {
        category: analysis.part_category || null,
        part_type: analysis.part_type || null,
        compatibility: analysis.compatibility || null,
        material: analysis.material || null,
        weight: analysis.weight || null,
      };
      console.log('✅ [AI EDGE FUNCTION] Part details:', analysis.part_details);
    } else if (analysis.item_type === 'apparel') {
      analysis.apparel_details = {
        category: analysis.apparel_category || null,
        size: analysis.size || null,
        gender_fit: analysis.gender_fit || null,
        material: analysis.apparel_material || null,
      };
      console.log('✅ [AI EDGE FUNCTION] Apparel details:', analysis.apparel_details);
    }

    // ============================================================
    // Phase 2: Web Search Enrichment (NEW)
    // ============================================================
    let webEnrichment = null;
    let searchUrls: Array<{url: string; type: string; relevance?: number}> = [];
    
    const detectedSubject = [
      analysis.clean_title,
      analysis.brand,
      analysis.model,
      analysis.model_year,
      analysis.item_type,
    ]
      .filter((value) => typeof value === 'string' && value.trim().length > 0)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (detectedSubject) {
      try {
        console.log('🔍 [AI EDGE FUNCTION] Starting web search enrichment...');
        
        const searchPrompt = `Use web search to research this second-hand cycling marketplace item: "${detectedSubject}".

The product was identified from human-uploaded photos. Treat it as USED unless there is strong evidence it is new.

Find and synthesize:
1. The clean product title buyers would recognise (official product name when available)
2. A human, second-hand marketplace product description with accurate product facts
3. Technical specifications:
   ${analysis.item_type === 'bike' ? '- Frame material, size, groupset, wheel size, suspension type' : ''}
   ${analysis.item_type === 'part' ? '- Compatibility, material, weight, dimensions' : ''}
   ${analysis.item_type === 'apparel' ? '- Size, material, gender fit, features' : ''}
4. Product category classification (be specific - e.g., "Mountain > Trail" or "Drivetrain > Rear Derailleur")
5. Used-market value in AUD for an Australian private sale
6. Model year identification if possible
7. Any compatibility or fitment information

Pricing rules:
- Prioritise used/sold/private listings in Australia when available
- Use retailer/RRP pricing only as supporting context, then discount for second-hand condition
- Convert/normalise to AUD if an overseas source is useful, but prefer AUD sources
- The returned min/max/target must be realistic second-hand prices, not new retail
- Factor visible condition from the photo analysis:
  - condition_rating: ${analysis.condition_rating || 'Unknown'}
  - visible wear: ${analysis.wear_notes || analysis.condition_details || 'Unknown'}

Description rules:
- product_description must be natural and human-like, as if written by a knowledgeable seller
- Keep it factual and useful, not salesy or robotic
- Do not describe condition here; condition belongs in seller notes
- The product_description field must contain ONLY plain prose text. Never include URLs, hyperlinks, website addresses, domain names, or source citations of any kind. Sources go only in sources_consulted.

Return ONLY valid JSON (no markdown):
{
  "clean_title": "2021 Giant TCR Advanced 2 Disc Road Bike",
  "product_description": "Detailed product description with no links or URLs...",
  "technical_specs": {
    "frame_material": "Carbon",
    "groupset": "Shimano 105"
  },
  "category_classification": {
    "level1": "Bicycles",
    "level2": "Road",
    "level3": "Endurance"
  },
  "used_market_pricing": {
    "min_aud": 2000,
    "max_aud": 3000,
    "target_aud": 2500,
    "confidence": 75,
    "basis": "Used Australian listings plus current RRP discounted for condition",
    "sources": ["BikeExchange", "eBay Australia"]
  },
  "compatibility_info": "Compatible with...",
  "model_year_confirmed": "2021",
  "sources_consulted": [
    {"url": "https://...", "type": "manufacturer", "relevance": 95}
  ]
}`;

        const webSearchResponse = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: OPENAI_LISTING_MODEL,
            input: searchPrompt,
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

        if (webSearchResponse.ok) {
          const webData = await webSearchResponse.json();
          console.log('✅ [AI EDGE FUNCTION] Web search complete');
          
          // Extract web search results
          let webOutputText = '';
          if (Array.isArray(webData.output) && webData.output.length > 0) {
            for (const item of webData.output) {
              if (item && item.type === 'web_search_call') {
                console.log(`🔍 [AI EDGE FUNCTION] Web search executed: ${item.status || 'unknown'}`);
              }
              if (item && item.type === 'message' && Array.isArray(item.content)) {
                for (const content of item.content) {
                  if (content && content.type === 'output_text' && content.text) {
                    webOutputText = content.text;
                  }
                }
              }
            }
          }
          
          if (webOutputText) {
            // Parse JSON from output
            try {
              const jsonMatch = webOutputText.match(/```(?:json)?\s*([\s\S]*?)```/) || webOutputText.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[jsonMatch.length === 2 ? 1 : 0]);
                webEnrichment = {
                  product_description: parsed.product_description,
                  technical_specs: parsed.technical_specs,
                  category_classification: parsed.category_classification,
                  used_market_pricing: parsed.used_market_pricing,
                  market_pricing: parsed.used_market_pricing || parsed.market_pricing,
                  compatibility_info: parsed.compatibility_info,
                  model_year_confirmed: parsed.model_year_confirmed,
                  clean_title: parsed.clean_title,
                };
                searchUrls = parsed.sources_consulted || [];
                console.log('✅ [AI EDGE FUNCTION] Web enrichment parsed successfully');
              }
            } catch (parseError) {
              console.error('⚠️ [AI EDGE FUNCTION] Failed to parse web enrichment:', parseError);
            }
          }
        } else {
          console.error('⚠️ [AI EDGE FUNCTION] Web search failed:', webSearchResponse.status);
        }
      } catch (webError) {
        console.error('⚠️ [AI EDGE FUNCTION] Web search error:', webError);
        // Continue without web enrichment - don't fail the whole request
      }
    }

    // ============================================================
    // Phase 3: Merge Image Analysis + Web Search Data
    // ============================================================

    // Strip any URLs/links from a text field (safety net in case AI ignores instructions)
    const stripUrls = (text: string | undefined | null): string | undefined => {
      if (!text) return undefined;
      return text
        .replace(/https?:\/\/[^\s)>\]"']+/gi, '')       // full URLs
        .replace(/www\.[^\s)>\]"']+/gi, '')               // www. links
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')          // markdown links → keep label only
        .replace(/\s{2,}/g, ' ')                          // collapse extra spaces
        .trim() || undefined;
    };

    const mergedAnalysis = { ...analysis };
    const dataSources: Record<string, "image" | "web" | "both"> = {};

    if (webEnrichment) {
      if (webEnrichment.clean_title) {
        mergedAnalysis.clean_title = stripUrls(webEnrichment.clean_title);
        mergedAnalysis.title = mergedAnalysis.clean_title;
        dataSources.title = 'web';
      } else if (analysis.clean_title) {
        mergedAnalysis.clean_title = stripUrls(analysis.clean_title);
        mergedAnalysis.title = mergedAnalysis.clean_title;
        dataSources.title = 'image';
      }

      // Merge product description (prefer web for comprehensive description)
      // Keep description and condition separate:
      // - description: product info from web search
      // - seller_notes: condition assessment from image analysis (written in first person)
      if (webEnrichment.product_description) {
        mergedAnalysis.description = stripUrls(webEnrichment.product_description);
        mergedAnalysis.seller_notes = stripUrls(analysis.condition_details);
        dataSources.description = 'both';
      }
    } else {
      // No web enrichment - use condition_details as seller_notes
      mergedAnalysis.seller_notes = stripUrls(analysis.condition_details);
    }
    
    if (webEnrichment) {
      
      // Merge technical specs
      if (webEnrichment.technical_specs) {
        if (analysis.bike_details) {
          mergedAnalysis.bike_details = {
            ...analysis.bike_details,
            ...webEnrichment.technical_specs,
          };
          dataSources.specs = 'both';
        } else if (analysis.part_details) {
          mergedAnalysis.part_details = {
            ...analysis.part_details,
            ...webEnrichment.technical_specs,
          };
          dataSources.specs = 'both';
        }
      }
      
      // Use web-backed used-market pricing if available.
      const usedPricing = webEnrichment.used_market_pricing || webEnrichment.market_pricing;
      if (usedPricing && usedPricing.min_aud) {
        const minAud = Number(usedPricing.min_aud);
        const maxAud = Number(usedPricing.max_aud || usedPricing.target_aud || minAud * 1.2);
        const targetAud = Number(usedPricing.target_aud || Math.round((minAud + maxAud) / 2));
        mergedAnalysis.price_estimate = {
          min_aud: minAud,
          max_aud: maxAud,
          target_aud: targetAud,
          confidence: usedPricing.confidence,
          reasoning: stripUrls(
            usedPricing.basis ||
            `Used-market AUD pricing from ${usedPricing.sources?.join(', ') || 'web search'}`
          ),
        };
        mergedAnalysis.price_min_aud = minAud;
        mergedAnalysis.price_max_aud = maxAud;
        mergedAnalysis.price_reasoning = mergedAnalysis.price_estimate.reasoning;
        dataSources.pricing = 'web';
      }
      
      // Confirm model year from web
      if (webEnrichment.model_year_confirmed) {
        mergedAnalysis.model_year = webEnrichment.model_year_confirmed;
        dataSources.model_year = 'web';
      }
      
      // Add web enrichment data
      mergedAnalysis.web_enrichment = webEnrichment;
      mergedAnalysis.search_urls = searchUrls;
      mergedAnalysis.data_sources = dataSources;
      
      // Build structured metadata for database
      mergedAnalysis.structured_metadata = {
        confidence: analysis.field_confidence,
      };
      
      if (analysis.item_type === 'bike' && analysis.bike_details) {
        mergedAnalysis.structured_metadata.bike = {
          frame_size: analysis.bike_details.frame_size,
          frame_material: analysis.bike_details.frame_material,
          bike_type: analysis.bike_details.bike_type,
          groupset: analysis.bike_details.groupset,
          wheel_size: analysis.bike_details.wheel_size,
          suspension_type: analysis.bike_details.suspension_type,
          color_primary: analysis.bike_details.color_primary,
          color_secondary: analysis.bike_details.color_secondary,
        };
      } else if (analysis.item_type === 'part' && analysis.part_details) {
        mergedAnalysis.structured_metadata.part = {
          part_type_detail: analysis.part_details.part_type,
          compatibility_notes: analysis.part_details.compatibility,
          material: analysis.part_details.material,
          weight: analysis.part_details.weight,
        };
      } else if (analysis.item_type === 'apparel' && analysis.apparel_details) {
        mergedAnalysis.structured_metadata.apparel = {
          size: analysis.apparel_details.size,
          gender_fit: analysis.apparel_details.gender_fit,
          apparel_material: analysis.apparel_details.material,
        };
      }
      
      console.log('✅ [AI EDGE FUNCTION] Data merged successfully');
    }

    if (!mergedAnalysis.clean_title && analysis.clean_title) {
      mergedAnalysis.clean_title = stripUrls(analysis.clean_title);
      mergedAnalysis.title = mergedAnalysis.clean_title;
    }

    if (!mergedAnalysis.price_estimate && analysis.price_min_aud) {
      const minAud = Number(analysis.price_min_aud);
      const maxAud = Number(analysis.price_max_aud || minAud * 1.2);
      mergedAnalysis.price_estimate = {
        min_aud: minAud,
        max_aud: maxAud,
        target_aud: Math.round((minAud + maxAud) / 2),
        reasoning: stripUrls(analysis.price_reasoning) || 'Preliminary second-hand AUD estimate from image analysis.',
      };
      dataSources.pricing = dataSources.pricing || 'image';
    }

    if (Object.keys(dataSources).length > 0) {
      mergedAnalysis.data_sources = {
        ...(mergedAnalysis.data_sources || {}),
        ...dataSources,
      };
    }

    return new Response(
      JSON.stringify({
        success: true,
        analysis: mergedAnalysis,
        meta: {
          model: openaiData.model,
          tokensUsed: openaiData.usage?.total_tokens,
          webSearchPerformed: !!webEnrichment,
          webSearchAttempted: !!detectedSubject,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('❌ [AI EDGE FUNCTION] Error:', error);
    return new Response(
      JSON.stringify({
        error: 'AI analysis failed',
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
