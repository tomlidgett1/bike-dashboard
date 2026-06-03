'use client';

import * as React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Dev-only page — 5 fundamentally different SERVICE CARD design directions.
// Each card shows a service (name + price) and a dot-point list of what the
// service includes. Driven from one shared SERVICES array so the five concepts
// compare fairly. Rendered as self-contained HTML in iframes (desktop + phone),
// so nothing leaks into / out of the app's global styles.
// These are PREVIEWS ONLY — nothing here is wired into the live storefront.
// Visit: http://localhost:3100/dev/service-cards
// ─────────────────────────────────────────────────────────────────────────────

interface Service {
  name: string;
  price: string;
  duration: string;
  popular: boolean;
  blurb: string;
  includes: string[];
}

// Shared sample services. "General Service · $129" is the lead/hero card the
// brief asked for; a cheaper tune and a featured Major Service show how each
// design tiles and how it handles the "Popular" highlight.
const SERVICES: Service[] = [
  {
    name: 'General Service',
    price: '$129',
    duration: '~2 hrs',
    popular: false,
    blurb: 'Our most popular tune — everything your bike needs to ride like new.',
    includes: [
      'Full drivetrain clean & degrease',
      'Gears indexed & brakes adjusted',
      'Wheels trued & tyres inflated',
      'All bolts torqued to spec',
      'Frame wipe-down & safety check',
    ],
  },
  {
    name: 'Minor Tune-Up',
    price: '$69',
    duration: '~45 min',
    popular: false,
    blurb: 'A quick once-over to keep things smooth between full services.',
    includes: [
      'Brake & gear adjustment',
      'Tyre pressure & wear check',
      'Chain lubrication',
      'Quick safety inspection',
    ],
  },
  {
    name: 'Major Service',
    price: '$249',
    duration: '~Half day',
    popular: true,
    blurb: 'A full strip-down and rebuild for bikes that need serious love.',
    includes: [
      'Everything in the General Service',
      'Bearings stripped & re-greased',
      'Hydraulic brakes bled',
      'New cables & housing fitted',
      'Wheels re-tensioned & trued',
    ],
  },
];

// ── Tiny inline-SVG icon helpers (kept as strings for the iframe docs) ────────
const check = (c: string, w = 12, sw = 3.2) =>
  `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
const wrench = (c: string, w = 18) =>
  `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.05 2.05a1.5 1.5 0 0 1-2.12-2.12z"/></svg>`;
const clock = (c: string, w = 12) =>
  `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/></svg>`;

const SHELL_HEAD =
  `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>` +
  `*{margin:0;padding:0;box-sizing:border-box}` +
  `body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;line-height:1.5}` +
  `ul{list-style:none}`;

// ════════════════════════════════════════════════════════════════════════════
// DESIGN 1 — CLEAN CHECKLIST · light grid, dark CTA, the safe professional default
// ════════════════════════════════════════════════════════════════════════════
function design1(): string {
  const cards = SERVICES.map((s) => `
    <article class="card${s.popular ? ' pop' : ''}">
      ${s.popular ? '<span class="ribbon">Most popular</span>' : ''}
      <header>
        <h3>${s.name}</h3>
        <span class="dur">${clock('#6b7280')} ${s.duration}</span>
      </header>
      <div class="price">${s.price}<span>/ service</span></div>
      <hr>
      <p class="lab">What's included</p>
      <ul>
        ${s.includes.map((i) => `<li><span class="ic">${check('#fff')}</span>${i}</li>`).join('')}
      </ul>
      <button class="cta">Book service</button>
    </article>`).join('');
  return `${SHELL_HEAD}
    body{background:#f6f6f4;padding:30px}
    .sec-h{max-width:1120px;margin:0 auto 20px;display:flex;align-items:flex-end;justify-content:space-between}
    .sec-h h2{font-size:22px;font-weight:800;letter-spacing:-.4px;color:#0a0a0a}
    .sec-h p{font-size:13px;color:#71717a;margin-top:2px}
    .grid{max-width:1120px;margin:0 auto;display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
    .card{position:relative;background:#fff;border:1px solid #ececec;border-radius:20px;padding:22px;display:flex;flex-direction:column;transition:box-shadow .2s,transform .2s}
    .card:hover{box-shadow:0 12px 30px rgba(0,0,0,.07);transform:translateY(-2px)}
    .card.pop{border-color:#f5d33a;border-top:3px solid #ffde59}
    .ribbon{position:absolute;top:-10px;right:18px;background:#ffde59;color:#0a0a0a;font-size:10.5px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;padding:4px 10px;border-radius:999px}
    header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
    header h3{font-size:17px;font-weight:800;letter-spacing:-.3px;color:#0a0a0a}
    .dur{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;color:#6b7280;background:#f3f4f6;padding:4px 9px;border-radius:999px;white-space:nowrap;flex-shrink:0}
    .price{font-size:34px;font-weight:800;letter-spacing:-1px;color:#0a0a0a;margin-top:12px}
    .price span{font-size:13px;font-weight:600;color:#9ca3af;letter-spacing:0;margin-left:5px}
    hr{border:none;border-top:1px solid #efefef;margin:16px 0 14px}
    .lab{font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#9ca3af;margin-bottom:12px}
    ul{display:flex;flex-direction:column;gap:10px;flex:1}
    li{display:flex;align-items:flex-start;gap:10px;font-size:13.5px;color:#3f3f46;line-height:1.45}
    .ic{flex-shrink:0;width:18px;height:18px;border-radius:50%;background:#0a0a0a;display:grid;place-items:center;margin-top:1px}
    .card.pop .ic{background:#0a0a0a}
    .cta{margin-top:20px;height:46px;border:none;border-radius:12px;background:#0a0a0a;color:#fff;font-size:14.5px;font-weight:700;cursor:pointer;transition:opacity .15s}
    .cta:hover{opacity:.88}
    .card.pop .cta{background:#ffde59;color:#0a0a0a}
    @media(max-width:820px){.grid{grid-template-columns:1fr}.sec-h{padding:0 2px}}
  </style></head><body>
    <div class="sec-h"><div><h2>Workshop Services</h2><p>Book online or call the shop — fast turnaround, expert mechanics.</p></div></div>
    <div class="grid">${cards}</div>
  </body></html>`;
}

// ════════════════════════════════════════════════════════════════════════════
// DESIGN 2 — PRICING PLAN · SaaS-style tiers, featured ribbon, accent CTA
// ════════════════════════════════════════════════════════════════════════════
function design2(): string {
  const cards = SERVICES.map((s) => `
    <article class="card${s.popular ? ' pop' : ''}">
      ${s.popular ? '<div class="badge">★ Most booked</div>' : ''}
      <p class="eyebrow">Workshop</p>
      <h3>${s.name}</h3>
      <div class="price">${s.price}<span>/ service</span></div>
      <p class="blurb">${s.blurb}</p>
      <ul>
        ${s.includes.map((i) => `<li><span class="ic">${check('#059669', 11, 3.5)}</span>${i}</li>`).join('')}
      </ul>
      <button class="cta">Choose this service</button>
    </article>`).join('');
  return `${SHELL_HEAD}
    body{background:#fff;padding:38px 30px}
    .sec-h{text-align:center;max-width:620px;margin:0 auto 30px}
    .sec-h h2{font-size:25px;font-weight:800;letter-spacing:-.5px;color:#0a0a0a}
    .sec-h p{font-size:14px;color:#71717a;margin-top:7px}
    .grid{max-width:1080px;margin:0 auto;display:grid;grid-template-columns:repeat(3,1fr);gap:20px;align-items:start}
    .card{position:relative;background:#fff;border:1.5px solid #ececec;border-radius:18px;padding:26px 24px;text-align:center;display:flex;flex-direction:column}
    .card.pop{border-color:#ffde59;box-shadow:0 18px 44px rgba(245,211,58,.28);transform:scale(1.035);z-index:2}
    .badge{position:absolute;top:-13px;left:50%;transform:translateX(-50%);background:#ffde59;color:#0a0a0a;font-size:11px;font-weight:800;letter-spacing:.3px;padding:6px 14px;border-radius:999px;white-space:nowrap}
    .eyebrow{font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#a1a1aa}
    h3{font-size:19px;font-weight:800;letter-spacing:-.3px;color:#0a0a0a;margin-top:8px}
    .price{font-size:40px;font-weight:900;letter-spacing:-1.5px;color:#0a0a0a;margin:10px 0 0}
    .price span{font-size:13px;font-weight:600;color:#9ca3af;letter-spacing:0;margin-left:4px}
    .blurb{font-size:13px;color:#71717a;line-height:1.55;margin:10px auto 0;max-width:230px}
    ul{display:flex;flex-direction:column;gap:11px;margin:22px 0;text-align:left;flex:1;border-top:1px solid #f0f0f0;padding-top:20px}
    li{display:flex;align-items:flex-start;gap:10px;font-size:13.5px;color:#3f3f46;line-height:1.45}
    .ic{flex-shrink:0;width:18px;height:18px;border-radius:50%;background:#ecfdf5;display:grid;place-items:center;margin-top:1px}
    .cta{height:48px;border:none;border-radius:12px;background:#0a0a0a;color:#fff;font-size:14.5px;font-weight:700;cursor:pointer;transition:opacity .15s,transform .15s}
    .cta:hover{transform:translateY(-1px)}
    .card.pop .cta{background:#ffde59;color:#0a0a0a}
    @media(max-width:820px){.grid{grid-template-columns:1fr;gap:26px}.card.pop{transform:none}}
  </style></head><body>
    <div class="sec-h"><h2>Choose your service</h2><p>Transparent pricing, no surprises. Every service includes a full safety check.</p></div>
    <div class="grid">${cards}</div>
  </body></html>`;
}

// ════════════════════════════════════════════════════════════════════════════
// DESIGN 3 — PREMIUM DARK · sporty charcoal cards, yellow accents, inverted featured
// ════════════════════════════════════════════════════════════════════════════
function design3(): string {
  const cards = SERVICES.map((s) => `
    <article class="card${s.popular ? ' pop' : ''}">
      <div class="top">
        <span class="chip">${wrench(s.popular ? '#0a0a0a' : '#ffde59')}</span>
        ${s.popular ? '<span class="tag">Popular</span>' : `<span class="dur">${clock('#8a8a93')} ${s.duration}</span>`}
      </div>
      <h3>${s.name}</h3>
      <div class="price">${s.price}<span>/ service</span></div>
      <ul>
        ${s.includes.map((i) => `<li><span class="ic">${check(s.popular ? '#ffde59' : '#0a0a0a', 10, 3.6)}</span>${i}</li>`).join('')}
      </ul>
      <button class="cta">Book now</button>
    </article>`).join('');
  return `${SHELL_HEAD}
    body{background:#0d0d10;padding:34px 30px}
    .sec-h{max-width:1120px;margin:0 auto 22px}
    .sec-h h2{font-size:23px;font-weight:800;letter-spacing:-.4px;color:#fff}
    .sec-h p{font-size:13.5px;color:#8a8a93;margin-top:4px}
    .grid{max-width:1120px;margin:0 auto;display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
    .card{position:relative;background:linear-gradient(160deg,#1a1a20,#141417);border:1px solid #2a2a31;border-radius:20px;padding:22px;display:flex;flex-direction:column;color:#fff;overflow:hidden}
    .card.pop{background:linear-gradient(160deg,#ffe87a,#ffde59);border-color:#ffde59;color:#0a0a0a}
    .top{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
    .chip{width:40px;height:40px;border-radius:12px;background:rgba(255,222,89,.14);display:grid;place-items:center}
    .card.pop .chip{background:rgba(10,10,10,.12)}
    .dur{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:#8a8a93}
    .tag{background:#0a0a0a;color:#ffde59;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;padding:5px 11px;border-radius:999px}
    h3{font-size:18px;font-weight:800;letter-spacing:-.3px}
    .price{font-size:32px;font-weight:900;letter-spacing:-1px;color:#ffde59;margin:8px 0 18px}
    .card.pop .price{color:#0a0a0a}
    .price span{font-size:12.5px;font-weight:600;color:#71717a;letter-spacing:0;margin-left:4px}
    .card.pop .price span{color:rgba(10,10,10,.5)}
    ul{display:flex;flex-direction:column;gap:11px;flex:1}
    li{display:flex;align-items:flex-start;gap:10px;font-size:13.5px;color:#c7c7cf;line-height:1.45}
    .card.pop li{color:#1c1c0e}
    .ic{flex-shrink:0;width:17px;height:17px;border-radius:50%;background:#ffde59;display:grid;place-items:center;margin-top:1px}
    .card.pop .ic{background:#0a0a0a}
    .cta{margin-top:20px;height:46px;border:1px solid #3a3a42;border-radius:12px;background:transparent;color:#fff;font-size:14.5px;font-weight:700;cursor:pointer;transition:background .15s}
    .cta:hover{background:rgba(255,255,255,.06)}
    .card.pop .cta{background:#0a0a0a;color:#fff;border-color:#0a0a0a}
    @media(max-width:820px){.grid{grid-template-columns:1fr}}
  </style></head><body>
    <div class="sec-h"><h2>Workshop &amp; Servicing</h2><p>Trusted mechanics. Quality parts. Your bike, dialled.</p></div>
    <div class="grid">${cards}</div>
  </body></html>`;
}

// ════════════════════════════════════════════════════════════════════════════
// DESIGN 4 — SPLIT HORIZONTAL · two-column rich cards, great for a few services
// ════════════════════════════════════════════════════════════════════════════
function design4(): string {
  const cards = SERVICES.map((s) => `
    <article class="card${s.popular ? ' pop' : ''}">
      <div class="left">
        <span class="chip">${wrench('#0a0a0a')}</span>
        ${s.popular ? '<span class="tag">Most popular</span>' : ''}
        <h3>${s.name}</h3>
        <p class="blurb">${s.blurb}</p>
        <div class="price">${s.price}</div>
        <span class="dur">${clock('#6b7280')} ${s.duration}</span>
        <button class="cta">Book now</button>
      </div>
      <div class="right">
        <p class="lab">What's included</p>
        <ul>
          ${s.includes.map((i) => `<li><span class="ic">${check('#059669', 12, 3.4)}</span>${i}</li>`).join('')}
        </ul>
      </div>
    </article>`).join('');
  return `${SHELL_HEAD}
    body{background:#f6f6f4;padding:32px 30px}
    .sec-h{max-width:960px;margin:0 auto 20px}
    .sec-h h2{font-size:22px;font-weight:800;letter-spacing:-.4px;color:#0a0a0a}
    .sec-h p{font-size:13px;color:#71717a;margin-top:3px}
    .stack{max-width:960px;margin:0 auto;display:flex;flex-direction:column;gap:16px}
    .card{display:grid;grid-template-columns:300px 1fr;background:#fff;border:1px solid #ececec;border-radius:20px;overflow:hidden}
    .card.pop{border-color:#f5d33a;box-shadow:0 14px 36px rgba(245,211,58,.2)}
    .left{padding:26px;border-right:1px solid #f0f0f0;display:flex;flex-direction:column;align-items:flex-start;background:#fafafa}
    .card.pop .left{background:#fffdf0}
    .chip{width:42px;height:42px;border-radius:12px;background:#ffde59;display:grid;place-items:center;margin-bottom:14px}
    .tag{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#9a7b00;background:#fff5cc;padding:4px 10px;border-radius:999px;margin-bottom:8px}
    h3{font-size:19px;font-weight:800;letter-spacing:-.3px;color:#0a0a0a}
    .blurb{font-size:13px;color:#71717a;line-height:1.5;margin-top:6px}
    .price{font-size:34px;font-weight:900;letter-spacing:-1px;color:#0a0a0a;margin-top:14px}
    .dur{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;color:#6b7280;margin-top:4px}
    .cta{margin-top:18px;width:100%;height:44px;border:none;border-radius:11px;background:#0a0a0a;color:#fff;font-size:14px;font-weight:700;cursor:pointer;transition:opacity .15s}
    .cta:hover{opacity:.88}
    .right{padding:26px 28px}
    .lab{font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#9ca3af;margin-bottom:16px}
    ul{display:grid;grid-template-columns:1fr 1fr;gap:13px 22px}
    li{display:flex;align-items:flex-start;gap:10px;font-size:13.5px;color:#3f3f46;line-height:1.4}
    .ic{flex-shrink:0;width:19px;height:19px;border-radius:50%;background:#ecfdf5;display:grid;place-items:center;margin-top:1px}
    @media(max-width:760px){.card{grid-template-columns:1fr}.left{border-right:none;border-bottom:1px solid #f0f0f0}.right ul{grid-template-columns:1fr}}
  </style></head><body>
    <div class="sec-h"><h2>Workshop Services</h2><p>Every service is carried out by a qualified mechanic. See exactly what you get.</p></div>
    <div class="stack">${cards}</div>
  </body></html>`;
}

// ════════════════════════════════════════════════════════════════════════════
// DESIGN 5 — EDITORIAL MINIMAL · typographic serif list, hairline rules, text-link CTA
// ════════════════════════════════════════════════════════════════════════════
function design5(): string {
  const rows = SERVICES.map((s) => `
    <article class="row">
      <div class="head">
        <div>
          ${s.popular ? '<p class="kick">★ Most booked</p>' : ''}
          <h3>${s.name}</h3>
          <p class="blurb">${s.blurb}</p>
        </div>
        <div class="pr">${s.price}<span>per service</span></div>
      </div>
      <ul>
        ${s.includes.map((i) => `<li>${check('#b08900', 12, 3)}<span>${i}</span></li>`).join('')}
      </ul>
      <a class="cta" href="#">Book this service →</a>
    </article>`).join('');
  return `${SHELL_HEAD}
    body{background:#fff;padding:44px 30px}
    .wrap{max-width:720px;margin:0 auto}
    .sec-h{border-bottom:2px solid #0a0a0a;padding-bottom:14px;margin-bottom:8px}
    .sec-h h2{font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:700;letter-spacing:-.5px;color:#0a0a0a}
    .sec-h p{font-size:13.5px;color:#71717a;margin-top:5px}
    .row{padding:30px 0;border-bottom:1px solid #ececec}
    .head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}
    .kick{font-size:11.5px;font-weight:700;letter-spacing:.4px;color:#b08900;margin-bottom:6px}
    h3{font-family:Georgia,'Times New Roman',serif;font-size:23px;font-weight:700;letter-spacing:-.3px;color:#0a0a0a}
    .blurb{font-size:14px;color:#71717a;line-height:1.55;margin-top:6px;max-width:420px}
    .pr{font-size:26px;font-weight:800;letter-spacing:-.5px;color:#0a0a0a;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
    .pr span{display:block;font-size:11px;font-weight:600;letter-spacing:.4px;text-transform:uppercase;color:#a1a1aa;margin-top:3px}
    ul{display:grid;grid-template-columns:1fr 1fr;gap:11px 28px;margin:20px 0 22px}
    li{display:flex;align-items:flex-start;gap:9px;font-size:14px;color:#3f3f46;line-height:1.5}
    li svg{margin-top:4px;flex-shrink:0}
    .cta{display:inline-block;font-size:13.5px;font-weight:700;color:#0a0a0a;text-decoration:none;border-bottom:2px solid #ffde59;padding-bottom:2px}
    .cta:hover{border-bottom-color:#0a0a0a}
    @media(max-width:640px){ul{grid-template-columns:1fr}.head{flex-direction:column}.pr{text-align:left}}
  </style></head><body>
    <div class="wrap">
      <div class="sec-h"><h2>Services</h2><p>Honest workshop pricing. Booked online or over the phone.</p></div>
      ${rows}
    </div>
  </body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────

interface Design {
  id: string;
  name: string;
  tag: string;
  desc: string;
  html: string;
  deskH: number;
}

const DESIGNS: Design[] = [
  {
    id: 'checklist',
    name: 'Clean Checklist',
    tag: 'Light · Professional default',
    desc: 'White cards in a grid, each with a duration pill, a bold price, a tidy checklist of inclusions and a solid dark "Book service" button. The safe, conversion-friendly choice that drops straight into the light services tab. The featured service gets a yellow top-border and ribbon.',
    html: design1(),
    deskH: 560,
  },
  {
    id: 'pricing',
    name: 'Pricing Plan',
    tag: 'Commercial · SaaS tiers',
    desc: 'Frames each service as a selectable plan — centred layout, big price with a "/ service" suffix, emerald ticks and an accent CTA. The featured service lifts off the page with a yellow border and a "Most booked" badge. Best when you want customers to compare and pick.',
    html: design2(),
    deskH: 600,
  },
  {
    id: 'dark',
    name: 'Premium Dark',
    tag: 'Sporty · Closest to current',
    desc: 'Charcoal cards with a yellow wrench chip, yellow price and yellow tick bullets — an elevated, card-based take on the dark panel you have today. The featured service flips to a full-yellow card for punch. Feels premium and race-shop.',
    html: design3(),
    deskH: 540,
  },
  {
    id: 'split',
    name: 'Split Horizontal',
    tag: 'Detailed · Few services',
    desc: 'Wide two-column cards: a tinted left rail holds the icon, price, duration and CTA, while the right side lays the inclusions out in two columns. Reads beautifully and shows long lists without scrolling — ideal for shops with two to four services.',
    html: design4(),
    deskH: 720,
  },
  {
    id: 'editorial',
    name: 'Editorial Minimal',
    tag: 'Refined · Typographic',
    desc: 'A borderless, magazine-style list with serif headlines, hairline rules, the price set in tabular figures and an understated underlined text-link CTA. Quiet, premium and content-first — lets the words do the work rather than boxes and shadows.',
    html: design5(),
    deskH: 760,
  },
];

const MOBILE_W = 390;
const MOBILE_H = 720;

function navTab(href: string, label: string, active: boolean) {
  return (
    <a
      href={href}
      style={{
        padding: '8px 16px',
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 700,
        textDecoration: 'none',
        color: active ? '#0a0a0a' : '#a1a1aa',
        background: active ? '#ffde59' : '#27272a',
        border: active ? '1px solid #ffde59' : '1px solid #3f3f46',
      }}
    >
      {label}
    </a>
  );
}

export default function ServiceCardsPage() {
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#0e0e11', minHeight: '100vh', padding: '36px 24px 90px' }}>
      <div style={{ maxWidth: 1680, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
          {navTab('/dev/email-preview', 'Email Templates', false)}
          {navTab('/dev/product-designs', 'Product Pages', false)}
          {navTab('/dev/service-cards', 'Service Cards', true)}
        </div>

        <div style={{ marginBottom: 30 }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: -0.6 }}>
            Service Card Designs
          </h1>
          <p style={{ margin: 0, fontSize: 14.5, color: '#8a8a93', maxWidth: 780, lineHeight: 1.6 }}>
            Five directions for the storefront services section — each shows a service&apos;s name, price and a
            dot-point list of exactly what&apos;s included (lead card: <b style={{ color: '#cfcfd6' }}>General Service · $129</b>).
            All five run off the same sample data so they compare fairly. Pick one and we&apos;ll wire it into the live
            Home tab plus add an &ldquo;includes&rdquo; editor under Settings → Services. Previews only — nothing here is live yet.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 44 }}>
          {DESIGNS.map((d, i) => (
            <section key={d.id}>
              {/* Label */}
              <div style={{ background: '#151519', border: '1px solid #27272a', borderRadius: 14, padding: '15px 18px', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
                  <span style={{ width: 24, height: 24, borderRadius: 7, background: '#ffde59', color: '#0a0a0a', fontSize: 12, fontWeight: 900, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>{d.name}</span>
                  <span style={{ fontSize: 12.5, color: '#ffde59', fontWeight: 600 }}>— {d.tag}</span>
                </div>
                <p style={{ margin: 0, fontSize: 13.5, color: '#9a9aa3', lineHeight: 1.6, maxWidth: 900 }}>{d.desc}</p>
              </div>

              {/* Viewports */}
              <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {/* Desktop */}
                <div style={{ flex: '1 1 720px', minWidth: 680 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Desktop</div>
                  <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid #27272a', boxShadow: '0 10px 40px rgba(0,0,0,.45)' }}>
                    <iframe
                      srcDoc={d.html}
                      style={{ width: '100%', height: d.deskH, border: 'none', display: 'block', background: '#fff' }}
                      title={d.name + ' desktop'}
                    />
                  </div>
                </div>

                {/* Mobile */}
                <div style={{ flex: '0 0 auto' }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Mobile · 390px</div>
                  <div style={{ width: MOBILE_W + 20, background: '#1a1a1a', borderRadius: 40, padding: 10, boxShadow: '0 10px 40px rgba(0,0,0,.45)', border: '1px solid #2a2a2a' }}>
                    <div style={{ position: 'relative', borderRadius: 30, overflow: 'hidden', background: '#fff' }}>
                      <iframe
                        srcDoc={d.html}
                        style={{ width: MOBILE_W, height: MOBILE_H, border: 'none', display: 'block' }}
                        title={d.name + ' mobile'}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
