import { buildSettingsLink, formatPrice, getAppUrl } from '../resend-client.ts';

export interface SaleNotificationParams {
  recipientName: string;
  orderNumber: string;
  productName: string;
  productImageUrl?: string;
  buyerName: string;
  buyerLogoUrl?: string;
  itemPrice: number;
  platformFee: number;
  sellerPayout: number;
  deliveryMethod?: string;
  deliveryDescription?: string;
  paymentDate: string;
  purchaseId: string;
  buyerAddress?: string;
}

export function saleNotificationTemplate(params: SaleNotificationParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { recipientName, orderNumber, productName, buyerName, buyerLogoUrl, sellerPayout, purchaseId, buyerAddress } = params;
  const appUrl = getAppUrl();
  const settingsLink = buildSettingsLink();
  const saleLink = `${appUrl}/sales/${purchaseId}`;
  const subject = `You made a sale — ${productName}`;
  const initial = buyerName.charAt(0).toUpperCase();

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
        <p style="margin:0 0 12px;font-size:11px;color:#F5C518;letter-spacing:5px;text-transform:uppercase;font-weight:700;">Sale complete</p>
        <h1 style="margin:0;font-size:68px;font-weight:900;color:#ffffff;line-height:0.92;letter-spacing:-3px;text-transform:uppercase;">You<br/>made a<br/>sale.</h1>
      </td></tr>

      <!-- Yellow bar -->
      <tr><td style="background:#F5C518;padding:22px 40px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td valign="middle">
            <p style="margin:0 0 3px;font-size:11px;color:#0a0a0a;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;">${productName}</p>
            <p style="margin:0;font-size:13px;color:#3d3000;">Bought by ${buyerName}</p>
          </td>
          <td align="right" valign="middle">
            <p style="margin:0;font-size:40px;font-weight:900;color:#0a0a0a;letter-spacing:-1.5px;">${formatPrice(sellerPayout)}</p>
          </td>
        </tr></table>
      </td></tr>

      <!-- White content -->
      <tr><td style="background:#ffffff;padding:36px 40px;">

        <p style="margin:0 0 28px;font-size:16px;color:#374151;line-height:1.7;">Hey ${recipientName} — ship within 3 days and you'll receive your payout as soon as ${buyerName} confirms receipt.</p>

        <!-- Buyer identity -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
          <tr>
            <td width="48" valign="middle" style="padding-right:14px;">
              ${buyerLogoUrl
                ? `<img src="${buyerLogoUrl}" width="44" height="44" style="border-radius:50%;display:block;" />`
                : `<table cellpadding="0" cellspacing="0"><tr><td style="width:44px;height:44px;background:#F5C518;border-radius:50%;text-align:center;line-height:44px;font-size:18px;font-weight:900;color:#0a0a0a;">${initial}</td></tr></table>`}
            </td>
            <td valign="middle">
              <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#111827;">${buyerName}</p>
              <p style="margin:0;font-size:13px;color:#9ca3af;">Order ${orderNumber}</p>
            </td>
          </tr>
        </table>

        ${buyerAddress ? `
        <!-- Ship to -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
          <tr><td style="background:#f9f9f7;padding:20px 24px;border-left:4px solid #F5C518;">
            <p style="margin:0 0 8px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">Ship to</p>
            <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#111827;">${buyerName}</p>
            <p style="margin:0;font-size:14px;color:#6b7280;">${buyerAddress}</p>
          </td></tr>
        </table>
        ` : ''}

        <!-- Steps -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
          <tr>
            <td width="31%" style="text-align:center;padding:20px 8px;background:#f9f9f7;">
              <p style="margin:0 0 8px;font-size:22px;">&#128230;</p>
              <p style="margin:0 0 3px;font-size:13px;font-weight:700;color:#111827;">Pack &amp; ship</p>
              <p style="margin:0;font-size:12px;color:#9ca3af;">Within 3 days</p>
            </td>
            <td width="4%" style="text-align:center;font-size:14px;color:#d1d5db;">&#8594;</td>
            <td width="31%" style="text-align:center;padding:20px 8px;background:#f9f9f7;">
              <p style="margin:0 0 8px;font-size:22px;">&#128205;</p>
              <p style="margin:0 0 3px;font-size:13px;font-weight:700;color:#111827;">Add tracking</p>
              <p style="margin:0;font-size:12px;color:#9ca3af;">Keep buyer updated</p>
            </td>
            <td width="4%" style="text-align:center;font-size:14px;color:#d1d5db;">&#8594;</td>
            <td width="30%" style="text-align:center;padding:20px 8px;background:#F5C518;">
              <p style="margin:0 0 8px;font-size:22px;">&#128176;</p>
              <p style="margin:0 0 3px;font-size:13px;font-weight:900;color:#0a0a0a;">Get paid</p>
              <p style="margin:0;font-size:12px;color:#3d3000;font-weight:600;">${formatPrice(sellerPayout)}</p>
            </td>
          </tr>
        </table>

        <!-- CTA -->
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="background:#F5C518;">
            <a href="${saleLink}" style="display:inline-block;color:#0a0a0a;text-decoration:none;padding:15px 40px;font-size:14px;font-weight:900;letter-spacing:2px;text-transform:uppercase;">View sale details &#8594;</a>
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

  const text = `You made a sale — ${productName}

${buyerName} purchased ${productName}
Your payout: ${formatPrice(sellerPayout)}
Order: ${orderNumber}

Ship within 3 days to receive payment.

View sale details: ${saleLink}

---
Manage preferences: ${settingsLink}`;

  return { subject, html, text };
}
