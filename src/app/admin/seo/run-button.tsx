'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function RunAgentButton() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/seo/run', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) {
        setMsg(body.error || 'Failed to start');
      } else if (body.skipped) {
        setMsg(`Skipped — ${body.reason}`);
      } else {
        setMsg(`Run started · ${body.enqueued ?? 0} tasks queued`);
        setTimeout(() => router.refresh(), 2000);
      }
    } catch {
      setMsg('Failed to reach the agent');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={run}
        disabled={loading}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-50"
      >
        {loading ? 'Starting…' : 'Run agent now'}
      </button>
      {msg && <span className="text-sm text-gray-600">{msg}</span>}
    </div>
  );
}
