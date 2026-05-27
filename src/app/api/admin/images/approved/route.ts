/**
 * List approved canonical product images for the Image Workbench.
 * GET /api/admin/images/approved?canonicalProductId=
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveProductImage } from '@/lib/services/image-resolver';

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

    const canonicalProductId = request.nextUrl.searchParams.get('canonicalProductId');
    if (!canonicalProductId) {
      return NextResponse.json({ error: 'canonicalProductId is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('product_images')
      .select(
        'id, canonical_product_id, cloudinary_public_id, cloudinary_url, external_url, thumbnail_url, mobile_card_url, card_url, gallery_url, detail_url, approval_status, is_primary, sort_order, source, created_at'
      )
      .eq('canonical_product_id', canonicalProductId)
      .eq('approval_status', 'approved')
      .order('is_primary', { ascending: false })
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[IMAGE WORKBENCH] Approved images error:', error);
      return NextResponse.json({ error: 'Failed to load images' }, { status: 500 });
    }

    const images = (data || []).map((row) => {
      const resolved = resolveProductImage(row);
      return {
        ...row,
        display_url: resolved?.card_url || resolved?.thumbnail_url || resolved?.original_url || null,
      };
    });

    return NextResponse.json({ success: true, data: images });
  } catch (error) {
    console.error('[IMAGE WORKBENCH] Approved images route error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load approved images' },
      { status: 500 }
    );
  }
}
