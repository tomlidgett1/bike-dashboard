'use client';

// Dev-only page — shows all 4 welcome email designs side by side
// Visit: http://localhost:3000/dev/email-preview

const APP_URL = 'https://yellowjersey.store';
const YJ_LOGO = `${APP_URL}/yj.svg`;
const MARKETPLACE = `${APP_URL}/marketplace`;
const SETTINGS = `${APP_URL}/settings/notifications`;

// ─────────────────────────────────────────────────────────────
// DESIGN 1: OBSIDIAN — Dark, minimal, premium (Linear / Vercel)
// ─────────────────────────────────────────────────────────────
const OBSIDIAN = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:48px 24px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

      <!-- Logo -->
      <tr><td style="padding-bottom:56px;" align="left">
        <img src="https://yellowjersey.store/yjlogo.png" alt="Yellow Jersey" height="40" style="display:block;" />
      </td></tr>

      <!-- Eyebrow -->
      <tr><td style="padding-bottom:12px;">
        <p style="margin:0;font-size:11px;color:#F5C518;text-transform:uppercase;letter-spacing:3px;font-weight:600;">New account</p>
      </td></tr>

      <!-- Heading -->
      <tr><td style="padding-bottom:28px;">
        <h1 style="margin:0;font-size:44px;font-weight:800;color:#ffffff;line-height:1.1;letter-spacing:-1.5px;">You're in the<br/>peloton.</h1>
      </td></tr>

      <!-- Body -->
      <tr><td style="padding-bottom:48px;">
        <p style="margin:0;font-size:17px;color:#6b7280;line-height:1.75;">Hey Thomas — welcome to Yellow Jersey. The marketplace where cyclists buy, sell, and negotiate on bikes and gear they'll actually use.</p>
      </td></tr>

      <!-- Features -->
      <tr><td style="padding-bottom:48px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:20px 0;border-top:1px solid #1f1f1f;">
              <table cellpadding="0" cellspacing="0"><tr>
                <td style="padding-right:16px;font-size:20px;line-height:1;">🛒</td>
                <td>
                  <p style="margin:0 0 3px;font-size:15px;font-weight:600;color:#e5e7eb;">Browse the marketplace</p>
                  <p style="margin:0;font-size:13px;color:#4b5563;line-height:1.6;">Bikes, wheels, components and gear from shops and private sellers.</p>
                </td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 0;border-top:1px solid #1f1f1f;">
              <table cellpadding="0" cellspacing="0"><tr>
                <td style="padding-right:16px;font-size:20px;line-height:1;">💬</td>
                <td>
                  <p style="margin:0 0 3px;font-size:15px;font-weight:600;color:#e5e7eb;">Negotiate directly</p>
                  <p style="margin:0;font-size:13px;color:#4b5563;line-height:1.6;">Make an offer. Sellers can accept, counter, or decline — real negotiation built in.</p>
                </td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 0;border-top:1px solid #1f1f1f;border-bottom:1px solid #1f1f1f;">
              <table cellpadding="0" cellspacing="0"><tr>
                <td style="padding-right:16px;font-size:20px;line-height:1;">🔒</td>
                <td>
                  <p style="margin:0 0 3px;font-size:15px;font-weight:600;color:#e5e7eb;">Pay with confidence</p>
                  <p style="margin:0;font-size:13px;color:#4b5563;line-height:1.6;">Escrow holds your funds until you confirm the item arrived as described.</p>
                </td>
              </tr></table>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- CTA -->
      <tr><td style="padding-bottom:64px;">
        <a href="${MARKETPLACE}" style="display:inline-block;background:#F5C518;color:#0a0a0a;text-decoration:none;padding:15px 36px;font-size:15px;font-weight:800;letter-spacing:0.5px;">Start exploring →</a>
      </td></tr>

      <!-- Footer -->
      <tr><td style="border-top:1px solid #1a1a1a;padding-top:28px;">
        <p style="margin:0 0 6px;font-size:11px;color:#374151;text-align:center;letter-spacing:0.5px;text-transform:uppercase;">Yellow Jersey</p>
        <p style="margin:0;font-size:11px;color:#1f2937;text-align:center;">
          <a href="${SETTINGS}" style="color:#374151;text-decoration:none;">Notification preferences</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;

// ─────────────────────────────────────────────────────────────
// DESIGN 2: VELOCITY — Bold, editorial, sports energy · YJ brand
// ─────────────────────────────────────────────────────────────
const VELOCITY = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- Hero block -->
      <tr><td style="background:#0a0a0a;padding:48px 40px 0;">
        <img src="https://yellowjersey.store/yjlogo.png" alt="Yellow Jersey" height="52" style="display:block;margin-bottom:48px;" />
        <p style="margin:0 0 12px;font-size:11px;color:#F5C518;letter-spacing:5px;text-transform:uppercase;font-weight:700;">Welcome</p>
        <h1 style="margin:0;font-size:72px;font-weight:900;color:#ffffff;line-height:0.92;letter-spacing:-3px;text-transform:uppercase;">The ride<br/>starts<br/>here.</h1>
      </td></tr>

      <!-- Yellow accent bar -->
      <tr><td style="background:#F5C518;padding:22px 40px;">
        <p style="margin:0;font-size:15px;color:#0a0a0a;font-weight:700;line-height:1.5;">Hey Thomas — you've just joined the marketplace built for cyclists who actually ride.</p>
      </td></tr>

      <!-- Content -->
      <tr><td style="background:#ffffff;padding:40px;">

        <!-- Stats row -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:40px;">
          <tr>
            <td width="33%" style="text-align:center;padding:24px 8px;background:#f5f5f0;" align="center">
              <p style="margin:0 0 6px;font-size:28px;font-weight:900;color:#0a0a0a;letter-spacing:-1px;">Buy</p>
              <p style="margin:0;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:2px;font-weight:600;">shop</p>
            </td>
            <td width="4%" style="font-size:0;">&nbsp;</td>
            <td width="33%" style="text-align:center;padding:24px 8px;background:#0a0a0a;" align="center">
              <p style="margin:0 0 6px;font-size:28px;font-weight:900;color:#F5C518;letter-spacing:-1px;">Offer</p>
              <p style="margin:0;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:2px;font-weight:600;">negotiate</p>
            </td>
            <td width="4%" style="font-size:0;">&nbsp;</td>
            <td width="33%" style="text-align:center;padding:24px 8px;background:#f5f5f0;" align="center">
              <p style="margin:0 0 6px;font-size:28px;font-weight:900;color:#0a0a0a;letter-spacing:-1px;">Sell</p>
              <p style="margin:0;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:2px;font-weight:600;">earn</p>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 36px;font-size:16px;color:#374151;line-height:1.75;">Browse thousands of listings from Australia's best bike shops and private sellers. Found something? Make an offer — real negotiation, not just buy-it-now. Secure escrow means you never pay until you're happy.</p>

        <!-- CTA -->
        <table cellpadding="0" cellspacing="0">
          <tr>
            <td style="background:#F5C518;">
              <a href="${MARKETPLACE}" style="display:inline-block;color:#0a0a0a;text-decoration:none;padding:17px 44px;font-size:14px;font-weight:900;letter-spacing:2.5px;text-transform:uppercase;">Explore now →</a>
            </td>
          </tr>
        </table>

      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#0a0a0a;padding:28px 40px;">
        <p style="margin:0;font-size:11px;color:#3d3d3d;text-align:center;letter-spacing:0.5px;">
          YELLOW JERSEY &nbsp;·&nbsp; <a href="${SETTINGS}" style="color:#3d3d3d;text-decoration:none;">Manage preferences</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;

// ─────────────────────────────────────────────────────────────
// DESIGN 3: CRAFT — Premium cycling editorial (Rapha / MAAP)
// ─────────────────────────────────────────────────────────────
const CRAFT = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#faf8f5;font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f5;padding:48px 24px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

      <!-- Top rule — yellow lead -->
      <tr><td style="padding-bottom:32px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="height:4px;background:#F5C518;width:48px;"></td>
          <td style="height:1px;background:#d4d0c8;"></td>
        </tr></table>
      </td></tr>

      <!-- Logo + label -->
      <tr><td style="padding-bottom:48px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td valign="middle">
            <img src="https://yellowjersey.store/yjlogo.png" alt="Yellow Jersey" height="28" style="display:inline-block;vertical-align:middle;" />
          </td>
          <td align="right" valign="middle">
            <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;color:#9c9488;letter-spacing:3px;text-transform:uppercase;">Member Welcome</p>
          </td>
        </tr></table>
      </td></tr>

      <!-- Eyebrow + heading -->
      <tr><td style="padding-bottom:8px;">
        <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;color:#0a0a0a;letter-spacing:3px;text-transform:uppercase;font-weight:700;">Yellow Jersey</p>
      </td></tr>
      <tr><td style="padding-bottom:32px;">
        <h1 style="margin:0;font-size:52px;font-weight:400;color:#1a1a1a;line-height:1.1;letter-spacing:-1px;font-style:italic;">Welcome,<br/>Thomas.</h1>
      </td></tr>

      <!-- Rule -->
      <tr><td style="padding-bottom:32px;">
        <div style="height:1px;background:#d4d0c8;"></div>
      </td></tr>

      <!-- Intro -->
      <tr><td style="padding-bottom:40px;">
        <p style="margin:0;font-size:18px;color:#3d3a34;line-height:1.85;font-weight:400;">You've joined Australia's most considered marketplace for cyclists — where the gear is real, the sellers are serious, and the negotiations are fair.</p>
      </td></tr>

      <!-- Three features — yellow left-border editorial style -->
      <tr><td style="padding-bottom:40px;">

        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
          <tr>
            <td width="4" style="background:#F5C518;font-size:0;">&nbsp;</td>
            <td style="padding:4px 0 4px 20px;">
              <p style="margin:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;font-weight:800;color:#0a0a0a;letter-spacing:1px;text-transform:uppercase;">I. The marketplace</p>
              <p style="margin:0;font-size:14px;font-weight:400;color:#1a1a1a;font-style:italic;line-height:1.5;">Thousands of listings from Australia's best independent bike shops and private collectors. Frames, wheels, components, and complete builds.</p>
            </td>
          </tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
          <tr>
            <td width="4" style="background:#F5C518;font-size:0;">&nbsp;</td>
            <td style="padding:4px 0 4px 20px;">
              <p style="margin:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;font-weight:800;color:#0a0a0a;letter-spacing:1px;text-transform:uppercase;">II. The offer</p>
              <p style="margin:0;font-size:14px;font-weight:400;color:#1a1a1a;font-style:italic;line-height:1.5;">Make an offer on anything. Sellers respond — accept, counter, or decline. No awkward haggling. No unanswered messages.</p>
            </td>
          </tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="4" style="background:#F5C518;font-size:0;">&nbsp;</td>
            <td style="padding:4px 0 4px 20px;">
              <p style="margin:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;font-weight:800;color:#0a0a0a;letter-spacing:1px;text-transform:uppercase;">III. The guarantee</p>
              <p style="margin:0;font-size:14px;font-weight:400;color:#1a1a1a;font-style:italic;line-height:1.5;">Payment held in escrow until you confirm receipt. If the item isn't as described, you're covered.</p>
            </td>
          </tr>
        </table>

      </td></tr>

      <!-- Rule -->
      <tr><td style="padding-bottom:36px;">
        <div style="height:1px;background:#d4d0c8;"></div>
      </td></tr>

      <!-- CTA — yellow fill -->
      <tr><td style="padding-bottom:64px;">
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="background:#F5C518;">
            <a href="${MARKETPLACE}" style="display:inline-block;color:#0a0a0a;text-decoration:none;padding:14px 36px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Enter the marketplace</a>
          </td>
        </tr></table>
      </td></tr>

      <!-- Bottom rule — yellow tail -->
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;"><tr>
          <td style="height:1px;background:#d4d0c8;"></td>
          <td style="height:4px;background:#F5C518;width:48px;"></td>
        </tr></table>
        <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;color:#9c9488;text-align:center;letter-spacing:1px;">
          YELLOW JERSEY &nbsp;·&nbsp; <a href="${SETTINGS}" style="color:#9c9488;text-decoration:none;">PREFERENCES</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;

// ─────────────────────────────────────────────────────────────
// DESIGN 4: SIGNAL — Clean modern SaaS (Notion / Loom / Figma)
// ─────────────────────────────────────────────────────────────
const SIGNAL = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 24px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">

      <!-- Black header band -->
      <tr><td style="background:#0a0a0a;padding:36px 40px 32px;">
        <img src="https://yellowjersey.store/yjlogo.png" alt="Yellow Jersey" height="36" style="display:block;margin-bottom:28px;" />
        <h1 style="margin:0;font-size:34px;font-weight:800;color:#ffffff;line-height:1.15;letter-spacing:-0.5px;">Hey Thomas,<br/>welcome aboard. 👋</h1>
      </td></tr>

      <!-- Yellow accent strip -->
      <tr><td style="background:#F5C518;height:5px;font-size:0;line-height:0;">&nbsp;</td></tr>

      <!-- White content -->
      <tr><td style="padding:40px;">

        <p style="margin:0 0 32px;font-size:16px;color:#374151;line-height:1.75;">You're now on Yellow Jersey — the marketplace where Australian cyclists buy, sell, and negotiate on gear they actually want.</p>

        <!-- Feature cards -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:36px;">

          <tr><td style="padding-bottom:12px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:10px;padding:16px 20px;border-left:4px solid #F5C518;">
              <tr>
                <td width="36" valign="middle" style="padding-right:14px;font-size:24px;">🛍️</td>
                <td valign="middle">
                  <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#111827;">Browse the marketplace</p>
                  <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Bikes, wheels, components and gear from shops and sellers across Australia.</p>
                </td>
              </tr>
            </table>
          </td></tr>

          <tr><td style="padding-bottom:12px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:10px;padding:16px 20px;border-left:4px solid #F5C518;">
              <tr>
                <td width="36" valign="middle" style="padding-right:14px;font-size:24px;">💸</td>
                <td valign="middle">
                  <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#111827;">Make an offer</p>
                  <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Name your price. Sellers accept, counter, or decline — genuine negotiation on every listing.</p>
                </td>
              </tr>
            </table>
          </td></tr>

          <tr><td>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:10px;padding:16px 20px;border-left:4px solid #F5C518;">
              <tr>
                <td width="36" valign="middle" style="padding-right:14px;font-size:24px;">🔐</td>
                <td valign="middle">
                  <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#111827;">Pay safely, every time</p>
                  <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Secure escrow holds your payment until you confirm receipt. You're always protected.</p>
                </td>
              </tr>
            </table>
          </td></tr>

        </table>

        <!-- CTA -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
          <tr>
            <td align="center">
              <a href="${MARKETPLACE}" style="display:inline-block;background:#F5C518;color:#0a0a0a;text-decoration:none;padding:15px 40px;border-radius:6px;font-size:15px;font-weight:800;letter-spacing:0.3px;">Explore listings →</a>
            </td>
          </tr>
        </table>

        <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;line-height:1.6;">Questions? Just reply to this email.</p>

      </td></tr>

      <!-- Footer band -->
      <tr><td style="background:#0a0a0a;padding:20px 40px;">
        <p style="margin:0;font-size:11px;color:#4b5563;text-align:center;">
          Yellow Jersey &nbsp;·&nbsp; <a href="${SETTINGS}" style="color:#4b5563;text-decoration:none;">Manage preferences</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;

const DESIGNS = [
  { name: 'Obsidian', subtitle: 'Dark · Minimal · Premium', html: OBSIDIAN },
  { name: 'Velocity', subtitle: 'Bold · Editorial · Sports', html: VELOCITY },
  { name: 'Craft', subtitle: 'Warm · Artisanal · Rapha-esque', html: CRAFT },
  { name: 'Signal', subtitle: 'Clean · Modern · SaaS', html: SIGNAL },
];

// ─────────────────────────────────────────────────────────────
// TRANSACTIONAL: New Message
// ─────────────────────────────────────────────────────────────
const MSG_NOTIFICATION = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 24px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">

      <!-- Black header -->
      <tr><td style="background:#0a0a0a;padding:28px 40px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td valign="middle">
            <img src="https://yellowjersey.store/yjlogo.png" alt="Yellow Jersey" height="28" style="display:block;" />
          </td>
          <td align="right" valign="middle">
            <p style="margin:0;font-size:11px;color:#6b7280;letter-spacing:2px;text-transform:uppercase;">New message</p>
          </td>
        </tr></table>
      </td></tr>

      <!-- Yellow strip -->
      <tr><td style="background:#F5C518;height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>

      <!-- Content -->
      <tr><td style="padding:36px 40px;">

        <!-- Sender -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
          <tr>
            <td width="48" valign="middle" style="padding-right:14px;">
              <div style="width:44px;height:44px;background:#F5C518;border-radius:50%;text-align:center;line-height:44px;font-size:18px;font-weight:900;color:#0a0a0a;display:inline-block;">J</div>
            </td>
            <td valign="middle">
              <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#111827;">James Walker</p>
              <p style="margin:0;font-size:13px;color:#9ca3af;">sent you a message</p>
            </td>
            <td align="right" valign="top">
              <p style="margin:0;font-size:12px;color:#d1d5db;">2 min ago</p>
            </td>
          </tr>
        </table>

        <!-- Listing context -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
          <tr>
            <td style="background:#f9fafb;border-radius:10px;padding:14px 18px;border-left:4px solid #F5C518;">
              <p style="margin:0 0 2px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;font-weight:600;">About your listing</p>
              <p style="margin:0;font-size:14px;font-weight:700;color:#111827;">Trek Domane AL 5 &nbsp;—&nbsp; $1,499</p>
            </td>
          </tr>
        </table>

        <!-- Message bubble -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
          <tr>
            <td style="background:#f3f4f6;border-radius:12px;border-bottom-left-radius:3px;padding:18px 22px;">
              <p style="margin:0;font-size:15px;color:#374151;line-height:1.65;">"Hi, is this bike still available? I'm very interested — would you consider $1,200?"</p>
            </td>
          </tr>
        </table>

        <!-- CTA -->
        <table cellpadding="0" cellspacing="0">
          <tr>
            <td style="background:#F5C518;">
              <a href="${APP_URL}/messages" style="display:inline-block;color:#0a0a0a;text-decoration:none;padding:14px 32px;font-size:14px;font-weight:900;letter-spacing:0.3px;">Reply now →</a>
            </td>
          </tr>
        </table>

      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#0a0a0a;padding:18px 40px;">
        <p style="margin:0;font-size:11px;color:#4b5563;text-align:center;">Yellow Jersey &nbsp;·&nbsp; <a href="${SETTINGS}" style="color:#4b5563;text-decoration:none;">Manage preferences</a></p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;

// ─────────────────────────────────────────────────────────────
// TRANSACTIONAL: New Offer (Velocity-esque — bold, exciting)
// ─────────────────────────────────────────────────────────────
const OFFER_NOTIFICATION = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- Hero -->
      <tr><td style="background:#0a0a0a;padding:40px 40px 0;">
        <img src="https://yellowjersey.store/yjlogo.png" alt="Yellow Jersey" height="44" style="display:block;margin-bottom:40px;" />
        <p style="margin:0 0 10px;font-size:11px;color:#F5C518;letter-spacing:5px;text-transform:uppercase;font-weight:700;">New offer</p>
        <h1 style="margin:0;font-size:60px;font-weight:900;color:#ffffff;line-height:0.92;letter-spacing:-2.5px;text-transform:uppercase;">Someone<br/>wants your<br/>bike.</h1>
      </td></tr>

      <!-- Yellow bar — offer amount -->
      <tr><td style="background:#F5C518;padding:20px 40px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td valign="middle">
            <p style="margin:0 0 3px;font-size:11px;color:#0a0a0a;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;">Offer from Sarah Chen</p>
            <p style="margin:0;font-size:13px;color:#3d3000;opacity:0.8;">Specialized S-Works Tarmac SL7</p>
          </td>
          <td align="right" valign="middle">
            <p style="margin:0;font-size:40px;font-weight:900;color:#0a0a0a;letter-spacing:-1.5px;">$4,200</p>
          </td>
        </tr></table>
      </td></tr>

      <!-- White content -->
      <tr><td style="background:#ffffff;padding:36px 40px;">

        <!-- Price comparison -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
          <tr>
            <td width="47%" style="text-align:center;padding:22px 12px;background:#f5f5f0;">
              <p style="margin:0 0 6px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">Listed at</p>
              <p style="margin:0;font-size:30px;font-weight:900;color:#9ca3af;letter-spacing:-1px;text-decoration:line-through;">$5,500</p>
            </td>
            <td width="6%" style="text-align:center;font-size:18px;color:#d1d5db;font-weight:300;">→</td>
            <td width="47%" style="text-align:center;padding:22px 12px;background:#0a0a0a;">
              <p style="margin:0 0 6px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">Their offer</p>
              <p style="margin:0;font-size:30px;font-weight:900;color:#F5C518;letter-spacing:-1px;">$4,200</p>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 32px;font-size:13px;color:#9ca3af;text-align:center;">$1,300 below asking · Expires in 48 hours</p>

        <!-- Action buttons -->
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="34%" style="padding-right:6px;">
              <a href="${APP_URL}/offers" style="display:block;background:#F5C518;color:#0a0a0a;text-decoration:none;padding:14px 8px;text-align:center;font-size:13px;font-weight:900;letter-spacing:1px;text-transform:uppercase;">Accept</a>
            </td>
            <td width="34%" style="padding:0 3px;">
              <a href="${APP_URL}/offers" style="display:block;background:#0a0a0a;color:#ffffff;text-decoration:none;padding:14px 8px;text-align:center;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Counter</a>
            </td>
            <td width="32%" style="padding-left:6px;">
              <a href="${APP_URL}/offers" style="display:block;border:1.5px solid #e5e7eb;color:#9ca3af;text-decoration:none;padding:13px 8px;text-align:center;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Decline</a>
            </td>
          </tr>
        </table>

      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#0a0a0a;padding:24px 40px;">
        <p style="margin:0;font-size:11px;color:#3d3d3d;text-align:center;">YELLOW JERSEY &nbsp;·&nbsp; <a href="${SETTINGS}" style="color:#3d3d3d;text-decoration:none;">Manage preferences</a></p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;

// ─────────────────────────────────────────────────────────────
// TRANSACTIONAL: Purchase Confirmation (Signal-esque — clean, reassuring)
// ─────────────────────────────────────────────────────────────
const PURCHASE_CONFIRM = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 24px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">

      <!-- Black header -->
      <tr><td style="background:#0a0a0a;padding:28px 40px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td valign="middle">
            <img src="https://yellowjersey.store/yjlogo.png" alt="Yellow Jersey" height="28" style="display:block;" />
          </td>
          <td align="right" valign="middle">
            <p style="margin:0;font-size:13px;color:#F5C518;font-weight:700;letter-spacing:0.3px;">Purchase confirmed ✓</p>
          </td>
        </tr></table>
      </td></tr>

      <!-- Yellow strip -->
      <tr><td style="background:#F5C518;height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>

      <!-- Content -->
      <tr><td style="padding:36px 40px;">

        <h2 style="margin:0 0 8px;font-size:26px;font-weight:800;color:#111827;letter-spacing:-0.5px;">It's on its way.</h2>
        <p style="margin:0 0 32px;font-size:15px;color:#6b7280;line-height:1.65;">Your payment is held safely in escrow. The seller has been notified and will ship soon.</p>

        <!-- Order card -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:12px;padding:22px 24px;margin-bottom:28px;border:1px solid #f0f0f0;">
          <tr><td>
            <p style="margin:0 0 14px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">Order #YJ-28471</p>
            <p style="margin:0 0 4px;font-size:17px;font-weight:800;color:#111827;">Specialized S-Works Tarmac SL7</p>
            <p style="margin:0 0 20px;font-size:13px;color:#6b7280;">Sold by The Bike Shop Melbourne</p>
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td valign="bottom">
                <p style="margin:0 0 2px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Total paid</p>
                <p style="margin:0;font-size:28px;font-weight:900;color:#111827;letter-spacing:-1px;">$4,800</p>
              </td>
              <td align="right" valign="bottom">
                <p style="margin:0 0 2px;font-size:12px;color:#6b7280;text-align:right;">Escrow protected</p>
                <p style="margin:0;font-size:13px;color:#F5C518;font-weight:700;text-align:right;">🔒 Funds held safely</p>
              </td>
            </tr></table>
          </td></tr>
        </table>

        <!-- Next steps -->
        <p style="margin:0 0 14px;font-size:11px;font-weight:800;color:#111827;text-transform:uppercase;letter-spacing:1.5px;">What happens next</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
          <tr><td style="padding:12px 0;border-top:1px solid #f3f4f6;">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="padding-right:14px;">
                <table cellpadding="0" cellspacing="0"><tr><td style="width:28px;height:28px;background:#F5C518;border-radius:50%;text-align:center;font-size:12px;font-weight:900;color:#0a0a0a;line-height:28px;">1</td></tr></table>
              </td>
              <td><p style="margin:0;font-size:14px;color:#374151;">Seller ships your item within 3 days</p></td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:12px 0;border-top:1px solid #f3f4f6;">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="padding-right:14px;">
                <table cellpadding="0" cellspacing="0"><tr><td style="width:28px;height:28px;background:#f3f4f6;border-radius:50%;text-align:center;font-size:12px;font-weight:900;color:#9ca3af;line-height:28px;">2</td></tr></table>
              </td>
              <td><p style="margin:0;font-size:14px;color:#374151;">You receive and inspect the item</p></td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:12px 0;border-top:1px solid #f3f4f6;">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="padding-right:14px;">
                <table cellpadding="0" cellspacing="0"><tr><td style="width:28px;height:28px;background:#f3f4f6;border-radius:50%;text-align:center;font-size:12px;font-weight:900;color:#9ca3af;line-height:28px;">3</td></tr></table>
              </td>
              <td><p style="margin:0;font-size:14px;color:#374151;">Confirm receipt — funds released to seller</p></td>
            </tr></table>
          </td></tr>
        </table>

        <!-- CTA -->
        <table cellpadding="0" cellspacing="0">
          <tr>
            <td style="background:#F5C518;">
              <a href="${APP_URL}/purchases" style="display:inline-block;color:#0a0a0a;text-decoration:none;padding:14px 32px;font-size:14px;font-weight:900;letter-spacing:0.3px;">View your purchase →</a>
            </td>
          </tr>
        </table>

      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#0a0a0a;padding:18px 40px;">
        <p style="margin:0;font-size:11px;color:#4b5563;text-align:center;">Yellow Jersey &nbsp;·&nbsp; <a href="${SETTINGS}" style="color:#4b5563;text-decoration:none;">Manage preferences</a></p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;

// ─────────────────────────────────────────────────────────────
// TRANSACTIONAL: Sale Notification (Velocity-esque — bold, celebratory)
// ─────────────────────────────────────────────────────────────
const SALE_NOTIFY = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- Hero -->
      <tr><td style="background:#0a0a0a;padding:40px 40px 0;">
        <img src="https://yellowjersey.store/yjlogo.png" alt="Yellow Jersey" height="44" style="display:block;margin-bottom:40px;" />
        <p style="margin:0 0 10px;font-size:11px;color:#F5C518;letter-spacing:5px;text-transform:uppercase;font-weight:700;">Sale complete</p>
        <h1 style="margin:0;font-size:68px;font-weight:900;color:#ffffff;line-height:0.92;letter-spacing:-3px;text-transform:uppercase;">You<br/>made a<br/>sale.</h1>
      </td></tr>

      <!-- Yellow bar — sale amount -->
      <tr><td style="background:#F5C518;padding:22px 40px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td valign="middle">
            <p style="margin:0 0 3px;font-size:11px;color:#0a0a0a;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;">Specialized S-Works Tarmac SL7</p>
            <p style="margin:0;font-size:13px;color:#3d3000;opacity:0.8;">Bought by Sarah Chen</p>
          </td>
          <td align="right" valign="middle">
            <p style="margin:0;font-size:40px;font-weight:900;color:#0a0a0a;letter-spacing:-1.5px;">$4,800</p>
          </td>
        </tr></table>
      </td></tr>

      <!-- White content -->
      <tr><td style="background:#ffffff;padding:36px 40px;">

        <p style="margin:0 0 28px;font-size:16px;color:#374151;line-height:1.7;">Ship within 3 days and you'll receive your payout as soon as Sarah confirms receipt.</p>

        <!-- Ship to -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
          <tr>
            <td style="background:#f9f9f7;padding:20px 24px;border-left:4px solid #F5C518;">
              <p style="margin:0 0 8px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">Ship to</p>
              <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#111827;">Sarah Chen</p>
              <p style="margin:0;font-size:14px;color:#6b7280;">45 Collins Street, Melbourne VIC 3000</p>
            </td>
          </tr>
        </table>

        <!-- Steps row -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
          <tr>
            <td width="31%" style="text-align:center;padding:20px 8px;background:#f9f9f7;">
              <p style="margin:0 0 8px;font-size:24px;">📦</p>
              <p style="margin:0 0 3px;font-size:13px;font-weight:700;color:#111827;">Pack &amp; ship</p>
              <p style="margin:0;font-size:12px;color:#9ca3af;">Within 3 days</p>
            </td>
            <td width="3%" style="text-align:center;font-size:14px;color:#d1d5db;">→</td>
            <td width="31%" style="text-align:center;padding:20px 8px;background:#f9f9f7;">
              <p style="margin:0 0 8px;font-size:24px;">📍</p>
              <p style="margin:0 0 3px;font-size:13px;font-weight:700;color:#111827;">Add tracking</p>
              <p style="margin:0;font-size:12px;color:#9ca3af;">Keep buyer updated</p>
            </td>
            <td width="3%" style="text-align:center;font-size:14px;color:#d1d5db;">→</td>
            <td width="32%" style="text-align:center;padding:20px 8px;background:#F5C518;">
              <p style="margin:0 0 8px;font-size:24px;">💰</p>
              <p style="margin:0 0 3px;font-size:13px;font-weight:900;color:#0a0a0a;">Get paid</p>
              <p style="margin:0;font-size:12px;color:#3d3000;font-weight:600;">$4,800 released</p>
            </td>
          </tr>
        </table>

        <!-- CTA -->
        <table cellpadding="0" cellspacing="0">
          <tr>
            <td style="background:#F5C518;">
              <a href="${APP_URL}/sales" style="display:inline-block;color:#0a0a0a;text-decoration:none;padding:15px 40px;font-size:14px;font-weight:900;letter-spacing:2px;text-transform:uppercase;">View sale details →</a>
            </td>
          </tr>
        </table>

      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#0a0a0a;padding:24px 40px;">
        <p style="margin:0;font-size:11px;color:#3d3d3d;text-align:center;">YELLOW JERSEY &nbsp;·&nbsp; <a href="${SETTINGS}" style="color:#3d3d3d;text-decoration:none;">Manage preferences</a></p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;

const TRANSACTION_DESIGNS = [
  { name: 'New Message', subtitle: 'Signal style · Clean', html: MSG_NOTIFICATION, height: 580 },
  { name: 'New Offer', subtitle: 'Velocity style · Bold', html: OFFER_NOTIFICATION, height: 640 },
  { name: 'Purchase Confirmation', subtitle: 'Signal style · Reassuring', html: PURCHASE_CONFIRM, height: 720 },
  { name: 'Sale Notification', subtitle: 'Velocity style · Celebratory', html: SALE_NOTIFY, height: 680 },
];

export default function EmailPreviewPage() {
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#18181b', minHeight: '100vh', padding: '40px 24px' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>

        {/* Dev section tabs */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
          <a href="/dev/email-preview" style={{ padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: 'none', color: '#0a0a0a', background: '#ffde59', border: '1px solid #ffde59' }}>
            Email Templates
          </a>
          <a href="/dev/product-designs" style={{ padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: 'none', color: '#a1a1aa', background: '#27272a', border: '1px solid #3f3f46' }}>
            Product Pages
          </a>
        </div>

        <div style={{ marginBottom: 40 }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>
            Welcome Email Designs
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: '#71717a' }}>
            4 concepts — pick one to ship, or combine elements.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 32, marginBottom: 72 }}>
          {DESIGNS.map((design) => (
            <div key={design.name}>
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{design.name}</span>
                <span style={{ fontSize: 12, color: '#52525b', background: '#27272a', padding: '3px 10px', borderRadius: 20 }}>
                  {design.subtitle}
                </span>
              </div>
              <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #27272a', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
                <iframe
                  srcDoc={design.html}
                  style={{ width: '100%', height: 640, border: 'none', display: 'block' }}
                  title={design.name}
                />
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 40 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>
            Transactional Email Designs
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: '#71717a' }}>
            Consistent YJ brand across all notification types.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 32 }}>
          {TRANSACTION_DESIGNS.map((design) => (
            <div key={design.name}>
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{design.name}</span>
                <span style={{ fontSize: 12, color: '#52525b', background: '#27272a', padding: '3px 10px', borderRadius: 20 }}>
                  {design.subtitle}
                </span>
              </div>
              <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #27272a', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
                <iframe
                  srcDoc={design.html}
                  style={{ width: '100%', height: design.height, border: 'none', display: 'block' }}
                  title={design.name}
                />
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
