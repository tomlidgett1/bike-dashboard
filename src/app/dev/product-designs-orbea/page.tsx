'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { ViewportPreview } from './_components/viewport-preview';

const OrbitBasqueDesign = dynamic(() => import('./_components/designs/orbit-basque').then((m) => m.OrbitBasqueDesign), { ssr: false });
const WireToRideDesign = dynamic(() => import('./_components/designs/wire-to-ride').then((m) => m.WireToRideDesign), { ssr: false });
const GeometryLabDesign = dynamic(() => import('./_components/designs/geometry-lab').then((m) => m.GeometryLabDesign), { ssr: false });
const ScrollChronicleDesign = dynamic(() => import('./_components/designs/scroll-chronicle').then((m) => m.ScrollChronicleDesign), { ssr: false });
const MyOStudioDesign = dynamic(() => import('./_components/designs/myo-studio').then((m) => m.MyOStudioDesign), { ssr: false });

const RESEARCH = [
  {
    title: 'Progressive 3D reveal',
    body: 'World-class product pages never block LCP with WebGL. Static hero first, Three.js lazy-loaded with Suspense — users see price and CTA immediately.',
  },
  {
    title: 'Orbea-grade storytelling',
    body: 'Orbea.com leads with heritage, frame technology and MyO personalisation. We mirror that: Basque provenance, OMX carbon narrative, live colour config.',
  },
  {
    title: 'Sticky conversion path',
    body: 'CTA, price and escrow trust stay visible while users explore 3D. Mobile sticky buy bars; desktop glass panels — never hunt for "Buy".',
  },
  {
    title: 'Interaction with purpose',
    body: 'Orbit controls, wireframe morph, hotspots and scroll chapters each communicate product value — not decoration for its own sake.',
  },
  {
    title: 'Device-aware performance',
    body: 'Reduced DPR caps, damping controls, and optional wireframe fallbacks keep 60fps on mobile without sacrificing the premium feel.',
  },
];

const DESIGNS = [
  {
    id: 'orbit-basque',
    name: 'Orbit Basque',
    tag: 'Cinematic · Full-viewport 3D',
    desc: 'Auto-orbiting procedural Orca Aero on a starfield with frosted-glass buy panel. Orbea heritage up front — employee-owned Basque craftsmanship meets Yellow Jersey escrow.',
    Component: OrbitBasqueDesign,
  },
  {
    id: 'wire-to-ride',
    name: 'Wire to Ride',
    tag: 'Engineering · Morph slider',
    desc: 'Drag to morph wireframe engineering view into solid OMX carbon. Tells the frame story the way Orbea\'s factory pages do — transparency builds trust on high-ticket bikes.',
    Component: WireToRideDesign,
  },
  {
    id: 'geometry-lab',
    name: 'Geometry Lab',
    tag: 'Interactive · Hotspot annotations',
    desc: 'Tap frame, wheels or drivetrain hotspots to highlight 3D components with spec copy. OrbitControls for exploration — Apple Product Page clarity with bike-specific depth.',
    Component: GeometryLabDesign,
  },
  {
    id: 'scroll-chronicle',
    name: 'Scroll Chronicle',
    tag: 'Immersive · Scroll-driven chapters',
    desc: 'Scroll advances cinematic chapters — Aero DNA, OMX Carbon, OQUO Wheels, 105 Di2 — each with unique camera angle and rotation speed. Nike/Apple scroll storytelling for the Orca Aero.',
    Component: ScrollChronicleDesign,
  },
  {
    id: 'myo-studio',
    name: 'MyO Studio',
    tag: 'Configurator · Live colour swap',
    desc: 'Orbea MyO-inspired frame colour picker with real-time Three.js material updates, size selector and configured-build CTA. Premium serif layout on warm paper tones.',
    Component: MyOStudioDesign,
  },
] as const;

function DevTabs() {
  const tab = (href: string, label: string, active: boolean) => (
    <a
      href={href}
      className={`rounded-md px-3 py-1.5 text-sm font-bold no-underline transition-colors ${
        active ? 'bg-[#ffde59] text-black' : 'border border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-white'
      }`}
    >
      {label}
    </a>
  );

  return (
    <div className="mb-7 flex flex-wrap gap-2">
      {tab('/dev/email-preview', 'Email Templates', false)}
      {tab('/dev/product-designs', 'Product Pages v1', false)}
      {tab('/dev/product-designs-orbea', 'Orbea 3D v2', true)}
    </div>
  );
}

export default function ProductDesignsOrbeaPage() {
  const [active, setActive] = React.useState(0);
  const [showResearch, setShowResearch] = React.useState(true);
  const design = DESIGNS[active];
  const ActiveDesign = design.Component;

  return (
    <div className="min-h-screen bg-[#0e0e11] px-6 py-9 pb-20 font-sans text-white">
      <div className="mx-auto max-w-[1680px]">
        <DevTabs />

        <div className="mb-6">
          <h1 className="mb-2 text-3xl font-extrabold tracking-tight">Orbea 3D Product Pages</h1>
          <p className="max-w-3xl text-sm leading-relaxed text-zinc-400">
            Five world-class product page concepts built around the Orbea Orca Aero M30i — each with Three.js
            WebGL experiences, fully responsive layouts, and Yellow Jersey marketplace conversion patterns.
            Preview at desktop and mobile side by side. Dev-only; not wired to live routes.
          </p>
        </div>

        {/* Research panel */}
        <div className="mb-6 overflow-hidden rounded-md border border-zinc-800 bg-white">
          <button
            type="button"
            onClick={() => setShowResearch((v) => !v)}
            className="flex w-full items-center justify-between px-5 py-4 text-left"
          >
            <div>
              <div className="text-sm font-extrabold text-zinc-900">Research — what makes a world-class product page</div>
              <div className="mt-0.5 text-xs text-zinc-500">Orbea.com · Apple · Nike · Three.js e-commerce best practices</div>
            </div>
            <span className="text-sm text-zinc-400">{showResearch ? '−' : '+'}</span>
          </button>
          {showResearch && (
            <div className="grid gap-px border-t border-zinc-100 bg-zinc-100 md:grid-cols-2 lg:grid-cols-3">
              {RESEARCH.map((item) => (
                <div key={item.title} className="bg-white px-5 py-4">
                  <div className="text-xs font-bold uppercase tracking-wider text-zinc-500">{item.title}</div>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-700">{item.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Design selector — large tabs */}
        <div className="mb-5 flex flex-wrap gap-2">
          {DESIGNS.map((d, i) => {
            const on = i === active;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setActive(i)}
                className={`min-w-[160px] rounded-md border px-4 py-3 text-left transition-colors ${
                  on ? 'border-[#ffde59] bg-zinc-900' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-600'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-md bg-[#ffde59] text-[10px] font-black text-black">
                    {i + 6}
                  </span>
                  <span className="text-sm font-extrabold">{d.name}</span>
                </div>
                <div className={`mt-1.5 text-[11px] font-semibold ${on ? 'text-[#ffde59]' : 'text-zinc-500'}`}>{d.tag}</div>
              </button>
            );
          })}
        </div>

        <div className="mb-7 rounded-md border border-zinc-800 bg-zinc-950 px-5 py-4">
          <div className="text-base font-extrabold">
            {active + 6}. {design.name}
            <span className="ml-2 text-sm font-semibold text-zinc-500">— {design.tag}</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">{design.desc}</p>
        </div>

        <ViewportPreview title={design.name}>
          <ActiveDesign />
        </ViewportPreview>
      </div>
    </div>
  );
}
