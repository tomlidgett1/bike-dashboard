/**
 * POST /api/store/brands/import-logo
 * Download a logo from a URL (e.g. Serper result) and store it in Supabase.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { compressLogoImage } from '@/lib/utils/compress-logo-image';

const MAX_BYTES = 5 * 1024 * 1024;

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local')) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return false;
}

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
      .select('account_type, bicycle_store')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = (await request.json()) as { imageUrl?: string };
    const imageUrl = body.imageUrl?.trim();

    if (!imageUrl?.startsWith('https://')) {
      return NextResponse.json({ error: 'A valid HTTPS image URL is required' }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(imageUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid image URL' }, { status: 400 });
    }

    if (isPrivateHost(parsed.hostname)) {
      return NextResponse.json({ error: 'Image URL is not allowed' }, { status: 400 });
    }

    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; YellowJerseyStore/1.0)',
        Accept: 'image/*,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Could not download image (${response.status})` },
        { status: 400 },
      );
    }

    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || '';
    const arrayBuffer = await response.arrayBuffer();

    if (arrayBuffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'Image exceeds 5MB limit' }, { status: 400 });
    }

    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'URL did not return an image' }, { status: 400 });
    }

    const rawBuffer = Buffer.from(arrayBuffer);
    const timestamp = Date.now();
    let uploadBuffer: Buffer = rawBuffer;
    let uploadContentType = contentType;
    let ext = 'webp';

    if (contentType === 'image/svg+xml') {
      ext = 'svg';
      uploadContentType = 'image/svg+xml';
    } else {
      const compressed = await compressLogoImage(rawBuffer);
      uploadBuffer = compressed.buffer;
      uploadContentType = compressed.contentType;
      ext = compressed.extension;
    }

    const path = `brands/${user.id}/${timestamp}.${ext}`;
    const adminStorage = createServiceRoleClient().storage;

    const { error: uploadError } = await adminStorage
      .from('listing-images')
      .upload(path, uploadBuffer, {
        cacheControl: '31536000',
        contentType: uploadContentType,
        upsert: false,
      });

    if (uploadError) {
      console.error('Brand logo import upload error:', uploadError);
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
    }

    const { data: urlData } = adminStorage.from('listing-images').getPublicUrl(path);

    return NextResponse.json({ url: urlData.publicUrl });
  } catch (err) {
    console.error('Error in POST /api/store/brands/import-logo:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
