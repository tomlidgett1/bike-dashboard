/**
 * Remove an approved canonical image from the workbench (deletes row).
 * POST /api/admin/images/remove-approved
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
    const canonicalProductId = body.canonicalProductId as string | undefined;
    const imageId = body.imageId as string | undefined;

    if (!canonicalProductId || !imageId) {
      return NextResponse.json({ error: 'canonicalProductId and imageId are required' }, { status: 400 });
    }

    const { error: deleteError } = await supabase
      .from('product_images')
      .delete()
      .eq('id', imageId)
      .eq('canonical_product_id', canonicalProductId);

    if (deleteError) {
      console.error('[IMAGE WORKBENCH] Remove image error:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    const { data: remaining, error: listError } = await supabase
      .from('product_images')
      .select('id, is_primary, sort_order, created_at')
      .eq('canonical_product_id', canonicalProductId)
      .eq('approval_status', 'approved');

    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    const rows = remaining || [];

    if (rows.length === 0) {
      await supabase
        .from('canonical_products')
        .update({
          image_review_status: 'pending',
          image_reviewed_at: null,
          image_reviewed_by: null,
          image_review_source: null,
          image_review_error: null,
        })
        .eq('id', canonicalProductId);

      await supabase
        .from('products')
        .update({
          image_review_status: 'pending',
          image_reviewed_at: null,
          image_reviewed_by: null,
          image_review_source: null,
        })
        .eq('canonical_product_id', canonicalProductId);

      return NextResponse.json({ success: true, remainingCount: 0 });
    }

    const hasPrimary = rows.some((r) => r.is_primary);
    if (!hasPrimary) {
      const sorted = [...rows].sort((a, b) => {
        const ao = a.sort_order ?? 0;
        const bo = b.sort_order ?? 0;
        if (ao !== bo) return ao - bo;
        return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      });
      const nextPrimaryId = sorted[0]?.id;
      if (nextPrimaryId) {
        await supabase
          .from('product_images')
          .update({ is_primary: false })
          .eq('canonical_product_id', canonicalProductId);
        await supabase
          .from('product_images')
          .update({ is_primary: true })
          .eq('id', nextPrimaryId)
          .eq('canonical_product_id', canonicalProductId);
      }
    }

    return NextResponse.json({ success: true, remainingCount: rows.length });
  } catch (error) {
    console.error('[IMAGE WORKBENCH] Remove approved error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to remove image' },
      { status: 500 }
    );
  }
}
