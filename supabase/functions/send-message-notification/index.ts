// ============================================================
// EMAIL NOTIFICATION EDGE FUNCTION
// ============================================================
// Sends email notifications for new messages
// Triggered by cron job every 2 minutes

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { emailTemplate } from './email-template.ts';

const BATCH_SIZE = 100;

Deno.serve(async (req) => {
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

    // Fetch pending notifications
    const { data: notifications, error: fetchError } = await supabase
      .from('notifications')
      .select(
        `
        id,
        user_id,
        type,
        conversation_id,
        message_id,
        created_at,
        conversations(
          id,
          subject,
          product_id,
          products(
            id,
            description,
            display_name,
            price
          )
        ),
        messages(
          id,
          content,
          sender_id
        )
      `
      )
      .eq('is_emailed', false)
      .is('email_sent_at', null)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error('Error fetching notifications:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch notifications' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!notifications || notifications.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No pending notifications', count: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get user emails and sender information
    const userIds = [...new Set(notifications.map((n: any) => n.user_id))];
    const senderIds = [
      ...new Set(
        notifications.map((n: any) => n.messages?.sender_id).filter(Boolean)
      ),
    ];

    const { data: users } = await supabase
      .from('users')
      .select('user_id, email, name, business_name, email_notifications')
      .in('user_id', userIds);

    const { data: senders } = await supabase
      .from('users')
      .select('user_id, name, business_name')
      .in('user_id', senderIds);

    // Create maps for quick lookup
    const userMap = new Map(users?.map((u: any) => [u.user_id, u]) || []);
    const senderMap = new Map(senders?.map((s: any) => [s.user_id, s]) || []);

    // Process each notification
    const emailResults = [];
    const notificationIdsToUpdate = [];

    for (const notification of notifications as any[]) {
      const user = userMap.get(notification.user_id);
      
      // Skip if user has disabled email notifications
      if (!user || !user.email_notifications || !user.email) {
        notificationIdsToUpdate.push(notification.id);
        continue;
      }

      const sender = senderMap.get(notification.messages?.sender_id);
      const senderName =
        sender?.business_name || sender?.name || 'Someone';
      
      const productInfo = notification.conversations?.products
        ? {
            name:
              notification.conversations.products.display_name ||
              notification.conversations.products.description,
            price: notification.conversations.products.price,
          }
        : null;

      const messagePreview = notification.messages?.content
        ? notification.messages.content.substring(0, 150)
        : 'Sent you a message';

      const conversationLink = `${supabaseUrl.replace('https://', 'https://app.')}/messages?conversation=${notification.conversation_id}`;

      // Generate email HTML
      const emailHtml = emailTemplate({
        recipientName: user.name || user.email,
        senderName,
        messagePreview,
        productInfo,
        conversationLink,
        subject: notification.conversations?.subject || 'New Message',
      });

      // Send email using Supabase Auth (built-in SMTP)
      try {
        // Note: Supabase doesn't have a direct email API in edge functions
        // You would integrate with SendGrid, Resend, or another email service here
        
        // Example with fetch to an email service API:
        // const emailResponse = await fetch('https://api.resend.com/emails', {
        //   method: 'POST',
        //   headers: {
        //     'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        //     'Content-Type': 'application/json',
        //   },
        //   body: JSON.stringify({
        //     from: 'Bike Marketplace <notifications@yourdomain.com>',
        //     to: user.email,
        //     subject: `New message from ${senderName}`,
        //     html: emailHtml,
        //   }),
        // });

        // For now, we'll just log (you need to integrate your email service)
        console.log(`Would send email to ${user.email} about message from ${senderName}`);
        
        notificationIdsToUpdate.push(notification.id);
        emailResults.push({
          notificationId: notification.id,
          recipient: user.email,
          status: 'simulated_success',
        });
      } catch (emailError) {
        console.error(
          `Failed to send email for notification ${notification.id}:`,
          emailError
        );
        emailResults.push({
          notificationId: notification.id,
          recipient: user.email,
          status: 'error',
          error: emailError.message,
        });
      }
    }

    // Update notifications as emailed
    if (notificationIdsToUpdate.length > 0) {
      const { error: updateError } = await supabase
        .from('notifications')
        .update({
          is_emailed: true,
          email_sent_at: new Date().toISOString(),
        })
        .in('id', notificationIdsToUpdate);

      if (updateError) {
        console.error('Error updating notifications:', updateError);
      }
    }

    return new Response(
      JSON.stringify({
        message: 'Email notifications processed',
        processed: emailResults.length,
        updated: notificationIdsToUpdate.length,
        results: emailResults,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});



