'use client';

import * as React from 'react';

const DESKTOP_H = 920;
const MOBILE_W = 390;
const MOBILE_H = 780;

export function ViewportPreview({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-7">
      <div className="min-w-0 flex-[1_1_820px]">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Desktop</span>
          <span className="text-[11px] text-zinc-600">1280px+ responsive</span>
        </div>
        <div className="overflow-hidden rounded-md border border-zinc-800 bg-white shadow-2xl">
          <div style={{ height: DESKTOP_H, overflow: 'auto' }}>{children}</div>
        </div>
      </div>

      <div className="shrink-0">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Mobile</span>
          <span className="text-[11px] text-zinc-600">390 × 844</span>
        </div>
        <div
          className="rounded-[2.75rem] border border-zinc-700 bg-zinc-900 p-2.5 shadow-2xl"
          style={{ width: MOBILE_W + 20 }}
        >
          <div className="relative overflow-hidden rounded-[2.1rem] bg-black">
            <div className="pointer-events-none absolute left-1/2 top-0 z-10 h-5 w-[120px] -translate-x-1/2 rounded-b-2xl bg-zinc-900" />
            <div
              className="overflow-auto bg-white"
              style={{ width: MOBILE_W, height: MOBILE_H }}
              title={title}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
