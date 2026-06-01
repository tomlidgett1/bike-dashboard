import { buildConversationLink, buildSettingsLink, getAppUrl } from '../resend-client.ts';

export interface MessageDigestItem {
  senderName: string;
  senderLogoUrl?: string;
  messagePreview: string;
  sentAt: string;
}

export interface MessageDigestParams {
  recipientName: string;
  conversationId: string;
  conversationSubject: string;
  messages: MessageDigestItem[];
  productInfo?: {
    name: string;
    price: number;
    imageUrl?: string;
  } | null;
  sellerLogoUrl?: string;
  sellerName?: string;
}

export function messageDigestTemplate(params: MessageDigestParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { recipientName, conversationId, conversationSubject, messages, productInfo, sellerName } = params;
  const appUrl = getAppUrl();
  const conversationLink = buildConversationLink(conversationId);
  const settingsLink = buildSettingsLink();
  const count = messages.length;
  const subject = `${count} unread message${count !== 1 ? 's' : ''} from ${messages[0]?.senderName || 'your conversation'}`;
  const firstSender = messages[0]?.senderName || 'Someone';
  const firstInitial = firstSender.charAt(0).toUpperCase();

  const messageRows = messages.map((msg) => {
    const preview = msg.messagePreview.length > 120 ? msg.messagePreview.substring(0, 120) + '...' : msg.messagePreview;
    const initial = msg.senderName.charAt(0).toUpperCase();
    return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        <td width="40" valign="top" style="padding-right:12px;padding-top:2px;">
          ${msg.senderLogoUrl
            ? `<img src="${msg.senderLogoUrl}" width="32" height="32" style="border-radius:50%;display:block;" />`
            : `<table cellpadding="0" cellspacing="0"><tr><td style="width:32px;height:32px;background:#F5C518;border-radius:50%;text-align:center;line-height:32px;font-size:12px;font-weight:900;color:#0a0a0a;">${initial}</td></tr></table>`}
        </td>
        <td valign="top" style="background:#f3f4f6;border-radius:0 10px 10px 10px;padding:12px 16px;border-left:3px solid #F5C518;">
          <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#111827;">${msg.senderName}</p>
          <p style="margin:0;font-size:14px;color:#374151;line-height:1.55;">${preview}</p>
        </td>
      </tr>
    </table>`;
  }).join('');

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
        <p style="margin:0 0 12px;font-size:11px;color:#F5C518;letter-spacing:5px;text-transform:uppercase;font-weight:700;">${count} unread</p>
        <h1 style="margin:0;font-size:64px;font-weight:900;color:#ffffff;line-height:0.92;letter-spacing:-3px;text-transform:uppercase;">You have<br/>messages.</h1>
      </td></tr>

      <!-- Yellow bar -->
      <tr><td style="background:#F5C518;padding:20px 40px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td valign="middle">
            <p style="margin:0 0 3px;font-size:11px;color:#3d3000;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;">${productInfo ? productInfo.name : conversationSubject}</p>
            <p style="margin:0;font-size:13px;color:#0a0a0a;font-weight:600;">${count} message${count !== 1 ? 's' : ''} waiting for your reply</p>
          </td>
        </tr></table>
      </td></tr>

      <!-- White content -->
      <tr><td style="background:#ffffff;padding:36px 40px;">

        ${messageRows}

        <!-- CTA -->
        <table cellpadding="0" cellspacing="0" style="margin-top:8px;"><tr>
          <td style="background:#F5C518;">
            <a href="${conversationLink}" style="display:inline-block;color:#0a0a0a;text-decoration:none;padding:15px 40px;font-size:14px;font-weight:900;letter-spacing:2px;text-transform:uppercase;">View conversation &#8594;</a>
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

  const text = `${count} unread message${count !== 1 ? 's' : ''}${productInfo ? ` — ${productInfo.name}` : ''}

${messages.map(m => `${m.senderName}: ${m.messagePreview.substring(0, 100)}`).join('\n\n')}

View conversation: ${conversationLink}

---
Manage preferences: ${settingsLink}`;

  return { subject, html, text };
}
