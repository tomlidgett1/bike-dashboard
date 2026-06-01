import { buildSettingsLink, getAppUrl } from '../resend-client.ts';

export interface WelcomeParams {
  recipientName: string;
  isStore?: boolean;
  storeName?: string;
}

export function welcomeTemplate(params: WelcomeParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { recipientName, isStore, storeName } = params;
  const appUrl = getAppUrl();
  const settingsLink = buildSettingsLink();
  const displayName = storeName || recipientName;
  const ctaUrl = isStore ? `${appUrl}/settings/store` : `${appUrl}/marketplace`;
  const ctaText = isStore ? 'Set up your store' : 'Explore the marketplace';
  const subject = `Welcome to Yellow Jersey, ${displayName}!`;

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
        <p style="margin:0 0 12px;font-size:11px;color:#F5C518;letter-spacing:5px;text-transform:uppercase;font-weight:700;">Welcome</p>
        <h1 style="margin:0;font-size:68px;font-weight:900;color:#ffffff;line-height:0.92;letter-spacing:-3px;text-transform:uppercase;">The ride<br/>starts<br/>here.</h1>
      </td></tr>

      <!-- Yellow bar -->
      <tr><td style="background:#F5C518;padding:22px 40px;">
        <p style="margin:0;font-size:15px;color:#0a0a0a;font-weight:700;line-height:1.5;">Hey ${displayName} — ${isStore ? "your store is now live on Yellow Jersey. Start listing and reach thousands of local cyclists." : "you've just joined the marketplace built for cyclists who actually ride."}</p>
      </td></tr>

      <!-- White content -->
      <tr><td style="background:#ffffff;padding:40px;">

        ${isStore ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:36px;">
          <tr><td style="padding-bottom:12px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:10px;padding:16px 20px;border-left:4px solid #F5C518;">
              <tr>
                <td width="36" valign="middle" style="padding-right:14px;font-size:22px;">🏪</td>
                <td valign="middle">
                  <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#111827;">Your storefront</p>
                  <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Customise your public store page with logo, banner, and full product catalogue.</p>
                </td>
              </tr>
            </table>
          </td></tr>
          <tr><td style="padding-bottom:12px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:10px;padding:16px 20px;border-left:4px solid #F5C518;">
              <tr>
                <td width="36" valign="middle" style="padding-right:14px;font-size:22px;">💰</td>
                <td valign="middle">
                  <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#111827;">Secure payments</p>
                  <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Buyers pay upfront into escrow. Funds release once they confirm receipt — protecting everyone.</p>
                </td>
              </tr>
            </table>
          </td></tr>
          <tr><td>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:10px;padding:16px 20px;border-left:4px solid #F5C518;">
              <tr>
                <td width="36" valign="middle" style="padding-right:14px;font-size:22px;">🤝</td>
                <td valign="middle">
                  <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#111827;">Offer negotiation</p>
                  <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Buyers can make offers on your listings. Accept, counter, or decline — you're in control.</p>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
        ` : `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:40px;">
          <tr>
            <td width="31%" style="text-align:center;padding:22px 8px;background:#f5f5f0;">
              <p style="margin:0 0 6px;font-size:26px;font-weight:900;color:#0a0a0a;letter-spacing:-1px;">Buy</p>
              <p style="margin:0;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:2px;font-weight:600;">shop</p>
            </td>
            <td width="3%" style="text-align:center;font-size:14px;color:#d1d5db;">&#8594;</td>
            <td width="31%" style="text-align:center;padding:22px 8px;background:#0a0a0a;">
              <p style="margin:0 0 6px;font-size:26px;font-weight:900;color:#F5C518;letter-spacing:-1px;">Offer</p>
              <p style="margin:0;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:2px;font-weight:600;">negotiate</p>
            </td>
            <td width="3%" style="text-align:center;font-size:14px;color:#d1d5db;">&#8594;</td>
            <td width="31%" style="text-align:center;padding:22px 8px;background:#f5f5f0;">
              <p style="margin:0 0 6px;font-size:26px;font-weight:900;color:#0a0a0a;letter-spacing:-1px;">Sell</p>
              <p style="margin:0;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:2px;font-weight:600;">earn</p>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 32px;font-size:15px;color:#374151;line-height:1.75;">Browse thousands of listings from Australia's best bike shops and private sellers. Make offers, negotiate directly, and pay securely via escrow.</p>
        `}

        <!-- CTA -->
        <table cellpadding="0" cellspacing="0">
          <tr>
            <td style="background:#F5C518;">
              <a href="${ctaUrl}" style="display:inline-block;color:#0a0a0a;text-decoration:none;padding:15px 40px;font-size:14px;font-weight:900;letter-spacing:2px;text-transform:uppercase;">${ctaText} &#8594;</a>
            </td>
          </tr>
        </table>

      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#0a0a0a;padding:24px 40px;">
        <p style="margin:0;font-size:11px;color:#3d3d3d;text-align:center;letter-spacing:0.5px;">
          YELLOW JERSEY &nbsp;&#183;&nbsp; <a href="${settingsLink}" style="color:#3d3d3d;text-decoration:none;">Manage preferences</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;

  const text = `Welcome to Yellow Jersey, ${displayName}!

${isStore
  ? `Your store is live. Start listing and reach thousands of local cyclists.`
  : `You've joined the marketplace built for cyclists who actually ride.`}

${ctaText}: ${ctaUrl}

---
Manage preferences: ${settingsLink}`;

  return { subject, html, text };
}
