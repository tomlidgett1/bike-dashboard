/**
 * Tracking API Endpoint
 * 
 * Receives batched user interaction events from the client and stores them
 * in the database. Updates product scores in real-time.
 * 
 * POST /api/tracking
 * Body: { interactions: Array<QueuedInteraction> }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

// ============================================================
// Types
// ============================================================

const VALID_INTERACTION_TYPES = new Set([
  'view', 'click', 'search', 'add_to_cart', 'like', 'unlike',
  'impression', 'gallery_view', 'photo_zoom', 'share',
  'store_view', 'category_view', 'filter', 'sort', 'location_change', 'scroll_depth',
  'carousel_impression', 'carousel_click', 'carousel_dismiss',
  'enquiry', 'message', 'offer', 'buy_intent',
  'dismiss',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface QueuedInteraction {
  sessionId: string;
  anonymousId?: string;
  userId?: string;
  productId?: string;
  interactionType: string;
  dwellTimeSeconds?: number;
  metadata?: Record<string, any>;
  timestamp: string;
}

interface TrackingRequest {
  interactions: QueuedInteraction[];
}

// ============================================================
// Rate Limiting (In-Memory)
// ============================================================

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 100; // 100 requests per minute per IP

function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(identifier, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }

  record.count++;
  return true;
}

// Clean up rate limit map every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitMap.entries()) {
      if (now > record.resetAt) {
        rateLimitMap.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

// ============================================================
// POST Handler
// ============================================================

export async function POST(request: NextRequest) {
  try {
    console.log('[Tracking API] POST request received at', new Date().toISOString());
    
    // Rate limiting by IP
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    if (!checkRateLimit(ip)) {
      console.log('[Tracking API] Rate limit exceeded for IP:', ip);
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    // Parse request body
    console.log('[Tracking API] Parsing request body...');
    const body: TrackingRequest = await request.json();
    console.log('[Tracking API] Received', body.interactions?.length || 0, 'interactions');
    
    if (!body.interactions || !Array.isArray(body.interactions)) {
      return NextResponse.json(
        { error: 'Invalid request: interactions array required' },
        { status: 400 }
      );
    }

    if (body.interactions.length === 0) {
      return NextResponse.json({ success: true, processed: 0 });
    }

    if (body.interactions.length > 100) {
      return NextResponse.json(
        { error: 'Batch too large: maximum 100 interactions per request' },
        { status: 400 }
      );
    }

    // Process asynchronously without blocking the response
    const interactionCount = body.interactions.length;
    processInteractionsAsync(body.interactions).catch(error => {
      console.error('[Tracking API] Async processing error:', error);
    });

    // Return immediately with 202 Accepted
    console.log('[Tracking API] Returning 202 Accepted (async processing)');
    return NextResponse.json(
      { success: true, processed: interactionCount, status: 'accepted' },
      { 
        status: 202,
        headers: {
          'Cache-Control': 'no-store',
        }
      }
    );

  } catch (error) {
    console.error('[Tracking API] Unexpected error:', error);
    console.error('[Tracking API] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Async processing function (non-blocking)
async function processInteractionsAsync(interactions: QueuedInteraction[]) {
  try {
    // Initialize Supabase client
    console.log('[Tracking API] Initializing Supabase client...');
    const supabase = await createClient();

    // Get authenticated user (if any)
    console.log('[Tracking API] Getting user...');
    const { data: { user } } = await supabase.auth.getUser();
    console.log('[Tracking API] User:', user?.id || 'Anonymous');
    
    // Process interactions
    console.log('[Tracking API] Processing interactions...');
    const validInteractions: any[] = [];
    const productScoreUpdates: Map<string, { type: string; count: number }> = new Map();

    for (const interaction of interactions) {
      // Validate interaction
      if (!interaction.sessionId || !UUID_RE.test(interaction.sessionId)) {
        continue; // Skip invalid interactions
      }

      // Validate interaction type
      if (!VALID_INTERACTION_TYPES.has(interaction.interactionType)) {
        continue;
      }

      // Only trust the authenticated user ID — never a client-supplied one.
      const userId = user?.id || null;

      const anonymousId =
        interaction.anonymousId && UUID_RE.test(interaction.anonymousId)
          ? interaction.anonymousId
          : null;

      // Guard against silly timestamps (clock skew / replayed offline queues)
      const eventAt = new Date(interaction.timestamp);
      const ageMs = Date.now() - eventAt.getTime();
      const createdAt =
        Number.isFinite(eventAt.getTime()) && ageMs > -60_000 && ageMs < 7 * 24 * 3600_000
          ? eventAt.toISOString()
          : new Date().toISOString();

      // Build interaction record
      const interactionRecord = {
        user_id: userId,
        anonymous_id: anonymousId,
        session_id: interaction.sessionId,
        product_id: interaction.productId || null,
        interaction_type: interaction.interactionType,
        dwell_time_seconds: interaction.dwellTimeSeconds || 0,
        metadata: interaction.metadata || {},
        created_at: createdAt,
      };

      validInteractions.push(interactionRecord);

      // Track product score updates
      if (interaction.productId && interaction.interactionType !== 'search') {
        const key = `${interaction.productId}:${interaction.interactionType}`;
        const current = productScoreUpdates.get(key);
        if (current) {
          current.count++;
        } else {
          productScoreUpdates.set(key, { type: interaction.interactionType, count: 1 });
        }
      }
    }

    if (validInteractions.length === 0) {
      console.log('[Tracking API] No valid interactions to process');
      return;
    }

    console.log('[Tracking API] Inserting', validInteractions.length, 'interactions...');
    console.log('[Tracking API] Sample interaction:', JSON.stringify({
      session_id: validInteractions[0]?.session_id,
      product_id: validInteractions[0]?.product_id,
      interaction_type: validInteractions[0]?.interaction_type,
      user_id: validInteractions[0]?.user_id,
    }, null, 2));
    
    // Insert with the service-role client: anonymous events have a NULL
    // user_id, which the user-scoped RLS insert policy rejects.
    const serviceClient = createServiceRoleClient();
    const { data: insertedData, error: insertError } = await serviceClient
      .from('user_interactions')
      .insert(validInteractions)
      .select();

    if (insertError) {
      console.error('[Tracking API] ❌ INSERT FAILED');
      console.error('[Tracking API] Error code:', insertError.code);
      console.error('[Tracking API] Error message:', insertError.message);
      console.error('[Tracking API] Error details:', insertError.details);
      console.error('[Tracking API] Error hint:', insertError.hint);
      console.error('[Tracking API] Failed interaction data:', JSON.stringify(validInteractions[0], null, 2));
      return; // Don't throw - just log and return
    }
    
    console.log('[Tracking API] ✅ Insert successful, inserted', insertedData?.length || 0, 'rows');

    // Update product scores atomically
    console.log('[Tracking API] Updating product scores for', productScoreUpdates.size, 'products...');
    for (const [key, { type, count }] of productScoreUpdates.entries()) {
      const productId = key.split(':')[0];
      
      try {
        // Use the increment_product_score function we created in migration
        const { error: scoreError } = await supabase.rpc('increment_product_score', {
          p_product_id: productId,
          p_interaction_type: type,
        });

        if (scoreError) {
          console.error('[Tracking API] Failed to update product score:', {
            productId,
            type,
            error: scoreError.message,
            code: scoreError.code,
          });
          // Don't fail the request if score update fails
        } else {
          console.log('[Tracking API] Score updated for product:', productId);
        }
      } catch (error) {
        console.error('[Tracking API] Exception updating score:', error);
        // Continue anyway
      }
    }

    // Update user preferences if user is authenticated (async, non-blocking)
    if (user?.id) {
      console.log('[Tracking API] Triggering user preferences update for:', user.id);
      // Don't await this - let it run in background
      (async () => {
        try {
          const { error } = await supabase.rpc('update_user_preferences_from_interactions', {
            p_user_id: user.id,
          });
          if (error) {
            console.error('[Tracking API] Failed to update user preferences:', error);
          } else {
            console.log('[Tracking API] User preferences updated successfully');
          }
        } catch (err) {
          console.error('[Tracking API] Exception in preferences update:', err);
        }
      })();
    }

    console.log('[Tracking API] Async processing completed successfully');
    return;

  } catch (error) {
    console.error('[Tracking API] Async processing error:', error);
    console.error('[Tracking API] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    // Don't throw - this is async processing
    return;
  }
}

// ============================================================
// GET Handler (Health Check)
// ============================================================

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'tracking-api',
    version: '1.0.0',
  });
}

