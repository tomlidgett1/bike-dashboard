import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Product IDs for all active store inventory with Uber delivery enabled.
 * Used when assigning an Uber carousel to a section.
 */
export async function fetchUberEnabledProductIds(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('products')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('uber_delivery_enabled', true)
    .or('listing_status.is.null,listing_status.eq.active');

  if (error) {
    console.error('[uber-carousel] Failed to fetch Uber product IDs:', error);
    return [];
  }

  return (data ?? []).map((row) => row.id);
}
