'use client';

import * as React from 'react';
import { ORBEA } from '../../_lib/orbea-product-data';
import { SceneCanvas } from '../scene-canvas';

const HOTSPOTS = [
  { id: 'frame' as const, label: 'OMX Carbon', x: '48%', y: '42%', copy: ORBEA.highlights[0].detail },
  { id: 'wheels' as const, label: 'OQUO RP45', x: '18%', y: '58%', copy: ORBEA.highlights[3].detail },
  { id: 'drivetrain' as const, label: '105 Di2', x: '52%', y: '62%', copy: ORBEA.highlights[2].detail },
];

/** Design 3 — Geometry Lab: interactive 3D with annotation hotspots */
export function GeometryLabDesign() {
  const [active, setActive] = React.useState<(typeof HOTSPOTS)[number]['id'] | null>('frame');

  const activeSpot = HOTSPOTS.find((h) => h.id === active);

  return (
    <div className="min-h-[900px] bg-[#f4f5f7] text-[#0f172a]">
      <header className="border-b border-[#e8eaee] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 md:px-8">
          <div className="flex items-center gap-2 text-sm font-extrabold">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-[#ffde59] text-xs font-black">YJ</span>
            Yellow Jersey
          </div>
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-500">Geometry Lab</div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
        <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">{ORBEA.brand} · {ORBEA.cat}</div>
            <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">{ORBEA.name}</h1>
          </div>
          <div className="text-2xl font-extrabold">{ORBEA.price}</div>
        </div>

        <div className="grid gap-6 md:grid-cols-[1fr_340px]">
          <div className="relative overflow-hidden rounded-md border border-[#e8eaee] bg-white shadow-sm">
            <div className="relative h-[420px] md:h-[520px]">
              <SceneCanvas
                frameColor="#1a1a1a"
                accentColor="#e63946"
                autoRotate={!active}
                rotateSpeed={0.18}
                enableControls
                highlightPart={active}
                cameraPosition={[0, 0.5, 3.3]}
              />

              {HOTSPOTS.map((spot) => (
                <button
                  key={spot.id}
                  type="button"
                  onClick={() => setActive(spot.id === active ? null : spot.id)}
                  className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: spot.x, top: spot.y }}
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-black transition-all ${
                      active === spot.id
                        ? 'border-[#ffde59] bg-[#ffde59] text-black scale-110 shadow-lg'
                        : 'border-[#0f172a] bg-white text-[#0f172a] hover:border-[#ffde59]'
                    }`}
                  >
                    {spot.id === 'frame' ? 'F' : spot.id === 'wheels' ? 'W' : 'D'}
                  </span>
                </button>
              ))}
            </div>

            <div className="border-t border-[#e8eaee] px-5 py-4 text-xs text-zinc-500">
              Tap hotspots or drag to orbit · {ORBEA.condition} · {ORBEA.size}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-md border border-[#e8eaee] bg-white p-5 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-500">Active component</div>
              <div className="mt-2 text-xl font-extrabold">{activeSpot?.label ?? 'Select a hotspot'}</div>
              <p className="mt-3 text-sm leading-relaxed text-zinc-600">
                {activeSpot?.copy ?? 'Explore the Orca Aero by selecting frame, wheels or drivetrain on the 3D model.'}
              </p>
            </div>

            <div className="rounded-md border border-[#e8eaee] bg-white p-5 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-500">Specifications</div>
              <dl className="mt-3 space-y-2 text-sm">
                {[
                  ['Frame', ORBEA.frame],
                  ['Groupset', ORBEA.groupset],
                  ['Wheels', ORBEA.wheels],
                  ['Weight', ORBEA.weight],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-[#f1f3f5] pb-2">
                    <dt className="text-zinc-500">{k}</dt>
                    <dd className="font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <button type="button" className="w-full rounded-md bg-[#ffde59] py-3.5 text-sm font-extrabold text-black">
              Buy Now — {ORBEA.price}
            </button>
            <button type="button" className="w-full rounded-md border border-[#d8dde3] bg-white py-3 text-sm font-bold">
              Make Offer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
