import { buildOfferLink, buildSettingsLink, formatPrice, getAppUrl } from '../resend-client.ts';

export type OfferStatusType = 'accepted' | 'rejected' | 'countered' | 'expired';

export interface OfferStatusParams {
  recipientName: string;
  sellerName: string;
  sellerLogoUrl?: string;
  productName: string;
  productImageUrl?: string;
  originalPrice: number;
  offerAmount: number;
  status: OfferStatusType;
  counterAmount?: number;
  counterMessage?: string;
  offerId: string;
  productId: string;
  expiresAt?: string;
}

const STATUS_CONFIG: Record<OfferStatusType, {
  eyebrow: string;
  headline: string;
  barBg: string;
  barTextColor: string;
  ctaText: string;
  ctaBg: string;
  ctaColor: string;
}> = {
  accepted: {
    eyebrow: 'Great news',
    headline: 'Your offer\nwas accepted.',
    barBg: '#F5C518',
    barTextColor: '#0a0a0a',
    ctaText: 'Complete your purchase',
    ctaBg: '#F5C518',
    ctaColor: '#0a0a0a',
  },
  countered: {
    eyebrow: 'Counter offer',
    headline: 'They made\na counter\noffer.',
    barBg: '#F5C518',
    barTextColor: '#0a0a0a',
    ctaText: 'View counter offer',
    ctaBg: '#F5C518',
    ctaColor: '#0a0a0a',
  },
  rejected: {
    eyebrow: 'Update',
    headline: 'Offer\ndeclined.',
    barBg: '#1f1f1f',
    barTextColor: '#9ca3af',
    ctaText: 'Browse similar listings',
    ctaBg: '#ffffff',
    ctaColor: '#0a0a0a',
  },
  expired: {
    eyebrow: 'Expired',
    headline: 'Offer\nexpired.',
    barBg: '#1f1f1f',
    barTextColor: '#9ca3af',
    ctaText: 'Make a new offer',
    ctaBg: '#ffffff',
    ctaColor: '#0a0a0a',
  },
};

export function offerStatusTemplate(params: OfferStatusParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { sellerName, sellerLogoUrl, productName, originalPrice, offerAmount, status, counterAmount, counterMessage, offerId } = params;
  const appUrl = getAppUrl();
  const offerLink = buildOfferLink(offerId);
  const settingsLink = buildSettingsLink();
  const cfg = STATUS_CONFIG[status];
  const initial = sellerName.charAt(0).toUpperCase();
  const isActive = status === 'accepted' || status === 'countered';

  const subject = status === 'accepted'
    ? `Your offer on ${productName} was accepted!`
    : status === 'countered'
    ? `Counter offer on ${productName}`
    : status === 'rejected'
    ? `Your offer on ${productName} was declined`
    : `Your offer on ${productName} has expired`;

  const headlineHtml = cfg.headline
    .split('\n')
    .map(line => line)
    .join('<br/>');

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- Hero -->
      <tr><td style="background:#0a0a0a;padding:48px 40px 0;">
        <img src="${appUrl}/yjlogo.png" alt="Yellow Jersey" height="44" style="display:block;margin-bottom:40px;" />
        <p style="margin:0 0 12px;font-size:11px;color:${isActive ? '#F5C518' : '#6b7280'};letter-spacing:5px;text-transform:uppercase;font-weight:700;">${cfg.eyebrow}</p>
        <h1 style="margin:0;font-size:64px;font-weight:900;color:#ffffff;line-height:0.92;letter-spacing:-3px;text-transform:uppercase;">${headlineHtml}</h1>
      </td></tr>

      <!-- Accent bar -->
      <tr><td style="background:${cfg.barBg};padding:20px 40px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td valign="middle">
            <p style="margin:0 0 2px;font-size:11px;color:${cfg.barTextColor === '#0a0a0a' ? '#3d3000' : '#6b7280'};font-weight:700;text-transform:uppercase;letter-spacing:1.5px;">${productName}</p>
            <table cellpadding="0" cellspacing="0" style="margin-top:6px;"><tr>
              <td style="padding-right:8px;">
                ${sellerLogoUrl
                  ? `<img src="${sellerLogoUrl}" width="28" height="28" style="border-radius:50%;display:block;" />`
                  : `<table cellpadding="0" cellspacing="0"><tr><td style="width:28px;height:28px;background:${isActive ? '#0a0a0a' : '#374151'};border-radius:50%;text-align:center;line-height:28px;font-size:11px;font-weight:900;color:${isActive ? '#F5C518' : '#9ca3af'};">${initial}</td></tr></table>`}
              </td>
              <td><p style="margin:0;font-size:13px;color:${cfg.barTextColor};font-weight:600;">${sellerName}</p></td>
            </tr></table>
          </td>
          <td align="right" valign="middle">
            ${status === 'countered' && counterAmount
              ? `<p style="margin:0 0 2px;font-size:11px;color:${cfg.barTextColor === '#0a0a0a' ? '#3d3000' : '#6b7280'};text-align:right;text-decoration:line-through;">${formatPrice(offerAmount)}</p>
                 <p style="margin:0;font-size:36px;font-weight:900;color:${cfg.barTextColor};letter-spacing:-1.5px;">${formatPrice(counterAmount)}</p>`
              : `<p style="margin:0 0 2px;font-size:11px;color:${cfg.barTextColor === '#0a0a0a' ? '#3d3000' : '#6b7280'};text-align:right;">Your offer</p>
                 <p style="margin:0;font-size:36px;font-weight:900;color:${cfg.barTextColor};letter-spacing:-1.5px;${!isActive ? 'text-decoration:line-through;' : ''}">${formatPrice(offerAmount)}</p>`}
          </td>
        </tr></table>
      </td></tr>

      <!-- White content -->
      <tr><td style="background:#ffffff;padding:36px 40px;">

        ${status === 'accepted' ? `
        <p style="margin:0 0 28px;font-size:16px;color:#374151;line-height:1.7;">${sellerName} has accepted your offer of ${formatPrice(offerAmount)} for the ${productName}. Your payment is held securely in escrow until you confirm receipt.</p>
        ` : status === 'countered' && counterAmount ? `
        <p style="margin:0 0 20px;font-size:16px;color:#374151;line-height:1.7;">${sellerName} passed on ${formatPrice(offerAmount)} but wants to make a deal. Their counter: <strong>${formatPrice(counterAmount)}</strong> — that's ${formatPrice(Math.abs(counterAmount - offerAmount))} ${counterAmount > offerAmount ? 'more' : 'less'} than your offer.</p>
        ${counterMessage ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;"><tr><td style="background:#f3f4f6;border-radius:0 12px 12px 12px;padding:18px 22px;border-left:4px solid #F5C518;"><p style="margin:0;font-size:15px;color:#374151;line-height:1.65;">${counterMessage}</p></td></tr></table>` : ''}
        ` : status === 'rejected' ? `
        <p style="margin:0 0 28px;font-size:16px;color:#374151;line-height:1.7;">${sellerName} has declined your offer of ${formatPrice(offerAmount)}. There are plenty more listings — keep browsing.</p>
        ` : `
        <p style="margin:0 0 28px;font-size:16px;color:#374151;line-height:1.7;">Your offer of ${formatPrice(offerAmount)} on ${productName} has expired. You can make a new offer if you're still interested.</p>
        `}

        <!-- Price summary for accepted/countered -->
        ${isActive ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
          <tr>
            <td width="47%" style="text-align:center;padding:20px 12px;background:#f5f5f0;">
              <p style="margin:0 0 5px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">Listed at</p>
              <p style="margin:0;font-size:26px;font-weight:900;color:#9ca3af;letter-spacing:-1px;">${formatPrice(originalPrice)}</p>
            </td>
            <td width="6%" style="text-align:center;font-size:18px;color:#d1d5db;">&#8594;</td>
            <td width="47%" style="text-align:center;padding:20px 12px;background:#0a0a0a;">
              <p style="margin:0 0 5px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">${status === 'countered' && counterAmount ? 'Counter' : 'Your offer'}</p>
              <p style="margin:0;font-size:26px;font-weight:900;color:#F5C518;letter-spacing:-1px;">${formatPrice(status === 'countered' && counterAmount ? counterAmount : offerAmount)}</p>
            </td>
          </tr>
        </table>
        ` : ''}

        <!-- CTA -->
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="background:${cfg.ctaBg};${cfg.ctaBg === '#ffffff' ? 'border:2px solid #0a0a0a;' : ''}">
            <a href="${offerLink}" style="display:inline-block;color:${cfg.ctaColor};text-decoration:none;padding:15px 40px;font-size:14px;font-weight:900;letter-spacing:2px;text-transform:uppercase;">${cfg.ctaText} &#8594;</a>
          </td>
        </tr></table>

      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#0a0a0a;padding:24px 40px;">
        <p style="margin:0;font-size:11px;color:#3d3d3d;text-align:center;">YELLOW JERSEY &nbsp;&#183;&nbsp; <a href="${settingsLink}" style="color:#3d3d3d;text-decoration:none;">Manage preferences</a></p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;

  const text = `${subject}

${productName} — Your offer: ${formatPrice(offerAmount)}${counterAmount ? ` | Counter: ${formatPrice(counterAmount)}` : ''}
${counterMessage ? `\nMessage: ${counterMessage}` : ''}

${cfg.ctaText}: ${offerLink}

---
Manage preferences: ${settingsLink}`;

  return { subject, html, text };
}
