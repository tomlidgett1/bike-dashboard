import { buildSettingsLink, formatPrice, getAppUrl } from '../resend-client.ts';

export interface SupportTicketNotificationParams {
  recipientName: string;
  type: string;
  ticketNumber: string;
  ticketSubject: string;
  ticketStatus: string;
  category: string;
  orderNumber?: string | null;
  productName?: string | null;
  productImageUrl?: string | null;
  resolutionType?: string | null;
  resolution?: string | null;
  resolutionAmount?: number | null;
  stripeRefundId?: string | null;
  stripeTransferReversalId?: string | null;
}

export function supportTicketNotificationTemplate(params: SupportTicketNotificationParams): {
  subject: string;
  html: string;
  text: string;
} {
  const appUrl = getAppUrl();
  const settingsLink = buildSettingsLink();
  const claimsLink = `${appUrl}/settings/purchases?tab=claims`;
  const copy = supportCopy(params);
  const ticketSubject = escapeHtml(params.ticketSubject);
  const productName = escapeHtml(params.productName || 'Order item');
  const orderNumber = params.orderNumber ? escapeHtml(params.orderNumber) : null;
  const resolution = params.resolution ? escapeHtml(params.resolution) : null;
  const amount = typeof params.resolutionAmount === 'number' ? formatPrice(params.resolutionAmount) : null;

  const resolutionBlock = (resolution || amount || params.stripeRefundId) ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
          <tr><td style="background:#f9f9f7;padding:18px 22px;border-left:4px solid #F5C518;">
            <p style="margin:0 0 8px;font-size:11px;color:#6b7280;font-weight:800;text-transform:uppercase;letter-spacing:1.3px;">Resolution</p>
            ${resolution ? `<p style="margin:0 0 8px;font-size:15px;color:#111827;font-weight:700;line-height:1.5;">${resolution}</p>` : ''}
            ${amount ? `<p style="margin:0 0 6px;font-size:14px;color:#374151;">Amount: <strong>${amount}</strong></p>` : ''}
            ${params.stripeRefundId ? `<p style="margin:0 0 4px;font-size:12px;color:#6b7280;">Stripe refund: ${escapeHtml(params.stripeRefundId)}</p>` : ''}
            ${params.stripeTransferReversalId ? `<p style="margin:0;font-size:12px;color:#6b7280;">Transfer reversal: ${escapeHtml(params.stripeTransferReversalId)}</p>` : ''}
          </td></tr>
        </table>` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${copy.subject}</title></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
      <tr><td style="background:#0a0a0a;padding:44px 40px 0;">
        <img src="${appUrl}/yjlogo.png" alt="Yellow Jersey" height="44" style="display:block;margin-bottom:36px;" />
        <p style="margin:0 0 12px;font-size:11px;color:#F5C518;letter-spacing:5px;text-transform:uppercase;font-weight:700;">${copy.kicker}</p>
        <h1 style="margin:0;font-size:56px;font-weight:900;color:#ffffff;line-height:0.94;letter-spacing:-2.5px;text-transform:uppercase;">${copy.headline}</h1>
      </td></tr>

      ${params.productImageUrl ? `
      <tr><td style="background:#0a0a0a;padding:28px 40px 0;line-height:0;font-size:0;">
        <img src="${params.productImageUrl}" width="520" style="display:block;width:100%;max-height:300px;object-fit:cover;border-radius:4px;" alt="${productName}" />
      </td></tr>` : ''}

      <tr><td style="background:#F5C518;padding:20px 40px;">
        <p style="margin:0 0 4px;font-size:11px;color:#3d3000;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;">${escapeHtml(params.ticketNumber)}${orderNumber ? ` · Order ${orderNumber}` : ''}</p>
        <p style="margin:0;font-size:15px;color:#0a0a0a;font-weight:800;">${ticketSubject}</p>
      </td></tr>

      <tr><td style="background:#ffffff;padding:36px 40px;">
        <p style="margin:0 0 8px;font-size:18px;color:#111827;font-weight:900;">${copy.title}</p>
        <p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.65;">${copy.body}</p>
        ${resolutionBlock}
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
          <tr><td style="border-top:1px solid #f3f4f6;padding-top:16px;">
            <p style="margin:0 0 4px;font-size:12px;color:#6b7280;">Item</p>
            <p style="margin:0;font-size:14px;color:#111827;font-weight:700;">${productName}</p>
          </td></tr>
        </table>
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="background:#F5C518;">
            <a href="${claimsLink}" style="display:inline-block;color:#0a0a0a;text-decoration:none;padding:15px 36px;font-size:14px;font-weight:900;letter-spacing:2px;text-transform:uppercase;">View claim &#8594;</a>
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

  const text = `${copy.subject}

${params.ticketNumber}${params.orderNumber ? ` / Order ${params.orderNumber}` : ''}
${params.ticketSubject}

${copy.body}
${resolution ? `\nResolution: ${params.resolution}\n` : ''}
${amount ? `Amount: ${amount}\n` : ''}
View claim: ${claimsLink}

Manage preferences: ${settingsLink}`;

  return { subject: copy.subject, html, text };
}

function supportCopy(params: SupportTicketNotificationParams): {
  subject: string;
  kicker: string;
  headline: string;
  title: string;
  body: string;
} {
  switch (params.type) {
    case 'ticket_created':
      return {
        subject: `Claim opened - ${params.ticketNumber}`,
        kicker: 'Claim opened',
        headline: 'A claim<br/>needs<br/>reply.',
        title: 'A buyer opened a claim.',
        body: 'Funds are held while the claim is active. Reply in the claim thread and offer a resolution if you can sort it out directly.',
      };
    case 'ticket_message':
    case 'ticket_status_changed':
      return {
        subject: `Claim updated - ${params.ticketNumber}`,
        kicker: 'Claim update',
        headline: 'New<br/>claim<br/>update.',
        title: 'There is a new update on the claim.',
        body: 'Review the latest message and respond from the claims tab.',
      };
    case 'ticket_resolution_offered':
      return {
        subject: `Resolution offered - ${params.ticketNumber}`,
        kicker: 'Resolution offered',
        headline: 'Review<br/>the<br/>offer.',
        title: 'The seller proposed a resolution.',
        body: 'You can accept the resolution if it works for you, or escalate the claim to Yellow Jersey support.',
      };
    case 'ticket_resolution_accepted':
      return {
        subject: `Resolution accepted - ${params.ticketNumber}`,
        kicker: 'Resolution accepted',
        headline: 'Claim<br/>accepted.',
        title: 'The buyer accepted the resolution.',
        body: 'The claim has been actioned according to the agreed resolution.',
      };
    case 'ticket_refunded':
      return {
        subject: `Refund processed - ${params.ticketNumber}`,
        kicker: 'Refund processed',
        headline: 'Refund<br/>processed.',
        title: 'A refund has been processed.',
        body: 'The refund has been sent back to the original payment method. Bank and card settlement timing can vary.',
      };
    case 'ticket_released_to_seller':
      return {
        subject: `Payment released - ${params.ticketNumber}`,
        kicker: 'Payment released',
        headline: 'Funds<br/>released.',
        title: 'The claim was closed and payment was released.',
        body: 'The seller payout has been released to the connected Stripe account payout flow.',
      };
    case 'ticket_escalated':
      return {
        subject: `Claim escalated - ${params.ticketNumber}`,
        kicker: 'Escalated',
        headline: 'Support<br/>will<br/>review.',
        title: 'This claim has been escalated.',
        body: 'Yellow Jersey support will review the claim history and resolution options.',
      };
    case 'ticket_resolved':
      return {
        subject: `Claim resolved - ${params.ticketNumber}`,
        kicker: 'Resolved',
        headline: 'Claim<br/>resolved.',
        title: 'This claim has been resolved.',
        body: 'The claim has been closed with the recorded resolution.',
      };
    default:
      return {
        subject: `Claim update - ${params.ticketNumber}`,
        kicker: 'Claim update',
        headline: 'Claim<br/>updated.',
        title: 'There is a new claim update.',
        body: 'Open the claims tab to review the latest activity.',
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
