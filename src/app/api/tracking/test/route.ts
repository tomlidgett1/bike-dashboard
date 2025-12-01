/**
 * Test Tracking API - Simplified version for debugging
 * POST /api/tracking/test
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    console.log('[Test Tracking] Starting...');
    
    // Parse body
    const body = await request.json();
    console.log('[Test Tracking] Received body:', JSON.stringify(body, null, 2));

    if (!body.interactions || !Array.isArray(body.interactions)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Initialize Supabase
    console.log('[Test Tracking] Creating Supabase client...');
    const supabase = await createClient();
    
    // Get user (if any)
    const { data: { user } } = await supabase.auth.getUser();
    console.log('[Test Tracking] User:', user?.id || 'Anonymous');

    // Process first interaction only for testing
    const interaction = body.interactions[0];
    console.log('[Test Tracking] Processing interaction:', interaction);

    const interactionRecord = {
      user_id: user?.id || null,
      session_id: interaction.sessionId,
      product_id: interaction.productId || null,
      interaction_type: interaction.interactionType,
      dwell_time_seconds: interaction.dwellTimeSeconds || 0,
      metadata: interaction.metadata || {},
      created_at: interaction.timestamp,
    };

    console.log('[Test Tracking] Prepared record:', JSON.stringify(interactionRecord, null, 2));

    // Try to insert
    console.log('[Test Tracking] Attempting insert...');
    const { data, error: insertError } = await supabase
      .from('user_interactions')
      .insert(interactionRecord)
      .select();

    if (insertError) {
      console.error('[Test Tracking] Insert error:', {
        message: insertError.message,
        code: insertError.code,
        details: insertError.details,
        hint: insertError.hint,
      });
      
      return NextResponse.json({
        error: 'Insert failed',
        details: {
          message: insertError.message,
          code: insertError.code,
          hint: insertError.hint,
          record: interactionRecord,
        }
      }, { status: 500 });
    }

    console.log('[Test Tracking] Insert successful:', data);

    // Try increment function if product_id exists
    if (interaction.productId && interaction.interactionType !== 'search') {
      console.log('[Test Tracking] Calling increment_product_score...');
      const { error: scoreError } = await supabase.rpc('increment_product_score', {
        p_product_id: interaction.productId,
        p_interaction_type: interaction.interactionType,
      });

      if (scoreError) {
        console.error('[Test Tracking] Score update error:', scoreError);
        // Don't fail the request
      } else {
        console.log('[Test Tracking] Score updated successfully');
      }
    }

    return NextResponse.json({
      success: true,
      processed: 1,
      inserted: data,
    });

  } catch (error) {
    console.error('[Test Tracking] Unexpected error:', error);
    console.error('[Test Tracking] Error details:', {
      message: error instanceof Error ? error.message : 'Unknown',
      stack: error instanceof Error ? error.stack : 'No stack',
    });
    
    return NextResponse.json({
      error: 'Unexpected error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'test-tracking-api',
    message: 'Use POST to send test interactions',
  });
}

