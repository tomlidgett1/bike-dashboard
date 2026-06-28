'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Play, Sparkles } from 'lucide-react';

export function BlogAgentPanel() {
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const router = useRouter();

  async function runAgent() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/blog/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: body.error || 'Agent failed to start' });
      } else {
        setMessage({
          type: 'success',
          text: body.slug
            ? `Published · /blog/${body.slug}`
            : 'Article published successfully',
        });
        setTopic('');
        setTimeout(() => router.refresh(), 1500);
      }
    } catch {
      setMessage({ type: 'error', text: 'Could not reach the blog agent' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-md border border-gray-200 bg-white p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-100">
          <Sparkles className="h-5 w-5 text-gray-700" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-gray-900">Blog writer agent</h2>
          <p className="mt-1 text-sm text-gray-500">
            Researches what&apos;s topical in cycling via web search, then writes an opinionated daily
            column with GPT-5.5. Runs automatically every day at 7:00am Melbourne time, or on demand below.
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <div>
          <label htmlFor="blog-topic" className="block text-sm font-medium text-gray-700">
            Topic <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            id="blog-topic"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Why gravel geometry has gone too far, or leave blank for today's hot take"
            className="mt-1.5 w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
            disabled={loading}
          />
          <p className="mt-1.5 text-xs text-gray-400">
            Leave empty and the agent will pick the most compelling cycling story of the day.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={runAgent}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Writing… (2–4 min)
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Run agent now
              </>
            )}
          </button>
          <Link
            href="/blog"
            target="_blank"
            className="text-sm text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline"
          >
            View public blog →
          </Link>
        </div>

        {message && (
          <div
            className={`rounded-md border px-4 py-3 text-sm ${
              message.type === 'success'
                ? 'border-green-200 bg-white text-green-800'
                : 'border-red-200 bg-white text-red-700'
            }`}
          >
            {message.text}
          </div>
        )}
      </div>
    </section>
  );
}
