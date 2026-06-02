import { buildConversationLink, buildSettingsLink, getAppUrl } from '../resend-client.ts';

export interface MessageNotificationParams {
  recipientName: string;
  senderName: string;
  senderLogoUrl?: string;
  messagePreview: string;
  productInfo?: {
    name: string;
    price: number;
    imageUrl?: string;
  } | null;
  conversationId: string;
  subject: string;
  sentAt: string;
}

export function messageNotificationTemplate(params: MessageNotificationParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { senderName, senderLogoUrl, messagePreview, productInfo, conversationId } = params;
  const productImageUrl = productInfo?.imageUrl;
  const appUrl = getAppUrl();
  const conversationLink = buildConversationLink(conversationId);
  const settingsLink = buildSettingsLink();
  const preview = messagePreview.length > 300 ? messagePreview.substring(0, 300) + '...' : messagePreview;
  const subject = `New message from ${senderName}`;
  const initial = senderName.charAt(0).toUpperCase();

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
        <p style="margin:0 0 12px;font-size:11px;color:#F5C518;letter-spacing:5px;text-transform:uppercase;font-weight:700;">New message</p>
        <h1 style="margin:0;font-size:64px;font-weight:900;color:#ffffff;line-height:0.92;letter-spacing:-3px;text-transform:uppercase;">You have<br/>a message.</h1>
      </td></tr>

      <!-- Yellow bar — sender context -->
      <tr><td style="background:#F5C518;padding:20px 40px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td valign="middle">
            ${senderLogoUrl
              ? `<img src="${senderLogoUrl}" width="36" height="36" style="border-radius:50%;display:inline-block;vertical-align:middle;margin-right:10px;" />`
              : `<table cellpadding="0" cellspacing="0" style="display:inline-table;vertical-align:middle;margin-right:10px;"><tr><td style="width:36px;height:36px;background:#0a0a0a;border-radius:50%;text-align:center;line-height:36px;font-size:14px;font-weight:900;color:#F5C518;">${initial}</td></tr></table>`}
            <span style="font-size:15px;font-weight:800;color:#0a0a0a;vertical-align:middle;">${senderName}</span>
          </td>
          ${productInfo ? `<td align="right" valign="middle"><p style="margin:0;font-size:13px;color:#3d3000;font-weight:600;">${productInfo.name}</p></td>` : ''}
        </tr></table>
      </td></tr>

      <!-- Product image -->
      ${productImageUrl ? `
      <tr><td style="background:#0a0a0a;padding:32px 40px 0;line-height:0;font-size:0;">
        <img src="${productImageUrl}" width="520" style="display:block;width:100%;max-height:280px;object-fit:cover;border-radius:4px;" alt="${productInfo?.name || 'Product'}" />
      </td></tr>` : ''}

      <!-- White content -->
      <tr><td style="background:#ffffff;padding:36px 40px;">

        <!-- Message bubble -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
          <tr><td style="background:#f3f4f6;border-radius:0 12px 12px 12px;padding:20px 24px;border-left:4px solid #F5C518;">
            <p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">${preview}</p>
          </td></tr>
        </table>

        <!-- CTA -->
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="background:#F5C518;">
            <a href="${conversationLink}" style="display:inline-block;color:#0a0a0a;text-decoration:none;padding:15px 40px;font-size:14px;font-weight:900;letter-spacing:2px;text-transform:uppercase;">Reply now &#8594;</a>
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

  const text = `New message from ${senderName}${productInfo ? ` (re: ${productInfo.name})` : ''}

${preview}

Reply: ${conversationLink}

---
Manage preferences: ${settingsLink}`;

  return { subject, html, text };
}
