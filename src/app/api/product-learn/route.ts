// ============================================================
// Product Learn API Route
// Forwards product research requests to Supabase Edge Function
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const startTime = performance.now();
  
  try {
    const body = await request.json();

    // Validate required field
    if (!body.productName || body.productName.trim().length < 2) {
      return NextResponse.json({
        success: false,
        error: 'Product name must be at least 2 characters',
      }, { status: 400 });
    }

    console.log(`🔍 [PRODUCT LEARN API] Research request for: "${body.productName}"`);
    if (body.brand) console.log(`   Brand: ${body.brand}`);
    if (body.model) console.log(`   Model: ${body.model}`);

    // Get Supabase client (handles auth automatically)
    const supabase = await createClient();

    // Get auth session (optional - product learn works without auth)
    const { data: { session } } = await supabase.auth.getSession();

    // Call the Supabase Edge Function
    const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/product-learn-ai`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s timeout for web search

    try {
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': session?.access_token 
            ? `Bearer ${session.access_token}` 
            : `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [PRODUCT LEARN API] Edge function error:', response.status, errorText);
        throw new Error(`Edge function failed: ${response.status}`);
      }

      const data = await response.json();
      
      const duration = performance.now() - startTime;
      console.log(`✅ [PRODUCT LEARN API] Completed in ${duration.toFixed(0)}ms`);

      return NextResponse.json(data);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if ((fetchError as Error).name === 'AbortError') {
        console.error('❌ [PRODUCT LEARN API] Request timeout after 45s');
        return NextResponse.json({
          success: false,
          error: 'Request timeout',
          details: 'Product research took too long to respond',
        }, { status: 504 });
      }
      
      throw fetchError;
    }
  } catch (error) {
    console.error('❌ [PRODUCT LEARN API] Error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Product research failed',
      details: (error as Error).message,
    }, { status: 500 });
  }
}
