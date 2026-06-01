// ============================================================
// PURCHASE NOTIFICATION EDGE FUNCTION
// ============================================================
// Sends email notifications for completed purchases
// Triggered by cron job every minute (purchases are time-critical)
//
// Handles:
// - purchase_complete: Buyer receipt after successful payment
// - listing_sold:      Seller notification when their item is purchased

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { sendEmail } from '../_shared/resend-client.ts';
import { purchaseConfirmationTemplate } from '../_shared/email-templates/purchase-confirmation.ts';
import { saleNotificationTemplate } from '../_shared/email-templates/sale-notification.ts';

const BATCH_SIZE = 50;

interface PurchaseNotification {
  id: string;
  user_id: string;
  type: 'purchase_complete' | 'listing_sold';
  purchase_id: string;
  is_read: boolean;
  created_at: string;
  notification_category: string;
  priority: string;
  email_delivery_status: string;
  email_scheduled_for: string | null;
}

interface PurchaseDetails {
  id: string;
  order_number: string;
  buyer_id: string;
  seller_id: string;
  product_id: string;
  item_price: number;
  shipping_cost: number;
  platform_fee: number;
  seller_payout_amount: number;
  total_amount: number;
  delivery_method: string | null;
  delivery_description: string | null;
  payment_date: string;
  products: {
    id: string;
    description: string;
    display_name: string | null;
    primary_image_url: string | null;
  };
}

Deno.serve(async (_req) => {
  const startTime = Date.now();
  console.log('[Purchase Notifications] Starting processing...');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Fetch pending purchase notifications
    const { data: notifications, error: fetchError } = await supabase
      .from('notifications')
      .select('id, user_id, type, purchase_id, is_read, created_at, notification_category, priority, email_delivery_status, email_scheduled_for')
      .eq('notification_category', 'transaction')
      .in('type', ['purchase_complete', 'listing_sold'])
      .or(`email_delivery_status.eq.pending,and(email_delivery_status.eq.scheduled,email_scheduled_for.lte.${new Date().toISOString()})`)
      .not('purchase_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error('[Purchase Notifications] Error fetching:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch notifications' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!notifications || notifications.length === 0) {
      console.log('[Purchase Notifications] No pending notifications');
      return new Response(
        JSON.stringify({ message: 'No pending notifications', count: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Purchase Notifications] Found ${notifications.length} pending notifications`);

    const purchaseIds = [...new Set(notifications.map((n: PurchaseNotification) => n.purchase_id))];
    const userIds = [...new Set(notifications.map((n: PurchaseNotification) => n.user_id))];

    // Fetch purchase details, user data, and preferences in parallel
    const [purchasesResult, usersResult, preferencesResult] = await Promise.all([
      supabase
        .from('purchases')
        .select(`
          id,
          order_number,
          buyer_id,
          seller_id,
          product_id,
          item_price,
          shipping_cost,
          platform_fee,
          seller_payout_amount,
          total_amount,
          delivery_method,
          delivery_description,
          payment_date,
          products!product_id (
            id,
            description,
            display_name,
            primary_image_url
          )
        `)
        .in('id', purchaseIds),
      supabase
        .from('users')
        .select('user_id, email, name, business_name, email_notifications, order_alerts')
        .in('user_id', userIds),
      supabase
        .from('notification_preferences')
        .select('user_id, email_enabled, purchase_confirmations_enabled, sale_notifications_enabled')
        .in('user_id', userIds),
    ]);

    const purchaseMap = new Map(purchasesResult.data?.map((p: any) => [p.id, p]) || []);
    const userMap = new Map(usersResult.data?.map((u: any) => [u.user_id, u]) || []);
    const preferencesMap = new Map(preferencesResult.data?.map((p: any) => [p.user_id, p]) || []);

    // Fetch buyer/seller names for purchases
    const allParticipantIds = new Set<string>();
    for (const purchase of purchasesResult.data || []) {
      allParticipantIds.add(purchase.buyer_id);
      allParticipantIds.add(purchase.seller_id);
    }

    const { data: participantsData } = await supabase
      .from('users')
      .select('user_id, name, business_name, logo_url')
      .in('user_id', Array.from(allParticipantIds));

    const participantMap = new Map(participantsData?.map((p: any) => [p.user_id, p]) || []);

    const results = {
      sent: 0,
      skipped: 0,
      failed: 0,
      details: [] as any[],
    };

    for (const notification of notifications as PurchaseNotification[]) {
      const user = userMap.get(notification.user_id);
      const preferences = preferencesMap.get(notification.user_id);
      const purchase = purchaseMap.get(notification.purchase_id) as PurchaseDetails | undefined;

      if (!user || !user.email || !purchase) {
        await markNotificationAs(supabase, notification.id, 'skipped');
        results.skipped++;
        results.details.push({
          id: notification.id,
          status: 'skipped',
          reason: !user ? 'no_user' : !user.email ? 'no_email' : 'no_purchase',
        });
        continue;
      }

      // Check master email toggle
      if (user.email_notifications === false || preferences?.email_enabled === false) {
        await markNotificationAs(supabase, notification.id, 'skipped');
        results.skipped++;
        results.details.push({ id: notification.id, status: 'skipped', reason: 'email_disabled' });
        continue;
      }

      // Check per-type preference (falls back to order_alerts legacy field)
      if (notification.type === 'purchase_complete') {
        const purchaseConfEnabled = preferences?.purchase_confirmations_enabled ?? user.order_alerts ?? true;
        if (purchaseConfEnabled === false) {
          await markNotificationAs(supabase, notification.id, 'skipped');
          results.skipped++;
          results.details.push({ id: notification.id, status: 'skipped', reason: 'purchase_confirmations_disabled' });
          continue;
        }
      }

      if (notification.type === 'listing_sold') {
        const saleNotifEnabled = preferences?.sale_notifications_enabled ?? user.order_alerts ?? true;
        if (saleNotifEnabled === false) {
          await markNotificationAs(supabase, notification.id, 'skipped');
          results.skipped++;
          results.details.push({ id: notification.id, status: 'skipped', reason: 'sale_notifications_disabled' });
          continue;
        }
      }

      const buyer = participantMap.get(purchase.buyer_id);
      const seller = participantMap.get(purchase.seller_id);
      const buyerName = buyer?.business_name || buyer?.name || 'A buyer';
      const buyerLogoUrl = buyer?.logo_url || undefined;
      const sellerName = seller?.business_name || seller?.name || 'The seller';
      const sellerLogoUrl = seller?.logo_url || undefined;
      const productName = purchase.products?.display_name || purchase.products?.description || 'Product';

      try {
        let emailContent;

        if (notification.type === 'purchase_complete') {
          emailContent = purchaseConfirmationTemplate({
            recipientName: user.name || user.email.split('@')[0],
            orderNumber: purchase.order_number,
            productName,
            productImageUrl: purchase.products?.primary_image_url || undefined,
            productId: purchase.product_id,
            sellerName,
            sellerLogoUrl,
            itemPrice: purchase.item_price,
            shippingCost: purchase.shipping_cost || 0,
            totalAmount: purchase.total_amount,
            deliveryMethod: purchase.delivery_method || undefined,
            deliveryDescription: purchase.delivery_description || undefined,
            paymentDate: purchase.payment_date || new Date().toISOString(),
            purchaseId: purchase.id,
          });
        } else {
          emailContent = saleNotificationTemplate({
            recipientName: user.name || user.email.split('@')[0],
            orderNumber: purchase.order_number,
            productName,
            productImageUrl: purchase.products?.primary_image_url || undefined,
            buyerName,
            buyerLogoUrl,
            itemPrice: purchase.item_price,
            platformFee: purchase.platform_fee || 0,
            sellerPayout: purchase.seller_payout_amount || 0,
            deliveryMethod: purchase.delivery_method || undefined,
            deliveryDescription: purchase.delivery_description || undefined,
            paymentDate: purchase.payment_date || new Date().toISOString(),
            purchaseId: purchase.id,
          });
        }

        const emailResult = await sendEmail({
          to: user.email,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
          tags: [
            { name: 'type', value: notification.type },
            { name: 'purchase_id', value: purchase.id },
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
          console.log(`[Purchase Notifications] Sent ${notification.type} to ${user.email}`);
        } else {
          await markNotificationAs(supabase, notification.id, 'failed');
          results.failed++;
          results.details.push({
            id: notification.id,
            type: notification.type,
            status: 'failed',
            error: emailResult.error,
          });
          console.error(`[Purchase Notifications] Failed to send to ${user.email}: ${emailResult.error}`);
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
        console.error(`[Purchase Notifications] Exception for notification ${notification.id}:`, error);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[Purchase Notifications] Done in ${duration}ms. Sent: ${results.sent}, Skipped: ${results.skipped}, Failed: ${results.failed}`);

    return new Response(
      JSON.stringify({ message: 'Purchase notifications processed', duration: `${duration}ms`, ...results }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Purchase Notifications] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

async function markNotificationAs(
  supabase: any,
  notificationId: string,
  status: 'sent' | 'skipped' | 'failed'
): Promise<void> {
  const updateData: any = { email_delivery_status: status };
  if (status === 'sent') {
    updateData.is_emailed = true;
    updateData.email_sent_at = new Date().toISOString();
  }
  await supabase.from('notifications').update(updateData).eq('id', notificationId);
}
