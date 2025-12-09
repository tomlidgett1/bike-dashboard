// ============================================================
// NOTIFICATIONS API ROUTE
// ============================================================
// GET: Fetch user's notifications

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { GetNotificationsResponse } from '@/lib/types/message';

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

    // Build query
    let query = supabase
      .from('notifications')
      .select(
        `
        *,
        conversations(id, subject, product_id),
        messages(id, content, sender_id)
      `
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    const { data: notifications, error: notificationsError } = await query;

    if (notificationsError) {
      console.error('Error fetching notifications:', notificationsError);
      return NextResponse.json(
        { error: 'Failed to fetch notifications' },
        { status: 500 }
      );
    }

    // Get sender details for messages
    const senderIds = [
      ...new Set(
        notifications
          ?.map((n: any) => n.messages?.sender_id)
          .filter(Boolean) as string[]
      ),
    ];

    let sendersMap = new Map();
    if (senderIds.length > 0) {
      const { data: senders } = await supabase
        .from('users')
        .select('user_id, name, business_name')
        .in('user_id', senderIds);

      senders?.forEach((sender) => {
        sendersMap.set(sender.user_id, sender);
      });
    }

    // Enrich notifications
    const enrichedNotifications = notifications?.map((notification: any) => ({
      id: notification.id,
      user_id: notification.user_id,
      type: notification.type,
      conversation_id: notification.conversation_id,
      message_id: notification.message_id,
      is_read: notification.is_read,
      is_emailed: notification.is_emailed,
      email_sent_at: notification.email_sent_at,
      created_at: notification.created_at,
      read_at: notification.read_at,
      conversation: notification.conversations
        ? {
            id: notification.conversations.id,
            subject: notification.conversations.subject,
            product_id: notification.conversations.product_id,
          }
        : undefined,
      message: notification.messages
        ? {
            id: notification.messages.id,
            content: notification.messages.content,
            sender_id: notification.messages.sender_id,
          }
        : undefined,
      sender: notification.messages?.sender_id
        ? sendersMap.get(notification.messages.sender_id)
        : undefined,
    }));

    // Count unread notifications
    const { count: unreadCount } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    const response: GetNotificationsResponse = {
      notifications: enrichedNotifications || [],
      total: notifications?.length || 0,
      unread: unreadCount || 0,
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Unexpected error fetching notifications:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}






