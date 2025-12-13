/**
 * Admin Image Download API
 * POST /api/admin/images/download - Download external image to Supabase Storage
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
    const { imageId } = body;

    if (!imageId) {
      return NextResponse.json({ error: 'Image ID required' }, { status: 400 });
    }

    console.log(`[IMAGE DOWNLOAD] Downloading image ${imageId} to storage`);

    // Get image record
    const { data: image, error: imageError } = await supabase
      .from('product_images')
      .select('id, external_url, is_downloaded, canonical_product_id, sort_order')
      .eq('id', imageId)
      .single();

    if (imageError || !image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    // Already downloaded
    if (image.is_downloaded) {
      console.log(`[IMAGE DOWNLOAD] Image already downloaded`);
      return NextResponse.json({ success: true, message: 'Already downloaded' });
    }

    // No external URL to download
    if (!image.external_url) {
      return NextResponse.json({ error: 'No external URL to download' }, { status: 400 });
    }

    // Call edge function to download
    const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/download-image`;
    const { data: { session } } = await supabase.auth.getSession();

    console.log(`[IMAGE DOWNLOAD] Calling download edge function...`);

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session?.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageId,
        externalUrl: image.external_url,
        canonicalProductId: image.canonical_product_id,
        sortOrder: image.sort_order,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[IMAGE DOWNLOAD] Download failed:', error);
      return NextResponse.json({ error: 'Download failed', details: error }, { status: 500 });
    }

    const result = await response.json();
    console.log('[IMAGE DOWNLOAD] Success:', result);

    return NextResponse.json({
      success: true,
      message: 'Image downloaded successfully',
      data: result.data,
    });
  } catch (error) {
    console.error('[IMAGE DOWNLOAD] Error:', error);
    const message = error instanceof Error ? error.message : 'Download failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}








