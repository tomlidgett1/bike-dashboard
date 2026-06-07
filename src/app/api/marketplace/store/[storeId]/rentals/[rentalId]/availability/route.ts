import { NextRequest, NextResponse } from 'next/server';
import { addMonths, format } from 'date-fns';
import { mergeBookedDates } from '@/lib/rentals/availability';
import { createPublicSupabaseClient } from '@/lib/marketplace/public-card-feed';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function defaultRange() {
  const from = format(new Date(), 'yyyy-MM-dd');
  const to = format(addMonths(new Date(), 3), 'yyyy-MM-dd');
  return { from, to };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string; rentalId: string }> },
) {
  try {
    const { storeId, rentalId } = await params;
    const supabase = createPublicSupabaseClient();

    const { data: rental, error: rentalError } = await supabase
      .from('store_rentals')
      .select('id, user_id, is_active, is_available')
      .eq('id', rentalId)
      .eq('user_id', storeId)
      .eq('is_active', true)
      .maybeSingle();

    if (rentalError || !rental) {
      return NextResponse.json({ error: 'Rental not found' }, { status: 404 });
    }

    const defaults = defaultRange();
    const from = request.nextUrl.searchParams.get('from') || defaults.from;
    const to = request.nextUrl.searchParams.get('to') || defaults.to;

    if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) {
      return NextResponse.json({ error: 'from and to must be YYYY-MM-DD' }, { status: 400 });
    }

    const { data: bookings, error } = await supabase
      .from('store_rental_bookings')
      .select('id, start_date, end_date, status')
      .eq('rental_id', rentalId)
      .in('status', ['pending', 'confirmed'])
      .lte('start_date', to)
      .gte('end_date', from)
      .order('start_date', { ascending: true });

    if (error) {
      console.error('Error fetching rental availability:', error);
      return NextResponse.json({ error: 'Failed to fetch availability' }, { status: 500 });
    }

    const activeBookings = bookings ?? [];
    const booked_dates = mergeBookedDates(activeBookings).filter(
      (date) => date >= from && date <= to,
    );

    return NextResponse.json({
      booked_dates,
      bookings: activeBookings,
      is_available: rental.is_available,
    });
  } catch (error) {
    console.error('Error in rental availability GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
