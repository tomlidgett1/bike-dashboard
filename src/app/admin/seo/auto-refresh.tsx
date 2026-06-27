'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// Polls the server component every `intervalMs` so the cockpit shows a run
// progressing in real time. Toggleable so it isn't refreshing while you read.
export function AutoRefresh({ intervalMs = 20000 }: { intervalMs?: number }) {
  const [on, setOn] = useState(true);
  const [tick, setTick] = useState(0);
  const router = useRouter();

  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => {
      router.refresh();
      setTick((t) => t + 1);
    }, intervalMs);
    return () => clearInterval(id);
  }, [on, intervalMs, router]);

  return (
    <button
      onClick={() => setOn((v) => !v)}
      className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 transition hover:border-gray-300"
      title="Auto-refresh the dashboard"
    >
      <span className={`h-2 w-2 rounded-full ${on ? 'bg-green-500' : 'bg-gray-300'}`} />
      {on ? `Live · every ${Math.round(intervalMs / 1000)}s` : 'Paused'}
      {on && tick > 0 && <span className="text-gray-400">({tick})</span>}
    </button>
  );
}
