// Search Dominance Agent — internal cockpit. Admin-only (tom@lidgett.net).
// Reads the whole control plane with the service-role client and surfaces the
// full process: live pipeline, runs, opportunities, pages, held drafts (with the
// exact reasons they're not live), GSC performance, keyword universe, and
// Google's index view. Resilient: any missing table/empty result degrades to an
// empty panel instead of 500-ing the page.
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { RunAgentButton } from './run-button';
import { AutoRefresh } from './auto-refresh';

export const dynamic = 'force-dynamic';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---- resilient fetch helpers ------------------------------------------------
async function pageCount(db: any, apply: (q: any) => any): Promise<number> {
  try { const { count } = await apply(db.from('seo_pages').select('id', { count: 'exact', head: true })); return count ?? 0; }
  catch { return 0; }
}
async function tableCount(db: any, table: string): Promise<number> {
  try { const { count } = await db.from(table).select('id', { count: 'exact', head: true }); return count ?? 0; }
  catch { return 0; }
}
async function rows<T = any>(p: any): Promise<T[]> {
  try { const { data, error } = await p; return error ? [] : (data ?? []); } catch { return []; }
}
async function rpc(db: any, fn: string, args?: any): Promise<any[]> {
  try { const { data, error } = await db.rpc(fn, args); return error ? [] : (data ?? []); } catch { return []; }
}

// ---- formatting -------------------------------------------------------------
function since(d: string | null): string {
  if (!d) return '—';
  const s = Math.round((Date.now() - Date.parse(d)) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
function dur(a: string | null, b: string | null): string {
  if (!a || !b) return '—';
  const s = Math.round(Math.abs(Date.parse(b) - Date.parse(a)) / 1000);
  return s < 60 ? `${s}s` : `${Math.round(s / 60)}m`;
}
const num = (n: any) => (n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toLocaleString('en-AU'));

function statusColor(s: string): string {
  return s === 'done' || s === 'completed' || s === 'published'
    ? 'text-green-700 bg-green-50'
    : s === 'error' || s === 'failed'
    ? 'text-red-700 bg-red-50'
    : s === 'running'
    ? 'text-blue-700 bg-blue-50'
    : s === 'draft'
    ? 'text-amber-700 bg-amber-50'
    : 'text-gray-600 bg-gray-100';
}

// Human one-liner for each handler's result jsonb.
function summarise(type: string, r: any): string {
  if (!r) return '—';
  if (r.skipped) return `skipped — ${r.skipped}`;
  switch (type) {
    case 'gsc-sync': return r.upserted != null ? `${num(r.upserted)} GSC rows (${r.startDate}→${r.endDate})` : '—';
    case 'inventory-sync': return `${r.categories ?? 0} categories · ${r.brands ?? 0} brands · ${r.stores ?? 0} stores · ${r.keywords_upserted ?? 0} keywords`;
    case 'keyword-engine': return r.note ? r.note : `${r.upserted ?? 0} keywords from ${r.rollups ?? 0} queries`;
    case 'page-planner': return `${r.published_kept ?? 0} kept live · ${r.drafts ?? 0} drafts · ${r.candidates_held ?? 0} held · ${r.retired ?? 0} retired · ${r.generators_enqueued ?? 0} queued to build`;
    case 'page-generator': return r.url ? `${r.url} · ${r.generated_by} · ${r.supply} listings` : '—';
    case 'page-validator': return r.url ? `${r.decision}${r.fails?.length ? ` — ${r.fails.join(', ')}` : ''}` : '—';
    case 'sitemap': return r.submitted ? `submitted ${r.submitted}` : '—';
    case 'url-inspection': return r.inspected != null ? `${r.inspected} URLs inspected (budget ${r.budget})` : '—';
    case 'merchant-sync': return `${r.synced ?? 0}/${r.eligible ?? 0} products synced`;
    case 'business-profile-sync': return r.total != null ? `${r.total} reviews · ${r.average ?? '—'}★` : '—';
    case 'internal-links': return `${r.updated ?? 0}/${r.pages ?? 0} pages linked`;
    case 'alerts': return r.pages ? `${r.pages.indexable} indexable · ${r.tasks?.done ?? 0} tasks done` : 'run closed';
    default: return JSON.stringify(r).slice(0, 90);
  }
}

const STAGE_ORDER = [
  'gsc-sync', 'inventory-sync', 'keyword-engine', 'page-planner', 'page-generator',
  'page-validator', 'internal-links', 'sitemap', 'url-inspection', 'merchant-sync',
  'business-profile-sync', 'alerts',
];
const STAGE_LABEL: Record<string, string> = {
  'gsc-sync': 'Pull Search Console', 'inventory-sync': 'Read live inventory', 'keyword-engine': 'Build keyword universe',
  'page-planner': 'Score & plan pages', 'page-generator': 'Generate pages', 'page-validator': 'Validate (publish gate)',
  'internal-links': 'Weave internal links', 'sitemap': 'Submit sitemap', 'url-inspection': 'Inspect in Google',
  'merchant-sync': 'Merchant feed', 'business-profile-sync': 'Business Profile', 'alerts': 'Roll up & close',
};

// ---- tiny presentational bits ----------------------------------------------
function Tile({ label, value, hint, accent }: { label: string; value: any; hint?: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3.5 ${accent ? 'border-amber-200 bg-amber-50/40' : 'border-gray-200 bg-white'}`}>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs font-medium text-gray-500">{label}</div>
      {hint && <div className="mt-0.5 text-[11px] text-gray-400">{hint}</div>}
    </div>
  );
}
function Card({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
function Badge({ children, status }: { children: ReactNode; status: string }) {
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${statusColor(status)}`}>{children}</span>;
}
const empty = (msg: string) => <p className="py-6 text-center text-sm text-gray-400">{msg}</p>;

export default async function SeoAgentDashboard() {
  // --- Admin gate ----------------------------------------------------------
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user || user.email !== 'tom@lidgett.net') redirect('/');

  const db = createServiceRoleClient();

  // --- Fetch everything in parallel ----------------------------------------
  const [
    indexable, published, drafts, candidates, retired, keywordCount,
    runs, allPages, heldDrafts, keywords, gscRollup, inspections,
  ] = await Promise.all([
    pageCount(db, (q) => q.eq('status', 'published').eq('indexability', 'index')),
    pageCount(db, (q) => q.eq('status', 'published')),
    pageCount(db, (q) => q.eq('status', 'draft')),
    pageCount(db, (q) => q.eq('status', 'candidate')),
    pageCount(db, (q) => q.eq('status', 'retired')),
    tableCount(db, 'seo_keywords'),
    rows(db.from('seo_runs').select('id, status, source, started_at, finished_at, stats').order('started_at', { ascending: false }).limit(12)),
    rows(db.from('seo_pages').select('url, page_type, target_keyword, status, indexability, quality_score, spam_risk_score, supply_count, last_published_at').order('updated_at', { ascending: false }).limit(500)),
    rows(db.from('seo_pages').select('url, page_type, supply_count, quality_score, content').eq('status', 'draft').order('updated_at', { ascending: false }).limit(20)),
    rows(db.from('seo_keywords').select('keyword, intent, source, location, priority_score, demand').order('priority_score', { ascending: false }).limit(500)),
    rpc(db, 'seo_gsc_query_rollup', { p_days: 28 }),
    rows(db.from('url_inspections').select('url, verdict, coverage_state, google_canonical, inspected_at').order('inspected_at', { ascending: false }).limit(12)),
  ]);

  const kwTotal = keywordCount; // accurate total; `keywords` is the top-500 for tables/breakdowns

  // Latest run + its task pipeline (grouped by stage).
  const latestRun = runs[0] ?? null;
  const latestTasks = latestRun ? await rows(db.from('seo_tasks').select('task_type, status, result, attempts, last_error, created_at, updated_at').eq('run_id', latestRun.id)) : [];
  const byType = (t: string) => latestTasks.filter((x: any) => x.task_type === t);
  const findResult = (t: string) => byType(t).find((x: any) => x.result)?.result ?? null;

  // Integrations status, inferred from what the last run actually did.
  const gscRes = findResult('gsc-sync');
  const merchRes = findResult('merchant-sync');
  const gbpRes = findResult('business-profile-sync');
  const smRes = findResult('sitemap');
  const glmActive = latestTasks.some((t: any) => t.task_type === 'page-generator' && t.result?.generated_by === 'glm');
  const genRan = latestTasks.some((t: any) => t.task_type === 'page-generator' && t.status === 'done');
  const integrations = [
    { name: 'Search Console', ok: gscRes ? !gscRes.skipped : null, note: gscRes ? (gscRes.skipped ? 'no creds' : `${num(gscRes.upserted)} rows`) : 'idle' },
    { name: 'AI copy (GLM)', ok: glmActive ? true : genRan ? false : null, note: glmActive ? 'active' : genRan ? 'templates' : 'idle' },
    { name: 'Sitemap submit', ok: smRes ? !smRes.skipped : null, note: smRes ? (smRes.skipped ? 'no creds' : 'submitted') : 'idle' },
    { name: 'Merchant Center', ok: merchRes ? !merchRes.skipped : null, note: merchRes ? (merchRes.skipped ? 'no creds' : `${merchRes.synced} synced`) : 'idle' },
    { name: 'Business Profile', ok: gbpRes ? !gbpRes.skipped : null, note: gbpRes ? (gbpRes.skipped ? 'no creds' : 'connected') : 'idle' },
  ];

  // Pages-by-type matrix.
  const TYPES = ['marketplace_category', 'suburb_category', 'store_directory', 'brand_city', 'owned_store', 'guide'];
  const matrix = TYPES.map((t) => {
    const ps = allPages.filter((p: any) => p.page_type === t);
    return {
      type: t,
      total: ps.length,
      indexable: ps.filter((p: any) => p.status === 'published' && p.indexability === 'index').length,
      published: ps.filter((p: any) => p.status === 'published').length,
      draft: ps.filter((p: any) => p.status === 'draft').length,
      candidate: ps.filter((p: any) => p.status === 'candidate').length,
      retired: ps.filter((p: any) => p.status === 'retired').length,
    };
  }).filter((m) => m.total > 0);

  const livePages = allPages.filter((p: any) => p.status === 'published' && p.indexability === 'index').slice(0, 25);

  // Opportunity cross-reference with TOKEN-AWARE matching (so "ashburton bike
  // shop" credits the page targeting "bike shop ashburton") + plural stemming +
  // junk filtering. Exact-string matching wrongly flagged covered keywords as
  // "needs stock".
  const STOP = new Set(['in', 'for', 'the', 'and', 'near', 'me', 'best', 'buy', 'melbourne', 'vic']);
  const toks = (s: string) =>
    (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .map((t) => t.replace(/(ies|s)$/, '')) // crude stem: bikes→bike, cycles→cycle
      .filter((t) => t.length > 2 && !STOP.has(t));
  const publishedPages = allPages.filter((p: any) => p.status === 'published');
  const pageToks = publishedPages.map((p: any) => ({ page: p, set: new Set(toks(p.target_keyword || p.url)) }));
  const coverFor = (kw: string) => {
    const kt = toks(kw);
    let best: any = null, bestN = 1; // require ≥2 shared meaningful tokens
    for (const { page, set } of pageToks) {
      const n = kt.filter((t) => set.has(t)).length;
      if (n > bestN) { best = page; bestN = n; }
    }
    return best;
  };
  // Generic noise / pure-brand single words that should never spawn a page.
  const JUNK = /^(yellow|commerce|e[\s-]?commerce|ecommerce|bike|shop|store|cycle|online)$/i;
  const isJunk = (kw: string) => JUNK.test((kw || '').trim()) || toks(kw).length === 0;

  const pageByKw = new Map<string, any>();
  for (const p of allPages) if (p.target_keyword) pageByKw.set(p.target_keyword, p);

  const opportunities = (keywords as any[])
    .filter((k) => !isJunk(k.keyword))
    .slice(0, 25)
    .map((k: any) => {
      const impr = k.demand?.impressions ?? 0;
      const pos = k.demand?.position ?? 0;
      const supply = k.demand?.supply_count ?? 0;
      const p = pageByKw.get(k.keyword) || coverFor(k.keyword);
      let action: string;
      if (p?.status === 'published') action = pos > 10 ? `improve (pos ${Number(pos).toFixed(0)})` : 'live ✓';
      else if (p) action = `in ${p.status}`;
      else action = supply >= 5 ? 'build page' : impr >= 10 ? 'gap — add page' : 'watch';
      return { ...k, impr, pos, supply, pageStatus: p?.status ?? null, action };
    });

  // Keyword universe breakdown.
  const intents = ['transactional_local', 'local_store', 'service', 'product', 'guide'];
  const intentCounts = intents.map((i) => ({ i, n: keywords.filter((k: any) => k.intent === i).length })).filter((x) => x.n);
  const sources = ['gsc', 'inventory', 'seed', 'internal_search'];
  const sourceCounts = sources.map((s) => ({ s, n: keywords.filter((k: any) => k.source === s).length })).filter((x) => x.n);

  // GSC totals (from the rollup; capped at top 2000 queries — fine for a headline).
  const gscClicks = gscRollup.reduce((a: number, r: any) => a + Number(r.clicks || 0), 0);
  const gscImpr = gscRollup.reduce((a: number, r: any) => a + Number(r.impressions || 0), 0);
  const gscAvgPos = gscRollup.length ? gscRollup.reduce((a: number, r: any) => a + Number(r.avg_position || 0), 0) / gscRollup.length : 0;
  const topQueries = gscRollup.slice(0, 12);

  const th = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500';
  const td = 'px-3 py-2 text-gray-700';

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Search Dominance Agent</h1>
          <p className="text-sm text-gray-500">
            Hourly SEO operating loop · {latestRun ? `last run ${since(latestRun.started_at)} (${latestRun.status})` : 'no runs yet'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AutoRefresh />
          <RunAgentButton />
        </div>
      </div>

      {/* Integrations */}
      <div className="mb-6 flex flex-wrap gap-2">
        {integrations.map((it) => (
          <div key={it.name} className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs">
            <span className={`h-2 w-2 rounded-full ${it.ok === true ? 'bg-green-500' : it.ok === false ? 'bg-gray-300' : 'bg-gray-200'}`} />
            <span className="font-medium text-gray-700">{it.name}</span>
            <span className="text-gray-400">{it.note}</span>
          </div>
        ))}
      </div>

      {/* Stat tiles */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile label="Indexable pages" value={indexable} hint="published + index" accent />
        <Tile label="Published" value={published} />
        <Tile label="Drafts (held)" value={drafts} hint="awaiting supply / review" />
        <Tile label="Candidates" value={candidates} hint="noindex, watching" />
        <Tile label="Retired" value={retired} hint="supply dried up" />
        <Tile label="Keywords tracked" value={num(kwTotal)} />
        <Tile label="GSC clicks (28d)" value={num(gscClicks)} hint={gscRollup.length ? '' : 'connect Search Console'} />
        <Tile label="GSC impressions (28d)" value={num(gscImpr)} />
        <Tile label="Avg position" value={gscAvgPos ? gscAvgPos.toFixed(1) : '—'} />
        <Tile label="Pages tracked" value={allPages.length} hint="all statuses" />
      </div>

      {/* Latest run pipeline — the process */}
      <div className="mb-8">
        <Card title="Latest run · pipeline" sub={latestRun ? `${latestRun.source} · started ${since(latestRun.started_at)} · ${latestTasks.length} tasks` : undefined}>
          {!latestRun ? empty('No runs yet — hit “Run agent now” to seed the first run.') : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr><th className={th}>Stage</th><th className={th}>Status</th><th className={th}>What it did</th></tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {STAGE_ORDER.map((stage) => {
                    const tasks = byType(stage);
                    const done = tasks.filter((t: any) => t.status === 'done').length;
                    const err = tasks.filter((t: any) => t.status === 'error').length;
                    const pending = tasks.filter((t: any) => t.status === 'queued' || t.status === 'running').length;
                    const state = tasks.length === 0 ? 'idle' : err ? 'error' : pending ? 'running' : 'done';
                    // fan-out stages: aggregate; single stages: show the result line.
                    let detail: string;
                    if (stage === 'page-generator') detail = tasks.length ? `${done} built${pending ? `, ${pending} pending` : ''}${err ? `, ${err} failed` : ''}` : 'nothing to build';
                    else if (stage === 'page-validator') {
                      const pub = tasks.filter((t: any) => t.result?.decision === 'published').length;
                      const held = tasks.filter((t: any) => t.result?.decision && t.result.decision !== 'published').length;
                      detail = tasks.length ? `${pub} published, ${held} held` : 'nothing to validate';
                    } else detail = summarise(stage, findResult(stage));
                    return (
                      <tr key={stage}>
                        <td className={`${td} font-medium`}>{STAGE_LABEL[stage]}</td>
                        <td className="px-3 py-2"><Badge status={state === 'idle' ? 'queued' : state}>{state === 'idle' ? 'idle' : state}{tasks.length > 1 ? ` ·${tasks.length}` : ''}</Badge></td>
                        <td className="px-3 py-2 text-gray-600">{detail}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Run history + Opportunity queue */}
      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <Card title="Run history" sub="last 12 runs">
          {runs.length === 0 ? empty('No runs yet.') : (
            <table className="w-full text-sm">
              <thead><tr><th className={th}>Started</th><th className={th}>Source</th><th className={th}>Duration</th><th className={th}>Tasks</th><th className={th}>Live</th><th className={th}>Status</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {runs.map((r: any) => (
                  <tr key={r.id}>
                    <td className={td}>{since(r.started_at)}</td>
                    <td className="px-3 py-2 text-gray-500">{r.source}</td>
                    <td className="px-3 py-2 text-gray-500">{dur(r.started_at, r.finished_at)}</td>
                    <td className="px-3 py-2 text-gray-500">{r.stats?.tasks ? `${r.stats.tasks.done}✓${r.stats.tasks.error ? ` ${r.stats.tasks.error}✗` : ''}` : '—'}</td>
                    <td className="px-3 py-2 text-gray-700">{r.stats?.pages?.indexable ?? '—'}</td>
                    <td className="px-3 py-2"><Badge status={r.status}>{r.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Opportunity queue" sub="highest-priority keywords + suggested action">
          {opportunities.length === 0 ? empty('No keywords yet (run the agent; GSC demand needs Google creds).') : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr><th className={th}>Keyword</th><th className={th}>Intent</th><th className={th}>Impr</th><th className={th}>Pos</th><th className={th}>Stock</th><th className={th}>Action</th></tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {opportunities.map((k: any) => (
                    <tr key={k.keyword}>
                      <td className={`${td} max-w-[180px] truncate`} title={k.keyword}>{k.keyword}</td>
                      <td className="px-3 py-2 text-gray-500">{k.intent ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-500">{k.impr || '—'}</td>
                      <td className="px-3 py-2 text-gray-500">{k.pos ? Number(k.pos).toFixed(1) : '—'}</td>
                      <td className="px-3 py-2 text-gray-500">{k.supply || '—'}</td>
                      <td className="px-3 py-2"><span className="font-medium text-gray-700">{k.action}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Pages by type */}
      <div className="mb-8">
        <Card title="Pages by type" sub="how supply turns into indexable surfaces">
          {matrix.length === 0 ? empty('No pages yet.') : (
            <table className="w-full text-sm">
              <thead><tr><th className={th}>Type</th><th className={th}>Indexable</th><th className={th}>Published</th><th className={th}>Draft</th><th className={th}>Candidate</th><th className={th}>Retired</th><th className={th}>Total</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {matrix.map((m) => (
                  <tr key={m.type}>
                    <td className={`${td} font-medium`}>{m.type.replace(/_/g, ' ')}</td>
                    <td className="px-3 py-2 font-semibold text-green-700">{m.indexable}</td>
                    <td className={td}>{m.published}</td>
                    <td className="px-3 py-2 text-amber-700">{m.draft}</td>
                    <td className="px-3 py-2 text-gray-500">{m.candidate}</td>
                    <td className="px-3 py-2 text-gray-400">{m.retired}</td>
                    <td className={`${td} font-medium`}>{m.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {/* Live pages + Held drafts */}
      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <Card title="Live pages" sub="published + indexable, in your sitemap">
          {livePages.length === 0 ? empty('Nothing live yet.') : (
            <table className="w-full text-sm">
              <thead><tr><th className={th}>URL</th><th className={th}>Stock</th><th className={th}>Quality</th><th className={th}>Published</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {livePages.map((p: any) => (
                  <tr key={p.url}>
                    <td className="px-3 py-2"><a href={p.url} target="_blank" rel="noreferrer" className="font-mono text-xs text-blue-700 hover:underline">{p.url}</a></td>
                    <td className="px-3 py-2 text-gray-600">{p.supply_count}</td>
                    <td className="px-3 py-2 text-gray-600">{Math.round(p.quality_score ?? 0)}</td>
                    <td className="px-3 py-2 text-gray-500">{since(p.last_published_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Held — needs attention" sub="drafts not live, and exactly why">
          {heldDrafts.length === 0 ? empty('No held drafts.') : (
            <table className="w-full text-sm">
              <thead><tr><th className={th}>URL</th><th className={th}>Stock</th><th className={th}>Why it's held</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {heldDrafts.map((p: any) => {
                  const fails: string[] = p.content?.validation?.fails ?? [];
                  return (
                    <tr key={p.url}>
                      <td className="px-3 py-2 font-mono text-xs text-gray-700">{p.url}</td>
                      <td className="px-3 py-2 text-gray-600">{p.supply_count}</td>
                      <td className="px-3 py-2 text-amber-700">{fails.length ? fails.join('; ') : 'awaiting validation / promotion'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {/* GSC top queries */}
      <div className="mb-8">
        <Card title="Search Console — top queries (28d)" sub={gscRollup.length ? 'what you already show up for' : 'connect Search Console to populate'}>
          {topQueries.length === 0 ? empty('No Search Console data yet — add GOOGLE_SERVICE_ACCOUNT_JSON + GSC_SITE_URL.') : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr><th className={th}>Query</th><th className={th}>Impressions</th><th className={th}>Clicks</th><th className={th}>Avg pos</th><th className={th}>Top page</th></tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {topQueries.map((q: any, i: number) => (
                    <tr key={i}>
                      <td className={`${td} max-w-[220px] truncate`} title={q.query}>{q.query}</td>
                      <td className="px-3 py-2 text-gray-600">{num(q.impressions)}</td>
                      <td className="px-3 py-2 text-gray-600">{num(q.clicks)}</td>
                      <td className="px-3 py-2 text-gray-600">{Number(q.avg_position).toFixed(1)}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-gray-500 max-w-[200px] truncate" title={q.top_page}>{q.top_page ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Keyword universe + URL inspections */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Keyword universe" sub={`${num(kwTotal)} keywords tracked`}>
          {kwTotal === 0 ? empty('Empty — run the agent.') : (
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">By intent</div>
                {intentCounts.map((x) => (
                  <div key={x.i} className="flex justify-between py-1 text-sm"><span className="text-gray-600">{x.i.replace(/_/g, ' ')}</span><span className="font-medium text-gray-800">{x.n}</span></div>
                ))}
              </div>
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">By source</div>
                {sourceCounts.map((x) => (
                  <div key={x.s} className="flex justify-between py-1 text-sm"><span className="text-gray-600">{x.s}</span><span className="font-medium text-gray-800">{x.n}</span></div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card title="Google's index view" sub="URL Inspection API results">
          {inspections.length === 0 ? empty('No inspections yet (needs Google creds).') : (
            <table className="w-full text-sm">
              <thead><tr><th className={th}>URL</th><th className={th}>Verdict</th><th className={th}>Coverage</th><th className={th}>When</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {inspections.map((i: any, idx: number) => (
                  <tr key={idx}>
                    <td className="px-3 py-2 font-mono text-[11px] text-gray-700 max-w-[180px] truncate" title={i.url}>{i.url}</td>
                    <td className="px-3 py-2 text-gray-600">{i.verdict ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-500">{i.coverage_state ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-500">{since(i.inspected_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <p className="mt-8 text-xs text-gray-400">
        Pages only go live when they pass the quality gate (real supply + unique content). Search Console, Merchant &amp; Business Profile panels populate once their credentials are set — see docs/SEO_AGENT.md.
      </p>
    </div>
  );
}
