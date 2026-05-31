/**
 * Store Sections API
 *
 * Sections are named groupings that contain category carousels.
 * e.g. "Nutrition" section → Clif carousel + GU carousel + Specials carousel.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { CreateSectionRequest, UpdateSectionRequest } from '@/lib/types/store';

async function authorisedStore(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { user: null, error: 'Unauthorized', status: 401 };

  const { data: profile } = await supabase
    .from('users')
    .select('account_type, bicycle_store')
    .eq('user_id', user.id)
    .single();

  if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
    return { user: null, error: 'Access denied. Only verified bicycle stores can manage sections.', status: 403 };
  }

  return { user, error: null, status: 200 };
}

/** GET /api/store/sections — list sections for authenticated store */
export async function GET() {
  try {
    const supabase = await createClient();
    const { user, error, status } = await authorisedStore(supabase);
    if (!user) return NextResponse.json({ error }, { status });

    const { data: sections, error: dbError } = await supabase
      .from('store_sections')
      .select('*')
      .eq('user_id', user.id)
      .order('display_order', { ascending: true });

    if (dbError) {
      console.error('Error fetching sections:', dbError);
      return NextResponse.json({ error: 'Failed to fetch sections' }, { status: 500 });
    }

    return NextResponse.json({ sections: sections || [] });
  } catch (err) {
    console.error('Error in GET /api/store/sections:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/store/sections — create a new section */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { user, error, status } = await authorisedStore(supabase);
    if (!user) return NextResponse.json({ error }, { status });

    const body: CreateSectionRequest = await request.json();

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Get next display_order
    let displayOrder = body.display_order ?? 0;
    if (!body.display_order) {
      const { data: maxRow } = await supabase
        .from('store_sections')
        .select('display_order')
        .eq('user_id', user.id)
        .order('display_order', { ascending: false })
        .limit(1)
        .single();
      displayOrder = (maxRow?.display_order ?? -1) + 1;
    }

    const { data: section, error: dbError } = await supabase
      .from('store_sections')
      .insert({
        user_id: user.id,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        display_order: displayOrder,
        is_active: true,
      })
      .select()
      .single();

    if (dbError) {
      console.error('Error creating section:', dbError);
      return NextResponse.json({ error: 'Failed to create section' }, { status: 500 });
    }

    return NextResponse.json({ section }, { status: 201 });
  } catch (err) {
    console.error('Error in POST /api/store/sections:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** PUT /api/store/sections — update section (name, description, display_order) */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { user, error, status } = await authorisedStore(supabase);
    if (!user) return NextResponse.json({ error }, { status });

    const body: UpdateSectionRequest = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: 'Section ID is required' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.description !== undefined) updateData.description = body.description?.trim() || null;
    if (body.display_order !== undefined) updateData.display_order = body.display_order;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data: section, error: dbError } = await supabase
      .from('store_sections')
      .update(updateData)
      .eq('id', body.id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (dbError) {
      console.error('Error updating section:', dbError);
      return NextResponse.json({ error: 'Failed to update section' }, { status: 500 });
    }

    if (!section) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    }

    return NextResponse.json({ section });
  } catch (err) {
    console.error('Error in PUT /api/store/sections:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/store/sections?id=... — delete section (categories become standalone) */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { user, error, status } = await authorisedStore(supabase);
    if (!user) return NextResponse.json({ error }, { status });

    const { searchParams } = new URL(request.url);
    const sectionId = searchParams.get('id');

    if (!sectionId) {
      return NextResponse.json({ error: 'Section ID is required' }, { status: 400 });
    }

    // Null out section_id on all categories in this section first
    await supabase
      .from('store_categories')
      .update({ section_id: null })
      .eq('section_id', sectionId)
      .eq('user_id', user.id);

    const { error: dbError } = await supabase
      .from('store_sections')
      .delete()
      .eq('id', sectionId)
      .eq('user_id', user.id);

    if (dbError) {
      console.error('Error deleting section:', dbError);
      return NextResponse.json({ error: 'Failed to delete section' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error in DELETE /api/store/sections:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
