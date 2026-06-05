/**
 * POST /api/settings/upload-logo
 * Compresses and uploads a bicycle store business logo to the logo bucket.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { compressLogoImage } from '@/lib/utils/compress-logo-image';

const MAX_BYTES = 5 * 1024 * 1024;
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('account_type, bicycle_store, logo_url')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Please upload an image file' }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Image must be less than 5MB' }, { status: 400 });
    }

    const raw = Buffer.from(await file.arrayBuffer());
    const { buffer, contentType, extension } = await compressLogoImage(raw);

    if (profile.logo_url) {
      const oldFileName = profile.logo_url.split('/').pop();
      if (oldFileName) {
        await supabase.storage.from('logo').remove([`${user.id}/${oldFileName}`]);
      }
    }

    const filePath = `${user.id}/${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('logo').upload(filePath, buffer, {
      cacheControl: '31536000',
      upsert: false,
      contentType,
    });

    if (uploadError) {
      console.error('Logo upload error:', uploadError);
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('logo').getPublicUrl(filePath);

    return NextResponse.json({
      url: publicUrl,
      optimized: true,
      contentType,
      bytes: buffer.length,
    });
  } catch (err) {
    console.error('Error in POST /api/settings/upload-logo:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
