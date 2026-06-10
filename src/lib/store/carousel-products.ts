import type { SupabaseClient } from '@supabase/supabase-js';

type CarouselRow = {
  id: string;
  name?: string;
  source: string;
  lightspeed_category_id?: string | null;
  lightspeed_category_name?: string | null;
  brand_name?: string | null;
  product_ids?: string[] | null;
};

/** Active in-stock products used for carousel assignment. */
export async function fetchCarouselEligibleProductIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('products')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .gt('qoh', 0);

  if (error) {
    console.error('[carousel-products] Failed to fetch eligible products:', error);
    return [];
  }

  return (data ?? []).map((row) => row.id);
}

export async function resolveCarouselProductIds(
  supabase: SupabaseClient,
  userId: string,
  carousel: CarouselRow,
  eligibleIds?: Set<string>,
): Promise<string[]> {
  if (carousel.source === 'lightspeed' && carousel.lightspeed_category_id) {
    const { data, error } = await supabase
      .from('products')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .gt('qoh', 0)
      .eq('lightspeed_category_id', carousel.lightspeed_category_id);

    if (error) {
      console.error('[carousel-products] Lightspeed resolve failed:', error);
      return carousel.product_ids ?? [];
    }

    const ids = (data ?? []).map((row) => row.id);
    return eligibleIds ? ids.filter((id) => eligibleIds.has(id)) : ids;
  }

  if (carousel.source === 'brand' && carousel.brand_name) {
    const brandLower = carousel.brand_name.toLowerCase();
    const { data, error } = await supabase
      .from('products')
      .select('id, manufacturer_name')
      .eq('user_id', userId)
      .eq('is_active', true)
      .gt('qoh', 0)
      .ilike('manufacturer_name', carousel.brand_name);

    if (error) {
      console.error('[carousel-products] Brand resolve failed:', error);
      return carousel.product_ids ?? [];
    }

    const ids = (data ?? [])
      .filter((row) => (row.manufacturer_name ?? '').toLowerCase() === brandLower)
      .map((row) => row.id);
    return eligibleIds ? ids.filter((id) => eligibleIds.has(id)) : ids;
  }

  if (carousel.source === 'uber') {
    const { data, error } = await supabase
      .from('products')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('uber_delivery_enabled', true)
      .or('listing_status.is.null,listing_status.eq.active');

    if (error) {
      console.error('[carousel-products] Uber resolve failed:', error);
      return carousel.product_ids ?? [];
    }

    const ids = (data ?? []).map((row) => row.id);
    return eligibleIds ? ids.filter((id) => eligibleIds.has(id)) : ids;
  }

  const stored = carousel.product_ids ?? [];
  return eligibleIds ? stored.filter((id) => eligibleIds.has(id)) : stored;
}

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
}

/** Keep stored product_ids in sync for dynamic carousel sources. */
export async function syncDynamicCarouselProductIds(
  supabase: SupabaseClient,
  userId: string,
  categories: CarouselRow[],
): Promise<Array<CarouselRow & { product_ids: string[]; resolved_product_count: number }>> {
  const dynamicSources = new Set(['lightspeed', 'brand', 'uber']);

  return Promise.all(
    categories.map(async (category) => {
      if (!dynamicSources.has(category.source)) {
        const productIds = category.product_ids ?? [];
        return {
          ...category,
          product_ids: productIds,
          resolved_product_count: productIds.length,
        };
      }

      const resolvedIds = await resolveCarouselProductIds(supabase, userId, category);
      const storedIds = category.product_ids ?? [];

      if (!sameIdSet(storedIds, resolvedIds)) {
        const { error } = await supabase
          .from('store_categories')
          .update({ product_ids: resolvedIds })
          .eq('id', category.id)
          .eq('user_id', userId);

        if (error) {
          console.error('[carousel-products] Failed to sync product_ids:', error);
        }
      }

      return {
        ...category,
        product_ids: resolvedIds,
        resolved_product_count: resolvedIds.length,
      };
    }),
  );
}
