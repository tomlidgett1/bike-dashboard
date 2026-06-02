// ============================================================
// ORDER NOTIFICATIONS API ROUTE
// ============================================================
// GET: Fetch user's order notifications

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveProductImage } from '@/lib/services/image-resolver';

type ProductImageRow = {
  product_id: string | null;
  canonical_product_id: string | null;
  cloudinary_public_id: string | null;
  cloudinary_url: string | null;
  external_url: string | null;
  thumbnail_url: string | null;
  card_url: string | null;
  is_primary: boolean | null;
  sort_order: number | null;
};

type NotificationProductRow = {
  id: string;
  description: string;
  display_name: string | null;
  canonical_product_id: string | null;
  primary_image_url: string | null;
  cached_image_url: string | null;
  images: unknown[] | null;
};

type NotificationPurchaseRow = {
  id: string;
  order_number: string;
  total_amount: number;
  status: string;
  product_id: string;
  buyer_id: string;
  seller_id: string;
  products: NotificationProductRow | NotificationProductRow[] | null;
};

type NotificationVoucherRow = {
  id: string;
  amount_cents: number;
  min_purchase_cents: number;
  description: string;
  status: string;
};

type NotificationTicketRow = {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
  category: string;
  purchase_id: string;
  purchases: NotificationPurchaseRow | NotificationPurchaseRow[] | null;
};

type NotificationRow = {
  id: string;
  user_id: string;
  purchase_id: string | null;
  ticket_id: string | null;
  voucher_id: string | null;
  type: string;
  notification_category: string;
  priority: string;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
  purchases: NotificationPurchaseRow | NotificationPurchaseRow[] | null;
  vouchers: NotificationVoucherRow | NotificationVoucherRow[] | null;
  support_tickets: NotificationTicketRow | NotificationTicketRow[] | null;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function resolveNotificationThumbnail(image: ProductImageRow | null | undefined): string | null {
  if (!image) return null;

  const resolved = resolveProductImage(image);
  return (
    image.thumbnail_url ||
    resolved?.thumbnail_url ||
    image.card_url ||
    resolved?.card_url ||
    image.external_url ||
    image.cloudinary_url ||
    null
  );
}

function indexPrimaryImageRows(rows: ProductImageRow[] | null | undefined, key: 'product_id' | 'canonical_product_id') {
  const imageByOwnerId = new Map<string, ProductImageRow>();

  [...(rows || [])]
    .sort((a, b) => {
      if (Boolean(a.is_primary) !== Boolean(b.is_primary)) {
        return a.is_primary ? -1 : 1;
      }
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    })
    .forEach((row) => {
      const ownerId = row[key];
      if (ownerId && !imageByOwnerId.has(ownerId)) {
        imageByOwnerId.set(ownerId, row);
      }
    });

  return imageByOwnerId;
}

export interface OrderNotification {
  id: string;
  user_id: string;
  purchase_id: string | null;
  ticket_id: string | null;
  voucher_id: string | null;
  type: string;
  notification_category: string;
  priority: string;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
  purchase?: {
    id: string;
    order_number: string;
    total_amount: number;
    status: string;
    product_id: string;
    buyer_id: string;
    seller_id: string;
    product?: {
      id: string;
      description: string;
      display_name: string | null;
      canonical_product_id: string | null;
      primary_image_url: string | null;
      cached_image_url: string | null;
      thumbnail_url: string | null;
      images: unknown[] | null;
    };
  };
  voucher?: {
    id: string;
    amount_cents: number;
    min_purchase_cents: number;
    description: string;
    status: string;
  };
  ticket?: {
    id: string;
    ticket_number: string;
    subject: string;
    status: string;
    category: string;
    purchase?: OrderNotification['purchase'];
  };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    // Parse query params
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const unreadOnly = searchParams.get('unreadOnly') === 'true';

    // Build query for order, voucher, and support notifications
    let query = supabase
      .from('notifications')
      .select(`
        id,
        user_id,
        purchase_id,
        ticket_id,
        voucher_id,
        type,
        notification_category,
        priority,
        is_read,
        created_at,
        read_at,
        purchases!purchase_id (
          id,
          order_number,
          total_amount,
          status,
          product_id,
          buyer_id,
          seller_id,
          products!product_id (
            id,
            description,
            display_name,
            canonical_product_id,
            primary_image_url,
            cached_image_url,
            images
          )
        ),
        vouchers!voucher_id (
          id,
          amount_cents,
          min_purchase_cents,
          description,
          status
        ),
        support_tickets!ticket_id (
          id,
          ticket_number,
          subject,
          status,
          category,
          purchase_id,
          purchases!purchase_id (
            id,
            order_number,
            total_amount,
            status,
            product_id,
            buyer_id,
            seller_id,
            products!product_id (
              id,
              description,
              display_name,
              canonical_product_id,
              primary_image_url,
              cached_image_url,
              images
            )
          )
        )
      `)
      .eq('user_id', user.id)
      .in('notification_category', ['order', 'voucher', 'support'])
      .order('created_at', { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    const { data, error: notificationsError } = await query;

    if (notificationsError) {
      console.error('Error fetching order notifications:', notificationsError);
      return NextResponse.json(
        { error: 'Failed to fetch notifications' },
        { status: 500 }
      );
    }

    const notifications = (data || []) as unknown as NotificationRow[];
    const products = notifications
      .flatMap((notification) => {
        const purchase = firstRelation(notification.purchases);
        const ticket = firstRelation(notification.support_tickets);
        const ticketPurchase = firstRelation(ticket?.purchases);
        return [
          firstRelation(purchase?.products),
          firstRelation(ticketPurchase?.products),
        ];
      })
      .filter((product): product is NotificationProductRow => Boolean(product));
    const productIds = [...new Set(products.map((product) => product.id).filter(Boolean))];
    const canonicalProductIds = [
      ...new Set(products.map((product) => product.canonical_product_id).filter(Boolean)),
    ] as string[];

    const [imagesByProductResult, imagesByCanonicalResult] = await Promise.all([
      productIds.length
        ? supabase
            .from('product_images')
            .select(
              'product_id, canonical_product_id, cloudinary_public_id, cloudinary_url, external_url, thumbnail_url, card_url, is_primary, sort_order'
            )
            .in('product_id', productIds)
            .eq('approval_status', 'approved')
        : Promise.resolve({ data: [] as ProductImageRow[], error: null }),
      canonicalProductIds.length
        ? supabase
            .from('product_images')
            .select(
              'product_id, canonical_product_id, cloudinary_public_id, cloudinary_url, external_url, thumbnail_url, card_url, is_primary, sort_order'
            )
            .in('canonical_product_id', canonicalProductIds)
            .eq('approval_status', 'approved')
        : Promise.resolve({ data: [] as ProductImageRow[], error: null }),
    ]);

    if (imagesByProductResult.error) {
      console.error('Error fetching notification product images by product id:', imagesByProductResult.error);
    }
    if (imagesByCanonicalResult.error) {
      console.error('Error fetching notification product images by canonical id:', imagesByCanonicalResult.error);
    }

    const imageByProductId = indexPrimaryImageRows(imagesByProductResult.data as ProductImageRow[], 'product_id');
    const imageByCanonicalProductId = indexPrimaryImageRows(
      imagesByCanonicalResult.data as ProductImageRow[],
      'canonical_product_id'
    );

    // Transform notifications to include order, voucher, and support ticket data
    const enrichedNotifications: OrderNotification[] = notifications.map((notification) => {
      const purchase = firstRelation(notification.purchases);
      const voucher = firstRelation(notification.vouchers);
      const ticket = firstRelation(notification.support_tickets);
      const product = firstRelation(purchase?.products);
      const ticketPurchase = firstRelation(ticket?.purchases);
      const ticketProduct = firstRelation(ticketPurchase?.products);
      const productImage =
        product &&
        (imageByProductId.get(product.id) ||
          (product.canonical_product_id
            ? imageByCanonicalProductId.get(product.canonical_product_id)
            : undefined));
      const ticketProductImage =
        ticketProduct &&
        (imageByProductId.get(ticketProduct.id) ||
          (ticketProduct.canonical_product_id
            ? imageByCanonicalProductId.get(ticketProduct.canonical_product_id)
            : undefined));

      return {
        id: notification.id,
        user_id: notification.user_id,
        purchase_id: notification.purchase_id,
        ticket_id: notification.ticket_id,
        voucher_id: notification.voucher_id,
        type: notification.type,
        notification_category: notification.notification_category,
        priority: notification.priority,
        is_read: notification.is_read,
        created_at: notification.created_at,
        read_at: notification.read_at,
        purchase: purchase ? {
          id: purchase.id,
          order_number: purchase.order_number,
          total_amount: purchase.total_amount,
          status: purchase.status,
          product_id: purchase.product_id,
          buyer_id: purchase.buyer_id,
          seller_id: purchase.seller_id,
          product: product ? {
            id: product.id,
            description: product.description,
            display_name: product.display_name,
            canonical_product_id: product.canonical_product_id,
            primary_image_url: product.primary_image_url,
            cached_image_url: product.cached_image_url,
            thumbnail_url:
              resolveNotificationThumbnail(productImage) ||
              product.cached_image_url ||
              product.primary_image_url ||
              null,
            images: product.images,
          } : undefined,
        } : undefined,
        voucher: voucher ? {
          id: voucher.id,
          amount_cents: voucher.amount_cents,
          min_purchase_cents: voucher.min_purchase_cents,
          description: voucher.description,
          status: voucher.status,
        } : undefined,
        ticket: ticket ? {
          id: ticket.id,
          ticket_number: ticket.ticket_number,
          subject: ticket.subject,
          status: ticket.status,
          category: ticket.category,
          purchase: ticketPurchase ? {
            id: ticketPurchase.id,
            order_number: ticketPurchase.order_number,
            total_amount: ticketPurchase.total_amount,
            status: ticketPurchase.status,
            product_id: ticketPurchase.product_id,
            buyer_id: ticketPurchase.buyer_id,
            seller_id: ticketPurchase.seller_id,
            product: ticketProduct ? {
              id: ticketProduct.id,
              description: ticketProduct.description,
              display_name: ticketProduct.display_name,
              canonical_product_id: ticketProduct.canonical_product_id,
              primary_image_url: ticketProduct.primary_image_url,
              cached_image_url: ticketProduct.cached_image_url,
              thumbnail_url:
                resolveNotificationThumbnail(ticketProductImage) ||
                ticketProduct.cached_image_url ||
                ticketProduct.primary_image_url ||
                null,
              images: ticketProduct.images,
            } : undefined,
          } : undefined,
        } : undefined,
      };
    });

    // Count unread notifications
    const { count: unreadCount } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('notification_category', ['order', 'voucher', 'support'])
      .eq('is_read', false);

    return NextResponse.json({
      notifications: enrichedNotifications,
      total: notifications?.length || 0,
      unread: unreadCount || 0,
    }, {
      headers: {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Unexpected error fetching order notifications:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
