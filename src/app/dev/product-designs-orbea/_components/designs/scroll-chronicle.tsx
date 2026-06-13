'use client';

import * as React from 'react';
import { ORBEA, ORBEA_IMAGES } from '../../_lib/orbea-product-data';
import { SceneCanvas } from '../scene-canvas';

const CHAPTERS = [
  { title: 'Aero DNA', body: 'Orca Aero tubeset shaped in the wind tunnel — sprint stability without the weight penalty.', rotateSpeed: 0.12, camera: [0, 0.55, 3.5] as [number, number, number], accent: '#e63946' },
  { title: 'OMX Carbon', body: ORBEA.highlights[0].detail, rotateSpeed: 0.35, camera: [0.8, 0.4, 2.8] as [number, number, number], accent: '#ffde59' },
  { title: 'OQUO Wheels', body: ORBEA.highlights[3].detail, rotateSpeed: 0.2, camera: [-0.6, 0.3, 3.2] as [number, number, number], accent: '#7eb8da' },
  { title: '105 Di2', body: ORBEA.highlights[2].detail, rotateSpeed: 0.28, camera: [0, 0.65, 2.6] as [number, number, number], accent: '#e63946' },
];

/** Design 4 — Scroll Chronicle: scroll-driven 3D chapters with cinematic sections */
export function ScrollChronicleDesign() {
  const [chapter, setChapter] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const getScrollParent = (node: HTMLElement): HTMLElement | Window => {
      let parent = node.parentElement;
      while (parent) {
        const { overflowY } = getComputedStyle(parent);
        if (overflowY === 'auto' || overflowY === 'scroll') return parent;
        parent = parent.parentElement;
      }
      return window;
    };

    const scrollRoot = getScrollParent(el);

    const onScroll = () => {
      const rootTop =
        scrollRoot instanceof Window ? 0 : (scrollRoot as HTMLElement).getBoundingClientRect().top;
      const elTop = el.getBoundingClientRect().top - rootTop;
      const scrollable =
        scrollRoot instanceof Window
          ? window.innerHeight
          : (scrollRoot as HTMLElement).clientHeight;
      const total = el.offsetHeight - scrollable;
      const scrolled = Math.max(0, -elTop);
      const progress = total > 0 ? Math.min(1, scrolled / total) : 0;
      const idx = Math.min(CHAPTERS.length - 1, Math.floor(progress * CHAPTERS.length));
      setChapter(idx);
    };

    scrollRoot.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => scrollRoot.removeEventListener('scroll', onScroll);
  }, []);

  const current = CHAPTERS[chapter];

  return (
    <div ref={containerRef} className="relative bg-black text-white" style={{ height: `${CHAPTERS.length * 100}vh` }}>
      <div className="sticky top-0 h-screen overflow-hidden">
        <div className="absolute inset-0">
          <SceneCanvas
            key={chapter}
            frameColor="#121212"
            accentColor={current.accent}
            autoRotate
            rotateSpeed={current.rotateSpeed}
            cameraPosition={current.camera}
            showStars
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/80 via-black/30 to-transparent" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/40" />
        </div>

        <nav className="relative z-10 flex items-center justify-between px-5 py-5 md:px-10">
          <div className="flex items-center gap-2 text-sm font-extrabold">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-[#ffde59] text-xs font-black text-black">YJ</span>
            Yellow Jersey
          </div>
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">Scroll Chronicle</div>
        </nav>

        <div className="relative z-10 flex h-[calc(100vh-72px)] flex-col justify-between px-5 pb-8 md:px-10 md:pb-12">
          <div className="max-w-xl">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.35em] text-[#ffde59]">
              {ORBEA.brand} · Chapter {chapter + 1}/{CHAPTERS.length}
            </div>
            <h1 className="text-4xl font-black leading-none tracking-tight transition-all duration-500 md:text-6xl">
              {current.title}
            </h1>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-zinc-300 md:text-base">{current.body}</p>
          </div>

          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="flex gap-2">
              {CHAPTERS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 rounded-full transition-all duration-300 ${i === chapter ? 'w-10 bg-[#ffde59]' : 'w-4 bg-white/20'}`}
                />
              ))}
            </div>

            <div className="rounded-md border border-white/15 bg-black/40 p-5 backdrop-blur-md md:w-72">
              <div className="text-xs text-zinc-400">{ORBEA.full}</div>
              <div className="mt-1 text-2xl font-extrabold text-[#ffde59]">{ORBEA.price}</div>
              <button type="button" className="mt-3 w-full rounded-md bg-[#ffde59] py-3 text-sm font-extrabold text-black">
                Buy Now
              </button>
            </div>
          </div>
        </div>

        <div className="absolute bottom-6 left-1/2 z-10 hidden -translate-x-1/2 text-xs font-semibold text-zinc-500 md:block">
          Scroll to explore ↓
        </div>
      </div>

      {/* Feature strip — visible after scroll on mobile via second panel */}
      <div className="relative z-20 bg-black px-5 py-16 md:hidden">
        <div className="grid grid-cols-2 gap-3">
          {[ORBEA_IMAGES.side, ORBEA_IMAGES.detail, ORBEA_IMAGES.wheel, ORBEA_IMAGES.cockpit].map((src, i) => (
            <div
              key={i}
              className="aspect-[4/3] rounded-md bg-cover bg-center"
              style={{ backgroundImage: `url('${src}')` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
