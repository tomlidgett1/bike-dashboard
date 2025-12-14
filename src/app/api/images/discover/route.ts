/**
 * AI Image Discovery API
 * POST /api/images/discover - Manually trigger AI image discovery
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    const body = await request.json();
    const { canonicalProductId } = body;

    if (!canonicalProductId) {
      return NextResponse.json(
        { error: 'Canonical product ID required' },
        { status: 400 }
      );
    }

    console.log(`[AI DISCOVER API] User ${user.id} triggered discovery for: ${canonicalProductId}`);

    // Verify canonical product exists
    const { data: canonical, error: canonicalError } = await supabase
      .from('canonical_products')
      .select('id, normalized_name')
      .eq('id', canonicalProductId)
      .single();

    if (canonicalError || !canonical) {
      return NextResponse.json({ error: 'Canonical product not found' }, { status: 404 });
    }

    // Check if already has images
    const { data: existingImages } = await supabase
      .from('product_images')
      .select('id')
      .eq('canonical_product_id', canonicalProductId)
      .limit(1);

    if (existingImages && existingImages.length > 0) {
      return NextResponse.json({
        message: 'Product already has images',
        skipped: true,
      });
    }

    // Call the edge function
    const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/discover-product-images`;
    const { data: { session } } = await supabase.auth.getSession();

    console.log(`[AI DISCOVER API] Calling edge function...`);

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session?.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ canonicalProductId }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[AI DISCOVER API] Edge function failed:`, error);
      return NextResponse.json(
        { error: 'AI discovery failed', details: error },
        { status: 500 }
      );
    }

    const result = await response.json();
    console.log(`[AI DISCOVER API] Success:`, result);

    return NextResponse.json({
      success: true,
      message: `Discovered ${result.data?.imagesDownloaded || 0} images`,
      data: result.data,
    });
  } catch (error) {
    console.error('[AI DISCOVER API] Error:', error);
    const message = error instanceof Error ? error.message : 'AI discovery failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}














