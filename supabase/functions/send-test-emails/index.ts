// Test email sender — sends one of every template to a given address
// Usage: POST /functions/v1/send-test-emails  { "to": "you@example.com" }

import { sendEmail } from '../_shared/resend-client.ts';
import { welcomeTemplate } from '../_shared/email-templates/welcome.ts';
import { messageNotificationTemplate } from '../_shared/email-templates/message-notification.ts';
import { offerReceivedTemplate } from '../_shared/email-templates/offer-received.ts';
import { offerStatusTemplate } from '../_shared/email-templates/offer-status.ts';
import { purchaseConfirmationTemplate } from '../_shared/email-templates/purchase-confirmation.ts';
import { saleNotificationTemplate } from '../_shared/email-templates/sale-notification.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const body = await req.json().catch(() => ({}));
  const to: string = body.to || 'tom@lidgett.net';

  const results: Record<string, { success: boolean; id?: string; error?: string }> = {};
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // 1. Welcome (individual)
  const welcome = welcomeTemplate({ recipientName: 'Tom', isStore: false });
  results.welcome_individual = await sendEmail({ to, subject: welcome.subject, html: welcome.html, text: welcome.text });
  await wait(600);

  // 2. Welcome (store)
  const welcomeStore = welcomeTemplate({ recipientName: 'Tom', isStore: true, storeName: 'The Bike Shop' });
  results.welcome_store = await sendEmail({ to, subject: `[STORE] ${welcomeStore.subject}`, html: welcomeStore.html, text: welcomeStore.text });
  await wait(600);

  // 3. New message
  const message = messageNotificationTemplate({
    recipientName: 'Tom',
    senderName: 'James Walker',
    messagePreview: 'Hi, is this bike still available? I\'m very interested — would you consider $1,200?',
    productInfo: { name: 'Trek Domane AL 5', price: 1499 },
    conversationId: 'test-conv-001',
    subject: '',
    sentAt: new Date().toISOString(),
  });
  results.message = await sendEmail({ to, subject: message.subject, html: message.html, text: message.text });
  await wait(600);

  // 4. Offer received
  const offer = offerReceivedTemplate({
    recipientName: 'Tom',
    buyerName: 'Sarah Chen',
    productName: 'Specialized S-Works Tarmac SL7',
    originalPrice: 5500,
    offerAmount: 4200,
    message: 'Love this bike! Would you take $4,200? Happy to pick up locally.',
    offerId: 'test-offer-001',
    productId: 'test-product-001',
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  });
  results.offer_received = await sendEmail({ to, subject: offer.subject, html: offer.html, text: offer.text });
  await wait(600);

  // 5. Offer accepted
  const offerAccepted = offerStatusTemplate({
    recipientName: 'Tom',
    sellerName: 'The Bike Shop Melbourne',
    productName: 'Specialized S-Works Tarmac SL7',
    originalPrice: 5500,
    offerAmount: 4200,
    status: 'accepted',
    offerId: 'test-offer-001',
    productId: 'test-product-001',
  });
  results.offer_accepted = await sendEmail({ to, subject: offerAccepted.subject, html: offerAccepted.html, text: offerAccepted.text });
  await wait(600);

  // 6. Offer countered
  const offerCountered = offerStatusTemplate({
    recipientName: 'Tom',
    sellerName: 'The Bike Shop Melbourne',
    productName: 'Specialized S-Works Tarmac SL7',
    originalPrice: 5500,
    offerAmount: 4200,
    status: 'countered',
    counterAmount: 4800,
    counterMessage: 'Thanks for the offer! I can do $4,800 — it\'s in perfect condition with less than 500km.',
    offerId: 'test-offer-001',
    productId: 'test-product-001',
  });
  results.offer_countered = await sendEmail({ to, subject: offerCountered.subject, html: offerCountered.html, text: offerCountered.text });
  await wait(600);

  // 7. Offer rejected
  const offerRejected = offerStatusTemplate({
    recipientName: 'Tom',
    sellerName: 'The Bike Shop Melbourne',
    productName: 'Specialized S-Works Tarmac SL7',
    originalPrice: 5500,
    offerAmount: 4200,
    status: 'rejected',
    offerId: 'test-offer-001',
    productId: 'test-product-001',
  });
  results.offer_rejected = await sendEmail({ to, subject: offerRejected.subject, html: offerRejected.html, text: offerRejected.text });
  await wait(600);

  // 8. Purchase confirmation
  const purchase = purchaseConfirmationTemplate({
    recipientName: 'Tom',
    orderNumber: 'YJ-28471',
    productName: 'Specialized S-Works Tarmac SL7',
    productId: 'test-product-001',
    sellerName: 'The Bike Shop Melbourne',
    itemPrice: 4800,
    shippingCost: 0,
    totalAmount: 4800,
    paymentDate: new Date().toISOString(),
    purchaseId: 'test-purchase-001',
  });
  results.purchase_confirmation = await sendEmail({ to, subject: purchase.subject, html: purchase.html, text: purchase.text });
  await wait(600);

  // 9. Sale notification
  const sale = saleNotificationTemplate({
    recipientName: 'Tom',
    orderNumber: 'YJ-28471',
    productName: 'Specialized S-Works Tarmac SL7',
    buyerName: 'Sarah Chen',
    itemPrice: 4800,
    platformFee: 192,
    sellerPayout: 4608,
    paymentDate: new Date().toISOString(),
    purchaseId: 'test-purchase-001',
    buyerAddress: '45 Collins Street, Melbourne VIC 3000',
  });
  results.sale_notification = await sendEmail({ to, subject: sale.subject, html: sale.html, text: sale.text });

  const sent = Object.values(results).filter(r => r.success).length;
  const failed = Object.values(results).filter(r => !r.success).length;

  console.log(`[Test Emails] Sent ${sent} to ${to}, ${failed} failed`);

  return new Response(
    JSON.stringify({ to, sent, failed, results }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
