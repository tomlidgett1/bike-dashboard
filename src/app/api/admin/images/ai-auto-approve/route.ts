import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * AI Auto-Approve Images API Route
 * Proxies requests to the Supabase Edge Function that uses GPT-4o Vision
 * to intelligently select and approve the best product images
 */
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

    const { canonicalProductId } = await request.json();

    if (!canonicalProductId) {
      return NextResponse.json(
        { error: 'canonical_product_id required' },
        { status: 400 }
      );
    }

    console.log(`[AI AUTO-APPROVE API] User ${user.id} triggered AI auto-approve for: ${canonicalProductId}`);

    // Verify canonical product exists
    const { data: canonical, error: canonicalError } = await supabase
      .from('canonical_products')
      .select('*')
      .eq('id', canonicalProductId)
      .single();

    if (canonicalError || !canonical) {
      console.error('[AI AUTO-APPROVE API] Product not found:', canonicalError);
      return NextResponse.json({ error: 'Canonical product not found' }, { status: 404 });
    }

    console.log('[AI AUTO-APPROVE API] Product:', canonical.normalized_name);

    // Get user session for edge function auth
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'No active session' }, { status: 401 });
    }

    // Call the Supabase Edge Function
    const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-auto-approve-images`;
    
    console.log(`[AI AUTO-APPROVE API] Calling edge function...`);

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ canonicalProductId }),
    });

    console.log(`[AI AUTO-APPROVE API] Edge function response status: ${response.status}`);

    const result = await response.json();

    if (!response.ok) {
      console.error('[AI AUTO-APPROVE API] Edge function error:', result);
      return NextResponse.json(
        { 
          success: false,
          error: result.error || 'Failed to auto-approve images',
          message: result.details || result.message,
        },
        { status: response.status }
      );
    }

    console.log(`[AI AUTO-APPROVE API] Success: ${result.data?.imagesSaved || 0} images saved`);
    console.log(`[AI AUTO-APPROVE API] AI Reasoning: ${result.data?.aiReasoning}`);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[AI AUTO-APPROVE API] Unexpected error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

