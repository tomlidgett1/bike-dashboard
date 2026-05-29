/**
 * POST /api/admin/images/hero-approve
 *
 * Saves a pre-enhanced hero image (already processed by enhance-preview and
 * uploaded to Cloudinary) as the new primary image for a canonical product.
 * Mirrors the tail of the studio-hero route but skips the OpenAI call —
 * the enhancement is done client-side in the hero-background panel.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body = await request.json();
    const canonicalProductId = (body.canonicalProductId as string | undefined)?.trim();
    const enhancedUrl = (body.enhancedUrl as string | undefined)?.trim();
    const enhancedPublicId = (body.enhancedPublicId as string | undefined)?.trim();
    const sourceImageUrl = (body.sourceImageUrl as string | undefined)?.trim();

    if (!canonicalProductId || !enhancedUrl) {
      return NextResponse.json(
        { error: 'canonicalProductId and enhancedUrl are required' },
        { status: 400 },
      );
    }

    // Verify product exists
    const { data: canonical, error: canonicalError } = await supabase
      .from('canonical_products')
      .select('id')
      .eq('id', canonicalProductId)
      .single();

    if (canonicalError || !canonical) {
      return NextResponse.json({ error: 'Canonical product not found' }, { status: 404 });
    }

    // Get next sort order
    const { data: sortRows } = await supabase
      .from('product_images')
      .select('sort_order')
      .eq('canonical_product_id', canonicalProductId)
      .order('sort_order', { ascending: false, nullsFirst: false })
      .limit(1);

    let nextSort = 0;
    const top = sortRows?.[0]?.sort_order;
    if (typeof top === 'number' && !Number.isNaN(top)) nextSort = top + 1;

    // Clear existing primary flags for this product
    await supabase
      .from('product_images')
      .update({ is_primary: false })
      .eq('canonical_product_id', canonicalProductId);

    // Insert the new enhanced image as approved + primary
    const { data: inserted, error: insertError } = await supabase
      .from('product_images')
      .insert({
        canonical_product_id: canonicalProductId,
        external_url: sourceImageUrl || enhancedUrl,
        cloudinary_url: enhancedUrl,
        cloudinary_public_id: enhancedPublicId || null,
        is_downloaded: true,
        approval_status: 'approved',
        is_primary: true,
        sort_order: nextSort,
        source: 'openai_studio_hero',
        uploaded_by: user.id,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[HERO-APPROVE] Insert error:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Update canonical_products status
    await supabase
      .from('canonical_products')
      .update({
        image_review_status: 'ready',
        image_reviewed_at: new Date().toISOString(),
        image_reviewed_by: user.id,
        image_review_source: 'hero_background',
      })
      .eq('id', canonicalProductId);

    // Cascade to linked products
    await supabase
      .from('products')
      .update({
        image_review_status: 'ready',
        image_reviewed_at: new Date().toISOString(),
        image_reviewed_by: user.id,
        image_review_source: 'canonical',
      })
      .eq('canonical_product_id', canonicalProductId);

    return NextResponse.json({ success: true, imageId: inserted.id });
  } catch (error) {
    console.error('[HERO-APPROVE] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Hero approve failed' },
      { status: 500 },
    );
  }
}
