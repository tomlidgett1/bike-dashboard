/**
 * Online Products Screenshot Extraction API
 * POST /api/store/online-products/extract
 *
 * Accepts a screenshot image, uses OpenAI vision to identify cycling products,
 * and returns structured product data (name, brand, price, description, specs, category).
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const EXTRACT_PROMPT = `You are a cycling product expert. Analyse this screenshot from an online cycling store and extract every distinct product you can see.

For each product, return:
- name: The full product name/title exactly as shown
- brand: The brand name (infer from product name if not separately listed)
- price: The price in AUD as a number (null if not shown)
- category: One of: Bicycles, Parts, Apparel, Nutrition
- subcategory: The most specific subcategory that fits (e.g. Road, Mountain, Helmets, Jerseys, Wheels, etc.)
- description: 2-3 sentence product description based on what you know about this product type
- specs: Key specifications as a short bullet list (use your cycling knowledge to fill in typical specs for this product)

Return a JSON object with a "products" array. Extract ALL visible products — even if partially visible.
If you cannot identify any cycling products in the image, return { "products": [] }.

Example format:
{
  "products": [
    {
      "name": "Shimano 105 R7100 Di2 Groupset",
      "brand": "Shimano",
      "price": 1299,
      "category": "Parts",
      "subcategory": "Drivetrain",
      "description": "...",
      "specs": "• 12-speed electronic shifting\n• ..."
    }
  ]
}`;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    // Only bicycle stores can use this feature
    const { data: profile } = await supabase
      .from('users')
      .select('account_type, bicycle_store')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;

    if (!imageFile) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    if (!imageFile.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
    }

    if (imageFile.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image must be under 20MB' }, { status: 400 });
    }

    // Convert to base64
    const buffer = await imageFile.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mimeType = imageFile.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

    const response = await openai.chat.completions.create({
      model: 'gpt-4.1',
      max_tokens: 4000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
                detail: 'high',
              },
            },
            {
              type: 'text',
              text: EXTRACT_PROMPT,
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'AI returned no content' }, { status: 500 });
    }

    let parsed: { products: unknown[] };
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
    }

    const products = Array.isArray(parsed.products) ? parsed.products : [];

    return NextResponse.json({ success: true, products });
  } catch (err) {
    console.error('[online-products/extract]', err);
    return NextResponse.json({ error: 'Extraction failed' }, { status: 500 });
  }
}
