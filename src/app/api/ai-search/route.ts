// ============================================================
// AI Search API Route
// Forwards search queries to Supabase Edge Function
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const startTime = performance.now();
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');

    // Validate query
    if (!query || query.trim().length < 3) {
      return NextResponse.json({
        success: false,
        error: 'Query must be at least 3 characters',
      }, { status: 400 });
    }

    console.log(`🤖 [AI SEARCH API] Query: "${query}"`);

    // Get Supabase client (handles auth automatically)
    const supabase = await createClient();

    // Get auth session (optional - AI search works without auth)
    const { data: { session } } = await supabase.auth.getSession();

    // Call the Supabase Edge Function
    const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/search-ai-expert`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': session?.access_token 
            ? `Bearer ${session.access_token}` 
            : `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [AI SEARCH API] Edge function error:', response.status, errorText);
        throw new Error(`Edge function failed: ${response.status}`);
      }

      const data = await response.json();
      
      const duration = performance.now() - startTime;
      console.log(`✅ [AI SEARCH API] Completed in ${duration.toFixed(0)}ms`);

      return NextResponse.json(data);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if ((fetchError as Error).name === 'AbortError') {
        console.error('❌ [AI SEARCH API] Request timeout after 30s');
        return NextResponse.json({
          success: false,
          error: 'Request timeout',
          details: 'AI search took too long to respond',
        }, { status: 504 });
      }
      
      throw fetchError;
    }
  } catch (error) {
    console.error('❌ [AI SEARCH API] Error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'AI search failed',
      details: (error as Error).message,
    }, { status: 500 });
  }
}

