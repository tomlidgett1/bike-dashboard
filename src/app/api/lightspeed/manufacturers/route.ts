/**
 * Lightspeed Manufacturers API
 *
 * Returns all manufacturers (brands) from the connected Lightspeed account.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createLightspeedClient } from '@/lib/services/lightspeed';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in first.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('account_type, bicycle_store')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
      return NextResponse.json(
        { error: 'Access denied. Only verified bicycle stores can load Lightspeed brands.' },
        { status: 403 },
      );
    }

    const { data: connection } = await supabase
      .from('lightspeed_connections')
      .select('status')
      .eq('user_id', user.id)
      .eq('status', 'connected')
      .single();

    if (!connection) {
      return NextResponse.json(
        { error: 'No active Lightspeed connection found. Please connect your Lightspeed account first.' },
        { status: 400 },
      );
    }

    const client = createLightspeedClient(user.id);
    const manufacturers = await client.getAllManufacturers();

    const brands = manufacturers
      .map((m) => ({
        id: String(m.manufacturerID),
        name: (m.name || '').trim(),
      }))
      .filter((m) => m.name)
      .sort((a, b) => a.name.localeCompare(b.name, 'en-AU'));

    return NextResponse.json({ manufacturers: brands });
  } catch (error) {
    console.error('Error in GET /api/lightspeed/manufacturers:', error);

    if (error instanceof Error && error.message.includes('No valid access token')) {
      return NextResponse.json(
        { error: 'Lightspeed connection expired. Please reconnect your account.' },
        { status: 401 },
      );
    }

    return NextResponse.json({ error: 'Failed to load Lightspeed brands' }, { status: 500 });
  }
}
