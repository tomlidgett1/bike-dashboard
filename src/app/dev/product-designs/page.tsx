'use client';

import * as React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Dev-only page — 5 fundamentally different PRODUCT PAGE design directions.
// Each is a self-contained, fully responsive HTML mockup (media queries inside).
// Shown at desktop width AND in a phone frame so you can judge web + mobile.
// These are PREVIEWS ONLY — nothing here is wired into the real product route.
// Visit: http://localhost:3000/dev/product-designs
// ─────────────────────────────────────────────────────────────────────────────

// Shared sample product (kept identical across designs so they compare fairly).
const P = {
  brand: 'Specialized',
  cat: 'Road Bike',
  name: 'S-Works Tarmac SL7',
  full: 'Specialized S-Works Tarmac SL7',
  variant: 'Dura-Ace Di2',
  year: '2023',
  price: '$5,950',
  was: '$7,200',
  off: '17%',
  condition: 'Excellent',
  size: '56 cm',
  frame: 'FACT 12r Carbon',
  groupset: 'Shimano Dura-Ace Di2',
  wheels: 'Roval Rapide CLX II',
  weight: '6.8 kg',
  seller: 'The Bike Shop Melbourne',
  location: 'Melbourne, VIC',
  rating: '4.9',
  sales: '213',
  blurb:
    'The S-Works Tarmac SL7 refuses to choose between aero and lightweight. Raced at the highest level, immaculately maintained, and ready for its next rider. Full service history, original receipt, and Roval Rapide wheels included.',
};

// Road-bike imagery. Rendered as CSS background-image over a gradient, so any
// failed load degrades to a clean coloured panel instead of a broken-image icon.
const IMG = {
  a: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1400&q=80',
  b: 'https://images.unsplash.com/photo-1576435728678-68d0fbf94e91?auto=format&fit=crop&w=1400&q=80',
  c: 'https://images.unsplash.com/photo-1571333250630-f0230c320b6d?auto=format&fit=crop&w=1400&q=80',
  d: 'https://images.unsplash.com/photo-1502744688674-c619d1586c9e?auto=format&fit=crop&w=1400&q=80',
  e: 'https://images.unsplash.com/photo-1511994298241-608e28f14fde?auto=format&fit=crop&w=1400&q=80',
};

// ════════════════════════════════════════════════════════════════════════════
// DESIGN 1 — SHOWROOM · Light, premium two-column retail with sticky buy box.
// ════════════════════════════════════════════════════════════════════════════
const SHOWROOM = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;background:#fff;color:#0a0a0a;-webkit-font-smoothing:antialiased;line-height:1.5}
a{color:inherit;text-decoration:none}
.wrap{max-width:1240px;margin:0 auto;padding:0 24px}
.nav{position:sticky;top:0;z-index:40;background:rgba(255,255,255,.92);backdrop-filter:blur(12px);border-bottom:1px solid #eee}
.nav-in{max-width:1240px;margin:0 auto;padding:0 24px;height:60px;display:flex;align-items:center;justify-content:space-between}
.logo{display:flex;align-items:center;gap:9px;font-weight:800;letter-spacing:-.3px;font-size:15px}
.chip{width:26px;height:26px;border-radius:7px;background:#ffde59;color:#0a0a0a;display:grid;place-items:center;font-size:12px;font-weight:900}
.nav-actions{display:flex;gap:8px}
.icbtn{width:38px;height:38px;border:1px solid #e5e7eb;border-radius:10px;display:grid;place-items:center;color:#6b7280;background:#fff;font-size:15px}
.crumbs{font-size:12.5px;color:#9ca3af;padding:18px 0 6px}
.crumbs b{color:#4b5563;font-weight:600}
.grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:40px;padding:8px 0 40px}
.gal .wrap2{display:block}
.hero{position:relative;border-radius:18px;overflow:hidden;background:linear-gradient(135deg,#eef0f3,#dfe3e8);aspect-ratio:4/3;background-size:cover;background-position:center}
.s:not(:first-child){display:none}
.hero .tag{position:absolute;top:14px;left:14px;background:#0a0a0a;color:#fff;font-size:11px;font-weight:700;letter-spacing:.5px;padding:6px 11px;border-radius:8px;text-transform:uppercase}
.hero .fav{position:absolute;top:14px;right:14px;width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.92);display:grid;place-items:center;font-size:18px}
.thumbs{display:flex;gap:10px;margin-top:12px}
.thumbs div{flex:1;aspect-ratio:1;border-radius:11px;background-size:cover;background-position:center;border:2px solid transparent;background-color:#eef0f3}
.thumbs div.on{border-color:#0a0a0a}
.buy{position:sticky;top:80px;align-self:start}
.eyebrow{font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#9ca3af;font-weight:700}
h1{font-size:27px;line-height:1.18;letter-spacing:-.5px;margin:7px 0 8px;font-weight:800}
.rate{display:flex;align-items:center;gap:7px;font-size:13px;color:#6b7280;margin-bottom:16px;flex-wrap:wrap}
.stars{color:#ffb400;letter-spacing:1px}
.price-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:7px}
.price{font-size:30px;font-weight:800;letter-spacing:-1px}
.was{font-size:17px;color:#9ca3af;text-decoration:line-through}
.off{background:#fee2e2;color:#dc2626;font-size:12px;font-weight:800;padding:3px 8px;border-radius:6px}
.cond{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:#059669;font-weight:600;margin-bottom:18px}
.dot{width:7px;height:7px;border-radius:50%;background:#10b981}
.btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:50px;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;border:1px solid transparent}
.btn-pri{background:#ffde59;color:#0a0a0a}
.btn-out{background:#fff;border-color:#d1d5db;color:#0a0a0a;margin-top:10px}
.btn-row{display:flex;gap:10px;margin-top:10px}
.btn-row .btn{height:46px;font-size:14px}
.btn-ghost{background:#f3f4f6;color:#0a0a0a}
.prot{display:flex;align-items:flex-start;gap:8px;font-size:12.5px;color:#6b7280;margin:14px 2px 0;line-height:1.5}
.seller{display:flex;align-items:center;gap:12px;padding:14px;border:1px solid #eee;border-radius:14px;margin-top:18px}
.av{width:42px;height:42px;border-radius:50%;background:#ffde59;display:grid;place-items:center;font-weight:800;color:#0a0a0a;flex-shrink:0}
.seller .meta{flex:1;min-width:0}
.seller .nm{font-weight:700;font-size:14px;display:flex;align-items:center;gap:6px}
.verified{color:#2563eb;font-size:13px}
.seller .sub{font-size:12px;color:#9ca3af}
.viewstore{font-size:12.5px;color:#6b7280;font-weight:600;flex-shrink:0}
.specs{margin-top:20px;border-top:1px solid #eee;padding-top:18px}
.specs h3,.desc h3{font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;font-weight:700;margin-bottom:12px}
.spec-grid{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#eee;border:1px solid #eee;border-radius:12px;overflow:hidden}
.spec-grid div{background:#fff;padding:12px 14px}
.spec-grid .k{font-size:11.5px;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px}
.spec-grid .v{font-size:14px;font-weight:600;margin-top:3px}
.delivery{margin-top:18px;display:flex;gap:10px}
.delivery .d{flex:1;border:1px solid #eee;border-radius:12px;padding:13px}
.delivery .d .t{font-size:13px;font-weight:700}
.delivery .d .sx{font-size:12px;color:#9ca3af;margin-top:2px}
.desc{margin-top:22px;border-top:1px solid #eee;padding-top:18px}
.desc p{font-size:14.5px;color:#4b5563;line-height:1.7}
.rel{border-top:1px solid #eee;padding:34px 0 60px}
.rel h2{font-size:18px;font-weight:800;letter-spacing:-.3px;margin-bottom:16px}
.rel-row{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.card .im{aspect-ratio:1;border-radius:14px;background-size:cover;background-position:center;background-color:#eef0f3}
.card .nm{font-size:13.5px;font-weight:600;margin-top:9px}
.card .pr{font-size:14px;font-weight:800;margin-top:2px}
.card .st{font-size:11.5px;color:#9ca3af}
.mbar{display:none}
@media(max-width:760px){
  .nav-in{height:54px}.crumbs{display:none}
  .grid{grid-template-columns:1fr;gap:0;padding:0}
  .gal{margin:0 -24px}
  .gal .wrap2{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch}
  .s{display:block!important;flex:0 0 100%;scroll-snap-align:start}
  .hero{border-radius:0;aspect-ratio:1}
  .thumbs{display:none}
  .buy{position:static;padding:18px 0 92px}
  .spec-grid{grid-template-columns:1fr 1fr}
  .rel-row{grid-template-columns:repeat(2,1fr)}
  h1{font-size:23px}
  .mbar{display:flex;position:fixed;bottom:0;left:0;right:0;z-index:50;background:#fff;border-top:1px solid #eee;padding:10px 16px;gap:12px;align-items:center;box-shadow:0 -6px 24px rgba(0,0,0,.06)}
  .mbar .p{font-weight:800;font-size:18px;white-space:nowrap;line-height:1.05}
  .mbar .p small{display:block;font-size:11px;color:#9ca3af;font-weight:500;text-decoration:line-through}
  .mbar .btn{height:46px}
}
</style></head><body>
<div class="nav"><div class="nav-in">
  <a class="logo"><span class="chip">YJ</span>Yellow Jersey</a>
  <div class="nav-actions"><div class="icbtn">&#8599;</div><div class="icbtn">&#9825;</div></div>
</div></div>
<div class="wrap">
  <div class="crumbs">Marketplace / <b>Road Bikes</b> / ${P.brand} / <b>${P.name}</b></div>
  <div class="grid">
    <div>
      <div class="gal"><div class="wrap2">
        <div class="hero s" style="background-image:url('${IMG.a}')"><div class="tag">${P.condition}</div><div class="fav">&#9825;</div></div>
        <div class="hero s" style="background-image:url('${IMG.b}')"></div>
        <div class="hero s" style="background-image:url('${IMG.c}')"></div>
        <div class="hero s" style="background-image:url('${IMG.d}')"></div>
      </div></div>
      <div class="thumbs">
        <div class="on" style="background-image:url('${IMG.a}')"></div>
        <div style="background-image:url('${IMG.b}')"></div>
        <div style="background-image:url('${IMG.c}')"></div>
        <div style="background-image:url('${IMG.d}')"></div>
      </div>
    </div>
    <div class="buy">
      <div class="eyebrow">${P.brand} &middot; ${P.cat}</div>
      <h1>${P.full}</h1>
      <div class="rate"><span class="stars">&#9733;&#9733;&#9733;&#9733;&#9733;</span> ${P.rating} &middot; ${P.sales} sales &middot; ${P.location}</div>
      <div class="price-row"><span class="price">${P.price}</span><span class="was">${P.was}</span><span class="off">&minus;${P.off}</span></div>
      <div class="cond"><span class="dot"></span>${P.condition} condition &middot; ${P.year}</div>
      <button class="btn btn-pri">Buy Now</button>
      <button class="btn btn-out">Add to Cart</button>
      <div class="btn-row"><button class="btn btn-ghost">Make Offer</button><button class="btn btn-ghost">Message</button></div>
      <div class="prot">&#128737;&#65039; <span>Buyer Protection &mdash; your payment is held in escrow until you confirm the bike arrived as described.</span></div>
      <div class="seller">
        <div class="av">B</div>
        <div class="meta"><div class="nm">${P.seller} <span class="verified">&#10004;</span></div><div class="sub">Bicycle Store &middot; Verified</div></div>
        <a class="viewstore">View store &rarr;</a>
      </div>
      <div class="specs"><h3>Specifications</h3>
        <div class="spec-grid">
          <div><div class="k">Year</div><div class="v">${P.year}</div></div>
          <div><div class="k">Frame size</div><div class="v">${P.size}</div></div>
          <div><div class="k">Frame</div><div class="v">${P.frame}</div></div>
          <div><div class="k">Groupset</div><div class="v">${P.groupset}</div></div>
          <div><div class="k">Wheels</div><div class="v">${P.wheels}</div></div>
          <div><div class="k">Weight</div><div class="v">${P.weight}</div></div>
        </div>
      </div>
      <div class="delivery">
        <div class="d"><div class="t">&#128666; Free shipping</div><div class="sx">Ships Australia-wide</div></div>
        <div class="d"><div class="t">&#128205; Pickup</div><div class="sx">${P.location}</div></div>
      </div>
      <div class="desc"><h3>Description</h3><p>${P.blurb}</p></div>
    </div>
  </div>
  <div class="rel"><h2>More from ${P.seller}</h2>
    <div class="rel-row">
      <div class="card"><div class="im" style="background-image:url('${IMG.b}')"></div><div class="nm">Trek &Eacute;monda SLR 9</div><div class="pr">$6,400</div><div class="st">Excellent &middot; 2022</div></div>
      <div class="card"><div class="im" style="background-image:url('${IMG.c}')"></div><div class="nm">Cerv&eacute;lo S5</div><div class="pr">$5,200</div><div class="st">Very good &middot; 2021</div></div>
      <div class="card"><div class="im" style="background-image:url('${IMG.d}')"></div><div class="nm">Canyon Aeroad CFR</div><div class="pr">$4,900</div><div class="st">Excellent &middot; 2023</div></div>
      <div class="card"><div class="im" style="background-image:url('${IMG.e}')"></div><div class="nm">Pinarello Dogma F</div><div class="pr">$8,100</div><div class="st">Like new &middot; 2023</div></div>
    </div>
  </div>
</div>
<div class="mbar"><div class="p">${P.price}<small>${P.was}</small></div><button class="btn btn-ghost" style="flex:1">Offer</button><button class="btn btn-pri" style="flex:1.4">Buy Now</button></div>
</body></html>`;

// ════════════════════════════════════════════════════════════════════════════
// DESIGN 2 — VELODROME · Dark, bold editorial. Oversized type, race energy.
// ════════════════════════════════════════════════════════════════════════════
const VELODROME = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;background:#0a0a0a;color:#fff;-webkit-font-smoothing:antialiased;line-height:1.4}
a{color:inherit;text-decoration:none}
.wrap{max-width:1280px;margin:0 auto;padding:0 32px}
.nav{display:flex;align-items:center;justify-content:space-between;height:74px}
.logo{display:flex;align-items:center;gap:10px;font-weight:900;letter-spacing:.5px;text-transform:uppercase;font-size:15px}
.chip{width:28px;height:28px;border-radius:7px;background:#ffde59;color:#0a0a0a;display:grid;place-items:center;font-size:13px;font-weight:900}
.navlinks{display:flex;gap:26px;font-size:13px;color:#8a8a8a;text-transform:uppercase;letter-spacing:1px;font-weight:600}
.hero{display:grid;grid-template-columns:1.1fr 1fr;gap:40px;padding:14px 0 50px;align-items:stretch}
.shot{border-radius:20px;overflow:hidden;background:linear-gradient(135deg,#1a1a1a,#000);background-size:cover;background-position:center;min-height:520px;position:relative}
.shot .badge{position:absolute;top:18px;left:18px;background:#ffde59;color:#0a0a0a;font-weight:900;font-size:11px;letter-spacing:1px;text-transform:uppercase;padding:7px 12px;border-radius:7px}
.panel{display:flex;flex-direction:column;justify-content:center}
.eyebrow{color:#ffde59;font-size:12px;font-weight:800;letter-spacing:4px;text-transform:uppercase;margin-bottom:16px}
h1{font-size:64px;line-height:.9;letter-spacing:-2.5px;text-transform:uppercase;font-weight:900;margin-bottom:22px}
.price{font-size:46px;font-weight:900;color:#ffde59;letter-spacing:-2px;line-height:1}
.pricesub{display:flex;align-items:center;gap:12px;margin:10px 0 26px}
.was{font-size:18px;color:#666;text-decoration:line-through}
.off{background:#ffde59;color:#0a0a0a;font-size:12px;font-weight:900;padding:4px 9px;border-radius:6px;letter-spacing:.5px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:30px}
.chips span{border:1px solid #2a2a2a;background:#141414;color:#cfcfcf;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:8px 13px;border-radius:8px}
.cta{display:flex;flex-direction:column;gap:12px}
.btn{height:58px;border-radius:12px;font-weight:900;font-size:15px;letter-spacing:1.5px;text-transform:uppercase;display:flex;align-items:center;justify-content:center;cursor:pointer;border:1.5px solid transparent}
.btn-pri{background:#ffde59;color:#0a0a0a}
.btn-out{background:transparent;border-color:#333;color:#fff}
.row2{display:flex;gap:12px}
.row2 .btn{flex:1;height:52px;font-size:13px}
.escrow{margin-top:18px;font-size:12.5px;color:#7a7a7a;display:flex;gap:8px;align-items:flex-start;line-height:1.55}
.escrow b{color:#ffde59;font-weight:700}
.film{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;padding-bottom:46px}
.film div{aspect-ratio:4/3;border-radius:12px;background-size:cover;background-position:center;background-color:#161616;border:1px solid #1e1e1e}
.statband{background:#ffde59;color:#0a0a0a;border-radius:18px;display:grid;grid-template-columns:repeat(4,1fr);overflow:hidden}
.statband .st{padding:26px 22px;border-right:1px solid rgba(0,0,0,.12)}
.statband .st:last-child{border-right:0}
.statband .k{font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;opacity:.65}
.statband .v{font-size:22px;font-weight:900;letter-spacing:-.5px;margin-top:6px}
.about{display:grid;grid-template-columns:240px 1fr;gap:40px;padding:54px 0}
.about h2{font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#ffde59;font-weight:800}
.about p{color:#a8a8a8;font-size:16px;line-height:1.85;margin-bottom:18px}
.seller{display:flex;align-items:center;gap:16px;border:1px solid #1f1f1f;background:#101010;border-radius:16px;padding:20px 22px;margin-bottom:54px}
.av{width:50px;height:50px;border-radius:50%;background:#ffde59;color:#0a0a0a;display:grid;place-items:center;font-weight:900;font-size:18px}
.seller .nm{font-weight:800;font-size:16px;display:flex;align-items:center;gap:8px}
.seller .sub{font-size:12.5px;color:#7a7a7a;letter-spacing:.5px}
.seller .go{margin-left:auto;color:#ffde59;font-weight:800;font-size:12px;letter-spacing:1px;text-transform:uppercase}
.rel{padding-bottom:70px}
.rel h2{font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#ffde59;font-weight:800;margin-bottom:18px}
.relrow{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.relrow .im{aspect-ratio:1;border-radius:12px;background-size:cover;background-position:center;background-color:#161616}
.relrow .nm{font-weight:700;font-size:14px;margin-top:10px}
.relrow .pr{color:#ffde59;font-weight:900;font-size:15px;margin-top:2px}
.mbar{display:none}
@media(max-width:760px){
  .wrap{padding:0 18px}.navlinks{display:none}.nav{height:60px}
  .hero{grid-template-columns:1fr;gap:22px;padding-bottom:24px}
  .shot{min-height:340px;margin:0 -18px;border-radius:0}
  h1{font-size:46px}.price{font-size:38px}
  .film{grid-template-columns:repeat(4,1fr);gap:8px;padding-bottom:30px}
  .statband{grid-template-columns:1fr 1fr}
  .statband .st{border-right:0;border-bottom:1px solid rgba(0,0,0,.1)}
  .about{grid-template-columns:1fr;gap:14px;padding:34px 0}
  .relrow{grid-template-columns:repeat(2,1fr)}
  .cta{padding-bottom:0}
  .panel .cta,.panel .escrow{display:none}
  .mbar{display:flex;position:fixed;bottom:0;left:0;right:0;z-index:60;background:#0a0a0a;border-top:1px solid #222;padding:11px 16px;gap:12px;align-items:center}
  .mbar .p{font-weight:900;font-size:20px;color:#ffde59;white-space:nowrap}
  .mbar .btn{height:48px;flex:1}
  .mbar .btn-out{flex:.8}
}
</style></head><body>
<div class="wrap">
  <div class="nav">
    <a class="logo"><span class="chip">YJ</span>Yellow Jersey</a>
    <div class="navlinks"><span>Bikes</span><span>Sell</span><span>Offers</span><span>&#9825;</span></div>
  </div>
  <div class="hero">
    <div class="shot" style="background-image:url('${IMG.a}')"><div class="badge">${P.condition}</div></div>
    <div class="panel">
      <div class="eyebrow">Just listed &middot; ${P.cat}</div>
      <h1>S-Works<br>Tarmac SL7</h1>
      <div class="price">${P.price}</div>
      <div class="pricesub"><span class="was">${P.was}</span><span class="off">&minus;${P.off} OFF</span></div>
      <div class="chips"><span>${P.year}</span><span>${P.size}</span><span>${P.weight}</span><span>Dura-Ace Di2</span></div>
      <div class="cta">
        <button class="btn btn-pri">Buy Now &mdash; ${P.price}</button>
        <div class="row2"><button class="btn btn-out">Make Offer</button><button class="btn btn-out">Message</button></div>
      </div>
      <div class="escrow">&#128737;&#65039; <span><b>Escrow protected.</b> Funds are held until you confirm the bike arrived as described.</span></div>
    </div>
  </div>
  <div class="film">
    <div style="background-image:url('${IMG.b}')"></div>
    <div style="background-image:url('${IMG.c}')"></div>
    <div style="background-image:url('${IMG.d}')"></div>
    <div style="background-image:url('${IMG.e}')"></div>
  </div>
  <div class="statband">
    <div class="st"><div class="k">Condition</div><div class="v">${P.condition}</div></div>
    <div class="st"><div class="k">Weight</div><div class="v">${P.weight}</div></div>
    <div class="st"><div class="k">Groupset</div><div class="v">Dura-Ace</div></div>
    <div class="st"><div class="k">Wheels</div><div class="v">Roval CLX</div></div>
  </div>
  <div class="about">
    <h2>The Detail</h2>
    <div>
      <p>${P.blurb}</p>
      <p>Frame: ${P.frame}. Drivetrain: ${P.groupset}. Wheelset: ${P.wheels}. Size ${P.size}, model year ${P.year}.</p>
    </div>
  </div>
  <div class="seller">
    <div class="av">B</div>
    <div><div class="nm">${P.seller} <span style="color:#ffde59">&#10004;</span></div><div class="sub">VERIFIED BICYCLE STORE &middot; ${P.rating}&#9733; (${P.sales})</div></div>
    <span class="go">View store &rarr;</span>
  </div>
  <div class="rel">
    <h2>You might also like</h2>
    <div class="relrow">
      <div><div class="im" style="background-image:url('${IMG.b}')"></div><div class="nm">Trek &Eacute;monda SLR 9</div><div class="pr">$6,400</div></div>
      <div><div class="im" style="background-image:url('${IMG.c}')"></div><div class="nm">Cerv&eacute;lo S5</div><div class="pr">$5,200</div></div>
      <div><div class="im" style="background-image:url('${IMG.d}')"></div><div class="nm">Canyon Aeroad CFR</div><div class="pr">$4,900</div></div>
      <div><div class="im" style="background-image:url('${IMG.e}')"></div><div class="nm">Pinarello Dogma F</div><div class="pr">$8,100</div></div>
    </div>
  </div>
</div>
<div class="mbar"><div class="p">${P.price}</div><button class="btn btn-out">Offer</button><button class="btn btn-pri">Buy Now</button></div>
</body></html>`;

// ════════════════════════════════════════════════════════════════════════════
// DESIGN 3 — ATELIER · Warm serif luxury. Considered, magazine, Rapha/MAAP calm.
// ════════════════════════════════════════════════════════════════════════════
const ATELIER = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Georgia,'Times New Roman',serif;background:#faf8f5;color:#1a1a1a;-webkit-font-smoothing:antialiased;line-height:1.6}
a{color:inherit;text-decoration:none}
.sans{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
.wrap{max-width:1080px;margin:0 auto;padding:0 32px}
.lead{display:flex;align-items:center;gap:0;padding-top:26px}
.lead .y{height:4px;width:54px;background:#ffde59}
.lead .ln{height:1px;background:#d8d2c8;flex:1}
.top{display:flex;align-items:center;justify-content:space-between;padding:20px 0 36px}
.logo{display:flex;align-items:center;gap:10px;font-size:17px;font-weight:700;letter-spacing:-.2px}
.chip{width:26px;height:26px;border-radius:6px;background:#ffde59;color:#0a0a0a;display:grid;place-items:center;font-size:12px;font-weight:900;font-family:-apple-system,sans-serif}
.member{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#9c9488}
.eyebrow{font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#9c9488;margin-bottom:10px}
h1{font-size:52px;font-weight:400;font-style:italic;letter-spacing:-1px;line-height:1.05;margin-bottom:30px}
.split{display:grid;grid-template-columns:1.05fr 1fr;gap:46px;align-items:start}
.bigshot{border-radius:6px;overflow:hidden;aspect-ratio:4/5;background:linear-gradient(135deg,#e8e3da,#d9d2c6);background-size:cover;background-position:center}
.price{font-size:38px;font-weight:400}
.condline{font-size:14px;color:#6b6357;font-style:italic;margin:6px 0 26px}
.secn{border-top:1px solid #e2dcd0;padding:18px 0}
.secn .lab{font-family:-apple-system,sans-serif;font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#9c9488;display:flex;gap:10px}
.secn .lab b{color:#1a1a1a}
.secn .val{font-style:italic;font-size:16px;margin-top:5px}
.buys{margin-top:30px;display:flex;flex-direction:column;gap:12px}
.btn{font-family:-apple-system,sans-serif;height:52px;border-radius:4px;font-weight:700;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;display:flex;align-items:center;justify-content:center;cursor:pointer;border:1px solid transparent}
.btn-pri{background:#ffde59;color:#0a0a0a}
.btn-out{background:transparent;border-color:#c9c1b3;color:#1a1a1a}
.msg{text-align:center;font-family:-apple-system,sans-serif;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#9c9488;margin-top:4px}
.escrow{font-style:italic;font-size:13px;color:#8a8377;margin-top:18px;line-height:1.6}
.detail{padding:60px 0 30px}
.detail .h{font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#9c9488;margin-bottom:18px;font-family:-apple-system,sans-serif}
.detail p{font-size:19px;line-height:1.9;color:#322e27;max-width:760px}
.gallery{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:24px 0 50px}
.gallery div{aspect-ratio:3/2;border-radius:6px;background-size:cover;background-position:center;background-color:#e8e3da}
.present{border-top:1px solid #e2dcd0;border-bottom:1px solid #e2dcd0;padding:30px 0;display:flex;align-items:center;gap:18px;margin-bottom:18px}
.av{width:50px;height:50px;border-radius:50%;background:#ffde59;color:#0a0a0a;display:grid;place-items:center;font-weight:900;font-family:-apple-system,sans-serif}
.present .nm{font-size:19px;font-style:italic}
.present .sub{font-family:-apple-system,sans-serif;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#9c9488;margin-top:3px}
.present .go{margin-left:auto;font-family:-apple-system,sans-serif;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#1a1a1a;border-bottom:1px solid #1a1a1a;padding-bottom:2px}
.tail{display:flex;align-items:center;padding:0 0 60px}
.tail .ln{height:1px;background:#d8d2c8;flex:1}
.tail .y{height:4px;width:54px;background:#ffde59}
.mbar{display:none}
@media(max-width:760px){
  .wrap{padding:0 20px}
  h1{font-size:38px}
  .split{grid-template-columns:1fr;gap:26px}
  .bigshot{aspect-ratio:1;margin:0 -20px;border-radius:0}
  .buys{padding-bottom:80px}
  .detail p{font-size:17px}
  .gallery{grid-template-columns:1fr 1fr}
  .member{display:none}
  .mbar{display:flex;position:fixed;bottom:0;left:0;right:0;z-index:60;background:#faf8f5;border-top:1px solid #e2dcd0;padding:12px 18px;gap:14px;align-items:center}
  .mbar .p{font-size:22px}
  .mbar .btn{flex:1;height:46px}
}
</style></head><body>
<div class="wrap">
  <div class="lead"><div class="y"></div><div class="ln"></div></div>
  <div class="top">
    <a class="logo"><span class="chip">YJ</span>Yellow Jersey</a>
    <span class="member">Marketplace &middot; Curated</span>
  </div>
  <div class="eyebrow">${P.brand} &mdash; ${P.cat}</div>
  <h1>S-Works Tarmac SL7</h1>
  <div class="split">
    <div class="bigshot" style="background-image:url('${IMG.a}')"></div>
    <div>
      <div class="price">${P.price}</div>
      <div class="condline">${P.condition} condition, ${P.year} &middot; was ${P.was}</div>
      <div class="secn"><div class="lab">I.&nbsp; <b>The Frame</b></div><div class="val">${P.frame}, ${P.size}</div></div>
      <div class="secn"><div class="lab">II.&nbsp; <b>The Drivetrain</b></div><div class="val">${P.groupset}</div></div>
      <div class="secn"><div class="lab">III.&nbsp; <b>The Wheels</b></div><div class="val">${P.wheels}, ${P.weight}</div></div>
      <div class="buys">
        <button class="btn btn-pri">Acquire &mdash; ${P.price}</button>
        <button class="btn btn-out">Make an offer</button>
        <div class="msg">or message the shop</div>
      </div>
      <div class="escrow">Payment is held in escrow until you confirm the bike has arrived exactly as described.</div>
    </div>
  </div>
  <div class="detail">
    <div class="h">The Detail</div>
    <p>${P.blurb}</p>
  </div>
  <div class="gallery">
    <div style="background-image:url('${IMG.b}')"></div>
    <div style="background-image:url('${IMG.c}')"></div>
    <div style="background-image:url('${IMG.d}')"></div>
    <div style="background-image:url('${IMG.e}')"></div>
  </div>
  <div class="present">
    <div class="av">B</div>
    <div><div class="nm">Presented by ${P.seller}</div><div class="sub">Verified bicycle store &middot; ${P.location}</div></div>
    <span class="go">View store</span>
  </div>
  <div class="tail"><div class="ln"></div><div class="y"></div></div>
</div>
<div class="mbar"><div class="p">${P.price}</div><button class="btn btn-out">Offer</button><button class="btn btn-pri">Acquire</button></div>
</body></html>`;

// ════════════════════════════════════════════════════════════════════════════
// DESIGN 4 — CONSOLE · Modular cards, SaaS clarity. Escrow & trust forward.
// ════════════════════════════════════════════════════════════════════════════
const CONSOLE_D = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;background:#f4f5f7;color:#0f172a;-webkit-font-smoothing:antialiased;line-height:1.5}
a{color:inherit;text-decoration:none}
.appbar{background:#fff;border-bottom:1px solid #e8eaee}
.appbar-in{max-width:1240px;margin:0 auto;padding:0 24px;height:60px;display:flex;align-items:center;gap:18px}
.logo{display:flex;align-items:center;gap:9px;font-weight:800;font-size:15px}
.chip{width:26px;height:26px;border-radius:7px;background:#ffde59;color:#0a0a0a;display:grid;place-items:center;font-size:12px;font-weight:900}
.search{flex:1;max-width:420px;background:#f1f3f5;border:1px solid #e8eaee;border-radius:10px;height:38px;display:flex;align-items:center;padding:0 14px;color:#9aa3af;font-size:13px}
.appbar .ico{margin-left:auto;display:flex;gap:8px;color:#64748b}
.appbar .ico div{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;border:1px solid #e8eaee;background:#fff}
.wrap{max-width:1240px;margin:0 auto;padding:22px 24px 60px}
.crumb{font-size:12.5px;color:#94a3b8;margin-bottom:16px}
.crumb b{color:#475569;font-weight:600}
.layout{display:grid;grid-template-columns:minmax(0,1fr) 388px;gap:22px;align-items:start}
.card{background:#fff;border:1px solid #e8eaee;border-radius:16px;padding:18px;box-shadow:0 1px 2px rgba(16,24,40,.04)}
.card+.card{margin-top:18px}
.gal .big{aspect-ratio:16/10;border-radius:12px;background-size:cover;background-position:center;background-color:#eceef1;position:relative}
.gal .big .tag{position:absolute;top:12px;left:12px;background:#0f172a;color:#fff;font-size:11px;font-weight:700;padding:5px 10px;border-radius:7px;text-transform:uppercase;letter-spacing:.5px}
.gal .strip{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:10px}
.gal .strip div{aspect-ratio:1;border-radius:9px;background-size:cover;background-position:center;background-color:#eceef1;border:2px solid transparent}
.gal .strip div.on{border-color:#0f172a}
.bento{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:18px}
.bento .b{background:#fff;border:1px solid #e8eaee;border-radius:14px;padding:14px}
.bento .k{font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;font-weight:600}
.bento .v{font-size:18px;font-weight:800;margin-top:5px;letter-spacing:-.3px}
.ttl{font-size:13px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px;display:flex;align-items:center;gap:8px}
.desc p{font-size:14.5px;color:#475569;line-height:1.75}
.sptable .r{display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid #f1f3f5;font-size:14px}
.sptable .r:last-child{border-bottom:0}
.sptable .r .k{color:#94a3b8}
.sptable .r .v{font-weight:600}
.deliv{display:flex;gap:12px}
.deliv .d{flex:1;border:1px solid #e8eaee;border-radius:12px;padding:13px;display:flex;gap:10px;align-items:center}
.deliv .ic{width:34px;height:34px;border-radius:9px;background:#f1f3f5;display:grid;place-items:center;font-size:16px}
.deliv .t{font-size:13.5px;font-weight:700}
.deliv .sx{font-size:12px;color:#94a3b8}
/* buy column */
.buy{position:sticky;top:22px}
.brand{font-size:12px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:1px}
.buy h1{font-size:22px;font-weight:800;letter-spacing:-.4px;margin:5px 0 12px;line-height:1.2}
.pr{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.pr .now{font-size:28px;font-weight:800;letter-spacing:-1px}
.pr .was{font-size:15px;color:#94a3b8;text-decoration:line-through}
.pr .off{background:#dcfce7;color:#16a34a;font-size:11.5px;font-weight:800;padding:3px 7px;border-radius:6px}
.condbadge{display:inline-flex;align-items:center;gap:6px;margin:12px 0 16px;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;font-size:12.5px;font-weight:700;padding:6px 11px;border-radius:8px}
.btn{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;height:48px;border-radius:11px;font-size:14.5px;font-weight:700;cursor:pointer;border:1px solid transparent}
.btn-pri{background:#ffde59;color:#0a0a0a}
.btn-out{background:#fff;border-color:#d8dde3;color:#0f172a;margin-top:9px}
.brow{display:flex;gap:9px;margin-top:9px}
.brow .btn{height:44px;font-size:13.5px}
.brow .btn-ghost{background:#f1f3f5;border-color:transparent}
.trust{margin-top:16px;border-top:1px solid #eef0f2;padding-top:14px;display:flex;flex-direction:column;gap:11px}
.trust .t{display:flex;gap:10px;align-items:flex-start;font-size:13px;color:#475569}
.trust .t .ck{width:18px;height:18px;border-radius:50%;background:#dcfce7;color:#16a34a;display:grid;place-items:center;font-size:11px;flex-shrink:0;margin-top:1px}
.trust .t b{color:#0f172a}
.sellerc{margin-top:16px;border-top:1px solid #eef0f2;padding-top:14px;display:flex;align-items:center;gap:11px}
.av{width:40px;height:40px;border-radius:10px;background:#ffde59;color:#0a0a0a;display:grid;place-items:center;font-weight:800;flex-shrink:0}
.sellerc .nm{font-size:13.5px;font-weight:700;display:flex;align-items:center;gap:5px}
.sellerc .sub{font-size:11.5px;color:#94a3b8}
.sellerc .go{margin-left:auto;font-size:12px;color:#64748b;font-weight:600}
.rel{margin-top:26px}
.rel .ttl{margin-bottom:14px}
.relrow{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.relrow .im{aspect-ratio:1;border-radius:12px;background-size:cover;background-position:center;background-color:#eceef1}
.relrow .nm{font-size:13px;font-weight:600;margin-top:8px}
.relrow .p2{font-size:13.5px;font-weight:800;margin-top:1px}
.mbar{display:none}
@media(max-width:760px){
  .search{display:none}
  .wrap{padding:16px 16px 92px}
  .layout{grid-template-columns:1fr;gap:18px}
  .bento{grid-template-columns:1fr 1fr}
  .gal .strip{grid-template-columns:repeat(5,1fr)}
  .buy{position:static}
  .relrow{grid-template-columns:repeat(2,1fr)}
  .mbar{display:flex;position:fixed;bottom:0;left:0;right:0;z-index:60;background:#fff;border-top:1px solid #e8eaee;padding:10px 16px;gap:12px;align-items:center;box-shadow:0 -6px 22px rgba(16,24,40,.06)}
  .mbar .p{font-weight:800;font-size:18px;white-space:nowrap}
  .mbar .btn{height:46px}
}
</style></head><body>
<div class="appbar"><div class="appbar-in">
  <a class="logo"><span class="chip">YJ</span>Yellow Jersey</a>
  <div class="search">Search bikes, parts, brands&hellip;</div>
  <div class="ico"><div>&#9825;</div><div>&#128722;</div></div>
</div></div>
<div class="wrap">
  <div class="crumb">Marketplace / Road Bikes / <b>${P.full}</b></div>
  <div class="layout">
    <div>
      <div class="card gal">
        <div class="big" style="background-image:url('${IMG.a}')"><div class="tag">${P.condition}</div></div>
        <div class="strip">
          <div class="on" style="background-image:url('${IMG.a}')"></div>
          <div style="background-image:url('${IMG.b}')"></div>
          <div style="background-image:url('${IMG.c}')"></div>
          <div style="background-image:url('${IMG.d}')"></div>
          <div style="background-image:url('${IMG.e}')"></div>
        </div>
      </div>
      <div class="bento">
        <div class="b"><div class="k">Year</div><div class="v">${P.year}</div></div>
        <div class="b"><div class="k">Size</div><div class="v">${P.size}</div></div>
        <div class="b"><div class="k">Weight</div><div class="v">${P.weight}</div></div>
        <div class="b"><div class="k">Groupset</div><div class="v" style="font-size:14px">Dura-Ace</div></div>
      </div>
      <div class="card desc"><div class="ttl">&#9778; Description</div><p>${P.blurb}</p></div>
      <div class="card sptable"><div class="ttl">&#9636; Specifications</div>
        <div class="r"><span class="k">Brand</span><span class="v">${P.brand}</span></div>
        <div class="r"><span class="k">Frame</span><span class="v">${P.frame}</span></div>
        <div class="r"><span class="k">Frame size</span><span class="v">${P.size}</span></div>
        <div class="r"><span class="k">Groupset</span><span class="v">${P.groupset}</span></div>
        <div class="r"><span class="k">Wheels</span><span class="v">${P.wheels}</span></div>
        <div class="r"><span class="k">Weight</span><span class="v">${P.weight}</span></div>
        <div class="r"><span class="k">Model year</span><span class="v">${P.year}</span></div>
      </div>
      <div class="card"><div class="ttl">&#128666; Delivery</div>
        <div class="deliv">
          <div class="d"><div class="ic">&#128666;</div><div><div class="t">Free shipping</div><div class="sx">Australia-wide</div></div></div>
          <div class="d"><div class="ic">&#128205;</div><div><div class="t">Local pickup</div><div class="sx">${P.location}</div></div></div>
        </div>
      </div>
    </div>
    <div class="buy">
      <div class="card">
        <div class="brand">${P.brand} &middot; ${P.cat}</div>
        <h1>${P.full}</h1>
        <div class="pr"><span class="now">${P.price}</span><span class="was">${P.was}</span><span class="off">&minus;${P.off}</span></div>
        <div class="condbadge">&#9679; ${P.condition} condition</div>
        <button class="btn btn-pri">Buy Now</button>
        <button class="btn btn-out">Add to Cart</button>
        <div class="brow"><button class="btn btn-ghost">Make Offer</button><button class="btn btn-ghost">Message</button></div>
        <div class="trust">
          <div class="t"><span class="ck">&#10004;</span><span><b>Escrow protected</b> &mdash; we hold payment until you confirm delivery.</span></div>
          <div class="t"><span class="ck">&#10004;</span><span><b>Buyer Protection</b> on every order, no extra cost.</span></div>
          <div class="t"><span class="ck">&#10004;</span><span><b>Verified seller</b> with ${P.sales} completed sales.</span></div>
        </div>
        <div class="sellerc">
          <div class="av">B</div>
          <div><div class="nm">${P.seller} <span style="color:#2563eb">&#10004;</span></div><div class="sub">Bicycle Store &middot; ${P.rating}&#9733;</div></div>
          <span class="go">View &rarr;</span>
        </div>
      </div>
    </div>
  </div>
  <div class="rel">
    <div class="ttl">&#10022; More from ${P.seller}</div>
    <div class="relrow">
      <div><div class="im" style="background-image:url('${IMG.b}')"></div><div class="nm">Trek &Eacute;monda SLR 9</div><div class="p2">$6,400</div></div>
      <div><div class="im" style="background-image:url('${IMG.c}')"></div><div class="nm">Cerv&eacute;lo S5</div><div class="p2">$5,200</div></div>
      <div><div class="im" style="background-image:url('${IMG.d}')"></div><div class="nm">Canyon Aeroad CFR</div><div class="p2">$4,900</div></div>
      <div><div class="im" style="background-image:url('${IMG.e}')"></div><div class="nm">Pinarello Dogma F</div><div class="p2">$8,100</div></div>
    </div>
  </div>
</div>
<div class="mbar"><div class="p">${P.price}</div><button class="btn btn-ghost" style="flex:1">Offer</button><button class="btn btn-pri" style="flex:1.4">Buy Now</button></div>
</body></html>`;

// ════════════════════════════════════════════════════════════════════════════
// DESIGN 5 — IMMERSIVE · Cinematic full-bleed hero + floating glass buy panel.
// ════════════════════════════════════════════════════════════════════════════
const IMMERSIVE = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;background:#000;color:#fff;-webkit-font-smoothing:antialiased;line-height:1.5}
a{color:inherit;text-decoration:none}
.topnav{position:absolute;top:0;left:0;right:0;z-index:20;display:flex;align-items:center;justify-content:space-between;padding:22px 32px}
.logo{display:flex;align-items:center;gap:9px;font-weight:800;font-size:15px}
.chip{width:26px;height:26px;border-radius:7px;background:#ffde59;color:#0a0a0a;display:grid;place-items:center;font-size:12px;font-weight:900}
.topnav .r{display:flex;gap:10px}
.topnav .r div{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.14);backdrop-filter:blur(8px);display:grid;place-items:center;font-size:16px}
.hero{position:relative;height:88vh;min-height:600px;background-size:cover;background-position:center;background-image:linear-gradient(180deg,rgba(0,0,0,.45) 0%,rgba(0,0,0,0) 30%,rgba(0,0,0,.15) 55%,rgba(0,0,0,.85) 100%),url('${IMG.a}'),linear-gradient(135deg,#222,#000)}
.herotext{position:absolute;left:40px;bottom:54px;max-width:560px}
.eyebrow{color:#ffde59;font-size:12px;font-weight:800;letter-spacing:4px;text-transform:uppercase;margin-bottom:14px}
.hero h1{font-size:62px;line-height:.95;letter-spacing:-2px;font-weight:800;margin-bottom:14px}
.heroprice{font-size:24px;font-weight:700}
.heroprice .was{font-size:16px;color:#cfcfcf;text-decoration:line-through;margin-left:8px;font-weight:400}
.glass{position:absolute;right:40px;bottom:54px;width:330px;background:rgba(20,20,20,.55);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);border:1px solid rgba(255,255,255,.16);border-radius:20px;padding:22px}
.glass .gp{font-size:30px;font-weight:800;letter-spacing:-1px}
.glass .gc{font-size:12.5px;color:#cfcfcf;margin:4px 0 16px}
.glass .gc b{color:#ffde59;font-weight:700}
.btn{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;height:50px;border-radius:13px;font-weight:700;font-size:15px;cursor:pointer;border:1px solid transparent}
.btn-pri{background:#ffde59;color:#0a0a0a}
.btn-out{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.22);color:#fff;margin-top:10px}
.qspec{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px;border-top:1px solid rgba(255,255,255,.14);padding-top:14px}
.qspec .k{font-size:10.5px;color:#9a9a9a;text-transform:uppercase;letter-spacing:1px}
.qspec .v{font-size:14px;font-weight:700;margin-top:2px}
/* feature sections */
.feat{display:grid;grid-template-columns:1fr 1fr;align-items:center;min-height:62vh}
.feat.rev .ph{order:2}
.feat .ph{height:100%;min-height:420px;background-size:cover;background-position:center;background-color:#111}
.feat .tx{padding:64px}
.feat .tx .e{color:#ffde59;font-size:12px;font-weight:800;letter-spacing:3px;text-transform:uppercase;margin-bottom:14px}
.feat .tx h2{font-size:40px;font-weight:800;letter-spacing:-1px;line-height:1.05;margin-bottom:16px}
.feat .tx p{font-size:16px;color:#a8a8a8;line-height:1.8;max-width:440px}
.nums{background:#ffde59;color:#0a0a0a;display:grid;grid-template-columns:repeat(4,1fr)}
.nums .n{padding:34px 26px;border-right:1px solid rgba(0,0,0,.12)}
.nums .n:last-child{border-right:0}
.nums .k{font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;opacity:.6}
.nums .v{font-size:26px;font-weight:900;letter-spacing:-1px;margin-top:8px}
.galstrip{padding:30px 32px 10px}
.galstrip h3{font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#7a7a7a;font-weight:800;margin-bottom:16px}
.galstrip .row{display:flex;gap:14px;overflow-x:auto}
.galstrip .row div{flex:0 0 360px;aspect-ratio:3/2;border-radius:14px;background-size:cover;background-position:center;background-color:#141414}
.seller{display:flex;align-items:center;gap:16px;margin:30px 32px 70px;border:1px solid #1d1d1d;background:#0c0c0c;border-radius:18px;padding:22px 24px}
.av{width:50px;height:50px;border-radius:50%;background:#ffde59;color:#0a0a0a;display:grid;place-items:center;font-weight:900;font-size:18px}
.seller .nm{font-weight:800;font-size:17px;display:flex;align-items:center;gap:8px}
.seller .sub{font-size:12.5px;color:#7a7a7a}
.seller .go{margin-left:auto;color:#ffde59;font-weight:800;font-size:13px}
.mbar{display:none}
@media(max-width:760px){
  .topnav{padding:16px 18px}
  .hero{height:78vh;min-height:480px}
  .herotext{left:20px;right:20px;bottom:24px;max-width:none}
  .hero h1{font-size:42px}
  .glass{display:none}
  .feat{grid-template-columns:1fr;min-height:0}
  .feat.rev .ph{order:0}
  .feat .ph{min-height:280px}
  .feat .tx{padding:34px 22px}
  .feat .tx h2{font-size:30px}
  .nums{grid-template-columns:1fr 1fr}
  .nums .n{border-right:0;border-bottom:1px solid rgba(0,0,0,.1)}
  .galstrip .row div{flex:0 0 280px}
  .seller{margin:24px 18px 92px;flex-wrap:wrap}
  .mbar{display:flex;position:fixed;bottom:0;left:0;right:0;z-index:60;background:rgba(10,10,10,.92);backdrop-filter:blur(10px);border-top:1px solid #222;padding:11px 16px;gap:12px;align-items:center}
  .mbar .p{font-weight:800;font-size:19px;color:#ffde59;white-space:nowrap}
  .mbar .btn{height:48px;flex:1}
  .mbar .btn-out{flex:.75}
}
</style></head><body>
<div class="topnav">
  <a class="logo"><span class="chip">YJ</span>Yellow Jersey</a>
  <div class="r"><div>&#9825;</div><div>&#8599;</div></div>
</div>
<div class="hero">
  <div class="herotext">
    <div class="eyebrow">${P.brand} &middot; ${P.cat}</div>
    <h1>S-Works<br>Tarmac SL7</h1>
    <div class="heroprice">${P.price}<span class="was">${P.was}</span></div>
  </div>
  <div class="glass">
    <div class="gp">${P.price}</div>
    <div class="gc"><b>${P.condition}</b> &middot; ${P.year} &middot; saves ${P.off}</div>
    <button class="btn btn-pri">Buy Now</button>
    <button class="btn btn-out">Make Offer</button>
    <div class="qspec">
      <div><div class="k">Size</div><div class="v">${P.size}</div></div>
      <div><div class="k">Weight</div><div class="v">${P.weight}</div></div>
      <div><div class="k">Frame</div><div class="v">Carbon</div></div>
      <div><div class="k">Groupset</div><div class="v">Dura-Ace</div></div>
    </div>
  </div>
</div>
<div class="feat">
  <div class="ph" style="background-image:url('${IMG.b}')"></div>
  <div class="tx"><div class="e">The Frame</div><h2>Aero, without the weight penalty.</h2><p>${P.frame}. The SL7 was engineered to be as fast in the hills as it is on the flats &mdash; this one has been ridden well and looked after better.</p></div>
</div>
<div class="nums">
  <div class="n"><div class="k">Year</div><div class="v">${P.year}</div></div>
  <div class="n"><div class="k">Weight</div><div class="v">${P.weight}</div></div>
  <div class="n"><div class="k">Condition</div><div class="v">${P.condition}</div></div>
  <div class="n"><div class="k">Size</div><div class="v">${P.size}</div></div>
</div>
<div class="feat rev">
  <div class="ph" style="background-image:url('${IMG.c}')"></div>
  <div class="tx"><div class="e">The Wheels</div><h2>Roval Rapide CLX II.</h2><p>${P.wheels} &mdash; deep-section carbon that holds speed and shrugs off crosswinds. Tubeless-ready and trued before listing.</p></div>
</div>
<div class="galstrip">
  <h3>Every angle</h3>
  <div class="row">
    <div style="background-image:url('${IMG.a}')"></div>
    <div style="background-image:url('${IMG.d}')"></div>
    <div style="background-image:url('${IMG.e}')"></div>
    <div style="background-image:url('${IMG.b}')"></div>
  </div>
</div>
<div class="seller">
  <div class="av">B</div>
  <div><div class="nm">${P.seller} <span style="color:#ffde59">&#10004;</span></div><div class="sub">Verified bicycle store &middot; ${P.location} &middot; Escrow protected</div></div>
  <span class="go">View store &rarr;</span>
</div>
<div class="mbar"><div class="p">${P.price}</div><button class="btn btn-out">Offer</button><button class="btn btn-pri">Buy Now</button></div>
</body></html>`;

// ─────────────────────────────────────────────────────────────────────────────

interface Design {
  id: string;
  name: string;
  tag: string;
  desc: string;
  html: string;
}

const DESIGNS: Design[] = [
  { id: 'showroom', name: 'Showroom', tag: 'Light · Premium retail', desc: 'A refined two-column layout with a sticky buy box, thumbnail gallery and spec grid. The safe, trustworthy evolution of the current page — closest to what shoppers already expect from premium e-commerce.', html: SHOWROOM },
  { id: 'velodrome', name: 'Velodrome', tag: 'Dark · Bold editorial', desc: 'Oversized condensed type, race energy and dramatic imagery on pure black. The product feels like a hero. Yellow does the heavy lifting for price and CTAs.', html: VELODROME },
  { id: 'atelier', name: 'Atelier', tag: 'Warm · Serif luxury', desc: 'Considered, magazine-style and calm — Rapha / MAAP territory. Serif headlines, numbered spec sections and generous whitespace position every bike as a curated acquisition.', html: ATELIER },
  { id: 'console', name: 'Console', tag: 'Modular · Trust-first', desc: 'A card-based, SaaS-clean layout that puts escrow, buyer protection and seller verification front and centre. Best for high-consideration, higher-priced purchases.', html: CONSOLE_D },
  { id: 'immersive', name: 'Immersive', tag: 'Cinematic · Image-led', desc: 'A full-bleed hero with a floating frosted-glass buy panel, then Apple-style scrolling feature sections. Photography-led storytelling for flagship listings.', html: IMMERSIVE },
];

const DESKTOP_H = 1480;
const MOBILE_W = 390;
const MOBILE_H = 800;

function DevTabs() {
  const tab = (href: string, label: string, active: boolean) => (
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
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
      {tab('/dev/email-preview', 'Email Templates', false)}
      {tab('/dev/product-designs', 'Product Pages v1', true)}
      {tab('/dev/product-designs-orbea', 'Orbea 3D v2', false)}
    </div>
  );
}

export default function ProductDesignsPage() {
  const [active, setActive] = React.useState(0);
  const d = DESIGNS[active];

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#0e0e11', minHeight: '100vh', padding: '36px 24px 80px' }}>
      <div style={{ maxWidth: 1680, margin: '0 auto' }}>
        <DevTabs />

        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: -0.6 }}>
            Product Page Designs
          </h1>
          <p style={{ margin: 0, fontSize: 14.5, color: '#8a8a93', maxWidth: 760, lineHeight: 1.6 }}>
            Five fundamentally different directions for the marketplace product page — each fully responsive.
            Pick a concept below to see it at desktop width and in a phone frame side by side. These are previews only;
            nothing here changes the live product page. For five new Orbea + Three.js concepts, see{' '}
            <a href="/dev/product-designs-orbea" style={{ color: '#ffde59' }}>Orbea 3D v2</a>.
          </p>
        </div>

        {/* Design selector */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
          {DESIGNS.map((design, i) => {
            const on = i === active;
            return (
              <button
                key={design.id}
                onClick={() => setActive(i)}
                style={{
                  textAlign: 'left',
                  cursor: 'pointer',
                  padding: '12px 16px',
                  borderRadius: 14,
                  minWidth: 168,
                  background: on ? '#1c1c22' : '#151519',
                  border: on ? '1.5px solid #ffde59' : '1.5px solid #27272a',
                  transition: 'border-color .15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 22, height: 22, borderRadius: 6, background: '#ffde59', color: '#0a0a0a', fontSize: 11, fontWeight: 900, display: 'grid', placeItems: 'center' }}>{i + 1}</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{design.name}</span>
                </div>
                <div style={{ fontSize: 11.5, color: on ? '#ffde59' : '#71717a', marginTop: 7, fontWeight: 600, letterSpacing: 0.2 }}>{design.tag}</div>
              </button>
            );
          })}
        </div>

        {/* Active design description */}
        <div style={{ background: '#151519', border: '1px solid #27272a', borderRadius: 14, padding: '16px 18px', marginBottom: 26 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 5 }}>
            {active + 1}. {d.name} <span style={{ color: '#71717a', fontWeight: 600, fontSize: 13 }}>— {d.tag}</span>
          </div>
          <p style={{ margin: 0, fontSize: 13.5, color: '#9a9aa3', lineHeight: 1.65 }}>{d.desc}</p>
        </div>

        {/* Viewports */}
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Desktop */}
          <div style={{ flex: '1 1 820px', minWidth: 820 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: 1 }}>Desktop</span>
              <span style={{ fontSize: 11.5, color: '#52525b' }}>responsive · 1280px+</span>
            </div>
            <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid #27272a', boxShadow: '0 10px 40px rgba(0,0,0,.5)', background: '#fff' }}>
              <iframe
                key={d.id + '-d'}
                srcDoc={d.html}
                style={{ width: '100%', height: DESKTOP_H, border: 'none', display: 'block' }}
                title={d.name + ' desktop'}
              />
            </div>
          </div>

          {/* Mobile (phone frame) */}
          <div style={{ flex: '0 0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: 1 }}>Mobile</span>
              <span style={{ fontSize: 11.5, color: '#52525b' }}>390 × 844</span>
            </div>
            <div style={{ width: MOBILE_W + 20, background: '#1a1a1a', borderRadius: 44, padding: 10, boxShadow: '0 10px 40px rgba(0,0,0,.5)', border: '1px solid #2a2a2a' }}>
              <div style={{ position: 'relative', borderRadius: 34, overflow: 'hidden', background: '#000' }}>
                <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 120, height: 22, background: '#1a1a1a', borderBottomLeftRadius: 14, borderBottomRightRadius: 14, zIndex: 5 }} />
                <iframe
                  key={d.id + '-m'}
                  srcDoc={d.html}
                  style={{ width: MOBILE_W, height: MOBILE_H, border: 'none', display: 'block' }}
                  title={d.name + ' mobile'}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
