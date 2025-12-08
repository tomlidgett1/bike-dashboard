/**
 * Image Upload API
 * POST /api/images/upload
 * 
 * Uploads a product image to Supabase Storage and creates a product_images record
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { uploadProductImage } from '@/lib/services/image-processing';

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

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const canonicalProductId = formData.get('canonicalProductId') as string;
    const isPrimary = formData.get('isPrimary') === 'true';
    const sortOrder = formData.get('sortOrder')
      ? parseInt(formData.get('sortOrder') as string)
      : 0;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!canonicalProductId) {
      return NextResponse.json(
        { error: 'Canonical product ID required' },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPEG, PNG, and WebP are supported.' },
        { status: 400 }
      );
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size exceeds 10MB limit' },
        { status: 400 }
      );
    }

    // Upload and process image
    const result = await uploadProductImage(file, canonicalProductId, {
      isPrimary,
      sortOrder,
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Image upload error:', error);
    const message = error instanceof Error ? error.message : 'Image upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}









