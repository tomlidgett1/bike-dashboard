// ============================================================
// OFFER RECEIVED EMAIL TEMPLATE
// ============================================================
// Template for notifying sellers when they receive an offer

import { buildOfferLink, buildProductLink, buildSettingsLink, formatPrice, formatDate, getAppUrl } from '../resend-client.ts';

export interface OfferReceivedParams {
  recipientName: string;
  buyerName: string;
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
  const {
    recipientName,
    buyerName,
    productName,
    productImageUrl,
    originalPrice,
    offerAmount,
    offerPercentage,
    message,
    offerId,
    productId,
    expiresAt,
  } = params;

  const offerLink = buildOfferLink(offerId);
  const productLink = buildProductLink(productId);
  const settingsLink = buildSettingsLink();
  
  const discount = offerPercentage || Math.round((1 - offerAmount / originalPrice) * 100);
  const emailSubject = `New offer received: ${formatPrice(offerAmount)} for ${productName}`;

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
            <td style="background-color: #059669; padding: 24px 32px; text-align: center;">
              <img src="${getAppUrl()}/yj.svg" alt="Yellow Jersey" width="120" height="auto" style="margin-bottom: 12px;" />
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">
                New Offer Received
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
                Great news! <strong>${buyerName}</strong> has made an offer on your listing.
              </p>

              <!-- Product & Offer Card -->
              <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 24px; overflow: hidden;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  ${productImageUrl ? `
                  <tr>
                    <td style="padding: 0;">
                      <img src="${productImageUrl}" alt="${productName}" width="100%" height="160" style="object-fit: cover; display: block;">
                    </td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="padding: 16px;">
                      <p style="margin: 0 0 8px; font-size: 16px; color: #111827; font-weight: 600;">
                        ${productName}
                      </p>
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td>
                            <p style="margin: 0; font-size: 14px; color: #6b7280;">
                              Your price: <span style="text-decoration: line-through;">${formatPrice(originalPrice)}</span>
                            </p>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding-top: 8px;">
                            <p style="margin: 0; font-size: 24px; color: #059669; font-weight: 700;">
                              ${formatPrice(offerAmount)}
                            </p>
                            <p style="margin: 4px 0 0; font-size: 13px; color: #6b7280;">
                              ${discount}% below asking price
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </div>

              ${message ? `
              <!-- Buyer's Message -->
              <div style="background-color: #f9fafb; border-left: 4px solid #3b82f6; padding: 16px 20px; margin-bottom: 24px; border-radius: 4px;">
                <p style="margin: 0 0 4px; font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 600;">
                  Message from ${buyerName}
                </p>
                <p style="margin: 0; font-size: 14px; color: #4b5563; line-height: 1.6;">
                  "${message}"
                </p>
              </div>
              ` : ''}

              <!-- Expiry Notice -->
              <div style="background-color: #fef3c7; border: 1px solid #f59e0b; padding: 12px 16px; margin-bottom: 24px; border-radius: 8px;">
                <p style="margin: 0; font-size: 14px; color: #92400e;">
                  ⏰ This offer expires on <strong>${formatDate(expiresAt)}</strong>
                </p>
              </div>

              <!-- Call to Action Buttons -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="${offerLink}" style="display: inline-block; background-color: #059669; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      View & Respond
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.6; text-align: center;">
                <a href="${offerLink}" style="color: #3b82f6; text-decoration: none;">
                  ${offerLink}
                </a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 24px 32px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px; font-size: 12px; color: #6b7280; text-align: center;">
                You're receiving this email because someone made an offer on your listing.
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

Great news! ${buyerName} has made an offer on your listing.

Product: ${productName}
Your price: ${formatPrice(originalPrice)}
Offer: ${formatPrice(offerAmount)} (${discount}% below asking)

${message ? `Message from ${buyerName}: "${message}"` : ''}

This offer expires on ${formatDate(expiresAt)}.

View & Respond: ${offerLink}

---
To manage your notification preferences, visit: ${settingsLink}
`;

  return { subject: emailSubject, html, text };
}

