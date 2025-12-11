// ============================================================
// OFFER STATUS EMAIL TEMPLATE
// ============================================================
// Template for notifying buyers when offer status changes
// (accepted, rejected, countered, expired)

import { buildOfferLink, buildProductLink, buildSettingsLink, formatPrice, formatDate, getAppUrl } from '../resend-client.ts';

export type OfferStatusType = 'accepted' | 'rejected' | 'countered' | 'expired';

export interface OfferStatusParams {
  recipientName: string;
  sellerName: string;
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

const STATUS_CONFIG = {
  accepted: {
    headerColor: '#059669',
    headerText: 'Offer Accepted!',
    emoji: '🎉',
    message: (sellerName: string) => `Great news! <strong>${sellerName}</strong> has accepted your offer.`,
    ctaText: 'View Details',
    ctaColor: '#059669',
  },
  rejected: {
    headerColor: '#dc2626',
    headerText: 'Offer Declined',
    emoji: '😔',
    message: (sellerName: string) => `Unfortunately, <strong>${sellerName}</strong> has declined your offer.`,
    ctaText: 'Browse Similar Items',
    ctaColor: '#1f2937',
  },
  countered: {
    headerColor: '#f59e0b',
    headerText: 'Counter Offer Received',
    emoji: '💰',
    message: (sellerName: string) => `<strong>${sellerName}</strong> has made a counter offer.`,
    ctaText: 'View Counter Offer',
    ctaColor: '#f59e0b',
  },
  expired: {
    headerColor: '#6b7280',
    headerText: 'Offer Expired',
    emoji: '⏰',
    message: (_sellerName: string) => `Your offer has expired without a response.`,
    ctaText: 'Make New Offer',
    ctaColor: '#1f2937',
  },
};

export function offerStatusTemplate(params: OfferStatusParams): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    recipientName,
    sellerName,
    productName,
    productImageUrl,
    originalPrice,
    offerAmount,
    status,
    counterAmount,
    counterMessage,
    offerId,
    productId,
    expiresAt,
  } = params;

  const config = STATUS_CONFIG[status];
  const offerLink = buildOfferLink(offerId);
  const productLink = buildProductLink(productId);
  const settingsLink = buildSettingsLink();

  const emailSubject = status === 'accepted'
    ? `Your offer of ${formatPrice(offerAmount)} was accepted!`
    : status === 'countered'
    ? `Counter offer: ${formatPrice(counterAmount || offerAmount)} for ${productName}`
    : status === 'rejected'
    ? `Your offer for ${productName} was declined`
    : `Your offer for ${productName} has expired`;

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
            <td style="background-color: ${config.headerColor}; padding: 24px 32px; text-align: center;">
              <img src="${getAppUrl()}/yjsmall.svg" alt="Yellow Jersey" width="120" height="auto" style="margin-bottom: 12px;" />
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">
                ${config.emoji} ${config.headerText}
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
                ${config.message(sellerName)}
              </p>

              <!-- Product & Offer Card -->
              <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 24px; overflow: hidden;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  ${productImageUrl ? `
                  <tr>
                    <td style="padding: 0;">
                      <img src="${productImageUrl}" alt="${productName}" width="100%" height="140" style="object-fit: cover; display: block;">
                    </td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="padding: 16px;">
                      <p style="margin: 0 0 12px; font-size: 16px; color: #111827; font-weight: 600;">
                        ${productName}
                      </p>
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td width="50%">
                            <p style="margin: 0; font-size: 12px; color: #6b7280;">Listed price</p>
                            <p style="margin: 4px 0 0; font-size: 16px; color: #374151; font-weight: 600;">
                              ${formatPrice(originalPrice)}
                            </p>
                          </td>
                          <td width="50%">
                            <p style="margin: 0; font-size: 12px; color: #6b7280;">Your offer</p>
                            <p style="margin: 4px 0 0; font-size: 16px; color: ${status === 'accepted' ? '#059669' : status === 'rejected' ? '#dc2626' : '#374151'}; font-weight: 600; ${status === 'rejected' ? 'text-decoration: line-through;' : ''}">
                              ${formatPrice(offerAmount)}
                            </p>
                          </td>
                        </tr>
                      </table>

                      ${status === 'countered' && counterAmount ? `
                      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
                        <p style="margin: 0; font-size: 12px; color: #6b7280;">Counter offer</p>
                        <p style="margin: 4px 0 0; font-size: 24px; color: #f59e0b; font-weight: 700;">
                          ${formatPrice(counterAmount)}
                        </p>
                        ${expiresAt ? `
                        <p style="margin: 8px 0 0; font-size: 12px; color: #6b7280;">
                          Expires: ${formatDate(expiresAt)}
                        </p>
                        ` : ''}
                      </div>
                      ` : ''}
                    </td>
                  </tr>
                </table>
              </div>

              ${counterMessage ? `
              <!-- Seller's Message -->
              <div style="background-color: #f9fafb; border-left: 4px solid #f59e0b; padding: 16px 20px; margin-bottom: 24px; border-radius: 4px;">
                <p style="margin: 0 0 4px; font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 600;">
                  Message from ${sellerName}
                </p>
                <p style="margin: 0; font-size: 14px; color: #4b5563; line-height: 1.6;">
                  "${counterMessage}"
                </p>
              </div>
              ` : ''}

              ${status === 'accepted' ? `
              <!-- Next Steps -->
              <div style="background-color: #ecfdf5; border: 1px solid #059669; padding: 16px; margin-bottom: 24px; border-radius: 8px;">
                <p style="margin: 0 0 8px; font-size: 14px; color: #065f46; font-weight: 600;">
                  What's next?
                </p>
                <p style="margin: 0; font-size: 14px; color: #065f46;">
                  The seller will reach out to arrange payment and collection/delivery.
                </p>
              </div>
              ` : ''}

              <!-- Call to Action Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="${status === 'rejected' ? productLink : offerLink}" style="display: inline-block; background-color: ${config.ctaColor}; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      ${config.ctaText}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 24px 32px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px; font-size: 12px; color: #6b7280; text-align: center;">
                You're receiving this email because you made an offer on this item.
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

  const statusMessages = {
    accepted: `Great news! ${sellerName} has accepted your offer of ${formatPrice(offerAmount)}.`,
    rejected: `Unfortunately, ${sellerName} has declined your offer of ${formatPrice(offerAmount)}.`,
    countered: `${sellerName} has made a counter offer of ${formatPrice(counterAmount || offerAmount)}.`,
    expired: `Your offer of ${formatPrice(offerAmount)} has expired.`,
  };

  const text = `
Hi ${recipientName},

${statusMessages[status]}

Product: ${productName}
Listed price: ${formatPrice(originalPrice)}
Your offer: ${formatPrice(offerAmount)}
${status === 'countered' && counterAmount ? `Counter offer: ${formatPrice(counterAmount)}` : ''}

${counterMessage ? `Message from ${sellerName}: "${counterMessage}"` : ''}

${status === 'accepted' ? 'The seller will reach out to arrange payment and collection/delivery.' : ''}

${config.ctaText}: ${status === 'rejected' ? productLink : offerLink}

---
To manage your notification preferences, visit: ${settingsLink}
`;

  return { subject: emailSubject, html, text };
}

