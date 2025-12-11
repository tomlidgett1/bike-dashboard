// ============================================================
// MESSAGE DIGEST EMAIL TEMPLATE
// ============================================================
// Template for batched message notifications (multiple unread messages)

import { buildConversationLink, buildSettingsLink, formatDate, getAppUrl } from '../resend-client.ts';

export interface MessageDigestItem {
  senderName: string;
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
}

export function messageDigestTemplate(params: MessageDigestParams): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    recipientName,
    conversationId,
    conversationSubject,
    messages,
    productInfo,
  } = params;

  const conversationLink = buildConversationLink(conversationId);
  const settingsLink = buildSettingsLink();
  const messageCount = messages.length;

  const emailSubject = `${messageCount} new message${messageCount > 1 ? 's' : ''} in "${conversationSubject}"`;

  const messagesHtml = messages.map((msg, index) => `
    <div style="padding: 12px 16px; ${index > 0 ? 'border-top: 1px solid #e5e7eb;' : ''}">
      <p style="margin: 0 0 4px; font-size: 14px; font-weight: 600; color: #111827;">
        ${msg.senderName}
      </p>
      <p style="margin: 0 0 4px; font-size: 14px; color: #4b5563; line-height: 1.5;">
        ${msg.messagePreview.length > 100 ? msg.messagePreview.substring(0, 100) + '...' : msg.messagePreview}
      </p>
      <p style="margin: 0; font-size: 12px; color: #9ca3af;">
        ${formatDate(msg.sentAt)}
      </p>
    </div>
  `).join('');

  const messagesText = messages.map(msg => 
    `${msg.senderName}: "${msg.messagePreview.substring(0, 100)}${msg.messagePreview.length > 100 ? '...' : ''}"`
  ).join('\n\n');

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${emailSubject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background-color: #1f2937; padding: 24px 32px; text-align: center;">
              <img src="${getAppUrl()}/yj.svg" alt="Yellow Jersey" width="120" height="auto" style="margin-bottom: 12px;" />
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">
                ${messageCount} New Message${messageCount > 1 ? 's' : ''}
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">
                Hi ${recipientName},
              </p>
              
              <p style="margin: 0 0 24px; font-size: 16px; color: #374151;">
                You have ${messageCount} unread message${messageCount > 1 ? 's' : ''} in your conversation:
              </p>

              ${productInfo ? `
              <!-- Product Info -->
              <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 12px 16px; margin-bottom: 16px; border-radius: 8px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    ${productInfo.imageUrl ? `
                    <td width="48" valign="middle" style="padding-right: 12px;">
                      <img src="${productInfo.imageUrl}" alt="" width="48" height="48" style="border-radius: 4px; object-fit: cover;">
                    </td>
                    ` : ''}
                    <td valign="middle">
                      <p style="margin: 0 0 2px; font-size: 14px; color: #111827; font-weight: 600;">
                        ${productInfo.name}
                      </p>
                      <p style="margin: 0; font-size: 14px; color: #3b82f6; font-weight: 700;">
                        $${productInfo.price.toFixed(2)}
                      </p>
                    </td>
                  </tr>
                </table>
              </div>
              ` : ''}

              <!-- Messages List -->
              <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 24px; overflow: hidden;">
                ${messagesHtml}
              </div>

              <!-- Call to Action Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="${conversationLink}" style="display: inline-block; background-color: #1f2937; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      View Conversation
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.6; text-align: center;">
                <a href="${conversationLink}" style="color: #3b82f6; text-decoration: none;">
                  ${conversationLink}
                </a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 24px 32px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px; font-size: 12px; color: #6b7280; text-align: center;">
                You're receiving this email because you have notifications enabled.
              </p>
              <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">
                <a href="${settingsLink}" style="color: #3b82f6; text-decoration: none;">Manage notification preferences</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  const text = `
Hi ${recipientName},

You have ${messageCount} unread message${messageCount > 1 ? 's' : ''} in your conversation about "${conversationSubject}":

${messagesText}

View Conversation: ${conversationLink}

---
To manage your notification preferences, visit: ${settingsLink}
`;

  return { subject: emailSubject, html, text };
}

