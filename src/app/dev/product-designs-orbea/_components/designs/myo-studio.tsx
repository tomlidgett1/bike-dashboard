'use client';

import * as React from 'react';
import { ORBEA, type OrbeaColor } from '../../_lib/orbea-product-data';
import { SceneCanvas } from '../scene-canvas';

/** Design 5 — MyO Studio: Orbea-inspired real-time colour configurator */
export function MyOStudioDesign() {
  const [color, setColor] = React.useState<OrbeaColor>(ORBEA.colors[0]);
  const [size, setSize] = React.useState<string>(ORBEA.size);

  return (
    <div className="min-h-[920px] bg-[#faf8f5] text-[#1a1a1a]">
      <header className="border-b border-[#e2dcd0] bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 md:px-8">
          <div className="flex items-center gap-2 text-sm font-extrabold">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-[#ffde59] text-xs font-black">YJ</span>
            Yellow Jersey
          </div>
          <div className="flex items-center gap-3">
            <img src="/brands/orbea-logo.svg" alt="Orbea" className="h-5" />
            <span className="hidden text-[10px] font-bold uppercase tracking-[0.25em] text-[#9c9488] md:inline">MyO Studio</span>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-0 md:grid-cols-[1.1fr_1fr]">
        <div className="relative min-h-[380px] border-b border-[#e2dcd0] md:min-h-[640px] md:border-b-0 md:border-r">
          <SceneCanvas
            frameColor={color.hex}
            accentColor={color.accent}
            autoRotate
            rotateSpeed={0.25}
            enableControls
            cameraPosition={[0, 0.5, 3.2]}
            ambient={0.55}
          />
          <div className="pointer-events-none absolute left-5 top-5 rounded-md bg-white/90 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[#9c9488] shadow-sm backdrop-blur">
            Live preview
          </div>
        </div>

        <div className="flex flex-col justify-center px-5 py-10 md:px-12">
          <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#9c9488]">{ORBEA.brand} · Configure</div>
          <h1 className="mt-2 font-serif text-4xl italic tracking-tight md:text-5xl">{ORBEA.name}</h1>
          <p className="mt-3 text-sm text-[#6b6357]">{ORBEA.variant} · {ORBEA.year}</p>

          <div className="mt-8">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#9c9488]">Frame colour</div>
            <div className="mt-3 flex flex-wrap gap-3">
              {ORBEA.colors.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition-all ${
                    color.id === c.id ? 'border-[#1a1a1a] bg-white shadow-sm' : 'border-[#e2dcd0] bg-transparent'
                  }`}
                >
                  <span className="h-5 w-5 rounded-full border border-black/10" style={{ background: c.hex }} />
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#9c9488]">Frame size</div>
            <div className="mt-3 flex gap-2">
              {['51 cm', '53 cm', '55 cm', '57 cm'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSize(s)}
                  className={`rounded-md border px-3 py-2 text-xs font-bold ${
                    size === s ? 'border-[#1a1a1a] bg-[#1a1a1a] text-white' : 'border-[#e2dcd0] bg-white'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-10 border-t border-[#e2dcd0] pt-8">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-3xl font-extrabold">{ORBEA.price}</div>
                <div className="text-sm text-[#9c9488] line-through">{ORBEA.was}</div>
              </div>
              <div className="text-right text-xs text-[#6b6357]">
                {color.name} · {size}
              </div>
            </div>
            <button type="button" className="mt-5 w-full rounded-md bg-[#ffde59] py-3.5 text-sm font-extrabold text-black">
              Buy configured build
            </button>
            <button type="button" className="mt-2 w-full rounded-md border border-[#c9c1b3] bg-transparent py-3 text-sm font-bold">
              Save configuration
            </button>
          </div>

          <p className="mt-6 text-xs italic leading-relaxed text-[#8a8377]">
            Inspired by Orbea MyO — customise frame colour before purchase. Payment held in escrow until delivery confirmed.
          </p>
        </div>
      </div>

      {/* Mobile sticky bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center gap-3 border-t border-[#e2dcd0] bg-[#faf8f5]/95 px-4 py-3 backdrop-blur md:hidden">
        <div className="shrink-0 text-lg font-extrabold">{ORBEA.price}</div>
        <button type="button" className="flex-1 rounded-md bg-[#ffde59] py-3 text-sm font-extrabold text-black">
          Buy
        </button>
      </div>
    </div>
  );
}
