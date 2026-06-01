// ============================================================
// WELCOME EMAIL EDGE FUNCTION
// ============================================================
// Sends a welcome email to new users immediately after signup.
// Triggered by cron every minute.
// Welcome emails bypass preference checks — they are system emails.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { sendEmail } from '../_shared/resend-client.ts';
import { welcomeTemplate } from '../_shared/email-templates/welcome.ts';

const BATCH_SIZE = 50;

Deno.serve(async (_req) => {
  const startTime = Date.now();
  console.log('[Welcome Emails] Starting processing...');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Fetch pending welcome notifications
    const { data: notifications, error: fetchError } = await supabase
      .from('notifications')
      .select('id, user_id, created_at')
      .eq('notification_category', 'welcome')
      .eq('type', 'welcome')
      .eq('email_delivery_status', 'pending')
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error('[Welcome Emails] Error fetching notifications:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch notifications' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!notifications || notifications.length === 0) {
      console.log('[Welcome Emails] No pending notifications');
      return new Response(
        JSON.stringify({ message: 'No pending notifications', count: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Welcome Emails] Found ${notifications.length} pending`);

    const userIds = notifications.map((n: any) => n.user_id);

    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('user_id, email, name, business_name, bicycle_store, account_type')
      .in('user_id', userIds);

    if (usersError) {
      console.error('[Welcome Emails] Error fetching users:', usersError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch users' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const userMap = new Map((users || []).map((u: any) => [u.user_id, u]));

    const results = {
      sent: 0,
      skipped: 0,
      failed: 0,
      details: [] as any[],
    };

    for (const notification of notifications as any[]) {
      const user = userMap.get(notification.user_id);

      if (!user || !user.email) {
        await markNotification(supabase, notification.id, 'skipped');
        results.skipped++;
        results.details.push({ id: notification.id, status: 'skipped', reason: 'no_user_or_email' });
        continue;
      }

      const isStore = !!(user.bicycle_store || user.account_type === 'store');
      const displayName = user.business_name || user.name || user.email.split('@')[0];

      try {
        const emailContent = welcomeTemplate({
          recipientName: displayName,
          isStore,
          storeName: isStore ? (user.business_name || undefined) : undefined,
        });

        const emailResult = await sendEmail({
          to: user.email,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
          tags: [
            { name: 'type', value: 'welcome' },
            { name: 'is_store', value: String(isStore) },
          ],
        });

        if (emailResult.success) {
          await markNotification(supabase, notification.id, 'sent');
          results.sent++;
          results.details.push({
            id: notification.id,
            status: 'sent',
            emailId: emailResult.id,
            recipient: user.email,
            isStore,
          });
          console.log(`[Welcome Emails] Sent to ${user.email} (store: ${isStore})`);
        } else {
          await markNotification(supabase, notification.id, 'failed');
          results.failed++;
          results.details.push({ id: notification.id, status: 'failed', error: emailResult.error });
          console.error(`[Welcome Emails] Failed for ${user.email}: ${emailResult.error}`);
        }
      } catch (err) {
        await markNotification(supabase, notification.id, 'failed');
        results.failed++;
        results.details.push({
          id: notification.id,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
        console.error(`[Welcome Emails] Exception for ${notification.id}:`, err);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[Welcome Emails] Done in ${duration}ms. Sent: ${results.sent}, Skipped: ${results.skipped}, Failed: ${results.failed}`);

    return new Response(
      JSON.stringify({ message: 'Welcome emails processed', duration: `${duration}ms`, ...results }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Welcome Emails] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

async function markNotification(
  supabase: any,
  notificationId: string,
  status: 'sent' | 'skipped' | 'failed'
): Promise<void> {
  const update: any = { email_delivery_status: status };
  if (status === 'sent') {
    update.is_emailed = true;
    update.email_sent_at = new Date().toISOString();
  }
  await supabase.from('notifications').update(update).eq('id', notificationId);
}
