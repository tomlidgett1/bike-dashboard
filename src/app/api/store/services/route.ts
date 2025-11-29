/**
 * Store Services API
 * 
 * Manages services offered by bike stores
 * (e.g., "Full Bicycle Service", "Wheel Truing", etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { CreateServiceRequest, UpdateServiceRequest } from '@/lib/types/store';

/**
 * GET /api/store/services
 * Fetch all services for authenticated merchant
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in first.' },
        { status: 401 }
      );
    }

    // Verify user is a verified bicycle store
    const { data: profile } = await supabase
      .from('users')
      .select('account_type, bicycle_store')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
      return NextResponse.json(
        { error: 'Access denied. Only verified bicycle stores can manage services.' },
        { status: 403 }
      );
    }

    // Fetch services
    const { data: services, error } = await supabase
      .from('store_services')
      .select('*')
      .eq('user_id', user.id)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching services:', error);
      return NextResponse.json(
        { error: 'Failed to fetch services' },
        { status: 500 }
      );
    }

    return NextResponse.json({ services: services || [] });
  } catch (error) {
    console.error('Error in GET /api/store/services:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/store/services
 * Create new service
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in first.' },
        { status: 401 }
      );
    }

    // Verify user is a verified bicycle store
    const { data: profile } = await supabase
      .from('users')
      .select('account_type, bicycle_store')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
      return NextResponse.json(
        { error: 'Access denied. Only verified bicycle stores can manage services.' },
        { status: 403 }
      );
    }

    const body: CreateServiceRequest = await request.json();

    // Validate required fields
    if (!body.name) {
      return NextResponse.json(
        { error: 'Service name is required' },
        { status: 400 }
      );
    }

    // Get next display order if not provided
    let displayOrder = body.display_order ?? 0;
    if (displayOrder === 0) {
      const { data: maxOrder } = await supabase
        .from('store_services')
        .select('display_order')
        .eq('user_id', user.id)
        .order('display_order', { ascending: false })
        .limit(1)
        .single();

      displayOrder = (maxOrder?.display_order ?? -1) + 1;
    }

    // Insert service
    const { data: service, error } = await supabase
      .from('store_services')
      .insert({
        user_id: user.id,
        name: body.name,
        description: body.description || null,
        display_order: displayOrder,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating service:', error);
      return NextResponse.json(
        { error: 'Failed to create service' },
        { status: 500 }
      );
    }

    return NextResponse.json({ service }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/store/services:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/store/services
 * Update service
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in first.' },
        { status: 401 }
      );
    }

    // Verify user is a verified bicycle store
    const { data: profile } = await supabase
      .from('users')
      .select('account_type, bicycle_store')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
      return NextResponse.json(
        { error: 'Access denied. Only verified bicycle stores can manage services.' },
        { status: 403 }
      );
    }

    const body: UpdateServiceRequest = await request.json();

    if (!body.id) {
      return NextResponse.json(
        { error: 'Service ID is required' },
        { status: 400 }
      );
    }

    // Build update object
    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.display_order !== undefined) updateData.display_order = body.display_order;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    // Update service
    const { data: service, error } = await supabase
      .from('store_services')
      .update(updateData)
      .eq('id', body.id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating service:', error);
      return NextResponse.json(
        { error: 'Failed to update service' },
        { status: 500 }
      );
    }

    if (!service) {
      return NextResponse.json(
        { error: 'Service not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ service });
  } catch (error) {
    console.error('Error in PUT /api/store/services:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/store/services
 * Delete service
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in first.' },
        { status: 401 }
      );
    }

    // Verify user is a verified bicycle store
    const { data: profile } = await supabase
      .from('users')
      .select('account_type, bicycle_store')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
      return NextResponse.json(
        { error: 'Access denied. Only verified bicycle stores can manage services.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const serviceId = searchParams.get('id');

    if (!serviceId) {
      return NextResponse.json(
        { error: 'Service ID is required' },
        { status: 400 }
      );
    }

    // Delete service
    const { error } = await supabase
      .from('store_services')
      .delete()
      .eq('id', serviceId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting service:', error);
      return NextResponse.json(
        { error: 'Failed to delete service' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/store/services:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

