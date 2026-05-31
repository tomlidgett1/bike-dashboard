/**
 * POST /api/store/categories/upload-logo
 * Uploads an image and sets it as the logo_url for a category carousel.
 * Body: FormData { file: File, categoryId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
    const categoryId = formData.get('categoryId') as string | null;

    if (!file || !categoryId) {
      return NextResponse.json({ error: 'file and categoryId are required' }, { status: 400 });
    }

    // Confirm the category belongs to this user
    const { data: category } = await supabase
      .from('store_categories')
      .select('id')
      .eq('id', categoryId)
      .eq('user_id', user.id)
      .single();

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const storagePath = `${user.id}/carousel-logos/${categoryId}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('logo')
      .upload(storagePath, buffer, {
        contentType: file.type || 'image/png',
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }

    const { data: { publicUrl } } = supabase.storage.from('logo').getPublicUrl(storagePath);

    // Save to category
    await supabase
      .from('store_categories')
      .update({ logo_url: publicUrl })
      .eq('id', categoryId)
      .eq('user_id', user.id);

    return NextResponse.json({ logo_url: publicUrl });
  } catch (err) {
    console.error('Error in upload-logo:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
