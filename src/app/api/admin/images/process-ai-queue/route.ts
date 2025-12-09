/**
 * Admin API to Process AI Auto-Approve Queue
 * POST /api/admin/images/process-ai-queue - Process next batch from queue with AI auto-approval
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

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

    // Only allow admin (tom@lidgett.net) to trigger queue processing
    if (user.email !== 'tom@lidgett.net') {
      return NextResponse.json({ error: 'Forbidden - Admin only' }, { status: 403 });
    }

    console.log(`[ADMIN AI QUEUE] User ${user.email} triggered AI queue processing`);

    // Call the edge function
    const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-ai-auto-approve-queue`;
    const { data: { session } } = await supabase.auth.getSession();

    console.log(`[ADMIN AI QUEUE] Calling edge function...`);

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session?.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    console.log(`[ADMIN AI QUEUE] Edge function response status: ${response.status}`);

    const result = await response.json();

    if (!response.ok) {
      console.error('[ADMIN AI QUEUE] Edge function error:', result);
      return NextResponse.json(
        { 
          error: 'Queue processing failed',
          details: result.error || result.message,
        },
        { status: response.status }
      );
    }

    console.log(`[ADMIN AI QUEUE] Success: Processed ${result.data?.processed || 0} products`);
    console.log(`[ADMIN AI QUEUE] Total images approved: ${result.data?.totalImagesApproved || 0}`);

    return NextResponse.json({
      success: true,
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    console.error('[ADMIN AI QUEUE] Error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

