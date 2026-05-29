/**
 * Image Enhancement Preview
 * POST /api/admin/images/enhance-preview
 *
 * Thin proxy to the enhance-product-image edge function.
 * Processes an external image URL through OpenAI gpt-image-2 to remove the
 * background and place the product on a clean white e-commerce backdrop,
 * then uploads the result to Cloudinary.
 *
 * Returns the enhanced Cloudinary URL without writing to any DB table — the
 * caller (auto-pilot panel) uses it as a candidate URL that gets saved on
 * normal approval.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
// Image processing can take 15–30 s; raise the timeout ceiling.
export const maxDuration = 60;

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

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      return NextResponse.json({ error: 'No active session' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      return NextResponse.json({ error: 'Supabase URL not configured' }, { status: 500 });
    }

    const body = await request.json();
    const imageUrl = (body.imageUrl as string | undefined)?.trim();
    const canonicalProductId = (body.canonicalProductId as string | undefined)?.trim();

    if (!imageUrl) {
      return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 });
    }

    const enhanceResponse = await fetch(
      `${supabaseUrl}/functions/v1/enhance-product-image`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageUrl,
          listingId: canonicalProductId ? `preview-${canonicalProductId}` : 'auto-pilot-preview',
        }),
      },
    );

    const result = await enhanceResponse.json();

    if (!enhanceResponse.ok || !result.success) {
      return NextResponse.json(
        { error: result.error || 'Image enhancement failed' },
        { status: enhanceResponse.status || 502 },
      );
    }

    return NextResponse.json({
      success: true,
      url: result.data.url,
      thumbnailUrl: result.data.thumbnailUrl,
      cardUrl: result.data.cardUrl,
      publicId: result.data.publicId,
    });
  } catch (error) {
    console.error('[ENHANCE-PREVIEW] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Enhancement failed' },
      { status: 500 },
    );
  }
}
