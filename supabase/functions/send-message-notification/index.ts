// ============================================================
// EMAIL NOTIFICATION EDGE FUNCTION
// ============================================================
// Sends email notifications for new messages with smart batching
// Triggered by cron job every 2 minutes
//
// Features:
// - Resend integration for reliable email delivery
// - Smart batching: groups multiple messages in same conversation
// - Skips notifications if user has read them in-app
// - Respects user notification preferences
// - Checks for recent user activity to avoid redundant emails

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { sendEmail } from '../_shared/resend-client.ts';
import { messageNotificationTemplate } from '../_shared/email-templates/message-notification.ts';
import { messageDigestTemplate } from '../_shared/email-templates/message-digest.ts';

const BATCH_SIZE = 100;
const ACTIVITY_THRESHOLD_MINUTES = 30;

interface NotificationWithDetails {
  id: string;
  user_id: string;
  type: string;
  conversation_id: string;
  message_id: string | null;
  is_read: boolean;
  created_at: string;
  notification_category: string;
  priority: string;
  email_delivery_status: string;
  email_scheduled_for: string | null;
  conversations: {
    id: string;
    subject: string;
    product_id: string | null;
    products?: {
      id: string;
      description: string;
      display_name: string | null;
      price: number;
      primary_image_url: string | null;
    };
  };
  messages: {
    id: string;
    content: string;
    sender_id: string;
    created_at: string;
  } | null;
}

interface UserPreferences {
  email_enabled: boolean;
  email_frequency: 'instant' | 'smart' | 'digest' | 'critical_only';
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
}

interface EmailDecision {
  send: boolean;
  reason: string;
  scheduleFor?: Date;
  batch?: boolean;
  batchedNotifications?: NotificationWithDetails[];
}

Deno.serve(async (_req) => {
  const startTime = Date.now();
  console.log('[Message Notifications] Starting processing...');

  try {
    // Create Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Fetch pending AND scheduled message notifications (not offer notifications)
    const { data: notifications, error: fetchError } = await supabase
      .from('notifications')
      .select(`
        id,
        user_id,
        type,
        conversation_id,
        message_id,
        is_read,
        created_at,
        notification_category,
        priority,
        email_delivery_status,
        email_scheduled_for,
        conversations(
          id,
          subject,
          product_id,
          products(
            id,
            description,
            display_name,
            price,
            primary_image_url
          )
        ),
        messages(
          id,
          content,
          sender_id,
          created_at
        )
      `)
      .eq('notification_category', 'message')
      .or(`email_delivery_status.eq.pending,and(email_delivery_status.eq.scheduled,email_scheduled_for.lte.${new Date().toISOString()})`)
      .eq('is_read', false)  // Skip already read notifications
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error('[Message Notifications] Error fetching:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch notifications' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!notifications || notifications.length === 0) {
      console.log('[Message Notifications] No pending notifications');
      return new Response(
        JSON.stringify({ message: 'No pending notifications', count: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Message Notifications] Found ${notifications.length} pending notifications`);

    // Get unique user IDs
    const userIds = [...new Set(notifications.map((n: any) => n.user_id))];
    const senderIds = [...new Set(
      notifications.map((n: any) => n.messages?.sender_id).filter(Boolean)
    )];

    // Fetch user data, preferences, and sender info in parallel
    const [usersResult, preferencesResult, sendersResult] = await Promise.all([
      supabase
        .from('users')
        .select('user_id, email, name, business_name, email_notifications')
        .in('user_id', userIds),
      supabase
        .from('notification_preferences')
        .select('user_id, email_enabled, email_frequency, quiet_hours_enabled, quiet_hours_start, quiet_hours_end')
        .in('user_id', userIds),
      supabase
        .from('users')
        .select('user_id, name, business_name')
        .in('user_id', senderIds),
    ]);

    // Create lookup maps
    const userMap = new Map(usersResult.data?.map((u: any) => [u.user_id, u]) || []);
    const preferencesMap = new Map(preferencesResult.data?.map((p: any) => [p.user_id, p]) || []);
    const senderMap = new Map(sendersResult.data?.map((s: any) => [s.user_id, s]) || []);

    // Group notifications by conversation for batching
    const notificationsByConversation = new Map<string, NotificationWithDetails[]>();
    for (const notification of notifications as NotificationWithDetails[]) {
      const conversationId = notification.conversation_id;
      if (!notificationsByConversation.has(conversationId)) {
        notificationsByConversation.set(conversationId, []);
      }
      notificationsByConversation.get(conversationId)!.push(notification);
    }

    // Process results
    const results = {
      sent: 0,
      skipped: 0,
      scheduled: 0,
      failed: 0,
      details: [] as any[],
    };

    // Process each conversation group
    for (const [conversationId, conversationNotifications] of notificationsByConversation) {
      const firstNotification = conversationNotifications[0];
      const userId = firstNotification.user_id;
      const user = userMap.get(userId);
      const preferences = preferencesMap.get(userId) as UserPreferences | undefined;

      // Skip if no user or no email
      if (!user || !user.email) {
        await markNotificationsAs(supabase, conversationNotifications.map(n => n.id), 'skipped');
        results.skipped += conversationNotifications.length;
        results.details.push({
          conversationId,
          status: 'skipped',
          reason: 'no_user_or_email',
        });
        continue;
      }

      // Check if user has disabled email notifications (legacy field)
      if (user.email_notifications === false) {
        await markNotificationsAs(supabase, conversationNotifications.map(n => n.id), 'skipped');
        results.skipped += conversationNotifications.length;
        results.details.push({
          conversationId,
          status: 'skipped',
          reason: 'email_notifications_disabled',
        });
        continue;
      }

      // Check notification preferences
      if (preferences && !preferences.email_enabled) {
        await markNotificationsAs(supabase, conversationNotifications.map(n => n.id), 'skipped');
        results.skipped += conversationNotifications.length;
        results.details.push({
          conversationId,
          status: 'skipped',
          reason: 'preferences_disabled',
        });
        continue;
      }

      // Check if user is active (sent a message recently)
      const isUserActive = await checkUserActivity(supabase, userId);
      if (isUserActive) {
        // Schedule for later instead of sending now
        const scheduleFor = new Date(Date.now() + ACTIVITY_THRESHOLD_MINUTES * 60 * 1000);
        await scheduleNotifications(supabase, conversationNotifications.map(n => n.id), scheduleFor);
        results.scheduled += conversationNotifications.length;
        results.details.push({
          conversationId,
          status: 'scheduled',
          reason: 'user_active',
          scheduleFor,
        });
        continue;
      }

      // Check quiet hours
      if (preferences?.quiet_hours_enabled && isWithinQuietHours(preferences)) {
        const scheduleFor = getQuietHoursEnd(preferences);
        await scheduleNotifications(supabase, conversationNotifications.map(n => n.id), scheduleFor);
        results.scheduled += conversationNotifications.length;
        results.details.push({
          conversationId,
          status: 'scheduled',
          reason: 'quiet_hours',
          scheduleFor,
        });
        continue;
      }

      // Prepare and send email
      try {
        let emailContent;
        
        if (conversationNotifications.length === 1) {
          // Single message notification
          const notification = conversationNotifications[0];
          const sender = senderMap.get(notification.messages?.sender_id || '');
          const senderName = sender?.business_name || sender?.name || 'Someone';
          
          emailContent = messageNotificationTemplate({
            recipientName: user.name || user.email.split('@')[0],
            senderName,
            messagePreview: notification.messages?.content || 'Sent you a message',
            productInfo: notification.conversations?.products ? {
              name: notification.conversations.products.display_name || notification.conversations.products.description,
              price: notification.conversations.products.price,
              imageUrl: notification.conversations.products.primary_image_url || undefined,
            } : null,
            conversationId: notification.conversation_id,
            subject: notification.conversations?.subject || 'New Message',
            sentAt: notification.messages?.created_at || notification.created_at,
          });
        } else {
          // Multiple messages - send digest
          const messages = conversationNotifications.map(n => {
            const sender = senderMap.get(n.messages?.sender_id || '');
            return {
              senderName: sender?.business_name || sender?.name || 'Someone',
              messagePreview: n.messages?.content || 'Sent you a message',
              sentAt: n.messages?.created_at || n.created_at,
            };
          });

          emailContent = messageDigestTemplate({
            recipientName: user.name || user.email.split('@')[0],
            conversationId,
            conversationSubject: firstNotification.conversations?.subject || 'Conversation',
            messages,
            productInfo: firstNotification.conversations?.products ? {
              name: firstNotification.conversations.products.display_name || firstNotification.conversations.products.description,
              price: firstNotification.conversations.products.price,
              imageUrl: firstNotification.conversations.products.primary_image_url || undefined,
            } : null,
          });
        }

        // Send the email via Resend
        const emailResult = await sendEmail({
          to: user.email,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
          tags: [
            { name: 'type', value: 'message_notification' },
            { name: 'conversation_id', value: conversationId },
          ],
        });

        if (emailResult.success) {
          await markNotificationsAs(supabase, conversationNotifications.map(n => n.id), 'sent');
          results.sent += conversationNotifications.length;
          results.details.push({
            conversationId,
            status: 'sent',
            emailId: emailResult.id,
            recipient: user.email,
            messageCount: conversationNotifications.length,
          });
          console.log(`[Message Notifications] Sent email to ${user.email} for conversation ${conversationId}`);
        } else {
          await markNotificationsAs(supabase, conversationNotifications.map(n => n.id), 'failed');
          results.failed += conversationNotifications.length;
          results.details.push({
            conversationId,
            status: 'failed',
            error: emailResult.error,
          });
          console.error(`[Message Notifications] Failed to send to ${user.email}: ${emailResult.error}`);
        }
      } catch (error) {
        await markNotificationsAs(supabase, conversationNotifications.map(n => n.id), 'failed');
        results.failed += conversationNotifications.length;
        results.details.push({
          conversationId,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        console.error(`[Message Notifications] Exception for conversation ${conversationId}:`, error);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[Message Notifications] Completed in ${duration}ms. Sent: ${results.sent}, Skipped: ${results.skipped}, Scheduled: ${results.scheduled}, Failed: ${results.failed}`);

    return new Response(
      JSON.stringify({
        message: 'Message notifications processed',
        duration: `${duration}ms`,
        ...results,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Message Notifications] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

async function checkUserActivity(supabase: any, userId: string): Promise<boolean> {
  const thresholdTime = new Date(Date.now() - ACTIVITY_THRESHOLD_MINUTES * 60 * 1000).toISOString();
  
  const { data } = await supabase
    .from('messages')
    .select('id')
    .eq('sender_id', userId)
    .gt('created_at', thresholdTime)
    .limit(1);
  
  return data && data.length > 0;
}

function isWithinQuietHours(preferences: UserPreferences): boolean {
  if (!preferences.quiet_hours_enabled) return false;
  
  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
  const start = preferences.quiet_hours_start.slice(0, 5);
  const end = preferences.quiet_hours_end.slice(0, 5);
  
  // Handle overnight quiet hours (e.g., 22:00 to 08:00)
  if (start > end) {
    return currentTime >= start || currentTime < end;
  }
  
  return currentTime >= start && currentTime < end;
}

function getQuietHoursEnd(preferences: UserPreferences): Date {
  const now = new Date();
  const [hours, minutes] = preferences.quiet_hours_end.split(':').map(Number);
  
  const endTime = new Date(now);
  endTime.setHours(hours, minutes, 0, 0);
  
  // If end time is before now, it's tomorrow
  if (endTime <= now) {
    endTime.setDate(endTime.getDate() + 1);
  }
  
  return endTime;
}

async function markNotificationsAs(
  supabase: any,
  notificationIds: string[],
  status: 'sent' | 'skipped' | 'failed'
): Promise<void> {
  const updateData: any = {
    email_delivery_status: status,
  };
  
  if (status === 'sent') {
    updateData.is_emailed = true;
    updateData.email_sent_at = new Date().toISOString();
  }
  
  await supabase
    .from('notifications')
    .update(updateData)
    .in('id', notificationIds);
}

async function scheduleNotifications(
  supabase: any,
  notificationIds: string[],
  scheduleFor: Date
): Promise<void> {
  await supabase
    .from('notifications')
    .update({
      email_delivery_status: 'scheduled',
      email_scheduled_for: scheduleFor.toISOString(),
    })
    .in('id', notificationIds);
}
