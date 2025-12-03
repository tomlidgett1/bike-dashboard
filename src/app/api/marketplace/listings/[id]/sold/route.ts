/**
 * Mark Listing as Sold API
 * 
 * POST: Mark a listing as sold
 * DELETE: Unmark a listing as sold (put back for sale)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorised' },
        { status: 401 }
      );
    }

    // Verify ownership
    const { data: listing, error: fetchError } = await supabase
      .from('products')
      .select('user_id, sold_at')
      .eq('id', id)
      .single();

    if (fetchError || !listing) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      );
    }

    if (listing.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Not authorised to modify this listing' },
        { status: 403 }
      );
    }

    if (listing.sold_at) {
      return NextResponse.json(
        { error: 'Listing is already marked as sold' },
        { status: 400 }
      );
    }

    // Mark as sold
    const { error: updateError } = await supabase
      .from('products')
      .update({ 
        sold_at: new Date().toISOString(),
        is_active: false 
      })
      .eq('id', id);

    if (updateError) {
      console.error('[Sold API] Error marking as sold:', updateError);
      return NextResponse.json(
        { error: 'Failed to mark listing as sold' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Listing marked as sold',
    });
  } catch (error) {
    console.error('[Sold API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorised' },
        { status: 401 }
      );
    }

    // Verify ownership
    const { data: listing, error: fetchError } = await supabase
      .from('products')
      .select('user_id, sold_at')
      .eq('id', id)
      .single();

    if (fetchError || !listing) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      );
    }

    if (listing.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Not authorised to modify this listing' },
        { status: 403 }
      );
    }

    if (!listing.sold_at) {
      return NextResponse.json(
        { error: 'Listing is not marked as sold' },
        { status: 400 }
      );
    }

    // Unmark as sold - put back for sale
    const { error: updateError } = await supabase
      .from('products')
      .update({ 
        sold_at: null,
        is_active: true 
      })
      .eq('id', id);

    if (updateError) {
      console.error('[Sold API] Error unmarking as sold:', updateError);
      return NextResponse.json(
        { error: 'Failed to unmark listing as sold' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Listing is back for sale',
    });
  } catch (error) {
    console.error('[Sold API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

