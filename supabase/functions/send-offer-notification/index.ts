// ============================================================
// OFFER NOTIFICATION EDGE FUNCTION
// ============================================================
// Sends email notifications for offer-related events
// Triggered by cron job every 1 minute (offers are time-sensitive)
//
// Handles:
// - offer_received: New offer submitted (notify seller)
// - offer_accepted: Offer accepted (notify buyer)
// - offer_rejected: Offer rejected (notify buyer)
// - offer_countered: Counter offer made (notify buyer)
// - offer_expired: Offer expired (notify both parties)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { sendEmail } from '../_shared/resend-client.ts';
import { offerReceivedTemplate } from '../_shared/email-templates/offer-received.ts';
import { offerStatusTemplate, OfferStatusType } from '../_shared/email-templates/offer-status.ts';

const BATCH_SIZE = 50;

interface OfferNotification {
  id: string;
  user_id: string;
  type: string;
  offer_id: string;
  is_read: boolean;
  created_at: string;
  notification_category: string;
  priority: string;
  email_delivery_status: string;
  email_scheduled_for: string | null;
}

interface OfferDetails {
  id: string;
  product_id: string;
  buyer_id: string;
  seller_id: string;
  original_price: number;
  offer_amount: number;
  offer_percentage: number | null;
  status: string;
  message: string | null;
  expires_at: string;
  created_at: string;
  products: {
    id: string;
    description: string;
    display_name: string | null;
    primary_image_url: string | null;
  };
}

Deno.serve(async (_req) => {
  const startTime = Date.now();
  console.log('[Offer Notifications] Starting processing...');

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

    // Fetch pending AND scheduled offer notifications
    const { data: notifications, error: fetchError } = await supabase
      .from('notifications')
      .select('id, user_id, type, offer_id, is_read, created_at, notification_category, priority, email_delivery_status, email_scheduled_for')
      .eq('notification_category', 'offer')
      .or(`email_delivery_status.eq.pending,and(email_delivery_status.eq.scheduled,email_scheduled_for.lte.${new Date().toISOString()})`)
      .not('offer_id', 'is', null)
      .order('priority', { ascending: false }) // Critical first
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error('[Offer Notifications] Error fetching:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch notifications' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!notifications || notifications.length === 0) {
      console.log('[Offer Notifications] No pending notifications');
      return new Response(
        JSON.stringify({ message: 'No pending notifications', count: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Offer Notifications] Found ${notifications.length} pending notifications`);

    // Get unique offer IDs and user IDs
    const offerIds = [...new Set(notifications.map((n: OfferNotification) => n.offer_id))];
    const userIds = [...new Set(notifications.map((n: OfferNotification) => n.user_id))];

    // Fetch offer details and user data in parallel
    const [offersResult, usersResult, preferencesResult] = await Promise.all([
      supabase
        .from('offers')
        .select(`
          id,
          product_id,
          buyer_id,
          seller_id,
          original_price,
          offer_amount,
          offer_percentage,
          status,
          message,
          expires_at,
          created_at,
          products!product_id (
            id,
            description,
            display_name,
            primary_image_url
          )
        `)
        .in('id', offerIds),
      supabase
        .from('users')
        .select('user_id, email, name, business_name, email_notifications')
        .in('user_id', userIds),
      supabase
        .from('notification_preferences')
        .select('user_id, email_enabled')
        .in('user_id', userIds),
    ]);

    // Create lookup maps
    const offerMap = new Map(offersResult.data?.map((o: any) => [o.id, o]) || []);
    const userMap = new Map(usersResult.data?.map((u: any) => [u.user_id, u]) || []);
    const preferencesMap = new Map(preferencesResult.data?.map((p: any) => [p.user_id, p]) || []);

    // Also fetch buyer/seller names for offers
    const allParticipantIds = new Set<string>();
    for (const offer of offersResult.data || []) {
      allParticipantIds.add(offer.buyer_id);
      allParticipantIds.add(offer.seller_id);
    }

    const { data: participantsData } = await supabase
      .from('users')
      .select('user_id, name, business_name')
      .in('user_id', Array.from(allParticipantIds));

    const participantMap = new Map(participantsData?.map((p: any) => [p.user_id, p]) || []);

    // Process results
    const results = {
      sent: 0,
      skipped: 0,
      failed: 0,
      details: [] as any[],
    };

    // Process each notification
    for (const notification of notifications as OfferNotification[]) {
      const user = userMap.get(notification.user_id);
      const preferences = preferencesMap.get(notification.user_id);
      const offer = offerMap.get(notification.offer_id) as OfferDetails | undefined;

      // Skip if no user, no email, or no offer
      if (!user || !user.email || !offer) {
        await markNotificationAs(supabase, notification.id, 'skipped');
        results.skipped++;
        results.details.push({
          id: notification.id,
          status: 'skipped',
          reason: !user ? 'no_user' : !user.email ? 'no_email' : 'no_offer',
        });
        continue;
      }

      // Check if user has disabled email notifications
      if (user.email_notifications === false || preferences?.email_enabled === false) {
        await markNotificationAs(supabase, notification.id, 'skipped');
        results.skipped++;
        results.details.push({
          id: notification.id,
          status: 'skipped',
          reason: 'email_disabled',
        });
        continue;
      }

      // Skip if already read in-app (user is aware)
      if (notification.is_read) {
        await markNotificationAs(supabase, notification.id, 'skipped');
        results.skipped++;
        results.details.push({
          id: notification.id,
          status: 'skipped',
          reason: 'already_read',
        });
        continue;
      }

      // Get participant names
      const buyer = participantMap.get(offer.buyer_id);
      const seller = participantMap.get(offer.seller_id);
      const buyerName = buyer?.business_name || buyer?.name || 'A buyer';
      const sellerName = seller?.business_name || seller?.name || 'The seller';
      const productName = offer.products?.display_name || offer.products?.description || 'Product';

      try {
        let emailContent;

        if (notification.type === 'offer_received') {
          // Seller receiving new offer
          emailContent = offerReceivedTemplate({
            recipientName: user.name || user.email.split('@')[0],
            buyerName,
            productName,
            productImageUrl: offer.products?.primary_image_url || undefined,
            originalPrice: offer.original_price,
            offerAmount: offer.offer_amount,
            offerPercentage: offer.offer_percentage || undefined,
            message: offer.message || undefined,
            offerId: offer.id,
            productId: offer.product_id,
            expiresAt: offer.expires_at,
          });
        } else {
          // Buyer receiving status update
          const statusMap: Record<string, OfferStatusType> = {
            'offer_accepted': 'accepted',
            'offer_rejected': 'rejected',
            'offer_countered': 'countered',
            'offer_expired': 'expired',
          };

          const status = statusMap[notification.type] || 'expired';

          emailContent = offerStatusTemplate({
            recipientName: user.name || user.email.split('@')[0],
            sellerName,
            productName,
            productImageUrl: offer.products?.primary_image_url || undefined,
            originalPrice: offer.original_price,
            offerAmount: offer.offer_amount,
            status,
            counterAmount: status === 'countered' ? offer.offer_amount : undefined,
            offerId: offer.id,
            productId: offer.product_id,
            expiresAt: offer.expires_at,
          });
        }

        // Send the email via Resend
        const emailResult = await sendEmail({
          to: user.email,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
          tags: [
            { name: 'type', value: notification.type },
            { name: 'offer_id', value: offer.id },
          ],
        });

        if (emailResult.success) {
          await markNotificationAs(supabase, notification.id, 'sent');
          results.sent++;
          results.details.push({
            id: notification.id,
            type: notification.type,
            status: 'sent',
            emailId: emailResult.id,
            recipient: user.email,
          });
          console.log(`[Offer Notifications] Sent ${notification.type} email to ${user.email}`);
        } else {
          await markNotificationAs(supabase, notification.id, 'failed');
          results.failed++;
          results.details.push({
            id: notification.id,
            type: notification.type,
            status: 'failed',
            error: emailResult.error,
          });
          console.error(`[Offer Notifications] Failed to send to ${user.email}: ${emailResult.error}`);
        }
      } catch (error) {
        await markNotificationAs(supabase, notification.id, 'failed');
        results.failed++;
        results.details.push({
          id: notification.id,
          type: notification.type,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        console.error(`[Offer Notifications] Exception for notification ${notification.id}:`, error);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[Offer Notifications] Completed in ${duration}ms. Sent: ${results.sent}, Skipped: ${results.skipped}, Failed: ${results.failed}`);

    return new Response(
      JSON.stringify({
        message: 'Offer notifications processed',
        duration: `${duration}ms`,
        ...results,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Offer Notifications] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

async function markNotificationAs(
  supabase: any,
  notificationId: string,
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
    .eq('id', notificationId);
}

