/**
 * Set which approved image is primary for a canonical product.
 * POST /api/admin/images/set-primary
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

    const { data: row, error: fetchError } = await supabase
      .from('product_images')
      .select('id, approval_status')
      .eq('id', imageId)
      .eq('canonical_product_id', canonicalProductId)
      .single();

    if (fetchError || !row || row.approval_status !== 'approved') {
      return NextResponse.json({ error: 'Image not found or not approved' }, { status: 404 });
    }

    await supabase
      .from('product_images')
      .update({ is_primary: false })
      .eq('canonical_product_id', canonicalProductId);

    const { error: primaryError } = await supabase
      .from('product_images')
      .update({ is_primary: true })
      .eq('id', imageId)
      .eq('canonical_product_id', canonicalProductId);

    if (primaryError) {
      return NextResponse.json({ error: primaryError.message }, { status: 500 });
    }

    await supabase
      .from('canonical_products')
      .update({
        image_review_status: 'ready',
        image_reviewed_at: new Date().toISOString(),
        image_reviewed_by: user.id,
      })
      .eq('id', canonicalProductId);

    await supabase
      .from('products')
      .update({
        image_review_status: 'ready',
        image_reviewed_at: new Date().toISOString(),
        image_reviewed_by: user.id,
        image_review_source: 'canonical',
      })
      .eq('canonical_product_id', canonicalProductId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[IMAGE WORKBENCH] Set primary error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to set primary' },
      { status: 500 }
    );
  }
}
