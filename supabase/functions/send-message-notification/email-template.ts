// ============================================================
// EMAIL TEMPLATE FOR MESSAGE NOTIFICATIONS
// ============================================================
// Clean, professional HTML email template

interface EmailTemplateParams {
  recipientName: string;
  senderName: string;
  messagePreview: string;
  productInfo?: {
    name: string;
    price: number;
  } | null;
  conversationLink: string;
  subject: string;
}

export function emailTemplate({
  recipientName,
  senderName,
  messagePreview,
  productInfo,
  conversationLink,
  subject,
}: EmailTemplateParams): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Message from ${senderName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background-color: #1f2937; padding: 30px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                💬 New Message
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; font-size: 16px; color: #374151;">
                Hi ${recipientName},
              </p>
              
              <p style="margin: 0 0 30px; font-size: 16px; color: #374151;">
                <strong>${senderName}</strong> sent you a message:
              </p>

              <!-- Message Preview Box -->
              <div style="background-color: #f9fafb; border-left: 4px solid #3b82f6; padding: 20px; margin-bottom: 30px; border-radius: 4px;">
                <p style="margin: 0; font-size: 15px; color: #4b5563; line-height: 1.6;">
                  "${messagePreview}${messagePreview.length >= 150 ? '...' : ''}"
                </p>
              </div>

              ${productInfo ? `
              <!-- Product Info -->
              <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 20px; margin-bottom: 30px; border-radius: 8px;">
                <p style="margin: 0 0 8px; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
                  About Product
                </p>
                <p style="margin: 0 0 4px; font-size: 16px; color: #111827; font-weight: 600;">
                  ${productInfo.name}
                </p>
                <p style="margin: 0; font-size: 18px; color: #3b82f6; font-weight: 700;">
                  $${productInfo.price.toFixed(2)}
                </p>
              </div>
              ` : ''}

              <!-- Call to Action Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 30px;">
                <tr>
                  <td align="center">
                    <a href="${conversationLink}" style="display: inline-block; background-color: #1f2937; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      View & Reply
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
                Or copy this link into your browser:<br>
                <a href="${conversationLink}" style="color: #3b82f6; text-decoration: none; word-break: break-all;">
                  ${conversationLink}
                </a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 30px 40px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 10px; font-size: 12px; color: #6b7280; text-align: center;">
                You're receiving this email because you have notifications enabled for your Bike Marketplace account.
              </p>
              <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">
                To manage your notification preferences, visit your <a href="${conversationLink.replace('/messages', '/settings/notifications')}" style="color: #3b82f6; text-decoration: none;">account settings</a>.
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
}

