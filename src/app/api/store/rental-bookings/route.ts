/**
 * Store Rental Bookings API
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  isRangeAvailable,
  normaliseDateRange,
} from '@/lib/rentals/availability';
import type {
  CreateRentalBookingRequest,
  RentalBookingStatus,
  UpdateRentalBookingRequest,
} from '@/lib/types/store';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

async function assertVerifiedStore(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized. Please log in first.' }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from('users')
    .select('account_type, bicycle_store')
    .eq('user_id', user.id)
    .single();

  if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
    return {
      error: NextResponse.json(
        { error: 'Access denied. Only verified bicycle stores can manage rental bookings.' },
        { status: 403 },
      ),
    };
  }

  return { user };
}

function parseDate(value: string | undefined, label: string) {
  if (!value || !DATE_PATTERN.test(value)) {
    return { error: `${label} must be YYYY-MM-DD` };
  }
  return { value };
}

async function loadActiveBookingsForRental(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rentalId: string,
  excludeBookingId?: string,
) {
  let query = supabase
    .from('store_rental_bookings')
    .select('id, start_date, end_date, status')
    .eq('rental_id', rentalId)
    .in('status', ['pending', 'confirmed']);

  if (excludeBookingId) {
    query = query.neq('id', excludeBookingId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function assertRentalOwned(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  rentalId: string,
) {
  const { data, error } = await supabase
    .from('store_rentals')
    .select('id')
    .eq('id', rentalId)
    .eq('user_id', userId)
    .maybeSingle();

  return !error && !!data;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await assertVerifiedStore(supabase);
    if ('error' in auth && auth.error) return auth.error;
    const { user } = auth as { user: { id: string } };

    const rentalId = request.nextUrl.searchParams.get('rental_id');

    let query = supabase
      .from('store_rental_bookings')
      .select('*')
      .eq('user_id', user.id)
      .order('start_date', { ascending: true });

    if (rentalId) {
      const owned = await assertRentalOwned(supabase, user.id, rentalId);
      if (!owned) {
        return NextResponse.json({ error: 'Rental not found' }, { status: 404 });
      }
      query = query.eq('rental_id', rentalId);
    }

    const { data: bookings, error } = await query;

    if (error) {
      console.error('Error fetching rental bookings:', error);
      return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 });
    }

    return NextResponse.json({ bookings: bookings ?? [] });
  } catch (error) {
    console.error('Error in GET /api/store/rental-bookings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await assertVerifiedStore(supabase);
    if ('error' in auth && auth.error) return auth.error;
    const { user } = auth as { user: { id: string } };

    const body: CreateRentalBookingRequest = await request.json();
    const start = parseDate(body.start_date, 'Start date');
    if ('error' in start) return NextResponse.json({ error: start.error }, { status: 400 });
    const end = parseDate(body.end_date, 'End date');
    if ('error' in end) return NextResponse.json({ error: end.error }, { status: 400 });

    if (!body.rental_id) {
      return NextResponse.json({ error: 'rental_id is required' }, { status: 400 });
    }

    const owned = await assertRentalOwned(supabase, user.id, body.rental_id);
    if (!owned) {
      return NextResponse.json({ error: 'Rental not found' }, { status: 404 });
    }

    const { start: rangeStart, end: rangeEnd } = normaliseDateRange(start.value!, end.value!);
    const existing = await loadActiveBookingsForRental(supabase, body.rental_id);
    if (!isRangeAvailable(rangeStart, rangeEnd, existing)) {
      return NextResponse.json(
        { error: 'These dates overlap with an existing booking' },
        { status: 409 },
      );
    }

    const status: RentalBookingStatus = body.status ?? 'confirmed';

    const { data: booking, error } = await supabase
      .from('store_rental_bookings')
      .insert({
        user_id: user.id,
        rental_id: body.rental_id,
        start_date: rangeStart,
        end_date: rangeEnd,
        customer_name: body.customer_name?.trim() || null,
        customer_phone: body.customer_phone?.trim() || null,
        customer_email: body.customer_email?.trim() || null,
        status,
        notes: body.notes?.trim() || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating rental booking:', error);
      return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
    }

    return NextResponse.json({ booking }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/store/rental-bookings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await assertVerifiedStore(supabase);
    if ('error' in auth && auth.error) return auth.error;
    const { user } = auth as { user: { id: string } };

    const body: UpdateRentalBookingRequest = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: 'Booking ID is required' }, { status: 400 });
    }

    const { data: existingBooking, error: fetchError } = await supabase
      .from('store_rental_bookings')
      .select('*')
      .eq('id', body.id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchError || !existingBooking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const nextStart = body.start_date ?? existingBooking.start_date;
    const nextEnd = body.end_date ?? existingBooking.end_date;
    const start = parseDate(nextStart, 'Start date');
    if ('error' in start) return NextResponse.json({ error: start.error }, { status: 400 });
    const end = parseDate(nextEnd, 'End date');
    if ('error' in end) return NextResponse.json({ error: end.error }, { status: 400 });

    const { start: rangeStart, end: rangeEnd } = normaliseDateRange(start.value!, end.value!);
    const nextStatus = (body.status ?? existingBooking.status) as RentalBookingStatus;

    if (nextStatus !== 'cancelled') {
      const existing = await loadActiveBookingsForRental(
        supabase,
        existingBooking.rental_id,
        body.id,
      );
      if (!isRangeAvailable(rangeStart, rangeEnd, existing)) {
        return NextResponse.json(
          { error: 'These dates overlap with an existing booking' },
          { status: 409 },
        );
      }
    }

    const updateData: Record<string, unknown> = {
      start_date: rangeStart,
      end_date: rangeEnd,
    };
    if (body.customer_name !== undefined) updateData.customer_name = body.customer_name?.trim() || null;
    if (body.customer_phone !== undefined) updateData.customer_phone = body.customer_phone?.trim() || null;
    if (body.customer_email !== undefined) updateData.customer_email = body.customer_email?.trim() || null;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.notes !== undefined) updateData.notes = body.notes?.trim() || null;

    const { data: booking, error } = await supabase
      .from('store_rental_bookings')
      .update(updateData)
      .eq('id', body.id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating rental booking:', error);
      return NextResponse.json({ error: 'Failed to update booking' }, { status: 500 });
    }

    return NextResponse.json({ booking });
  } catch (error) {
    console.error('Error in PUT /api/store/rental-bookings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await assertVerifiedStore(supabase);
    if ('error' in auth && auth.error) return auth.error;
    const { user } = auth as { user: { id: string } };

    const bookingId = request.nextUrl.searchParams.get('id');
    if (!bookingId) {
      return NextResponse.json({ error: 'Booking ID is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('store_rental_bookings')
      .delete()
      .eq('id', bookingId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting rental booking:', error);
      return NextResponse.json({ error: 'Failed to delete booking' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/store/rental-bookings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
