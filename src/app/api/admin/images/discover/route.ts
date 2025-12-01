/**
 * Admin Image Discovery API
 * POST /api/admin/images/discover - Manually trigger AI image discovery for a product
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

    console.log(`[ADMIN IMAGE DISCOVERY] User ${user.id} triggered discovery for: ${canonicalProductId}`);

    // Verify canonical product exists and fetch ALL data including UPC
    const { data: canonical, error: canonicalError } = await supabase
      .from('canonical_products')
      .select('*')
      .eq('id', canonicalProductId)
      .single();

    if (canonicalError || !canonical) {
      console.error('[ADMIN IMAGE DISCOVERY] Product not found:', canonicalError);
      return NextResponse.json({ error: 'Canonical product not found' }, { status: 404 });
    }

    console.log('[ADMIN IMAGE DISCOVERY] Fetched product data:', {
      id: canonical.id,
      name: canonical.normalized_name,
      upc: canonical.upc,
      upcType: typeof canonical.upc,
      upcLength: canonical.upc?.length,
      category: canonical.category,
      manufacturer: canonical.manufacturer,
    });

    // Skip queue entirely - call discover-product-images directly for single product
    // This prevents batch processing of other queued items
    
    console.log('[ADMIN IMAGE DISCOVERY] Bypassing queue, calling discover-product-images directly');
    
    // Call discover-product-images directly (not the queue processor)
    // This ensures we ONLY process the specific product clicked, not all queued items
    const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/discover-product-images`;
    const { data: { session } } = await supabase.auth.getSession();

    console.log(`[ADMIN IMAGE DISCOVERY] Calling discover-product-images directly for: ${canonicalProductId}`);
    console.log(`[ADMIN IMAGE DISCOVERY] Product: ${canonical.normalized_name}`);
    console.log(`[ADMIN IMAGE DISCOVERY] UPC: ${canonical.upc || 'None'}`);
    console.log(`[ADMIN IMAGE DISCOVERY] Has session: ${!!session}`);

    try {
      // Call the edge function and wait for response
      const edgeFunctionResponse = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ canonicalProductId }),
      });

      console.log(`[ADMIN IMAGE DISCOVERY] Edge function response status: ${edgeFunctionResponse.status}`);
      
      if (!edgeFunctionResponse.ok) {
        const errorText = await edgeFunctionResponse.text();
        console.error('[ADMIN IMAGE DISCOVERY] Edge function error:', errorText);
        return NextResponse.json({ 
          error: 'Discovery failed', 
          details: errorText 
        }, { status: 500 });
      } else {
        const edgeResult = await edgeFunctionResponse.json();
        console.log('[ADMIN IMAGE DISCOVERY] Edge function result:', edgeResult);
        
        return NextResponse.json({
          success: true,
          message: edgeResult.message || 'Image discovery completed',
          canonicalProductId,
          data: edgeResult.data,
        });
      }
    } catch (fetchError) {
      console.error('[ADMIN IMAGE DISCOVERY] Error calling edge function:', fetchError);
      return NextResponse.json({ 
        error: 'Failed to call edge function',
        details: fetchError instanceof Error ? fetchError.message : 'Unknown error'
      }, { status: 500 });
    }
  } catch (error) {
    console.error('[ADMIN IMAGE DISCOVERY] Error:', error);
    const message = error instanceof Error ? error.message : 'Image discovery failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

