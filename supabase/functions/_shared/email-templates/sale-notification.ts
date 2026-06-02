import { buildSettingsLink, formatPrice, getAppUrl } from '../resend-client.ts';

export interface SaleNotificationLineItem {
  name: string;
  imageUrl?: string;
  itemPrice: number;
  quantity?: number;
  sellerPayout?: number;
}

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
  isPickup?: boolean;
  pickupLocation?: string;
  deliveryMethod?: string;
  deliveryDescription?: string;
  paymentDate: string;
  purchaseId: string;
  buyerAddress?: string;
  /** All products in this order. When >1, the email lists every item. */
  items?: SaleNotificationLineItem[];
}

export function saleNotificationTemplate(params: SaleNotificationParams): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    recipientName, orderNumber, productName, productImageUrl, buyerName, buyerLogoUrl,
    sellerPayout, purchaseId, buyerAddress, isPickup, pickupLocation,
  } = params;
  const appUrl = getAppUrl();
  const settingsLink = buildSettingsLink();
  const saleLink = `${appUrl}/sales/${purchaseId}`;

  // One order may contain multiple products (cart checkout). Normalise to a
  // line-item list so a single email lists everything the seller sold.
  const items: SaleNotificationLineItem[] =
    params.items && params.items.length > 0
      ? params.items
      : [{ name: productName, imageUrl: productImageUrl, itemPrice: params.itemPrice, quantity: 1, sellerPayout }];
  const isMultiItem = items.length > 1;
  const displayName = isMultiItem ? `${items.length} items` : productName;
  const heroImageUrl = productImageUrl || items.find((it) => it.imageUrl)?.imageUrl;

  const subject = isMultiItem
    ? `You made a sale — ${items.length} items`
    : `You made a sale — ${productName}`;
  const initial = buyerName.charAt(0).toUpperCase();

  const itemsListBlock = isMultiItem ? `
        <p style="margin:0 0 14px;font-size:11px;font-weight:800;color:#111827;text-transform:uppercase;letter-spacing:1.5px;">Items sold in this order</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
          ${items.map((it) => `
          <tr><td style="padding:12px 0;border-top:1px solid #f3f4f6;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td valign="middle"><p style="margin:0;font-size:14px;color:#374151;font-weight:600;">${it.name}${it.quantity && it.quantity > 1 ? ` &#215; ${it.quantity}` : ''}</p></td>
              <td align="right" valign="middle"><p style="margin:0;font-size:14px;color:#111827;font-weight:700;">${formatPrice((it.sellerPayout ?? it.itemPrice) * (it.quantity || 1))}</p></td>
            </tr></table>
          </td></tr>`).join('')}
        </table>` : '';

  const introText = isPickup
    ? `Hey ${recipientName} — ${buyerName} will arrange collection${pickupLocation ? ` from ${pickupLocation}` : ''}. Once they confirm they've picked it up, your payout is released.`
    : `Hey ${recipientName} — ship within 3 days and you'll receive your payout as soon as ${buyerName} confirms receipt.`;

  const stepsBlock = isPickup ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
          <tr>
            <td width="46%" style="text-align:center;padding:20px 8px;background:#f9f9f7;">
              <p style="margin:0 0 8px;font-size:22px;">&#128205;</p>
              <p style="margin:0 0 3px;font-size:13px;font-weight:700;color:#111827;">Arrange pickup</p>
              <p style="margin:0;font-size:12px;color:#9ca3af;">${pickupLocation ? pickupLocation : 'At your location'}</p>
            </td>
            <td width="8%" style="text-align:center;font-size:14px;color:#d1d5db;">&#8594;</td>
            <td width="46%" style="text-align:center;padding:20px 8px;background:#F5C518;">
              <p style="margin:0 0 8px;font-size:22px;">&#128176;</p>
              <p style="margin:0 0 3px;font-size:13px;font-weight:900;color:#0a0a0a;">Get paid</p>
              <p style="margin:0;font-size:12px;color:#3d3000;font-weight:600;">${formatPrice(sellerPayout)}</p>
            </td>
          </tr>
        </table>` : `
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
        </table>`;

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

      <!-- Product image -->
      ${heroImageUrl ? `
      <tr><td style="background:#0a0a0a;padding:32px 40px 0;line-height:0;font-size:0;">
        <img src="${heroImageUrl}" width="520" style="display:block;width:100%;max-height:340px;object-fit:cover;border-radius:4px;" alt="${displayName}" />
      </td></tr>` : ''}

      <!-- Yellow bar -->
      <tr><td style="background:#F5C518;padding:22px 40px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td valign="middle">
            <p style="margin:0 0 3px;font-size:11px;color:#0a0a0a;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;">${displayName}</p>
            <p style="margin:0;font-size:13px;color:#3d3000;">Bought by ${buyerName}</p>
          </td>
          <td align="right" valign="middle">
            <p style="margin:0;font-size:40px;font-weight:900;color:#0a0a0a;letter-spacing:-1.5px;">${formatPrice(sellerPayout)}</p>
          </td>
        </tr></table>
      </td></tr>

      <!-- White content -->
      <tr><td style="background:#ffffff;padding:36px 40px;">

        <p style="margin:0 0 28px;font-size:16px;color:#374151;line-height:1.7;">${introText}</p>

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

        ${isPickup ? `
        <!-- Pickup location -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
          <tr><td style="background:#f9f9f7;padding:20px 24px;border-left:4px solid #F5C518;">
            <p style="margin:0 0 8px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">Pickup location</p>
            <p style="margin:0;font-size:15px;font-weight:700;color:#111827;">${pickupLocation || 'To be arranged'}</p>
            <p style="margin:0 0 0;font-size:13px;color:#6b7280;">The buyer will contact you to arrange a time</p>
          </td></tr>
        </table>
        ` : buyerAddress ? `
        <!-- Ship to -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
          <tr><td style="background:#f9f9f7;padding:20px 24px;border-left:4px solid #F5C518;">
            <p style="margin:0 0 8px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">Ship to</p>
            <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#111827;">${buyerName}</p>
            <p style="margin:0;font-size:14px;color:#6b7280;">${buyerAddress}</p>
          </td></tr>
        </table>
        ` : ''}

        <!-- Items sold (multi-product orders only) -->
        ${itemsListBlock}

        <!-- Steps -->
        ${stepsBlock}

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

  const itemsListText = isMultiItem
    ? `\nItems sold:\n${items.map((it) => `- ${it.name}${it.quantity && it.quantity > 1 ? ` x ${it.quantity}` : ''} — ${formatPrice((it.sellerPayout ?? it.itemPrice) * (it.quantity || 1))}`).join('\n')}\n`
    : '';

  const text = `You made a sale — ${displayName}

${buyerName} purchased ${displayName}
Your payout: ${formatPrice(sellerPayout)}
Order: ${orderNumber}
${itemsListText}

${isPickup
  ? `Pickup${pickupLocation ? ` from ${pickupLocation}` : ''} — the buyer will contact you to arrange a time.`
  : `Ship within 3 days to receive payment.`}

View sale details: ${saleLink}

---
Manage preferences: ${settingsLink}`;

  return { subject, html, text };
}
