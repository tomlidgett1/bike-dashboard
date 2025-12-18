/**
 * Admin Image Curation API
 * POST /api/admin/images/curate - Trigger AI image curation for a canonical product
 * Uses GPT-4o Vision to select up to 5 diverse angle images
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

    console.log(`[ADMIN IMAGE CURATE] User ${user.id} triggered curation for: ${canonicalProductId}`);

    // Verify canonical product exists
    const { data: canonical, error: canonicalError } = await supabase
      .from('canonical_products')
      .select('id, normalized_name, upc, category, manufacturer, marketplace_category')
      .eq('id', canonicalProductId)
      .single();

    if (canonicalError || !canonical) {
      console.error('[ADMIN IMAGE CURATE] Product not found:', canonicalError);
      return NextResponse.json({ error: 'Canonical product not found' }, { status: 404 });
    }

    console.log('[ADMIN IMAGE CURATE] Fetched product data:', {
      id: canonical.id,
      name: canonical.normalized_name,
      upc: canonical.upc,
      category: canonical.marketplace_category || canonical.category,
    });

    // Call curate-canonical-images edge function directly
    const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/curate-canonical-images`;
    const { data: { session } } = await supabase.auth.getSession();

    console.log(`[ADMIN IMAGE CURATE] Calling curate-canonical-images for: ${canonicalProductId}`);
    console.log(`[ADMIN IMAGE CURATE] Product: ${canonical.normalized_name}`);

    try {
      const edgeFunctionResponse = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ canonicalProductId }),
      });

      console.log(`[ADMIN IMAGE CURATE] Edge function response status: ${edgeFunctionResponse.status}`);

      if (!edgeFunctionResponse.ok) {
        const errorText = await edgeFunctionResponse.text();
        console.error('[ADMIN IMAGE CURATE] Edge function error:', errorText);
        return NextResponse.json(
          {
            success: false,
            error: 'Curation failed',
            details: errorText,
          },
          { status: 500 }
        );
      }

      const edgeResult = await edgeFunctionResponse.json();
      console.log('[ADMIN IMAGE CURATE] Edge function result:', edgeResult);

      return NextResponse.json({
        success: edgeResult.success,
        message: edgeResult.success
          ? `Successfully curated ${edgeResult.data?.imagesSelected || 0} images`
          : edgeResult.error || 'Curation failed',
        canonicalProductId,
        data: edgeResult.data,
      });
    } catch (fetchError) {
      console.error('[ADMIN IMAGE CURATE] Error calling edge function:', fetchError);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to call edge function',
          details: fetchError instanceof Error ? fetchError.message : 'Unknown error',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[ADMIN IMAGE CURATE] Error:', error);
    const message = error instanceof Error ? error.message : 'Image curation failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}


