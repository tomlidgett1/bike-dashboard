'use client';

import * as React from 'react';
import { ORBEA } from '../../_lib/orbea-product-data';
import { SceneCanvas } from '../scene-canvas';

function BuyBar({ compact }: { compact?: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 ${compact ? 'fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-black/90 px-4 py-3 backdrop-blur-md md:hidden' : 'hidden'}`}
    >
      <div className="shrink-0">
        <div className="text-lg font-extrabold text-[#ffde59]">{ORBEA.price}</div>
        <div className="text-[11px] text-zinc-500 line-through">{ORBEA.was}</div>
      </div>
      <button type="button" className="flex-1 rounded-md border border-white/20 py-3 text-sm font-bold text-white">
        Offer
      </button>
      <button type="button" className="flex-[1.4] rounded-md bg-[#ffde59] py-3 text-sm font-bold text-black">
        Buy Now
      </button>
    </div>
  );
}

/** Design 1 — Orbit Basque: full-viewport 3D hero, auto-orbit, particle stars, glass buy panel */
export function OrbitBasqueDesign() {
  return (
    <div className="relative min-h-[920px] overflow-hidden bg-[#050505] text-white md:min-h-[780px]">
      <div className="absolute inset-0">
        <SceneCanvas
          frameColor="#141414"
          accentColor="#e63946"
          autoRotate
          rotateSpeed={0.28}
          showStars
          showFloat
          cameraPosition={[0, 0.5, 3.4]}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/90" />
      </div>

      <nav className="relative z-10 flex items-center justify-between px-5 py-4 md:px-8">
        <div className="flex items-center gap-2 text-sm font-extrabold">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-[#ffde59] text-xs font-black text-black">YJ</span>
          Yellow Jersey
        </div>
        <div className="flex gap-2 text-zinc-400">
          <button type="button" className="grid h-9 w-9 place-items-center rounded-md border border-white/10 bg-white/5 text-sm">♡</button>
          <button type="button" className="grid h-9 w-9 place-items-center rounded-md border border-white/10 bg-white/5 text-sm">↗</button>
        </div>
      </nav>

      <div className="relative z-10 mx-auto grid max-w-6xl gap-6 px-5 pb-28 pt-4 md:grid-cols-[1fr_320px] md:items-end md:px-8 md:pb-12">
        <div>
          <div className="mb-3 flex items-center gap-3">
            <img src="/brands/orbea-logo.svg" alt="Orbea" className="h-5 brightness-0 invert opacity-90" />
            <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#e63946]">{ORBEA.heritage}</span>
          </div>
          <h1 className="text-4xl font-black uppercase leading-[0.92] tracking-tight md:text-6xl">
            Orca
            <br />
            Aero M30i
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-zinc-400 md:text-base">{ORBEA.blurb.slice(0, 140)}…</p>
        </div>

        <div className="rounded-md border border-white/15 bg-white/10 p-5 backdrop-blur-xl">
          <div className="text-3xl font-extrabold tracking-tight">{ORBEA.price}</div>
          <div className="mt-1 text-sm text-zinc-400">
            <span className="line-through">{ORBEA.was}</span>
            <span className="ml-2 rounded-md bg-[#ffde59]/20 px-2 py-0.5 text-xs font-bold text-[#ffde59]">−{ORBEA.off}</span>
          </div>
          <div className="mt-2 text-xs font-semibold text-emerald-400">● {ORBEA.condition} · {ORBEA.year}</div>
          <button type="button" className="mt-4 w-full rounded-md bg-[#ffde59] py-3.5 text-sm font-extrabold text-black">
            Buy Now
          </button>
          <button type="button" className="mt-2 w-full rounded-md border border-white/20 py-3 text-sm font-bold text-white">
            Make Offer
          </button>
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/10 pt-4 text-xs">
            <div><div className="text-zinc-500">Size</div><div className="font-bold">{ORBEA.size}</div></div>
            <div><div className="text-zinc-500">Weight</div><div className="font-bold">{ORBEA.weight}</div></div>
          </div>
        </div>
      </div>

      <BuyBar compact />
    </div>
  );
}
