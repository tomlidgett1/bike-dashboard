import { NextRequest, NextResponse } from 'next/server';
import { isRangeAvailable, normaliseDateRange } from '@/lib/rentals/availability';
import { createPublicSupabaseClient } from '@/lib/marketplace/public-card-feed';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string; rentalId: string }> },
) {
  try {
    const { storeId, rentalId } = await params;
    const body = await request.json();

    const start = body.start_date as string | undefined;
    const end = body.end_date as string | undefined;

    if (!start || !end || !DATE_PATTERN.test(start) || !DATE_PATTERN.test(end)) {
      return NextResponse.json(
        { error: 'start_date and end_date must be YYYY-MM-DD' },
        { status: 400 },
      );
    }

    const customerName = typeof body.customer_name === 'string' ? body.customer_name.trim() : '';
    const customerPhone = typeof body.customer_phone === 'string' ? body.customer_phone.trim() : '';
    const customerEmail = typeof body.customer_email === 'string' ? body.customer_email.trim() : '';

    if (!customerName) {
      return NextResponse.json({ error: 'Your name is required' }, { status: 400 });
    }

    if (!customerPhone && !customerEmail) {
      return NextResponse.json(
        { error: 'A phone number or email is required' },
        { status: 400 },
      );
    }

    const supabase = createPublicSupabaseClient();

    const { data: rental, error: rentalError } = await supabase
      .from('store_rentals')
      .select('id, user_id, is_active, is_available')
      .eq('id', rentalId)
      .eq('user_id', storeId)
      .eq('is_active', true)
      .maybeSingle();

    if (rentalError || !rental || !rental.is_available) {
      return NextResponse.json({ error: 'Rental not found or unavailable' }, { status: 404 });
    }

    const { start: rangeStart, end: rangeEnd } = normaliseDateRange(start, end);

    const { data: existingBookings, error: bookingsError } = await supabase
      .from('store_rental_bookings')
      .select('id, start_date, end_date, status')
      .eq('rental_id', rentalId)
      .in('status', ['pending', 'confirmed']);

    if (bookingsError) {
      console.error('Error checking rental availability:', bookingsError);
      return NextResponse.json({ error: 'Failed to check availability' }, { status: 500 });
    }

    if (!isRangeAvailable(rangeStart, rangeEnd, existingBookings ?? [])) {
      return NextResponse.json(
        { error: 'These dates are no longer available' },
        { status: 409 },
      );
    }

    const { data: booking, error } = await supabase
      .from('store_rental_bookings')
      .insert({
        user_id: rental.user_id,
        rental_id: rentalId,
        start_date: rangeStart,
        end_date: rangeEnd,
        customer_name: customerName,
        customer_phone: customerPhone || null,
        customer_email: customerEmail || null,
        status: 'pending',
        notes: null,
      })
      .select('id, start_date, end_date, status')
      .single();

    if (error) {
      console.error('Error creating rental booking request:', error);
      return NextResponse.json({ error: 'Failed to submit booking request' }, { status: 500 });
    }

    return NextResponse.json({ booking }, { status: 201 });
  } catch (error) {
    console.error('Error in rental booking POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
