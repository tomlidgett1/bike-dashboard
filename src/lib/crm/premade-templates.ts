// Pre-made campaign templates for cycling stores.
//
// Ten distinct, production-quality starting points that load straight into the
// CRM agent preview. Each is a complete email-safe HTML document (tables,
// inline CSS, fluid max-width 600px with mobile media queries, {{UNSUBSCRIBE_URL}}
// + {{FIRST_NAME}} merge tags) with its own creative concept, palette, and layout
// — not variations of one design.
// The agent adapts copy, links, and products after the owner loads one.

import { buildHtmlCampaignContent } from "./campaign-html";
import type { StoreBranding } from "./templates";
import type { CrmEmailTemplateRecord } from "./agent/chat-types";

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

/** Shared responsive rules — class-based so inline desktop styles stay intact. */
const RESPONSIVE_STYLES = `
  img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
  table { border-collapse: collapse !important; }
  .wrapper { width: 100% !important; max-width: 600px !important; }
  @media only screen and (max-width: 600px) {
    .outer-pad { padding-left: 8px !important; padding-right: 8px !important; }
    .pad-x { padding-left: 22px !important; padding-right: 22px !important; }
    .h1-xl { font-size: 46px !important; line-height: 0.95 !important; letter-spacing: -2px !important; }
    .h1-lg { font-size: 36px !important; line-height: 1.05 !important; letter-spacing: -1px !important; }
    .h1-md { font-size: 30px !important; line-height: 1.12 !important; }
    .offer-lockup { font-size: 46px !important; letter-spacing: -1px !important; }
    .stack { width: 100% !important; }
    .stack-cell { display: block !important; width: 100% !important; max-width: 100% !important; box-sizing: border-box !important; }
    .stack-gap .stack-cell + .stack-cell { padding-left: 0 !important; padding-top: 20px !important; }
    .sale-col { display: block !important; width: 100% !important; border-left: 1px solid #262626 !important; }
    .sale-col-first { border-top: 1px solid #262626 !important; }
    .btn-wrap { width: 100% !important; max-width: 100% !important; }
    .btn-wrap td { display: block !important; width: 100% !important; }
    .btn-a { display: block !important; width: 100% !important; box-sizing: border-box !important; text-align: center !important; padding-left: 20px !important; padding-right: 20px !important; }
    .meta-right { display: block !important; width: 100% !important; text-align: left !important; padding-top: 4px !important; }
    .header-right { display: block !important; width: 100% !important; text-align: left !important; padding-top: 8px !important; }
    .badge-right { display: block !important; width: 100% !important; text-align: left !important; padding-top: 10px !important; }
    .cta-row .cta-text { display: block !important; width: 100% !important; text-align: left !important; padding-bottom: 14px !important; }
    .cta-row .cta-btn { display: block !important; width: 100% !important; text-align: left !important; }
    .num-col { width: 36px !important; }
  }
`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Full email document scaffold: fluid 600px max card on a page background. */
function shell(pageBg: string, inner: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="color-scheme" content="light">
<meta name="x-apple-disable-message-reformatting">
<title>Campaign</title>
<style type="text/css">${RESPONSIVE_STYLES}</style>
</head>
<body style="margin:0;padding:0;background:${pageBg};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${pageBg};">
<tr><td align="center" class="outer-pad" style="padding:32px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="wrapper" style="width:100%;max-width:600px;">
${inner}
</table>
</td></tr>
</table>
</body>
</html>`;
}

function footer(store: string, opts: { bg: string; text: string; muted: string }): string {
  return `<tr><td class="pad-x" style="background:${opts.bg};padding:26px 40px;text-align:center;">
<p style="margin:0;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${opts.text};">${store}</p>
<p style="margin:8px 0 0;font-family:${FONT};font-size:11px;line-height:1.6;color:${opts.muted};">You're receiving this because you're a customer.</p>
<p style="margin:6px 0 0;"><a href="{{UNSUBSCRIBE_URL}}" target="_blank" style="font-family:${FONT};font-size:11px;color:${opts.muted};text-decoration:underline;">Unsubscribe</a></p>
</td></tr>`;
}

function button(args: { href: string; label: string; bg: string; color: string; align?: string }): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="${args.align ?? "left"}" class="btn-wrap" style="width:auto;max-width:100%;"><tr>
<td style="background:${args.bg};border-radius:4px;">
<a href="${args.href}" target="_blank" class="btn-a" style="display:inline-block;font-family:${FONT};color:${args.color};text-decoration:none;padding:15px 36px;font-size:13px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">${args.label}</a>
</td></tr></table>`;
}

// ============================================================
// 1. The Full Service — premium service offer, ivory + copper
// ============================================================
function serviceOffer(store: string): string {
  return shell(
    "#f4f1ec",
    `<tr><td class="pad-x" style="background:#ffffff;padding:44px 48px 12px;text-align:center;">
<p style="margin:0;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#b45309;">${store} · Workshop</p>
<h1 class="h1-md" style="margin:18px 0 0;font-family:${SERIF};font-size:40px;line-height:1.15;font-weight:400;color:#1c1917;">Your bike deserves<br/>a proper service.</h1>
<p style="margin:16px auto 0;max-width:420px;font-family:${FONT};font-size:15px;line-height:1.6;color:#57534e;">G'day {{FIRST_NAME}}, our mechanics are opening the books for this month. Book now and ride away feeling brand new.</p>
</td></tr>
<tr><td class="pad-x" style="background:#ffffff;padding:28px 48px;text-align:center;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="border-top:1px solid #e7e5e4;border-bottom:1px solid #e7e5e4;padding:26px 0;">
<p class="offer-lockup" style="margin:0;font-family:${FONT};font-size:64px;font-weight:800;letter-spacing:-2px;color:#1c1917;">20% OFF</p>
<p style="margin:6px 0 0;font-family:${FONT};font-size:13px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#b45309;">All services · this month only</p>
</td></tr></table>
</td></tr>
<tr><td class="pad-x" style="background:#ffffff;padding:6px 48px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:12px 0;border-bottom:1px solid #f5f5f4;font-family:${FONT};font-size:14px;color:#1c1917;">Full safety inspection</td><td class="meta-right" align="right" style="font-family:${FONT};font-size:13px;color:#78716c;">Included</td></tr>
<tr><td style="padding:12px 0;border-bottom:1px solid #f5f5f4;font-family:${FONT};font-size:14px;color:#1c1917;">Gears &amp; brakes tuned</td><td class="meta-right" align="right" style="font-family:${FONT};font-size:13px;color:#78716c;">Included</td></tr>
<tr><td style="padding:12px 0;font-family:${FONT};font-size:14px;color:#1c1917;">Drivetrain clean &amp; lube</td><td class="meta-right" align="right" style="font-family:${FONT};font-size:13px;color:#78716c;">Included</td></tr>
</table>
</td></tr>
<tr><td class="pad-x" style="background:#ffffff;padding:26px 48px 44px;text-align:center;">
${button({ href: "#book", label: "Book your service", bg: "#1c1917", color: "#ffffff", align: "center" })}
<p style="margin:16px 0 0;font-family:${FONT};font-size:12px;color:#a8a29e;">Offer ends on the last day of the month. Mention this email in store.</p>
</td></tr>
${footer(store, { bg: "#1c1917", text: "#fafaf9", muted: "#a8a29e" })}`,
  );
}

// ============================================================
// 2. Race Day Bulletin — dark poster, yellow accent
// ============================================================
function raceDay(store: string): string {
  return shell(
    "#0a0a0a",
    `<tr><td class="pad-x" style="background:#0a0a0a;padding:40px 44px 0;border:1px solid #262626;border-bottom:0;">
<table role="presentation" width="100%"><tr>
<td style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#f5c518;">${store}</td>
<td class="header-right" align="right" style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#737373;">Bulletin</td>
</tr></table>
</td></tr>
<tr><td class="pad-x" style="background:#0a0a0a;padding:36px 44px 8px;border-left:1px solid #262626;border-right:1px solid #262626;">
<h1 class="h1-xl" style="margin:0;font-family:${FONT};font-size:72px;line-height:0.95;font-weight:900;letter-spacing:-2px;text-transform:uppercase;color:#ffffff;">Race<br/>day is<br/><span style="color:#f5c518;">coming.</span></h1>
</td></tr>
<tr><td class="pad-x" style="background:#0a0a0a;padding:26px 44px;border-left:1px solid #262626;border-right:1px solid #262626;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:12px 0;border-top:1px solid #262626;font-family:${FONT};font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#737373;">When</td><td class="meta-right" align="right" style="padding:12px 0;border-top:1px solid #262626;font-family:${FONT};font-size:14px;font-weight:700;color:#ffffff;">Sunday, wheels down 7am</td></tr>
<tr><td style="padding:12px 0;border-top:1px solid #262626;font-family:${FONT};font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#737373;">Where</td><td class="meta-right" align="right" style="padding:12px 0;border-top:1px solid #262626;font-family:${FONT};font-size:14px;font-weight:700;color:#ffffff;">Rolling from the shop</td></tr>
<tr><td style="padding:12px 0;border-top:1px solid #262626;border-bottom:1px solid #262626;font-family:${FONT};font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#737373;">Grades</td><td class="meta-right" align="right" style="padding:12px 0;border-top:1px solid #262626;border-bottom:1px solid #262626;font-family:${FONT};font-size:14px;font-weight:700;color:#ffffff;">All welcome</td></tr>
</table>
<p style="margin:22px 0 0;font-family:${FONT};font-size:15px;line-height:1.65;color:#a3a3a3;">Number pinning, last-minute tubes, and pre-race nerves all sorted at the shop. Roll past before the start and we'll see you right.</p>
</td></tr>
<tr><td class="pad-x" style="background:#0a0a0a;padding:8px 44px 42px;border:1px solid #262626;border-top:0;">
${button({ href: "#rsvp", label: "Count me in", bg: "#f5c518", color: "#0a0a0a" })}
</td></tr>
${footer(store, { bg: "#000000", text: "#f5f5f5", muted: "#737373" })}`,
  );
}

// ============================================================
// 3. New Season Drop — stark minimal, red hairline
// ============================================================
function seasonDrop(store: string): string {
  return shell(
    "#ffffff",
    `<tr><td class="pad-x" style="background:#ffffff;padding:48px 48px 0;">
<table role="presentation" width="100%"><tr>
<td style="font-family:${FONT};font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#111111;">${store}</td>
<td class="header-right" align="right" style="font-family:${FONT};font-size:12px;color:#dc2626;font-weight:700;">SS26</td>
</tr></table>
<div style="margin-top:14px;border-top:3px solid #111111;"></div>
</td></tr>
<tr><td class="pad-x" style="background:#ffffff;padding:42px 48px 10px;">
<h1 class="h1-lg" style="margin:0;font-family:${FONT};font-size:54px;line-height:1.02;font-weight:900;letter-spacing:-2px;color:#111111;">The new<br/>season has<br/>landed<span style="color:#dc2626;">.</span></h1>
<p style="margin:22px 0 0;max-width:430px;font-family:${FONT};font-size:15px;line-height:1.65;color:#525252;">Fresh frames, fresh rubber, fresh kit. First stock is on the floor now — and the good sizes never hang around.</p>
</td></tr>
<tr><td class="pad-x" style="background:#ffffff;padding:28px 48px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td class="num-col" width="52" style="padding:16px 0;border-top:1px solid #e5e5e5;font-family:${FONT};font-size:13px;font-weight:800;color:#dc2626;">01</td><td style="padding:16px 0;border-top:1px solid #e5e5e5;font-family:${FONT};font-size:17px;font-weight:700;color:#111111;">Road</td><td class="meta-right" align="right" style="padding:16px 0;border-top:1px solid #e5e5e5;font-family:${FONT};font-size:13px;color:#a3a3a3;">In store now</td></tr>
<tr><td class="num-col" width="52" style="padding:16px 0;border-top:1px solid #e5e5e5;font-family:${FONT};font-size:13px;font-weight:800;color:#dc2626;">02</td><td style="padding:16px 0;border-top:1px solid #e5e5e5;font-family:${FONT};font-size:17px;font-weight:700;color:#111111;">Gravel</td><td class="meta-right" align="right" style="padding:16px 0;border-top:1px solid #e5e5e5;font-family:${FONT};font-size:13px;color:#a3a3a3;">In store now</td></tr>
<tr><td class="num-col" width="52" style="padding:16px 0;border-top:1px solid #e5e5e5;border-bottom:1px solid #e5e5e5;font-family:${FONT};font-size:13px;font-weight:800;color:#dc2626;">03</td><td style="padding:16px 0;border-top:1px solid #e5e5e5;border-bottom:1px solid #e5e5e5;font-family:${FONT};font-size:17px;font-weight:700;color:#111111;">Mountain</td><td class="meta-right" align="right" style="padding:16px 0;border-top:1px solid #e5e5e5;border-bottom:1px solid #e5e5e5;font-family:${FONT};font-size:13px;color:#a3a3a3;">Landing soon</td></tr>
</table>
</td></tr>
<tr><td class="pad-x" style="background:#ffffff;padding:30px 48px 48px;">
${button({ href: "#shop", label: "See what's new", bg: "#111111", color: "#ffffff" })}
</td></tr>
${footer(store, { bg: "#f5f5f5", text: "#111111", muted: "#a3a3a3" })}`,
  );
}

// ============================================================
// 4. The Win-Back Letter — warm personal letter, serif
// ============================================================
function winBackLetter(store: string): string {
  return shell(
    "#efece6",
    `<tr><td class="pad-x" style="background:#fdfbf7;padding:46px 54px 0;text-align:center;">
<p style="margin:0;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#8c7b5e;">${store}</p>
<div style="width:40px;height:1px;background:#d6cdbd;margin:18px auto 0;"></div>
</td></tr>
<tr><td class="pad-x" style="background:#fdfbf7;padding:34px 54px 10px;">
<p style="margin:0;font-family:${SERIF};font-size:19px;line-height:1.75;color:#3b352b;">Dear {{FIRST_NAME}},</p>
<p style="margin:18px 0 0;font-family:${SERIF};font-size:17px;line-height:1.8;color:#57503f;">It's been a while since we've seen you or your bike, and the workshop feels a little quieter for it.</p>
<p style="margin:18px 0 0;font-family:${SERIF};font-size:17px;line-height:1.8;color:#57503f;">Whether it's a squeaky chain, a big new goal, or just an excuse to talk bikes over a coffee — the door's open, and the stand is free.</p>
<p style="margin:18px 0 0;font-family:${SERIF};font-size:17px;line-height:1.8;color:#57503f;">Come say hi. We'd love to get you rolling again.</p>
<p style="margin:26px 0 0;font-family:${SERIF};font-size:17px;line-height:1.7;color:#3b352b;">— The team at ${store}</p>
</td></tr>
<tr><td class="pad-x" style="background:#fdfbf7;padding:32px 54px 14px;text-align:center;">
${button({ href: "#visit", label: "Plan my visit", bg: "#3b352b", color: "#fdfbf7", align: "center" })}
</td></tr>
<tr><td class="pad-x" style="background:#fdfbf7;padding:0 54px 44px;text-align:center;">
<p style="margin:14px 0 0;font-family:${SERIF};font-style:italic;font-size:14px;color:#8c7b5e;">P.S. Bring the bike. First look-over is on us.</p>
</td></tr>
${footer(store, { bg: "#3b352b", text: "#fdfbf7", muted: "#a89d87" })}`,
  );
}

// ============================================================
// 5. Saturday Shop Ride — event card with date lockup, green
// ============================================================
function shopRide(store: string): string {
  return shell(
    "#f3f4f1",
    `<tr><td class="pad-x" style="background:#ffffff;padding:40px 44px 26px;">
<p style="margin:0;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#166534;">${store} · Group ride</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="stack stack-gap" style="margin-top:24px;"><tr>
<td class="stack-cell" width="150" valign="top">
<table role="presentation" width="130" cellpadding="0" cellspacing="0" style="border:2px solid #111111;max-width:130px;">
<tr><td style="background:#166534;padding:8px 0;text-align:center;font-family:${FONT};font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#ffffff;">Saturday</td></tr>
<tr><td style="background:#ffffff;padding:14px 0 4px;text-align:center;font-family:${FONT};font-size:44px;font-weight:900;letter-spacing:-1px;color:#111111;">6:30</td></tr>
<tr><td style="background:#ffffff;padding:0 0 14px;text-align:center;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#6b7280;">AM sharp</td></tr>
</table>
</td>
<td class="stack-cell" valign="top" style="padding-left:26px;">
<h1 class="h1-md" style="margin:0;font-family:${FONT};font-size:32px;line-height:1.1;font-weight:900;letter-spacing:-0.5px;color:#111111;">The Saturday<br/>Shop Ride.</h1>
<p style="margin:12px 0 0;font-family:${FONT};font-size:14px;line-height:1.6;color:#4b5563;">Every grade, no drop, plenty of coffee. Rolling from the front door — first-timers very welcome, {{FIRST_NAME}}.</p>
</td>
</tr></table>
</td></tr>
<tr><td class="pad-x" style="background:#ffffff;padding:0 44px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:13px 0;border-top:1px solid #f3f4f6;font-family:${FONT};font-size:13px;font-weight:700;color:#111111;">Distance</td><td class="meta-right" align="right" style="padding:13px 0;border-top:1px solid #f3f4f6;font-family:${FONT};font-size:13px;color:#6b7280;">40 km, rolling</td></tr>
<tr><td style="padding:13px 0;border-top:1px solid #f3f4f6;font-family:${FONT};font-size:13px;font-weight:700;color:#111111;">Pace</td><td class="meta-right" align="right" style="padding:13px 0;border-top:1px solid #f3f4f6;font-family:${FONT};font-size:13px;color:#6b7280;">Social — nobody gets left</td></tr>
<tr><td style="padding:13px 0;border-top:1px solid #f3f4f6;border-bottom:1px solid #f3f4f6;font-family:${FONT};font-size:13px;font-weight:700;color:#111111;">Coffee stop</td><td class="meta-right" align="right" style="padding:13px 0;border-top:1px solid #f3f4f6;border-bottom:1px solid #f3f4f6;font-family:${FONT};font-size:13px;color:#6b7280;">Always. Non-negotiable.</td></tr>
</table>
</td></tr>
<tr><td class="pad-x" style="background:#ffffff;padding:28px 44px 42px;">
${button({ href: "#ride", label: "Save my spot", bg: "#166534", color: "#ffffff" })}
</td></tr>
${footer(store, { bg: "#111111", text: "#f9fafb", muted: "#9ca3af" })}`,
  );
}

// ============================================================
// 6. Mega Clearance — black + red, loud sale energy
// ============================================================
function clearance(store: string): string {
  return shell(
    "#111111",
    `<tr><td class="pad-x" style="background:#ef4444;padding:10px 40px;text-align:center;">
<p style="margin:0;font-family:${FONT};font-size:12px;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:#ffffff;">Ends Sunday · While stock lasts</p>
</td></tr>
<tr><td class="pad-x" style="background:#000000;padding:44px 40px 20px;text-align:center;">
<p style="margin:0;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:#a3a3a3;">${store} presents</p>
<h1 class="h1-xl" style="margin:14px 0 0;font-family:${FONT};font-size:96px;line-height:0.9;font-weight:900;letter-spacing:-4px;text-transform:uppercase;color:#ffffff;">Mega<br/><span style="color:#ef4444;">Sale</span></h1>
<p style="margin:22px 0 0;font-family:${FONT};font-size:20px;font-weight:800;color:#ffffff;">Up to <span style="color:#ef4444;">50% off</span> across the store</p>
</td></tr>
<tr><td class="pad-x" style="background:#000000;padding:18px 40px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="stack">
<tr>
<td class="sale-col sale-col-first stack-cell" width="33%" style="padding:16px 6px;border:1px solid #262626;text-align:center;"><p style="margin:0;font-family:${FONT};font-size:22px;font-weight:900;color:#ffffff;">Tyres</p><p style="margin:4px 0 0;font-family:${FONT};font-size:12px;font-weight:700;color:#ef4444;">from 30% off</p></td>
<td class="sale-col stack-cell" width="33%" style="padding:16px 6px;border:1px solid #262626;border-left:0;text-align:center;"><p style="margin:0;font-family:${FONT};font-size:22px;font-weight:900;color:#ffffff;">Kit</p><p style="margin:4px 0 0;font-family:${FONT};font-size:12px;font-weight:700;color:#ef4444;">from 40% off</p></td>
<td class="sale-col stack-cell" width="33%" style="padding:16px 6px;border:1px solid #262626;border-left:0;text-align:center;"><p style="margin:0;font-family:${FONT};font-size:22px;font-weight:900;color:#ffffff;">Bikes</p><p style="margin:4px 0 0;font-family:${FONT};font-size:12px;font-weight:700;color:#ef4444;">ask in store</p></td>
</tr>
</table>
</td></tr>
<tr><td class="pad-x" style="background:#000000;padding:26px 40px 46px;text-align:center;">
${button({ href: "#sale", label: "Shop the sale", bg: "#ef4444", color: "#ffffff", align: "center" })}
<p style="margin:16px 0 0;font-family:${FONT};font-size:12px;color:#737373;">No rainchecks on clearance stock. When it's gone, it's gone.</p>
</td></tr>
${footer(store, { bg: "#0a0a0a", text: "#fafafa", muted: "#737373" })}`,
  );
}

// ============================================================
// 7. Workshop Nights — chalkboard class invite, amber
// ============================================================
function workshopNight(store: string): string {
  return shell(
    "#1f2937",
    `<tr><td class="pad-x" style="background:#111827;padding:42px 46px 0;border-bottom:0;">
<table role="presentation" width="100%"><tr>
<td style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#f59e0b;">${store} · Workshop nights</td>
<td class="badge-right" align="right"><span style="display:inline-block;padding:5px 12px;border:1px solid #f59e0b;font-family:${FONT};font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#f59e0b;">12 seats only</span></td>
</tr></table>
</td></tr>
<tr><td class="pad-x" style="background:#111827;padding:30px 46px 8px;">
<h1 class="h1-lg" style="margin:0;font-family:${FONT};font-size:46px;line-height:1.05;font-weight:900;letter-spacing:-1px;color:#f9fafb;">Learn to fix<br/>your own bike.</h1>
<p style="margin:16px 0 0;max-width:440px;font-family:${FONT};font-size:15px;line-height:1.65;color:#9ca3af;">One evening, our mechanics, your bike on the stand. Hands-on from minute one — {{FIRST_NAME}}, you'll leave able to handle the fixes that end most rides.</p>
</td></tr>
<tr><td class="pad-x" style="background:#111827;padding:24px 46px 6px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td width="30" style="padding:11px 0;font-family:${FONT};font-size:15px;color:#f59e0b;">✓</td><td style="padding:11px 0;border-bottom:1px solid #1f2937;font-family:${FONT};font-size:14px;color:#e5e7eb;">Fix a flat in under five minutes</td></tr>
<tr><td width="30" style="padding:11px 0;font-family:${FONT};font-size:15px;color:#f59e0b;">✓</td><td style="padding:11px 0;border-bottom:1px solid #1f2937;font-family:${FONT};font-size:14px;color:#e5e7eb;">Index your gears so they actually shift</td></tr>
<tr><td width="30" style="padding:11px 0;font-family:${FONT};font-size:15px;color:#f59e0b;">✓</td><td style="padding:11px 0;border-bottom:1px solid #1f2937;font-family:${FONT};font-size:14px;color:#e5e7eb;">Quiet disc brakes, properly</td></tr>
<tr><td width="30" style="padding:11px 0;font-family:${FONT};font-size:15px;color:#f59e0b;">✓</td><td style="padding:11px 0;font-family:${FONT};font-size:14px;color:#e5e7eb;">The pre-ride check the pros do</td></tr>
</table>
</td></tr>
<tr><td class="pad-x" style="background:#111827;padding:26px 46px 44px;">
${button({ href: "#class", label: "Grab a seat", bg: "#f59e0b", color: "#111827" })}
<p style="margin:14px 0 0;font-family:${FONT};font-size:12px;color:#6b7280;">Tools, stand, and pizza provided. Bring your bike and your questions.</p>
</td></tr>
${footer(store, { bg: "#0b0f19", text: "#f9fafb", muted: "#6b7280" })}`,
  );
}

// ============================================================
// 8. The Commuter Brief — editorial digest, blue
// ============================================================
function commuterBrief(store: string): string {
  return shell(
    "#ffffff",
    `<tr><td class="pad-x" style="background:#ffffff;padding:44px 50px 0;text-align:center;">
<div style="border-top:4px solid #111111;"></div>
<h1 style="margin:20px 0 0;font-family:${SERIF};font-size:34px;font-weight:700;letter-spacing:0.5px;color:#111111;">The Commuter Brief</h1>
<p style="margin:8px 0 0;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#1d4ed8;">From ${store} · Three things this week</p>
<div style="margin-top:20px;border-top:1px solid #e5e7eb;"></div>
</td></tr>
<tr><td class="pad-x" style="background:#ffffff;padding:30px 50px 0;">
<p style="margin:0;font-family:${FONT};font-size:12px;font-weight:800;color:#1d4ed8;">No. 1 — Lights check</p>
<h2 style="margin:6px 0 0;font-family:${SERIF};font-size:22px;font-weight:700;color:#111111;">Dark mornings are back</h2>
<p style="margin:8px 0 0;font-family:${FONT};font-size:14px;line-height:1.65;color:#4b5563;">Sunrise is creeping later. If your commute starts before 7am, it's officially lights season — charge them tonight, not at the traffic lights.</p>
</td></tr>
<tr><td class="pad-x" style="background:#ffffff;padding:26px 50px 0;">
<div style="border-top:1px solid #e5e7eb;"></div>
<p style="margin:26px 0 0;font-family:${FONT};font-size:12px;font-weight:800;color:#1d4ed8;">No. 2 — Wet weather wisdom</p>
<h2 style="margin:6px 0 0;font-family:${SERIF};font-size:22px;font-weight:700;color:#111111;">Mudguards win winters</h2>
<p style="margin:8px 0 0;font-family:${FONT};font-size:14px;line-height:1.65;color:#4b5563;">A dry back is a happy back. Fitting takes us ten minutes in the workshop while you grab a coffee next door.</p>
</td></tr>
<tr><td class="pad-x" style="background:#ffffff;padding:26px 50px 0;">
<div style="border-top:1px solid #e5e7eb;"></div>
<p style="margin:26px 0 0;font-family:${FONT};font-size:12px;font-weight:800;color:#1d4ed8;">No. 3 — From the workshop</p>
<h2 style="margin:6px 0 0;font-family:${SERIF};font-size:22px;font-weight:700;color:#111111;">Squeaks are not a personality trait</h2>
<p style="margin:8px 0 0;font-family:${FONT};font-size:14px;line-height:1.65;color:#4b5563;">That noise your bike makes? It's telling you something. Roll by and we'll translate — diagnosis is always free.</p>
</td></tr>
<tr><td class="pad-x" style="background:#ffffff;padding:32px 50px 46px;text-align:center;">
<div style="border-top:1px solid #e5e7eb;margin-bottom:28px;"></div>
${button({ href: "#visit", label: "Visit the shop", bg: "#1d4ed8", color: "#ffffff", align: "center" })}
</td></tr>
${footer(store, { bg: "#111111", text: "#f9fafb", muted: "#9ca3af" })}`,
  );
}

// ============================================================
// 9. Inner Circle — black + gold VIP early access
// ============================================================
function innerCircle(store: string): string {
  return shell(
    "#000000",
    `<tr><td class="pad-x" style="background:#000000;padding:52px 50px 0;text-align:center;">
<p style="margin:0;font-family:${FONT};font-size:10px;font-weight:700;letter-spacing:5px;text-transform:uppercase;color:#d4af37;">Inner Circle</p>
<div style="width:36px;height:1px;background:#d4af37;margin:22px auto;"></div>
<h1 class="h1-md" style="margin:0;font-family:${SERIF};font-size:44px;line-height:1.2;font-weight:400;color:#fafafa;">Before<br/>anyone else.</h1>
<p style="margin:20px auto 0;max-width:400px;font-family:${FONT};font-size:14px;line-height:1.7;color:#a3a3a3;">{{FIRST_NAME}}, you're one of our best customers — so you get first pick. 48 hours of early access before we tell everyone else.</p>
</td></tr>
<tr><td class="pad-x" style="background:#000000;padding:36px 50px 6px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:14px 0;border-top:1px solid #1f1f1f;font-family:${FONT};font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#d4af37;">Early access</td><td class="meta-right" align="right" style="padding:14px 0;border-top:1px solid #1f1f1f;font-family:${FONT};font-size:14px;color:#e5e5e5;">New arrivals, 48h head start</td></tr>
<tr><td style="padding:14px 0;border-top:1px solid #1f1f1f;font-family:${FONT};font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#d4af37;">Priority</td><td class="meta-right" align="right" style="padding:14px 0;border-top:1px solid #1f1f1f;font-family:${FONT};font-size:14px;color:#e5e5e5;">Jump the workshop queue</td></tr>
<tr><td style="padding:14px 0;border-top:1px solid #1f1f1f;border-bottom:1px solid #1f1f1f;font-family:${FONT};font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#d4af37;">First dibs</td><td class="meta-right" align="right" style="padding:14px 0;border-top:1px solid #1f1f1f;border-bottom:1px solid #1f1f1f;font-family:${FONT};font-size:14px;color:#e5e5e5;">Limited runs held for you</td></tr>
</table>
</td></tr>
<tr><td class="pad-x" style="background:#000000;padding:34px 50px 52px;text-align:center;">
<table role="presentation" cellpadding="0" cellspacing="0" align="center" class="btn-wrap" style="width:auto;max-width:100%;"><tr>
<td style="border:1px solid #d4af37;">
<a href="#access" target="_blank" class="btn-a" style="display:inline-block;font-family:${FONT};color:#d4af37;text-decoration:none;padding:15px 44px;font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">Use my early access</a>
</td></tr></table>
</td></tr>
${footer(store, { bg: "#0a0a0a", text: "#fafafa", muted: "#737373" })}`,
  );
}

// ============================================================
// 10. Tune-Up Checklist — fresh teal, interactive checklist
// ============================================================
function tuneUpChecklist(store: string): string {
  const row = (label: string, hint: string, last = false) =>
    `<tr>
<td width="34" valign="top" style="padding:13px 0;${last ? "" : "border-bottom:1px solid #f0f4f3;"}"><div style="width:16px;height:16px;border:2px solid #0f766e;border-radius:3px;"></div></td>
<td style="padding:11px 0;${last ? "" : "border-bottom:1px solid #f0f4f3;"}font-family:${FONT};font-size:14px;font-weight:600;color:#134e4a;">${label}<span style="display:block;margin-top:2px;font-size:12px;font-weight:400;color:#6b7280;">${hint}</span></td>
</tr>`;

  return shell(
    "#eef4f3",
    `<tr><td class="pad-x" style="background:#0f766e;padding:38px 46px;">
<p style="margin:0;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#99f6e4;">${store} · Pre-season check</p>
<h1 class="h1-md" style="margin:12px 0 0;font-family:${FONT};font-size:42px;line-height:1.05;font-weight:900;letter-spacing:-1px;color:#ffffff;">Is your bike<br/>ready to ride?</h1>
<p style="margin:14px 0 0;max-width:430px;font-family:${FONT};font-size:14px;line-height:1.6;color:#ccfbf1;">Run through our mechanics' 6-point check, {{FIRST_NAME}}. Tick fewer than five? Bring it in — the first look-over is free.</p>
</td></tr>
<tr><td class="pad-x" style="background:#ffffff;padding:26px 46px 10px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${row("Tyres hold pressure overnight", "Soft in the morning means a slow leak")}
${row("Brakes bite before the lever hits the bar", "Spongy levers need attention")}
${row("Chain is clean and quiet", "A noisy chain is an expensive chain")}
${row("Gears shift without hesitation", "Clunks and skips mean cable wear")}
${row("No creaks from the bottom bracket", "Creaks never fix themselves")}
${row("Headset feels tight, not notchy", "Rock the front brake and feel for play", true)}
</table>
</td></tr>
<tr><td class="pad-x" style="background:#ffffff;padding:24px 46px 44px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="cta-row stack" style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:6px;"><tr>
<td class="cta-text stack-cell" style="padding:18px 22px;">
<p style="margin:0;font-family:${FONT};font-size:14px;font-weight:700;color:#134e4a;">Scored under 5/6?</p>
<p style="margin:4px 0 0;font-family:${FONT};font-size:13px;line-height:1.5;color:#0f766e;">Book a free 10-minute check with our mechanics this week.</p>
</td>
<td class="cta-btn stack-cell" align="right" style="padding:18px 22px;">
${button({ href: "#check", label: "Book free check", bg: "#0f766e", color: "#ffffff", align: "right" })}
</td>
</tr></table>
</td></tr>
${footer(store, { bg: "#134e4a", text: "#f0fdfa", muted: "#5eead4" })}`,
  );
}

// ============================================================
// Catalogue
// ============================================================

type PremadeDefinition = {
  id: string;
  name: string;
  description: string;
  subject: string;
  layout: "classic" | "minimal" | "editorial";
  summary: string;
  build: (storeName: string) => string;
};

const PREMADE_DEFINITIONS: PremadeDefinition[] = [
  {
    id: "premade-full-service",
    name: "The Full Service",
    description: "Premium workshop offer with a bold discount lockup",
    subject: "Your bike deserves a proper service",
    layout: "minimal",
    summary: "Service promotion with a 20% off lockup, inclusions list, and booking CTA.",
    build: serviceOffer,
  },
  {
    id: "premade-race-day",
    name: "Race Day Bulletin",
    description: "Dark race-poster announcement for events and rides",
    subject: "Race day is coming. Are you in?",
    layout: "classic",
    summary: "Event bulletin with poster typography, when/where/grades rows, and RSVP CTA.",
    build: raceDay,
  },
  {
    id: "premade-season-drop",
    name: "New Season Drop",
    description: "Stark minimal launch for new stock and ranges",
    subject: "The new season drop has landed",
    layout: "minimal",
    summary: "New-arrivals teaser with numbered range list (road, gravel, mountain).",
    build: seasonDrop,
  },
  {
    id: "premade-win-back",
    name: "The Win-Back Letter",
    description: "Warm personal letter for lapsed customers",
    subject: "It's been a while. Let's get you rolling again",
    layout: "editorial",
    summary: "Handwritten-feel letter inviting lapsed customers back, with a P.S. hook.",
    build: winBackLetter,
  },
  {
    id: "premade-shop-ride",
    name: "Saturday Shop Ride",
    description: "Group ride invite with a big date lockup",
    subject: "Saturday shop ride: wheels down 6:30am",
    layout: "classic",
    summary: "Weekly ride invite: time block, distance/pace/coffee details, RSVP CTA.",
    build: shopRide,
  },
  {
    id: "premade-clearance",
    name: "Mega Clearance",
    description: "Loud black-and-red sale with category tiles",
    subject: "Clearance: up to 50% off ends Sunday",
    layout: "classic",
    summary: "High-urgency clearance: giant SALE type, category discounts, ends-Sunday strip.",
    build: clearance,
  },
  {
    id: "premade-workshop-night",
    name: "Workshop Nights",
    description: "Maintenance class invite with a skills checklist",
    subject: "Workshop night: learn to fix your own bike",
    layout: "editorial",
    summary: "Class invite: limited seats badge, what-you-learn checklist, seat booking CTA.",
    build: workshopNight,
  },
  {
    id: "premade-commuter-brief",
    name: "The Commuter Brief",
    description: "Editorial newsletter digest in three sections",
    subject: "The Commuter Brief: 3 things this week",
    layout: "editorial",
    summary: "Masthead newsletter with three numbered stories and a soft visit CTA.",
    build: commuterBrief,
  },
  {
    id: "premade-inner-circle",
    name: "Inner Circle VIP",
    description: "Black-and-gold early access for top customers",
    subject: "You're in. Early access starts now",
    layout: "minimal",
    summary: "VIP early-access invite with benefit rows and a gold outline CTA.",
    build: innerCircle,
  },
  {
    id: "premade-tune-up",
    name: "Spring Tune-Up Checklist",
    description: "Interactive 6-point bike check with free booking",
    subject: "10-point spring check: is your bike ready?",
    layout: "classic",
    summary: "Self-serve checklist that funnels into a free workshop check booking.",
    build: tuneUpChecklist,
  },
];

/** Build the pre-made template records with the store's branding injected. */
export function buildPremadeTemplates(store: StoreBranding): CrmEmailTemplateRecord[] {
  const storeName = escapeHtml(store.name.trim() || "Your Bike Shop");

  return PREMADE_DEFINITIONS.map((definition) => ({
    id: definition.id,
    name: definition.name,
    description: definition.description,
    subject: definition.subject,
    template_key: "store_announcement",
    use_count: 0,
    updated_at: "",
    content: buildHtmlCampaignContent({
      title: definition.name,
      body: definition.summary,
      html: definition.build(storeName),
      layout: definition.layout,
    }),
  }));
}

export function isPremadeTemplateId(id: string): boolean {
  return id.startsWith("premade-");
}
