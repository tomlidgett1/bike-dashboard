// Cycling blog agent — internal cockpit. Admin-only (tom@lidgett.net).
import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { BlogAgentPanel } from './blog-agent-panel';
import type { BlogAgentRun, BlogPost } from '@/lib/blog/types';

export const dynamic = 'force-dynamic';

function since(d: string | null): string {
  if (!d) return '—';
  const s = Math.round((Date.now() - Date.parse(d)) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function statusColor(s: string): string {
  return s === 'completed' || s === 'published'
    ? 'text-green-700 bg-green-50'
    : s === 'error' || s === 'failed'
      ? 'text-red-700 bg-red-50'
      : s === 'running'
        ? 'text-blue-700 bg-blue-50'
        : 'text-gray-600 bg-gray-100';
}

function Card({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Badge({ children, status }: { children: ReactNode; status: string }) {
  return (
    <span className={`inline-block rounded-md px-1.5 py-0.5 text-[11px] font-medium ${statusColor(status)}`}>
      {children}
    </span>
  );
}

export default async function BlogAdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== 'tom@lidgett.net') {
    redirect('/marketplace');
  }

  const db = createServiceRoleClient();

  const [{ data: posts }, { data: runs }] = await Promise.all([
    db.from('blog_posts').select('*').order('created_at', { ascending: false }).limit(20),
    db.from('blog_agent_runs').select('*').order('started_at', { ascending: false }).limit(15),
  ]);

  const publishedCount = (posts ?? []).filter((p) => p.status === 'published').length;
  const runningRun = (runs ?? []).find((r) => r.status === 'running');

  return (
    <div className="min-h-screen bg-[#f7f7f4]">
      <header className="border-b border-black/[0.06] bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Admin</p>
            <h1 className="text-xl font-semibold text-gray-900">Blog agent</h1>
          </div>
          <Link
            href="/admin/seo"
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            SEO agent →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-5 py-8 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-gray-200 bg-white p-4">
            <div className="text-2xl font-bold text-gray-900">{publishedCount}</div>
            <div className="text-xs font-medium text-gray-500">Published posts</div>
          </div>
          <div className="rounded-md border border-gray-200 bg-white p-4">
            <div className="text-2xl font-bold text-gray-900">{(runs ?? []).length}</div>
            <div className="text-xs font-medium text-gray-500">Agent runs</div>
          </div>
          <div className="rounded-md border border-gray-200 bg-white p-4">
            <div className="text-2xl font-bold text-gray-900">
              {runningRun ? 'Active' : 'Idle'}
            </div>
            <div className="text-xs font-medium text-gray-500">Agent status</div>
          </div>
        </div>

        <BlogAgentPanel />

        <Card title="Published articles" sub="Most recent first">
          {(posts ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No posts yet — run the agent above.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {(posts as BlogPost[]).map((post) => (
                <div key={post.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/blog/${post.slug}`}
                      target="_blank"
                      className="text-sm font-medium text-gray-900 hover:underline"
                    >
                      {post.title}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-gray-400">{post.excerpt}</p>
                    {post.topic && (
                      <p className="mt-1 text-[11px] text-gray-400">Topic: {post.topic}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge status={post.status}>{post.status}</Badge>
                    <span className="text-[11px] text-gray-400">{since(post.published_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Agent run history" sub="Daily cron at 7:00am Melbourne · manual runs below">
          {(runs ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No runs yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-400">
                    <th className="pb-2 pr-4 font-medium">When</th>
                    <th className="pb-2 pr-4 font-medium">Trigger</th>
                    <th className="pb-2 pr-4 font-medium">Topic</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(runs as BlogAgentRun[]).map((run) => (
                    <tr key={run.id}>
                      <td className="py-2.5 pr-4 text-gray-600">{since(run.started_at)}</td>
                      <td className="py-2.5 pr-4 capitalize text-gray-600">{run.trigger_source}</td>
                      <td className="max-w-[200px] truncate py-2.5 pr-4 text-gray-600">
                        {run.custom_topic || run.resolved_topic || '—'}
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge status={run.status}>{run.status}</Badge>
                      </td>
                      <td className="py-2.5 text-gray-500">
                        {run.duration_ms ? `${Math.round(run.duration_ms / 1000)}s` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
