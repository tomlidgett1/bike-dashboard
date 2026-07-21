import type { SupabaseClient } from '@supabase/supabase-js';

type BrandMatchInput = {
  manufacturer_id?: string | null;
  manufacturer_name?: string | null;
  brand?: string | null;
};

type StoreBrandRow = {
  logo_url: string | null;
  name: string;
  lightspeed_manufacturer_id: string | null;
  lightspeed_manufacturer_name: string | null;
};

function normaliseBrandName(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

/**
 * Resolve a product's brand logo for public product pages.
 *
 * Reads `store_brands` (public SELECT). Admin approve writes the logo there
 * after curation, so approved logos appear here. `brand_logo_curations` is
 * service-role only and cannot be queried from the public product page client.
 */
export async function resolveProductBrandLogoUrl(
  supabase: SupabaseClient,
  storeUserId: string,
  product: BrandMatchInput,
): Promise<string | null> {
  const { data: brands, error } = await supabase
    .from('store_brands')
    .select('logo_url, name, lightspeed_manufacturer_id, lightspeed_manufacturer_name')
    .eq('user_id', storeUserId)
    .eq('is_active', true)
    .not('logo_url', 'is', null);

  if (error || !brands?.length) return null;

  const withLogos = brands as StoreBrandRow[];
  const manufacturerId = product.manufacturer_id ? String(product.manufacturer_id) : null;
  const nameCandidates = [product.manufacturer_name, product.brand]
    .map(normaliseBrandName)
    .filter(Boolean);

  if (manufacturerId) {
    const byId = withLogos.find(
      (b) =>
        b.lightspeed_manufacturer_id &&
        String(b.lightspeed_manufacturer_id) === manufacturerId,
    );
    if (byId?.logo_url) return byId.logo_url;
  }

  for (const candidate of nameCandidates) {
    const byLsName = withLogos.find(
      (b) => normaliseBrandName(b.lightspeed_manufacturer_name) === candidate,
    );
    if (byLsName?.logo_url) return byLsName.logo_url;

    const byName = withLogos.find((b) => normaliseBrandName(b.name) === candidate);
    if (byName?.logo_url) return byName.logo_url;
  }

  return null;
}
