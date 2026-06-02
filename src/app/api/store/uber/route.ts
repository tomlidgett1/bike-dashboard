import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { normaliseUberNotificationPhones } from '@/lib/uber-delivery';

interface UberSettingsProduct {
  id: string;
  name: string;
  price: number;
  category: string;
  subcategory: string | null;
  stock: number | null;
  image_url: string | null;
  uber_delivery_enabled: boolean;
  listing_source: string | null;
}

interface UberProductImageRow {
  cloudinary_url?: string | null;
  external_url?: string | null;
  is_primary?: boolean | null;
  approval_status?: string | null;
  sort_order?: number | null;
}

interface UberProductRow {
  id: string;
  description?: string | null;
  display_name?: string | null;
  price?: number | string | null;
  qoh?: number | null;
  category_name?: string | null;
  marketplace_category?: string | null;
  marketplace_subcategory?: string | null;
  listing_source?: string | null;
  cached_image_url?: string | null;
  cached_thumbnail_url?: string | null;
  primary_image_url?: string | null;
  uber_delivery_enabled?: boolean | null;
  product_images?: UberProductImageRow[] | null;
}

async function requireBikeStore() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { supabase, user: null, profile: null, response: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('user_id, account_type, bicycle_store, business_name, phone, uber_notification_phones')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileError || !profile || profile.account_type !== 'bicycle_store' || profile.bicycle_store !== true) {
    return {
      supabase,
      user,
      profile,
      response: NextResponse.json({ error: 'Uber settings are only available to verified bike stores' }, { status: 403 }),
    };
  }

  return { supabase, user, profile, response: null };
}

function productName(product: UberProductRow): string {
  return product.display_name || product.description || 'Untitled product';
}

function productImage(product: UberProductRow): string | null {
  if (product.cached_thumbnail_url) return product.cached_thumbnail_url;
  if (product.cached_image_url) return product.cached_image_url;
  if (product.primary_image_url) return product.primary_image_url;

  if (Array.isArray(product.product_images) && product.product_images.length > 0) {
    const approvedImages = product.product_images.filter(
      (image) => image.approval_status === 'approved' || image.approval_status == null
    );
    const image =
      approvedImages.find((item) => item.is_primary) ||
      approvedImages.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];
    if (!image) return null;
    return image.cloudinary_url || image.external_url || null;
  }

  return null;
}

export async function GET() {
  const guard = await requireBikeStore();
  if (guard.response) return guard.response;

  const { supabase, user, profile } = guard;

  const { data: products, error } = await supabase
    .from('products')
    .select(`
      id,
      description,
      display_name,
      price,
      qoh,
      category_name,
      marketplace_category,
      marketplace_subcategory,
      listing_source,
      listing_status,
      is_active,
      cached_image_url,
      cached_thumbnail_url,
      primary_image_url,
      uber_delivery_enabled,
      product_images!product_id (
        cloudinary_url,
        external_url,
        is_primary,
        approval_status,
        sort_order
      )
    `)
    .eq('user_id', user!.id)
    .eq('is_active', true)
    .or('listing_status.is.null,listing_status.eq.active')
    .order('category_name', { ascending: true })
    .order('display_name', { ascending: true });

  if (error) {
    console.error('[Store Uber] Product fetch error:', error);
    return NextResponse.json({ error: 'Failed to load Uber products' }, { status: 500 });
  }

  const formattedProducts: UberSettingsProduct[] = ((products || []) as UberProductRow[]).map((product) => ({
    id: product.id,
    name: productName(product),
    price: Number(product.price) || 0,
    category: product.category_name || product.marketplace_category || 'Uncategorised',
    subcategory: product.marketplace_subcategory || null,
    stock: typeof product.qoh === 'number' ? product.qoh : null,
    image_url: productImage(product),
    uber_delivery_enabled: !!product.uber_delivery_enabled,
    listing_source: product.listing_source || null,
  }));

  return NextResponse.json({
    store: {
      name: profile!.business_name || 'Bike store',
      phone: profile!.phone || '',
      notificationPhones: normaliseUberNotificationPhones(profile!.uber_notification_phones),
    },
    products: formattedProducts,
  });
}

export async function PATCH(request: NextRequest) {
  const guard = await requireBikeStore();
  if (guard.response) return guard.response;

  const { supabase, user } = guard;
  const body = await request.json();

  if ('notificationPhones' in body) {
    const phones = normaliseUberNotificationPhones(body.notificationPhones);
    const { error } = await supabase
      .from('users')
      .update({ uber_notification_phones: phones, updated_at: new Date().toISOString() })
      .eq('user_id', user!.id);

    if (error) {
      console.error('[Store Uber] Phone update error:', error);
      return NextResponse.json({ error: 'Failed to save phone numbers' }, { status: 500 });
    }

    return NextResponse.json({ success: true, notificationPhones: phones });
  }

  if ('productId' in body && 'uberDeliveryEnabled' in body) {
    const productId = String(body.productId || '');
    if (!productId) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('products')
      .update({
        uber_delivery_enabled: !!body.uberDeliveryEnabled,
        updated_at: new Date().toISOString(),
      })
      .eq('id', productId)
      .eq('user_id', user!.id);

    if (error) {
      console.error('[Store Uber] Product update error:', error);
      return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      productId,
      uberDeliveryEnabled: !!body.uberDeliveryEnabled,
    });
  }

  return NextResponse.json({ error: 'No supported update provided' }, { status: 400 });
}
