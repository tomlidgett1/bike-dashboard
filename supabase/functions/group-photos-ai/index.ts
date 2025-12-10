// ============================================================
// AI Photo Grouping - Supabase Edge Function
// Groups photos by product using OpenAI Vision API
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

interface PhotoGroup {
  id: string;
  photoIndexes: number[];
  suggestedName: string;
  confidence: number;
}

interface GroupingRequest {
  imageUrls: string[];
}

interface GroupingResponse {
  groups: PhotoGroup[];
  totalPhotos: number;
}

// ============================================================
// Main Handler
// ============================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🤖 [PHOTO GROUPING] === Request started ===');

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
      console.error('❌ [PHOTO GROUPING] Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('✓ [PHOTO GROUPING] User authenticated:', user.id);

    // Parse request body
    const body: GroupingRequest = await req.json();
    const { imageUrls } = body;

    if (!imageUrls || imageUrls.length === 0) {
      return new Response(JSON.stringify({ error: 'No images provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`🖼️ [PHOTO GROUPING] Processing ${imageUrls.length} images...`);

    // Build prompt for OpenAI
    const systemPrompt = `You are an expert at analyzing cycling product photos and grouping them by individual products.

Your task:
- Analyse all the provided images
- Group photos that show the SAME product together
- Provide a suggested product name for each group
- Assign a confidence score (0-100) for each grouping

Rules:
- Photos of the same bike from different angles should be in one group
- Photos of different bikes should be in separate groups
- Parts/components photographed together should be grouped separately from bikes
- If a photo shows multiple distinct products, assign it to the most prominent product
- Use visual cues: frame design, color, components, branding, background

Output format (JSON only, no markdown):
{
  "groups": [
    {
      "id": "group-1",
      "photoIndexes": [0, 1, 2],
      "suggestedName": "Trek Mountain Bike",
      "confidence": 95
    }
  ]
}`;

    // Build image content for OpenAI Vision API
    const imageContent = imageUrls.map((url, index) => ({
      type: "image_url" as const,
      image_url: {
        url: url,
        detail: "low" as const, // Use low detail for cost efficiency
      }
    }));

    const userPrompt = `Analyse these ${imageUrls.length} photos and group them by product. 
    
Images are numbered 0 to ${imageUrls.length - 1} in order.

Return JSON with groups, where each group has:
- id: unique identifier (group-1, group-2, etc.)
- photoIndexes: array of image indexes belonging to this product
- suggestedName: brief product name (e.g., "Red Mountain Bike", "Shimano Derailleur")
- confidence: how confident you are this grouping is correct (0-100)

If you can't confidently group photos, default to one photo per group.`;

    // Call OpenAI API
    console.log('🤖 [PHOTO GROUPING] Calling OpenAI Vision API...');

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
            content: systemPrompt,
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
      console.error('❌ [PHOTO GROUPING] OpenAI API error:', errorText);
      throw new Error(`OpenAI API error: ${openaiResponse.status}`);
    }

    const openaiData = await openaiResponse.json();
    console.log(`✅ [PHOTO GROUPING] OpenAI response received (${openaiData.usage?.total_tokens || '?'} tokens)`);

    // Parse AI response
    const content = openaiData.choices[0].message.content;
    const parsed = JSON.parse(content);
    const groups: PhotoGroup[] = parsed.groups || [];

    console.log(`✅ [PHOTO GROUPING] Grouped ${imageUrls.length} photos into ${groups.length} products`);

    // Validate grouping (ensure all photos are assigned)
    const assignedIndexes = new Set<number>();
    groups.forEach(group => {
      group.photoIndexes.forEach(idx => assignedIndexes.add(idx));
    });

    // If any photos are missing, create singleton groups for them
    const missingIndexes: number[] = [];
    for (let i = 0; i < imageUrls.length; i++) {
      if (!assignedIndexes.has(i)) {
        missingIndexes.push(i);
      }
    }

    if (missingIndexes.length > 0) {
      console.log(`⚠️ [PHOTO GROUPING] ${missingIndexes.length} unassigned photos, creating singleton groups`);
      missingIndexes.forEach((idx, i) => {
        groups.push({
          id: `group-${groups.length + 1}`,
          photoIndexes: [idx],
          suggestedName: `Product ${groups.length + 1}`,
          confidence: 50,
        });
      });
    }

    const response: GroupingResponse = {
      groups,
      totalPhotos: imageUrls.length,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ [PHOTO GROUPING] Error:', error);
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

