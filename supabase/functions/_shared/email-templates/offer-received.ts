import { buildOfferLink, buildSettingsLink, formatPrice, getAppUrl } from '../resend-client.ts';

export interface OfferReceivedParams {
  recipientName: string;
  buyerName: string;
  buyerLogoUrl?: string;
  productName: string;
  productImageUrl?: string;
  originalPrice: number;
  offerAmount: number;
  offerPercentage?: number;
  message?: string;
  offerId: string;
  productId: string;
  expiresAt: string;
}

export function offerReceivedTemplate(params: OfferReceivedParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { buyerName, buyerLogoUrl, productName, productImageUrl, originalPrice, offerAmount, message, offerId, expiresAt } = params;
  const appUrl = getAppUrl();
  const offerLink = buildOfferLink(offerId);
  const settingsLink = buildSettingsLink();
  const subject = `New offer on your ${productName}`;
  const initial = buyerName.charAt(0).toUpperCase();
  const savings = originalPrice - offerAmount;

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
        <p style="margin:0 0 12px;font-size:11px;color:#F5C518;letter-spacing:5px;text-transform:uppercase;font-weight:700;">New offer</p>
        <h1 style="margin:0;font-size:60px;font-weight:900;color:#ffffff;line-height:0.92;letter-spacing:-2.5px;text-transform:uppercase;">Someone<br/>wants your<br/>bike.</h1>
      </td></tr>

      <!-- Product image -->
      ${productImageUrl ? `
      <tr><td style="background:#0a0a0a;padding:32px 40px 0;line-height:0;font-size:0;">
        <img src="${productImageUrl}" width="520" style="display:block;width:100%;max-height:340px;object-fit:cover;border-radius:4px;" alt="${productName}" />
      </td></tr>` : ''}

      <!-- Yellow bar — offer amount -->
      <tr><td style="background:#F5C518;padding:20px 40px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td valign="middle">
            <p style="margin:0 0 3px;font-size:11px;color:#0a0a0a;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;">Offer from ${buyerName}</p>
            <p style="margin:0;font-size:13px;color:#3d3000;">${productName}</p>
          </td>
          <td align="right" valign="middle">
            <p style="margin:0;font-size:40px;font-weight:900;color:#0a0a0a;letter-spacing:-1.5px;">${formatPrice(offerAmount)}</p>
          </td>
        </tr></table>
      </td></tr>

      <!-- White content -->
      <tr><td style="background:#ffffff;padding:36px 40px;">

        <!-- Buyer identity -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
          <tr>
            <td width="48" valign="middle" style="padding-right:14px;">
              ${buyerLogoUrl
                ? `<img src="${buyerLogoUrl}" width="44" height="44" style="border-radius:50%;display:block;" />`
                : `<table cellpadding="0" cellspacing="0"><tr><td style="width:44px;height:44px;background:#F5C518;border-radius:50%;text-align:center;line-height:44px;font-size:18px;font-weight:900;color:#0a0a0a;">${initial}</td></tr></table>`}
            </td>
            <td valign="middle">
              <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#111827;">${buyerName}</p>
              <p style="margin:0;font-size:13px;color:#9ca3af;">Expires ${new Date(expiresAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</p>
            </td>
          </tr>
        </table>

        <!-- Price comparison -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
          <tr>
            <td width="47%" style="text-align:center;padding:22px 12px;background:#f5f5f0;">
              <p style="margin:0 0 6px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">Listed at</p>
              <p style="margin:0;font-size:28px;font-weight:900;color:#9ca3af;letter-spacing:-1px;text-decoration:line-through;">${formatPrice(originalPrice)}</p>
            </td>
            <td width="6%" style="text-align:center;font-size:18px;color:#d1d5db;">&#8594;</td>
            <td width="47%" style="text-align:center;padding:22px 12px;background:#0a0a0a;">
              <p style="margin:0 0 6px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">Their offer</p>
              <p style="margin:0;font-size:28px;font-weight:900;color:#F5C518;letter-spacing:-1px;">${formatPrice(offerAmount)}</p>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 28px;font-size:13px;color:#9ca3af;text-align:center;">${formatPrice(savings)} below asking</p>

        ${message ? `
        <!-- Buyer message -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
          <tr><td style="background:#f3f4f6;border-radius:12px;border-bottom-left-radius:3px;padding:16px 20px;">
            <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">${message}</p>
          </td></tr>
        </table>
        ` : ''}

        <!-- Action buttons -->
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="34%" style="padding-right:6px;">
              <a href="${offerLink}" style="display:block;background:#F5C518;color:#0a0a0a;text-decoration:none;padding:14px 8px;text-align:center;font-size:13px;font-weight:900;letter-spacing:1px;text-transform:uppercase;">Accept</a>
            </td>
            <td width="34%" style="padding:0 3px;">
              <a href="${offerLink}" style="display:block;background:#0a0a0a;color:#ffffff;text-decoration:none;padding:14px 8px;text-align:center;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Counter</a>
            </td>
            <td width="32%" style="padding-left:6px;">
              <a href="${offerLink}" style="display:block;border:1.5px solid #e5e7eb;color:#9ca3af;text-decoration:none;padding:13px 8px;text-align:center;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Decline</a>
            </td>
          </tr>
        </table>

      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#0a0a0a;padding:24px 40px;">
        <p style="margin:0;font-size:11px;color:#3d3d3d;text-align:center;">YELLOW JERSEY &nbsp;&#183;&nbsp; <a href="${settingsLink}" style="color:#3d3d3d;text-decoration:none;">Manage preferences</a></p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;

  const text = `New offer on your ${productName}

${buyerName} offered ${formatPrice(offerAmount)} (listed at ${formatPrice(originalPrice)})

Accept, counter, or decline: ${offerLink}

---
Manage preferences: ${settingsLink}`;

  return { subject, html, text };
}
