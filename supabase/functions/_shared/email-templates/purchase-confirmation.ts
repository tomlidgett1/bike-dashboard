import { buildSettingsLink, formatPrice, getAppUrl } from '../resend-client.ts';

export interface PurchaseConfirmationParams {
  recipientName: string;
  orderNumber: string;
  productName: string;
  productImageUrl?: string;
  productId: string;
  sellerName: string;
  sellerLogoUrl?: string;
  itemPrice: number;
  shippingCost: number;
  platformFee?: number;
  totalAmount: number;
  deliveryMethod?: string;
  deliveryDescription?: string;
  paymentDate: string;
  purchaseId: string;
}

export function purchaseConfirmationTemplate(params: PurchaseConfirmationParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { recipientName, orderNumber, productName, sellerName, sellerLogoUrl, totalAmount, purchaseId } = params;
  const appUrl = getAppUrl();
  const settingsLink = buildSettingsLink();
  const purchaseLink = `${appUrl}/purchases/${purchaseId}`;
  const subject = `Purchase confirmed — ${productName}`;
  const sellerInitial = sellerName.charAt(0).toUpperCase();

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
        <p style="margin:0 0 12px;font-size:11px;color:#F5C518;letter-spacing:5px;text-transform:uppercase;font-weight:700;">Purchase confirmed &#10003;</p>
        <h1 style="margin:0;font-size:64px;font-weight:900;color:#ffffff;line-height:0.92;letter-spacing:-3px;text-transform:uppercase;">You're<br/>getting a<br/>new bike.</h1>
      </td></tr>

      <!-- Yellow bar — order summary -->
      <tr><td style="background:#F5C518;padding:20px 40px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td valign="middle">
            <p style="margin:0 0 3px;font-size:11px;color:#3d3000;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;">Order ${orderNumber}</p>
            <p style="margin:0;font-size:15px;color:#0a0a0a;font-weight:700;">${productName}</p>
            <table cellpadding="0" cellspacing="0" style="margin-top:6px;"><tr>
              <td style="padding-right:8px;">
                ${sellerLogoUrl
                  ? `<img src="${sellerLogoUrl}" width="24" height="24" style="border-radius:50%;display:block;" />`
                  : `<table cellpadding="0" cellspacing="0"><tr><td style="width:24px;height:24px;background:#0a0a0a;border-radius:50%;text-align:center;line-height:24px;font-size:10px;font-weight:900;color:#F5C518;">${sellerInitial}</td></tr></table>`}
              </td>
              <td><p style="margin:0;font-size:12px;color:#3d3000;">${sellerName}</p></td>
            </tr></table>
          </td>
          <td align="right" valign="middle">
            <p style="margin:0 0 2px;font-size:11px;color:#3d3000;text-align:right;text-transform:uppercase;letter-spacing:1px;">Total paid</p>
            <p style="margin:0;font-size:40px;font-weight:900;color:#0a0a0a;letter-spacing:-1.5px;">${formatPrice(totalAmount)}</p>
          </td>
        </tr></table>
      </td></tr>

      <!-- White content -->
      <tr><td style="background:#ffffff;padding:36px 40px;">

        <p style="margin:0 0 8px;font-size:18px;font-weight:800;color:#111827;letter-spacing:-0.3px;">Your payment is secured.</p>
        <p style="margin:0 0 32px;font-size:15px;color:#6b7280;line-height:1.65;">Hey ${recipientName} — ${formatPrice(totalAmount)} is held safely in escrow. ${sellerName} has been notified and will ship soon.</p>

        <!-- Escrow badge -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
          <tr><td style="background:#f9f9f7;padding:16px 20px;border-left:4px solid #F5C518;">
            <p style="margin:0;font-size:14px;color:#374151;font-weight:600;">&#128274; Funds are held in escrow — you won't pay until you confirm receipt of your item.</p>
          </td></tr>
        </table>

        <!-- Steps -->
        <p style="margin:0 0 14px;font-size:11px;font-weight:800;color:#111827;text-transform:uppercase;letter-spacing:1.5px;">What happens next</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
          <tr><td style="padding:12px 0;border-top:1px solid #f3f4f6;">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="padding-right:14px;"><table cellpadding="0" cellspacing="0"><tr><td style="width:28px;height:28px;background:#F5C518;border-radius:50%;text-align:center;font-size:12px;font-weight:900;color:#0a0a0a;line-height:28px;">1</td></tr></table></td>
              <td><p style="margin:0;font-size:14px;color:#374151;font-weight:600;">Seller ships your item within 3 days</p></td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:12px 0;border-top:1px solid #f3f4f6;">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="padding-right:14px;"><table cellpadding="0" cellspacing="0"><tr><td style="width:28px;height:28px;background:#f3f4f6;border-radius:50%;text-align:center;font-size:12px;font-weight:900;color:#9ca3af;line-height:28px;">2</td></tr></table></td>
              <td><p style="margin:0;font-size:14px;color:#374151;">You receive and inspect the item</p></td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:12px 0;border-top:1px solid #f3f4f6;">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="padding-right:14px;"><table cellpadding="0" cellspacing="0"><tr><td style="width:28px;height:28px;background:#f3f4f6;border-radius:50%;text-align:center;font-size:12px;font-weight:900;color:#9ca3af;line-height:28px;">3</td></tr></table></td>
              <td><p style="margin:0;font-size:14px;color:#374151;">Confirm receipt — funds released to seller</p></td>
            </tr></table>
          </td></tr>
        </table>

        <!-- CTA -->
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="background:#F5C518;">
            <a href="${purchaseLink}" style="display:inline-block;color:#0a0a0a;text-decoration:none;padding:15px 40px;font-size:14px;font-weight:900;letter-spacing:2px;text-transform:uppercase;">View your purchase &#8594;</a>
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

  const text = `Purchase confirmed — ${productName}

Order ${orderNumber}
${productName} from ${sellerName}
Total: ${formatPrice(totalAmount)} (held in escrow)

What happens next:
1. Seller ships within 3 days
2. You receive and inspect the item
3. Confirm receipt — funds released to seller

View purchase: ${purchaseLink}

---
Manage preferences: ${settingsLink}`;

  return { subject, html, text };
}
