// ============================================================
// Instagram Post API
// ============================================================
// Posts generated images to Instagram with captions

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createInstagramClient, generateCaption } from '@/lib/services/instagram-client';

export async function POST(request: NextRequest) {
  try {
    const { productId, imageUrl } = await request.json();

    if (!productId || !imageUrl) {
      return NextResponse.json(
        { error: 'Product ID and image URL are required' },
        { status: 400 }
      );
    }

    console.log('[Instagram Post] Starting post flow for product:', productId);

    // Fetch product details
    const supabase = await createClient();
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, description, price, brand, model')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      console.error('[Instagram Post] Product not found:', productError);
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    // Generate title and caption
    const title = product.brand && product.model
      ? `${product.brand} ${product.model}`
      : product.description.substring(0, 50);
    
    const caption = generateCaption(title, product.price, product.description);

    console.log('[Instagram Post] Generated caption:', caption);

    // Create Instagram post record (pending status)
    const { data: postRecord, error: insertError } = await supabase
      .from('instagram_posts')
      .insert({
        product_id: productId,
        cloudinary_image_url: imageUrl,
        caption: caption,
        status: 'processing',
      })
      .select()
      .single();

    if (insertError || !postRecord) {
      console.error('[Instagram Post] Failed to create post record:', insertError);
      return NextResponse.json(
        { error: 'Failed to create post record' },
        { status: 500 }
      );
    }

    try {
      // Initialize Instagram client
      const instagram = createInstagramClient();

      // Validate credentials first
      const isValid = await instagram.validateCredentials();
      if (!isValid) {
        throw new Error('Invalid Instagram credentials');
      }

      console.log('[Instagram Post] Sending to n8n webhook...');

      // Post to Instagram via n8n webhook
      const { scenarioExecutionId, status } = await instagram.postImage(
        imageUrl,
        caption,
        productId,
        title,
        product.price,
        product.description
      );

      console.log('[Instagram Post] Successfully triggered n8n workflow:', { 
        scenarioExecutionId, 
        status 
      });

      // n8n will handle the actual Instagram posting
      // We track the workflow execution ID
      const n8nUrl = `https://tomlidgett.app.n8n.cloud/workflow/${scenarioExecutionId}`;

      // Update post record with success
      const { error: updateError } = await supabase
        .from('instagram_posts')
        .update({
          instagram_post_id: scenarioExecutionId,
          instagram_url: n8nUrl,
          status: 'posted',
          posted_at: new Date().toISOString(),
        })
        .eq('id', postRecord.id);

      if (updateError) {
        console.error('[Instagram Post] Failed to update post record:', updateError);
        // Don't fail the request - the webhook was triggered successfully
      }

      return NextResponse.json({
        success: true,
        postId: scenarioExecutionId,
        postUrl: n8nUrl,
        message: `Successfully triggered n8n workflow (status: ${status})`,
      });
    } catch (instagramError) {
      console.error('[Instagram Post] Instagram API error:', instagramError);

      // Update post record with error
      await supabase
        .from('instagram_posts')
        .update({
          status: 'failed',
          error_message: instagramError instanceof Error 
            ? instagramError.message 
            : 'Unknown error',
        })
        .eq('id', postRecord.id);

      return NextResponse.json(
        { 
          error: 'Failed to post to Instagram',
          details: instagramError instanceof Error 
            ? instagramError.message 
            : 'Unknown error',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[Instagram Post] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process Instagram post',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to check Instagram post status
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const productId = searchParams.get('productId');

    if (!productId) {
      return NextResponse.json(
        { error: 'Product ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: posts, error } = await supabase
      .from('instagram_posts')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Instagram Post] Error fetching posts:', error);
      return NextResponse.json(
        { error: 'Failed to fetch post history' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      posts: posts || [],
    });
  } catch (error) {
    console.error('[Instagram Post] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch post history',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

