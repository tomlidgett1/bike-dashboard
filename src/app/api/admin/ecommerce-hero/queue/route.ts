/**
 * E-Commerce Hero Queue API
 * 
 * GET /api/admin/ecommerce-hero/queue - Get queue status
 * POST /api/admin/ecommerce-hero/queue - Add image to processing queue
 * DELETE /api/admin/ecommerce-hero/queue - Cancel pending queue item
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET - Fetch queue items with status
 */
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
    const status = searchParams.get('status'); // 'pending', 'processing', 'completed', 'failed', or null for all
    const productId = searchParams.get('productId'); // Filter by specific product
    const limit = parseInt(searchParams.get('limit') || '50');

    let query = supabase
      .from('ecommerce_hero_queue')
      .select(`
        id,
        product_id,
        source_image_url,
        status,
        result_cloudinary_url,
        result_card_url,
        result_thumbnail_url,
        error_message,
        retry_count,
        processing_started_at,
        processing_completed_at,
        created_at,
        created_by,
        products:product_id (
          id,
          description,
          display_name,
          brand,
          model,
          cached_image_url
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq('status', status);
    }
    
    if (productId) {
      query = query.eq('product_id', productId);
    }

    const { data: queueItems, error } = await query;

    if (error) {
      console.error('[ECOMMERCE-HERO QUEUE] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get counts by status
    const { data: statusCounts } = await supabase
      .from('ecommerce_hero_queue')
      .select('status')
      .then(result => {
        if (result.error) return { data: null };
        const counts = {
          pending: 0,
          processing: 0,
          completed: 0,
          failed: 0,
          total: result.data?.length || 0,
        };
        for (const item of result.data || []) {
          const s = item.status as keyof typeof counts;
          if (s in counts && s !== 'total') {
            counts[s]++;
          }
        }
        return { data: counts };
      });

    // Transform items
    const items = (queueItems || []).map(item => ({
      id: item.id,
      productId: item.product_id,
      sourceImageUrl: item.source_image_url,
      status: item.status,
      resultCardUrl: item.result_card_url,
      resultThumbnailUrl: item.result_thumbnail_url,
      resultCloudinaryUrl: item.result_cloudinary_url,
      errorMessage: item.error_message,
      retryCount: item.retry_count,
      processingStartedAt: item.processing_started_at,
      processingCompletedAt: item.processing_completed_at,
      createdAt: item.created_at,
      createdBy: item.created_by,
      product: item.products ? {
        id: (item.products as any).id,
        name: (item.products as any).display_name || (item.products as any).description,
        brand: (item.products as any).brand,
        model: (item.products as any).model,
        cachedImageUrl: (item.products as any).cached_image_url,
      } : null,
    }));

    return NextResponse.json({
      success: true,
      data: items,
      counts: statusCounts,
    });
  } catch (error) {
    console.error('[ECOMMERCE-HERO QUEUE] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch queue' },
      { status: 500 }
    );
  }
}

/**
 * POST - Add image to processing queue
 * Also preserves all JSONB images into product_images to prevent them from being lost
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

    const body = await request.json();
    const { productId, sourceImageUrl, sourceImageId } = body;

    if (!productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 });
    }

    if (!sourceImageUrl) {
      return NextResponse.json({ error: 'sourceImageUrl is required' }, { status: 400 });
    }

    console.log(`[ECOMMERCE-HERO QUEUE] Adding to queue:`, {
      productId,
      sourceImageUrl: sourceImageUrl.substring(0, 50) + '...',
      sourceImageId,
      userId: user.id,
    });

    // Verify product exists and get its JSONB images
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, description, display_name, images')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // IMPORTANT: Preserve all JSONB images into product_images BEFORE processing
    // This prevents the sync trigger from wiping them out after AI processing
    if (product.images && Array.isArray(product.images) && product.images.length > 0) {
      console.log(`[ECOMMERCE-HERO QUEUE] Preserving ${product.images.length} JSONB images...`);
      
      // Get existing product_images to check for duplicates
      const { data: existingImages } = await supabase
        .from('product_images')
        .select('cloudinary_url, card_url, external_url')
        .eq('product_id', productId);
      
      const existingUrls = new Set<string>();
      for (const img of existingImages || []) {
        if (img.cloudinary_url) existingUrls.add(img.cloudinary_url);
        if (img.card_url) existingUrls.add(img.card_url);
        if (img.external_url) existingUrls.add(img.external_url);
      }
      
      // Insert JSONB images that don't already exist in product_images
      let preservedCount = 0;
      for (let i = 0; i < product.images.length; i++) {
        const jsonbImg = product.images[i] as {
          url?: string;
          cardUrl?: string;
          thumbnailUrl?: string;
          galleryUrl?: string;
          detailUrl?: string;
          isPrimary?: boolean;
        };
        const imgUrl = jsonbImg.url || jsonbImg.cardUrl;
        
        if (!imgUrl) continue;
        
        // Skip if this URL already exists
        if (existingUrls.has(imgUrl)) continue;
        
        // Insert into product_images
        const { error: preserveError } = await supabase
          .from('product_images')
          .insert({
            product_id: productId,
            cloudinary_url: imgUrl,
            card_url: jsonbImg.cardUrl || imgUrl,
            thumbnail_url: jsonbImg.thumbnailUrl,
            gallery_url: jsonbImg.galleryUrl,
            detail_url: jsonbImg.detailUrl,
            external_url: imgUrl,
            is_primary: jsonbImg.isPrimary || false,
            is_downloaded: false,
            is_ai_generated: false,
            approval_status: 'approved',
            sort_order: i + 1, // Preserve order, AI image will be sort_order 0
          });
        
        if (!preserveError) {
          preservedCount++;
          existingUrls.add(imgUrl);
        }
      }
      
      if (preservedCount > 0) {
        console.log(`[ECOMMERCE-HERO QUEUE] Preserved ${preservedCount} JSONB images into product_images`);
      }
    }

    // Check if already in queue (pending or processing)
    const { data: existingItem } = await supabase
      .from('ecommerce_hero_queue')
      .select('id, status')
      .eq('product_id', productId)
      .eq('source_image_url', sourceImageUrl)
      .in('status', ['pending', 'processing'])
      .single();

    if (existingItem) {
      return NextResponse.json({
        success: false,
        error: 'This image is already in the queue',
        existingId: existingItem.id,
        status: existingItem.status,
      }, { status: 409 });
    }

    // Add to queue
    const { data: queueItem, error: insertError } = await supabase
      .from('ecommerce_hero_queue')
      .insert({
        product_id: productId,
        source_image_url: sourceImageUrl,
        source_image_id: sourceImageId || null,
        status: 'pending',
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[ECOMMERCE-HERO QUEUE] Insert error:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    console.log(`[ECOMMERCE-HERO QUEUE] Added queue item: ${queueItem.id}`);

    return NextResponse.json({
      success: true,
      data: {
        id: queueItem.id,
        productId: queueItem.product_id,
        status: queueItem.status,
        createdAt: queueItem.created_at,
      },
    });
  } catch (error) {
    console.error('[ECOMMERCE-HERO QUEUE] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add to queue' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Cancel pending queue item
 */
export async function DELETE(request: NextRequest) {
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
    const queueId = searchParams.get('id');

    if (!queueId) {
      return NextResponse.json({ error: 'Queue item id is required' }, { status: 400 });
    }

    // Only allow deleting pending items
    const { data: item, error: fetchError } = await supabase
      .from('ecommerce_hero_queue')
      .select('id, status, created_by')
      .eq('id', queueId)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ error: 'Queue item not found' }, { status: 404 });
    }

    if (item.status !== 'pending') {
      return NextResponse.json(
        { error: `Cannot cancel item with status: ${item.status}` },
        { status: 400 }
      );
    }

    // Delete the item
    const { error: deleteError } = await supabase
      .from('ecommerce_hero_queue')
      .delete()
      .eq('id', queueId);

    if (deleteError) {
      console.error('[ECOMMERCE-HERO QUEUE] Delete error:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    console.log(`[ECOMMERCE-HERO QUEUE] Deleted queue item: ${queueId}`);

    return NextResponse.json({
      success: true,
      message: 'Queue item cancelled',
    });
  } catch (error) {
    console.error('[ECOMMERCE-HERO QUEUE] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cancel queue item' },
      { status: 500 }
    );
  }
}

