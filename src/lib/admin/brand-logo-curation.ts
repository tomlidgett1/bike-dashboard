import type { SupabaseClient } from '@supabase/supabase-js';
import { buildBrandLogoSearchQuery } from '@/lib/store/brand-logo-serper';
import {
  importBrandLogoFromUrl,
  type BrandLogoCropPixels,
} from '@/lib/admin/import-brand-logo';
import { resolveYellowJerseyStoreUserId } from '@/lib/admin/yellow-jersey-store';

export type BrandLogoCurationStatus = 'pending' | 'approved' | 'skipped';

export interface BrandLogoCurationRow {
  id: string;
  store_user_id: string;
  brand_name: string;
  manufacturer_id: string | null;
  manufacturer_name: string | null;
  product_count: number;
  status: BrandLogoCurationStatus;
  approved_logo_url: string | null;
  store_brand_id: string | null;
  search_query: string | null;
  rejected_urls: string[];
  search_page: number;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

interface ProductBrandAggregate {
  brand_name: string;
  manufacturer_id: string | null;
  manufacturer_name: string | null;
  product_count: number;
}

function normaliseBrandKey(
  brandName: string,
  manufacturerId: string | null,
): string {
  return manufacturerId?.trim() || brandName.trim().toLowerCase();
}

function resolveDisplayBrandName(row: {
  manufacturer_name?: string | null;
  brand?: string | null;
}): string | null {
  const name = (row.manufacturer_name || row.brand || '').trim();
  return name || null;
}

export async function aggregateYellowJerseyBrands(
  supabase: SupabaseClient,
  storeUserId: string,
): Promise<ProductBrandAggregate[]> {
  const { data, error } = await supabase
    .from('products')
    .select('manufacturer_id, manufacturer_name, brand, qoh')
    .eq('user_id', storeUserId)
    .eq('is_active', true)
    .gt('qoh', 0);

  if (error) throw new Error(error.message);

  const counts = new Map<string, ProductBrandAggregate>();

  for (const row of data ?? []) {
    const brandName = resolveDisplayBrandName(row);
    if (!brandName) continue;

    const units = Math.max(0, Math.floor(Number(row.qoh) || 0));
    if (units <= 0) continue;

    const manufacturerId = row.manufacturer_id ? String(row.manufacturer_id) : null;
    const key = normaliseBrandKey(brandName, manufacturerId);
    const existing = counts.get(key);

    if (existing) {
      existing.product_count += units;
      continue;
    }

    counts.set(key, {
      brand_name: brandName,
      manufacturer_id: manufacturerId,
      manufacturer_name: row.manufacturer_name?.trim() || brandName,
      product_count: units,
    });
  }

  return Array.from(counts.values()).sort((a, b) => b.product_count - a.product_count);
}

export async function syncBrandLogoCurations(
  supabase: SupabaseClient,
  storeUserId: string,
): Promise<{ synced: number; total: number }> {
  const brands = await aggregateYellowJerseyBrands(supabase, storeUserId);
  if (brands.length === 0) return { synced: 0, total: 0 };

  const now = new Date().toISOString();
  const rows = brands.map((brand) => ({
    store_user_id: storeUserId,
    brand_name: brand.brand_name,
    manufacturer_id: brand.manufacturer_id,
    manufacturer_name: brand.manufacturer_name,
    product_count: brand.product_count,
    updated_at: now,
  }));

  // Batch upsert in chunks — sequential per-brand upserts were the main sync cost.
  const CHUNK = 100;
  let synced = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error, count } = await supabase
      .from('brand_logo_curations')
      .upsert(chunk, {
        onConflict: 'store_user_id,brand_key',
        ignoreDuplicates: false,
        count: 'exact',
      });

    if (error) {
      console.error('[brand-logo-curation] batch upsert failed:', error.message);
      continue;
    }
    synced += count ?? chunk.length;
  }

  return { synced, total: brands.length };
}

export async function listBrandLogoCurations(
  supabase: SupabaseClient,
  options: {
    storeUserId: string;
    status?: BrandLogoCurationStatus | 'all';
  },
): Promise<BrandLogoCurationRow[]> {
  let query = supabase
    .from('brand_logo_curations')
    .select('*')
    .eq('store_user_id', options.storeUserId)
    .order('product_count', { ascending: false })
    .order('brand_name', { ascending: true });

  if (options.status && options.status !== 'all') {
    query = query.eq('status', options.status);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as BrandLogoCurationRow[];
}

export async function getBrandLogoCurationById(
  supabase: SupabaseClient,
  id: string,
): Promise<BrandLogoCurationRow | null> {
  const { data, error } = await supabase
    .from('brand_logo_curations')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as BrandLogoCurationRow | null) ?? null;
}

async function upsertStoreBrand(options: {
  supabase: SupabaseClient;
  storeUserId: string;
  brand: BrandLogoCurationRow;
  logoUrl: string;
}): Promise<string> {
  const { supabase, storeUserId, brand, logoUrl } = options;

  if (brand.manufacturer_id) {
    const { data: existing } = await supabase
      .from('store_brands')
      .select('id')
      .eq('user_id', storeUserId)
      .eq('lightspeed_manufacturer_id', brand.manufacturer_id)
      .maybeSingle();

    if (existing?.id) {
      const { data: updated, error } = await supabase
        .from('store_brands')
        .update({
          name: brand.brand_name,
          logo_url: logoUrl,
          lightspeed_manufacturer_name: brand.manufacturer_name,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('id')
        .single();

      if (error) throw new Error(error.message);
      return updated.id;
    }
  }

  const { data: byName } = await supabase
    .from('store_brands')
    .select('id')
    .eq('user_id', storeUserId)
    .ilike('name', brand.brand_name)
    .maybeSingle();

  if (byName?.id) {
    const { data: updated, error } = await supabase
      .from('store_brands')
      .update({
        logo_url: logoUrl,
        lightspeed_manufacturer_id: brand.manufacturer_id,
        lightspeed_manufacturer_name: brand.manufacturer_name,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', byName.id)
      .select('id')
      .single();

    if (error) throw new Error(error.message);
    return updated.id;
  }

  const { data: maxOrder } = await supabase
    .from('store_brands')
    .select('display_order')
    .eq('user_id', storeUserId)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const displayOrder = (maxOrder?.display_order ?? -1) + 1;

  const { data: created, error } = await supabase
    .from('store_brands')
    .insert({
      user_id: storeUserId,
      name: brand.brand_name,
      logo_url: logoUrl,
      lightspeed_manufacturer_id: brand.manufacturer_id,
      lightspeed_manufacturer_name: brand.manufacturer_name,
      display_order: displayOrder,
      is_active: true,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return created.id;
}

export async function approveBrandLogo(options: {
  supabase: SupabaseClient;
  curationId: string;
  imageUrl: string;
  crop?: BrandLogoCropPixels | null;
  reviewedBy: string;
}): Promise<BrandLogoCurationRow> {
  const curation = await getBrandLogoCurationById(options.supabase, options.curationId);
  if (!curation) throw new Error('Brand curation not found');

  const adminStorage = options.supabase.storage.from('listing-images');
  const importResult = await importBrandLogoFromUrl({
    imageUrl: options.imageUrl,
    crop: options.crop,
    storagePathPrefix: `brands/${curation.store_user_id}`,
    upload: async (path, buffer, contentType) => {
      const { error } = await adminStorage.upload(path, buffer, {
        cacheControl: '31536000',
        contentType,
        upsert: false,
      });
      return { error: error ? new Error(error.message) : null };
    },
    getPublicUrl: (path) => adminStorage.getPublicUrl(path).data.publicUrl,
  });

  if ('error' in importResult) {
    throw new Error(importResult.error);
  }

  const storeBrandId = await upsertStoreBrand({
    supabase: options.supabase,
    storeUserId: curation.store_user_id,
    brand: curation,
    logoUrl: importResult.url,
  });

  const { data, error } = await options.supabase
    .from('brand_logo_curations')
    .update({
      status: 'approved',
      approved_logo_url: importResult.url,
      store_brand_id: storeBrandId,
      reviewed_at: new Date().toISOString(),
      reviewed_by: options.reviewedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', curation.id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as BrandLogoCurationRow;
}

export async function rejectBrandLogoCandidate(options: {
  supabase: SupabaseClient;
  curationId: string;
  imageUrl: string;
}): Promise<BrandLogoCurationRow> {
  const curation = await getBrandLogoCurationById(options.supabase, options.curationId);
  if (!curation) throw new Error('Brand curation not found');

  const rejected = Array.from(new Set([...(curation.rejected_urls ?? []), options.imageUrl.trim()]));

  const { data, error } = await options.supabase
    .from('brand_logo_curations')
    .update({
      rejected_urls: rejected,
      search_page: curation.search_page + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', curation.id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as BrandLogoCurationRow;
}

export async function skipBrandLogoCuration(options: {
  supabase: SupabaseClient;
  curationId: string;
  reviewedBy: string;
}): Promise<BrandLogoCurationRow> {
  const { data, error } = await options.supabase
    .from('brand_logo_curations')
    .update({
      status: 'skipped',
      reviewed_at: new Date().toISOString(),
      reviewed_by: options.reviewedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', options.curationId)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as BrandLogoCurationRow;
}

export function buildCurationSearchQuery(curation: BrandLogoCurationRow): string {
  return (
    curation.search_query?.trim() ||
    buildBrandLogoSearchQuery({ brandName: curation.brand_name })
  );
}

export async function ensureYellowJerseyStore(
  supabase: SupabaseClient,
): Promise<string> {
  const storeUserId = await resolveYellowJerseyStoreUserId(supabase);
  if (!storeUserId) {
    throw new Error(
      'Yellow Jersey store not found. Set YELLOW_JERSEY_STORE_USER_ID or ensure a bicycle store user exists with business_name containing "Yellow Jersey".',
    );
  }
  return storeUserId;
}
