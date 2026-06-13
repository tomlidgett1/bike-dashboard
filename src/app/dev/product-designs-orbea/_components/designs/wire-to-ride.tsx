'use client';

import * as React from 'react';
import { ORBEA } from '../../_lib/orbea-product-data';
import { SceneCanvas } from '../scene-canvas';

/** Design 2 — Wire to Ride: wireframe-to-solid morph slider, Basque forge storytelling */
export function WireToRideDesign() {
  const [morph, setMorph] = React.useState(72);

  const wireOpacity = Math.max(0, 1 - morph / 100);
  const solidOpacity = morph / 100;

  return (
    <div className="min-h-[900px] bg-[#0c0c0c] text-white">
      <div className="border-b border-white/10 px-5 py-4 md:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-extrabold">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-[#ffde59] text-xs font-black text-black">YJ</span>
            Yellow Jersey
          </div>
          <img src="/brands/orbea-logo.svg" alt="Orbea" className="h-6 brightness-0 invert" />
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-0 md:grid-cols-2">
        <div className="relative min-h-[420px] md:min-h-[560px]">
          <div className="absolute inset-0 opacity-100">
            <SceneCanvas
              frameColor="#ffde59"
              accentColor="#e63946"
              wireframe
              opacity={wireOpacity || 0.01}
              autoRotate={false}
              rotateSpeed={0}
              cameraPosition={[0, 0.55, 3.1]}
            />
          </div>
          <div className="absolute inset-0">
            <SceneCanvas
              frameColor="#1a1a1a"
              accentColor="#e63946"
              wireframe={false}
              opacity={solidOpacity}
              autoRotate
              rotateSpeed={0.22}
              cameraPosition={[0, 0.55, 3.1]}
            />
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0c0c0c] via-transparent to-transparent" />
        </div>

        <div className="flex flex-col justify-center px-5 py-10 md:px-12">
          <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#ffde59]">Basque Forge</div>
          <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">{ORBEA.full}</h1>
          <p className="mt-4 text-sm leading-relaxed text-zinc-400">{ORBEA.blurb}</p>

          <div className="mt-8 rounded-md border border-white/10 bg-white/5 p-5">
            <div className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-zinc-400">
              <span>Wireframe</span>
              <span>OMX Carbon</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={morph}
              onChange={(e) => setMorph(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-md bg-zinc-800 accent-[#ffde59]"
            />
            <p className="mt-3 text-xs text-zinc-500">
              Drag to reveal how Orbea&apos;s monocoque carbon transforms from engineering wireframe to race-ready frame.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <div className="text-3xl font-extrabold">{ORBEA.price}</div>
            <button type="button" className="rounded-md bg-[#ffde59] px-6 py-3 text-sm font-extrabold text-black">
              Acquire — {ORBEA.price}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border-t border-white/10 bg-white/10 md:grid-cols-4">
        {ORBEA.highlights.map((h) => (
          <div key={h.label} className="bg-[#0c0c0c] px-5 py-6">
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{h.label}</div>
            <div className="mt-1 text-lg font-extrabold">{h.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
