/**
 * AI Image Discovery Status API
 * GET /api/images/discovery-status?canonicalProductId={id}
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const canonicalProductId = searchParams.get('canonicalProductId');

    if (!canonicalProductId) {
      return NextResponse.json(
        { error: 'Canonical product ID required' },
        { status: 400 }
      );
    }

    // Get queue status
    const { data: queueItem, error: queueError } = await supabase
      .from('ai_image_discovery_queue')
      .select('*')
      .eq('canonical_product_id', canonicalProductId)
      .single();

    if (queueError && queueError.code !== 'PGRST116') {
      // PGRST116 = no rows found, which is ok
      console.error('[DISCOVERY STATUS] Error fetching queue item:', queueError);
    }

    // Get actual images count
    const { data: images, error: imagesError } = await supabase
      .from('product_images')
      .select('id, is_primary')
      .eq('canonical_product_id', canonicalProductId);

    const imageCount = images?.length || 0;
    const hasPrimaryImage = images?.some(img => img.is_primary) || false;

    return NextResponse.json({
      success: true,
      data: {
        canonicalProductId,
        hasImages: imageCount > 0,
        imageCount,
        hasPrimaryImage,
        queueStatus: queueItem ? {
          status: queueItem.status,
          attempts: queueItem.attempts,
          imagesFound: queueItem.images_found,
          imagesDownloaded: queueItem.images_downloaded,
          errorMessage: queueItem.error_message,
          createdAt: queueItem.created_at,
          completedAt: queueItem.completed_at,
        } : null,
      },
    });
  } catch (error) {
    console.error('[DISCOVERY STATUS] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to get status';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}












