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
  type: 'purchase_complete' | 'listing_sold' | 'order_confirmed' | 'order_placed';
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
  stripe_session_id: string | null;
  buyer_id: string;
  seller_id: string;
  product_id: string;
  item_price: number;
  shipping_cost: number;
  platform_fee: number;
  seller_payout_amount: number;
  total_amount: number;
  shipping_method: string | null;
  shipping_address: string | null;
  payment_date: string;
  products: {
    id: string;
    description: string;
    display_name: string | null;
    primary_image_url: string | null;
    pickup_only: boolean | null;
    pickup_location: string | null;
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
    // Note: DB uses notification_category='order' and types 'order_confirmed'/'order_placed'
    // Legacy types 'purchase_complete'/'listing_sold' are also supported for backwards compat
    const { data: notifications, error: fetchError } = await supabase
      .from('notifications')
      .select('id, user_id, type, purchase_id, is_read, created_at, notification_category, priority, email_delivery_status, email_scheduled_for')
      .in('notification_category', ['order', 'transaction'])
      .in('type', ['purchase_complete', 'listing_sold', 'order_confirmed', 'order_placed'])
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
          stripe_session_id,
          buyer_id,
          seller_id,
          product_id,
          item_price,
          shipping_cost,
          platform_fee,
          seller_payout_amount,
          total_amount,
          shipping_method,
          shipping_address,
          payment_date,
          products (
            id,
            description,
            display_name,
            primary_image_url,
            pickup_only,
            pickup_location
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

    // Group notifications so each (recipient + role + order) gets ONE email
    // listing every product. Cart checkout creates one purchase row per product
    // sharing a stripe_session_id — without grouping the buyer/seller would
    // receive N separate emails for a single order.
    interface NotificationGroup {
      key: string;
      user: any;
      preferences: any;
      isBuyer: boolean;
      notificationIds: string[];
      purchases: PurchaseDetails[];
    }
    const groups = new Map<string, NotificationGroup>();

    for (const notification of notifications as PurchaseNotification[]) {
      const user = userMap.get(notification.user_id);
      const purchase = purchaseMap.get(notification.purchase_id) as PurchaseDetails | undefined;
      const isBuyer = notification.type === 'purchase_complete' || notification.type === 'order_confirmed';

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

      const orderKey = purchase.stripe_session_id || purchase.id;
      const key = `${notification.user_id}|${isBuyer ? 'buyer' : 'seller'}|${orderKey}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          user,
          preferences: preferencesMap.get(notification.user_id),
          isBuyer,
          notificationIds: [],
          purchases: [],
        };
        groups.set(key, group);
      }
      group.notificationIds.push(notification.id);
      if (!group.purchases.some((p) => p.id === purchase.id)) group.purchases.push(purchase);
    }

    for (const group of groups.values()) {
      const { user, preferences, isBuyer, notificationIds, purchases } = group;
      const markAll = async (status: 'sent' | 'skipped' | 'failed') => {
        for (const id of notificationIds) await markNotificationAs(supabase, id, status);
      };

      // Master email toggle
      if (user.email_notifications === false || preferences?.email_enabled === false) {
        await markAll('skipped');
        results.skipped += notificationIds.length;
        results.details.push({ ids: notificationIds, status: 'skipped', reason: 'email_disabled' });
        continue;
      }

      // Per-type preference (falls back to order_alerts legacy field)
      if (isBuyer) {
        const enabled = preferences?.purchase_confirmations_enabled ?? user.order_alerts ?? true;
        if (enabled === false) {
          await markAll('skipped');
          results.skipped += notificationIds.length;
          results.details.push({ ids: notificationIds, status: 'skipped', reason: 'purchase_confirmations_disabled' });
          continue;
        }
      } else {
        const enabled = preferences?.sale_notifications_enabled ?? user.order_alerts ?? true;
        if (enabled === false) {
          await markAll('skipped');
          results.skipped += notificationIds.length;
          results.details.push({ ids: notificationIds, status: 'skipped', reason: 'sale_notifications_disabled' });
          continue;
        }
      }

      // Stable display order; the first row drives the shared header fields.
      purchases.sort((a, b) => (a.order_number || '').localeCompare(b.order_number || ''));
      const primary = purchases[0];
      const buyer = participantMap.get(primary.buyer_id);
      const seller = participantMap.get(primary.seller_id);
      const buyerName = buyer?.business_name || buyer?.name || 'A buyer';
      const buyerLogoUrl = buyer?.logo_url || undefined;
      const sellerName = seller?.business_name || seller?.name || 'The seller';
      const sellerLogoUrl = seller?.logo_url || undefined;
      const isPickup = primary.products?.pickup_only === true;
      const pickupLocation = primary.products?.pickup_location || undefined;
      const productNameOf = (p: PurchaseDetails) => p.products?.display_name || p.products?.description || 'Product';
      // Multi-item cart rows are numbered ORDER-1, ORDER-2… — strip the suffix
      // so the consolidated email shows the single order reference.
      const orderNumber = purchases.length > 1 ? primary.order_number.replace(/-\d+$/, '') : primary.order_number;

      try {
        let emailContent;

        if (isBuyer) {
          const items = purchases.map((p) => ({
            name: productNameOf(p),
            imageUrl: p.products?.primary_image_url || undefined,
            price: p.item_price,
            quantity: 1,
          }));
          emailContent = purchaseConfirmationTemplate({
            recipientName: user.name || user.email.split('@')[0],
            orderNumber,
            productName: productNameOf(primary),
            productImageUrl: primary.products?.primary_image_url || undefined,
            productId: primary.product_id,
            sellerName,
            sellerLogoUrl,
            itemPrice: primary.item_price,
            shippingCost: purchases.reduce((s, p) => s + (p.shipping_cost || 0), 0),
            totalAmount: purchases.reduce((s, p) => s + (p.total_amount || 0), 0),
            isPickup,
            pickupLocation,
            deliveryMethod: primary.shipping_method || undefined,
            deliveryDescription: primary.shipping_address || undefined,
            paymentDate: primary.payment_date || new Date().toISOString(),
            purchaseId: primary.id,
            items: items.length > 1 ? items : undefined,
          });
        } else {
          const items = purchases.map((p) => ({
            name: productNameOf(p),
            imageUrl: p.products?.primary_image_url || undefined,
            itemPrice: p.item_price,
            quantity: 1,
            sellerPayout: p.seller_payout_amount || 0,
          }));
          emailContent = saleNotificationTemplate({
            recipientName: user.name || user.email.split('@')[0],
            orderNumber,
            productName: productNameOf(primary),
            productImageUrl: primary.products?.primary_image_url || undefined,
            buyerName,
            buyerLogoUrl,
            itemPrice: primary.item_price,
            platformFee: purchases.reduce((s, p) => s + (p.platform_fee || 0), 0),
            sellerPayout: purchases.reduce((s, p) => s + (p.seller_payout_amount || 0), 0),
            isPickup,
            pickupLocation,
            deliveryMethod: primary.shipping_method || undefined,
            buyerAddress: primary.shipping_address || undefined,
            paymentDate: primary.payment_date || new Date().toISOString(),
            purchaseId: primary.id,
            items: items.length > 1 ? items : undefined,
          });
        }

        const emailResult = await sendEmail({
          to: user.email,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
          tags: [
            { name: 'type', value: isBuyer ? 'purchase_complete' : 'listing_sold' },
            { name: 'purchase_id', value: primary.id },
          ],
        });

        if (emailResult.success) {
          await markAll('sent');
          results.sent += notificationIds.length;
          results.details.push({
            ids: notificationIds,
            role: isBuyer ? 'buyer' : 'seller',
            status: 'sent',
            emailId: emailResult.id,
            recipient: user.email,
            items: purchases.length,
          });
          console.log(`[Purchase Notifications] Sent ${isBuyer ? 'buyer' : 'seller'} email (${purchases.length} item(s)) to ${user.email}`);
        } else {
          await markAll('failed');
          results.failed += notificationIds.length;
          results.details.push({ ids: notificationIds, status: 'failed', error: emailResult.error });
          console.error(`[Purchase Notifications] Failed to send to ${user.email}: ${emailResult.error}`);
        }
      } catch (error) {
        await markAll('failed');
        results.failed += notificationIds.length;
        results.details.push({
          ids: notificationIds,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        console.error(`[Purchase Notifications] Exception for group ${group.key}:`, error);
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
