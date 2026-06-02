import { buildSettingsLink, formatDate, formatPrice, getAppUrl } from '../resend-client.ts';

export interface OrderStatusNotificationParams {
  recipientName: string;
  type: string;
  orderNumber: string;
  productName: string;
  productImageUrl?: string;
  sellerName?: string;
  buyerName?: string;
  totalAmount: number;
  trackingNumber?: string | null;
  purchaseId: string;
  eventDate?: string | null;
}

export function orderStatusNotificationTemplate(params: OrderStatusNotificationParams): {
  subject: string;
  html: string;
  text: string;
} {
  const appUrl = getAppUrl();
  const settingsLink = buildSettingsLink();
  const orderLink = `${appUrl}/settings/purchases`;
  const status = statusCopy(params);
  const productName = escapeHtml(params.productName);
  const orderNumber = escapeHtml(params.orderNumber);
  const trackingNumber = params.trackingNumber ? escapeHtml(params.trackingNumber) : null;
  const eventDate = params.eventDate ? formatDate(params.eventDate) : formatDate(new Date());

  const trackingBlock = trackingNumber ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
          <tr><td style="background:#f9f9f7;padding:18px 22px;border-left:4px solid #F5C518;">
            <p style="margin:0 0 6px;font-size:11px;color:#6b7280;font-weight:800;text-transform:uppercase;letter-spacing:1.3px;">Tracking</p>
            <p style="margin:0;font-size:16px;color:#111827;font-weight:800;">${trackingNumber}</p>
          </td></tr>
        </table>` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${status.subject}</title></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
      <tr><td style="background:#0a0a0a;padding:44px 40px 0;">
        <img src="${appUrl}/yjlogo.png" alt="Yellow Jersey" height="44" style="display:block;margin-bottom:36px;" />
        <p style="margin:0 0 12px;font-size:11px;color:#F5C518;letter-spacing:5px;text-transform:uppercase;font-weight:700;">${status.kicker}</p>
        <h1 style="margin:0;font-size:58px;font-weight:900;color:#ffffff;line-height:0.94;letter-spacing:-2.5px;text-transform:uppercase;">${status.headline}</h1>
      </td></tr>

      ${params.productImageUrl ? `
      <tr><td style="background:#0a0a0a;padding:28px 40px 0;line-height:0;font-size:0;">
        <img src="${params.productImageUrl}" width="520" style="display:block;width:100%;max-height:300px;object-fit:cover;border-radius:4px;" alt="${productName}" />
      </td></tr>` : ''}

      <tr><td style="background:#F5C518;padding:20px 40px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td>
            <p style="margin:0 0 4px;font-size:11px;color:#3d3000;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;">Order ${orderNumber}</p>
            <p style="margin:0;font-size:15px;color:#0a0a0a;font-weight:800;">${productName}</p>
          </td>
          <td align="right">
            <p style="margin:0;font-size:26px;color:#0a0a0a;font-weight:900;">${formatPrice(params.totalAmount)}</p>
          </td>
        </tr></table>
      </td></tr>

      <tr><td style="background:#ffffff;padding:36px 40px;">
        <p style="margin:0 0 8px;font-size:18px;color:#111827;font-weight:900;">${status.title}</p>
        <p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.65;">${status.body}</p>
        ${trackingBlock}
        <p style="margin:0 0 28px;font-size:13px;color:#6b7280;">Updated ${eventDate}</p>
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="background:#F5C518;">
            <a href="${orderLink}" style="display:inline-block;color:#0a0a0a;text-decoration:none;padding:15px 36px;font-size:14px;font-weight:900;letter-spacing:2px;text-transform:uppercase;">View order &#8594;</a>
          </td>
        </tr></table>
      </td></tr>

      <tr><td style="background:#0a0a0a;padding:24px 40px;">
        <p style="margin:0;font-size:11px;color:#3d3d3d;text-align:center;">YELLOW JERSEY &nbsp;&#183;&nbsp; <a href="${settingsLink}" style="color:#3d3d3d;text-decoration:none;">Manage preferences</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  const text = `${status.subject}

Order ${params.orderNumber}
${params.productName}
Total: ${formatPrice(params.totalAmount)}

${status.body}
${trackingNumber ? `\nTracking: ${trackingNumber}\n` : ''}
View order: ${orderLink}

Manage preferences: ${settingsLink}`;

  return { subject: status.subject, html, text };
}

function statusCopy(params: OrderStatusNotificationParams): {
  subject: string;
  kicker: string;
  headline: string;
  title: string;
  body: string;
} {
  const sellerName = params.sellerName || 'The seller';
  const buyerName = params.buyerName || 'The buyer';

  switch (params.type) {
    case 'order_shipped':
      return {
        subject: `Order shipped - ${params.productName}`,
        kicker: 'Shipped',
        headline: 'On its<br/>way.',
        title: 'Your order has shipped.',
        body: `${sellerName} has marked the order as shipped. Inspect it when it arrives, then confirm receipt to release payment.`,
      };
    case 'tracking_added':
      return {
        subject: `Tracking added - ${params.productName}`,
        kicker: 'Tracking added',
        headline: 'Track<br/>your<br/>order.',
        title: 'Tracking has been added.',
        body: `${sellerName} added tracking for your order. Keep an eye on delivery and contact the seller if anything looks wrong.`,
      };
    case 'order_delivered':
      return {
        subject: `Order delivered - ${params.productName}`,
        kicker: 'Delivered',
        headline: 'Check<br/>it over.',
        title: 'Your order is marked delivered.',
        body: 'Inspect the item carefully. If everything is right, confirm receipt. If something is wrong, open a claim before funds are released.',
      };
    case 'receipt_confirmed':
      return {
        subject: `Receipt confirmed - ${params.productName}`,
        kicker: 'Receipt confirmed',
        headline: 'Buyer<br/>confirmed.',
        title: 'The buyer confirmed receipt.',
        body: `${buyerName} confirmed the item was received. Yellow Jersey will release the seller payout.`,
      };
    case 'funds_released':
      return {
        subject: `Funds released - ${params.productName}`,
        kicker: 'Funds released',
        headline: 'Payout<br/>released.',
        title: 'Your payout has been released.',
        body: 'The order funds have been released to the seller payout flow. Stripe will handle settlement timing for the connected account.',
      };
    default:
      return {
        subject: `Order update - ${params.productName}`,
        kicker: 'Order update',
        headline: 'Order<br/>updated.',
        title: 'Your order has been updated.',
        body: 'There is a new update on your Yellow Jersey order.',
      };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
