// ============================================================
// Generate Description API Route
// Forwards description generation requests to Supabase Edge Function
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const startTime = performance.now();
  
  try {
    const body = await request.json();

    // Validate required field
    if (!body.title || body.title.trim().length < 2) {
      return NextResponse.json({
        success: false,
        error: 'Title must be at least 2 characters',
      }, { status: 400 });
    }

    console.log(`🔍 [GEN DESC API] Request for: "${body.title}"`);
    if (body.brand) console.log(`   Brand: ${body.brand}`);
    if (body.model) console.log(`   Model: ${body.model}`);

    // Get Supabase client
    const supabase = await createClient();

    // Get auth session
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required',
      }, { status: 401 });
    }

    // Call the Supabase Edge Function
    const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-listing-description`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [GEN DESC API] Edge function error:', response.status, errorText);
        throw new Error(`Edge function failed: ${response.status}`);
      }

      const data = await response.json();
      
      const duration = performance.now() - startTime;
      console.log(`✅ [GEN DESC API] Completed in ${duration.toFixed(0)}ms`);

      return NextResponse.json(data);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if ((fetchError as Error).name === 'AbortError') {
        console.error('❌ [GEN DESC API] Request timeout after 30s');
        return NextResponse.json({
          success: false,
          error: 'Request timeout',
          details: 'Description generation took too long',
        }, { status: 504 });
      }
      
      throw fetchError;
    }
  } catch (error) {
    console.error('❌ [GEN DESC API] Error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to generate description',
      details: (error as Error).message,
    }, { status: 500 });
  }
}

