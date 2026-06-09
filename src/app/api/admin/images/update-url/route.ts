/**
 * Update a canonical product_images row with a new URL (e.g. after BG removal).
 * POST /api/admin/images/update-url
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body = await request.json();
    const imageId = body.imageId as string | undefined;
    const canonicalProductId = body.canonicalProductId as string | undefined;
    const cloudinaryUrl = body.cloudinaryUrl as string | undefined;
    const cloudinaryPublicId = body.cloudinaryPublicId as string | undefined;
    const externalUrl = body.externalUrl as string | undefined;

    if (!imageId || !canonicalProductId || (!cloudinaryUrl && !externalUrl)) {
      return NextResponse.json(
        { error: 'imageId, canonicalProductId, and a URL are required' },
        { status: 400 },
      );
    }

    const { data: imageRow, error: imageError } = await supabase
      .from('product_images')
      .select('id, canonical_product_id, product_id')
      .eq('id', imageId)
      .maybeSingle();

    if (imageError || !imageRow) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    if (imageRow.canonical_product_id) {
      if (imageRow.canonical_product_id !== canonicalProductId) {
        return NextResponse.json({ error: 'Image not found' }, { status: 404 });
      }
    } else if (imageRow.product_id) {
      const { data: productRow } = await supabase
        .from('products')
        .select('canonical_product_id, user_id')
        .eq('id', imageRow.product_id)
        .maybeSingle();

      if (
        !productRow ||
        productRow.user_id !== user.id ||
        productRow.canonical_product_id !== canonicalProductId
      ) {
        return NextResponse.json({ error: 'Image not found' }, { status: 404 });
      }
    } else {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    const patch: Record<string, string | null> = {};
    if (cloudinaryUrl) {
      patch.cloudinary_url = cloudinaryUrl;
      patch.external_url = null;
    } else if (externalUrl) {
      patch.external_url = externalUrl;
    }
    if (cloudinaryPublicId) patch.cloudinary_public_id = cloudinaryPublicId;

    const { data: updated, error: updateError } = await supabase
      .from('product_images')
      .update(patch)
      .eq('id', imageId)
      .select('id, cloudinary_public_id, cloudinary_url, external_url')
      .maybeSingle();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (!updated) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 },
    );
  }
}
