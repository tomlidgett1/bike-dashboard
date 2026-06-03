/**
 * Store Homepage Image Upload API
 *
 * Uploads a landing-page image (hero, story, collection tile or gallery photo)
 * to Supabase storage and returns the public URL. Verified bicycle stores only.
 * Stored in the existing `listing-images` bucket under homepage/{userId}/.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import sharp from 'sharp';

const MAX_BYTES = 8 * 1024 * 1024; // 8MB — hero/gallery photos run larger than logos
const VALID_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif'];
const HOMEPAGE_IMAGE_MAX_WIDTH = 1920;
const HOMEPAGE_IMAGE_MAX_HEIGHT = 1280;
const HOMEPAGE_IMAGE_QUALITY = 82;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('account_type, bicycle_store')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const slotRaw = (formData.get('slot') as string | null) ?? 'image';
    const slot = slotRaw.replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || 'image';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!VALID_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Use JPEG, PNG, WebP or AVIF.' },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File size exceeds 8MB limit' }, { status: 400 });
    }

    const path = `homepage/${user.id}/${slot}-${Date.now()}.webp`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const optimized = await sharp(buffer)
      .rotate()
      .resize({
        width: HOMEPAGE_IMAGE_MAX_WIDTH,
        height: HOMEPAGE_IMAGE_MAX_HEIGHT,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: HOMEPAGE_IMAGE_QUALITY, effort: 4 })
      .toBuffer();

    // Service role for storage — user is verified above and the path is rooted
    // at the user ID (mirrors the brand-logo upload route).
    const adminStorage = createServiceRoleClient().storage;
    const { error: uploadError } = await adminStorage
      .from('listing-images')
      .upload(path, optimized, {
        cacheControl: '31536000',
        contentType: 'image/webp',
        upsert: false,
      });

    if (uploadError) {
      console.error('Homepage image upload error:', uploadError);
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
    }

    const { data: urlData } = adminStorage.from('listing-images').getPublicUrl(path);
    return NextResponse.json({
      url: urlData.publicUrl,
      optimized: true,
      contentType: 'image/webp',
      bytes: optimized.length,
    });
  } catch (err) {
    console.error('Error in POST /api/store/homepage/upload:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
