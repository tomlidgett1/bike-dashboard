// ============================================================
// ORDER NOTIFICATIONS API ROUTE
// ============================================================
// GET: Fetch user's order notifications

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export interface OrderNotification {
  id: string;
  user_id: string;
  purchase_id: string | null;
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
      images: any[] | null;
    };
  };
  voucher?: {
    id: string;
    amount_cents: number;
    min_purchase_cents: number;
    description: string;
    status: string;
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

    // Build query for order and voucher notifications
    let query = supabase
      .from('notifications')
      .select(`
        id,
        user_id,
        purchase_id,
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
            images
          )
        ),
        vouchers!voucher_id (
          id,
          amount_cents,
          min_purchase_cents,
          description,
          status
        )
      `)
      .eq('user_id', user.id)
      .in('notification_category', ['order', 'voucher'])
      .order('created_at', { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    const { data: notifications, error: notificationsError } = await query;

    if (notificationsError) {
      console.error('Error fetching order notifications:', notificationsError);
      return NextResponse.json(
        { error: 'Failed to fetch notifications' },
        { status: 500 }
      );
    }

    // Transform notifications to include purchase and voucher data
    const enrichedNotifications: OrderNotification[] = (notifications || []).map((notification: any) => ({
      id: notification.id,
      user_id: notification.user_id,
      purchase_id: notification.purchase_id,
      voucher_id: notification.voucher_id,
      type: notification.type,
      notification_category: notification.notification_category,
      priority: notification.priority,
      is_read: notification.is_read,
      created_at: notification.created_at,
      read_at: notification.read_at,
      purchase: notification.purchases ? {
        id: notification.purchases.id,
        order_number: notification.purchases.order_number,
        total_amount: notification.purchases.total_amount,
        status: notification.purchases.status,
        product_id: notification.purchases.product_id,
        buyer_id: notification.purchases.buyer_id,
        seller_id: notification.purchases.seller_id,
        product: notification.purchases.products ? {
          id: notification.purchases.products.id,
          description: notification.purchases.products.description,
          display_name: notification.purchases.products.display_name,
          images: notification.purchases.products.images,
        } : undefined,
      } : undefined,
      voucher: notification.vouchers ? {
        id: notification.vouchers.id,
        amount_cents: notification.vouchers.amount_cents,
        min_purchase_cents: notification.vouchers.min_purchase_cents,
        description: notification.vouchers.description,
        status: notification.vouchers.status,
      } : undefined,
    }));

    // Count unread notifications (both order and voucher)
    const { count: unreadCount } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('notification_category', ['order', 'voucher'])
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




