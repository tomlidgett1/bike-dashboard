/**
 * Online Products Creation API
 * POST /api/store/online-products/create
 *
 * Creates store_inventory products from online catalog screenshots.
 * Products are tagged with listing_source='online_catalog' so they show
 * the "Online Only" badge on the marketplace.
 *
 * For each product:
 *  1. Find or create a canonical_product
 *  2. Insert into products table as store_inventory / online_catalog
 *  3. Insert approved images into product_images linked to canonical
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  buildExistingCatalogIndex,
  catalogMatchKey,
  findDuplicateForProduct,
} from '@/lib/store/online-products-csv';

export const dynamic = 'force-dynamic';

interface CandidateImage {
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
}

interface CsvRowLink {
  csvRowId: string;
}

interface IncomingProduct {
  name: string;
  brand: string | null;
  price: number | null;
  soh?: number | null;
  /** Raw CSV row label — stored on products.description for optimise title checks */
  catalogDescription?: string | null;
  description: string | null;
  specs: string | null;
  category: string;
  subcategory: string;
  selectedCandidates: CandidateImage[];
  primaryUrl: string;
}

function resolveProductQoh(soh: number | null | undefined) {
  if (typeof soh === 'number' && Number.isFinite(soh)) {
    return Math.max(0, Math.floor(soh));
  }
  return 9999;
}

async function ensureCanonical(
  supabase: Awaited<ReturnType<typeof createClient>>,
  name: string,
  brand: string | null,
): Promise<string> {
  const normalized = name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ');

  const { data: existing } = await supabase
    .from('canonical_products')
    .select('id')
    .eq('normalized_name', normalized)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from('canonical_products')
    .insert({
      normalized_name: normalized,
      manufacturer: brand || null,
      cleaned: false,
    })
    .select('id')
    .single();

  if (error || !created) throw new Error(`Failed to create canonical product: ${error?.message}`);
  return created.id;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    const { data: profile } = await supabase
      .from('users')
      .select('account_type, bicycle_store')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const products: IncomingProduct[] = body.products || [];
    const csvLinks: CsvRowLink[] = Array.isArray(body.csvLinks) ? body.csvLinks : [];
    const onlineOnly = body.onlineOnly !== false;
    const listingSource = onlineOnly ? 'online_catalog' : 'manual';
    const skuPrefix = onlineOnly ? 'ONLINE' : 'STORE';

    if (!products.length) {
      return NextResponse.json({ error: 'No products provided' }, { status: 400 });
    }

    const createdIds: string[] = [];
    const errors: string[] = [];
    const skippedDuplicates: string[] = [];
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    const { data: existingRows } = await supabase
      .from('products')
      .select('id, display_name, description, brand')
      .eq('user_id', user.id)
      .eq('listing_type', 'store_inventory');

    const catalogIndex = buildExistingCatalogIndex(existingRows ?? []);

    const now = Date.now();
    for (let i = 0; i < products.length; i++) {
      const product = products[i];

      const duplicate = findDuplicateForProduct(product.name, product.brand, catalogIndex);
      if (duplicate) {
        skippedDuplicates.push(product.name);
        errors.push(`${product.name}: duplicate of existing store product`);
        continue;
      }

      const resolvedPrice =
        typeof product.price === 'number' && Number.isFinite(product.price) ? product.price : 0;

      const catalogDescription =
        product.catalogDescription?.trim() ||
        product.description?.trim() ||
        product.name;

      // 1. Find or create canonical product
      const canonicalId = await ensureCanonical(supabase, product.name, product.brand);

      const { data: categoryId } = await supabase.rpc('resolve_marketplace_category_id', {
        p_level1: product.category,
        p_level2: product.subcategory,
        p_level3: null,
      });

      if (categoryId) {
        await supabase
          .from('canonical_products')
          .update({
            marketplace_category_id: categoryId,
            categorisation_status: 'classified',
            categorisation_source: 'online_catalog',
            categorisation_confidence: 0.9,
            categorised_at: new Date().toISOString(),
          })
          .eq('id', canonicalId)
          .neq('categorisation_status', 'classified');
      }

      // 2. Create the store product
      const { data: inserted, error: insertError } = await supabase
        .from('products')
        .insert({
          user_id: user.id,
          listing_type: 'store_inventory',
          listing_source: listingSource,
          listing_status: 'active',
          is_active: true,
          canonical_product_id: canonicalId,
          description: catalogDescription,
          display_name: product.name,
          brand: product.brand,
          price: resolvedPrice,
          marketplace_category: product.category,
          marketplace_subcategory: product.subcategory,
          product_description: product.description || null,
          product_specs: product.specs || null,
          qoh: resolveProductQoh(product.soh),
          system_sku: `${skuPrefix}-${now}-${i}`,
          lightspeed_item_id: `${listingSource}-${now}-${i}`,
          primary_image_url: product.primaryUrl || null,
        })
        .select('id')
        .single();

      if (insertError || !inserted) {
        console.error('[online-products/create] product insert error:', insertError);
        errors.push(`${product.name}: ${insertError?.message ?? 'unknown error'}`);
        continue;
      }

      createdIds.push(inserted.id);

      const csvRowId = csvLinks[i]?.csvRowId;
      if (csvRowId) {
        await supabase
          .from('online_product_csv_rows')
          .update({
            status: 'created',
            created_product_id: inserted.id,
            is_selected: false,
          })
          .eq('id', csvRowId);
      }

      const matchKey = catalogMatchKey(product.name, product.brand);
      if (matchKey) {
        catalogIndex.byCatalogKey.set(matchKey, {
          existingProductId: inserted.id,
          existingProductName: product.name,
        });
      }

      // 3. Save approved images into product_images linked to canonical product
      if (product.selectedCandidates.length > 0) {
        // Clear any existing pending images for this canonical product
        await supabase
          .from('product_images')
          .update({ approval_status: 'rejected' })
          .eq('canonical_product_id', canonicalId)
          .eq('approval_status', 'pending');

        for (let i = 0; i < product.selectedCandidates.length; i++) {
          const candidate = product.selectedCandidates[i];
          if (!candidate?.url) continue;

          const isPrimary = candidate.url === product.primaryUrl;

          const { data: imgInserted } = await supabase
            .from('product_images')
            .insert({
              canonical_product_id: canonicalId,
              external_url: candidate.url,
              width: candidate.width || null,
              height: candidate.height || null,
              is_downloaded: false,
              approval_status: 'approved',
              is_primary: isPrimary,
              sort_order: i,
              source: 'serper_workbench',
              uploaded_by: user.id,
            })
            .select('id')
            .single();

          // Schedule Cloudinary upload in the background
          if (imgInserted && supabaseUrl && accessToken) {
            void fetch(`${supabaseUrl}/functions/v1/upload-to-cloudinary`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                imageUrl: candidate.url,
                listingId: `canonical-${canonicalId}`,
                index: i,
              }),
            })
              .then(async (res) => {
                if (!res.ok) return;
                const data = await res.json();
                if (!data.success) return;
                await supabase
                  .from('product_images')
                  .update({
                    cloudinary_url: data.data?.url,
                    cloudinary_public_id: data.data?.publicId,
                    is_downloaded: true,
                  })
                  .eq('id', imgInserted.id);
              })
              .catch(() => undefined);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      created: createdIds.length,
      ids: createdIds,
      errors,
      skippedDuplicates: skippedDuplicates.length,
      onlineOnly,
    });
  } catch (err) {
    console.error('[online-products/create]', err);
    return NextResponse.json({ error: 'Failed to create products' }, { status: 500 });
  }
}
