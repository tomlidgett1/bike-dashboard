// ============================================================================
// seo-orchestrator — the hourly conductor.
//
// It does NOT do the work. Each hour (pg_cron) it: takes a lock (so runs never
// overlap), opens a seo_runs row, and seeds the seo_tasks queue with the
// pipeline stages in dependency order (staggered run_after + priority). The
// seo-worker drains the queue. The final 'alerts' task closes the run.
//
// Handlers read from TABLES (gsc_query_page_daily, products, seo_keywords,
// seo_pages) rather than prior task outputs, so soft ordering is enough —
// a stage that runs early just sees slightly older data and self-corrects next
// hour. A stuck run auto-expires after 50 min so the next hour isn't blocked.
// ============================================================================
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/seo-db.ts';

interface StageSpec {
  task_type: string;
  priority: number;
  delaySec: number;
  payload?: Record<string, unknown>;
}

// gsc-sync + inventory-sync gather data; keyword-engine + page-planner reason
// over it; page-planner fans out page-generator/page-validator tasks; the rest
// publish/measure. alerts runs last and closes the run.
const PIPELINE: StageSpec[] = [
  { task_type: 'gsc-sync', priority: 10, delaySec: 0, payload: { windows: [3, 7, 28, 90] } },
  { task_type: 'inventory-sync', priority: 10, delaySec: 0 },
  { task_type: 'keyword-engine', priority: 20, delaySec: 30 },
  { task_type: 'page-planner', priority: 30, delaySec: 60 },
  { task_type: 'sitemap', priority: 40, delaySec: 120 },
  { task_type: 'url-inspection', priority: 45, delaySec: 120, payload: { quotaBudget: 1500 } },
  { task_type: 'merchant-sync', priority: 50, delaySec: 30, payload: { limit: 500 } },
  { task_type: 'business-profile-sync', priority: 50, delaySec: 30 },
  { task_type: 'internal-links', priority: 60, delaySec: 140 },
  { task_type: 'alerts', priority: 90, delaySec: 180 },
];

const LOCK_WINDOW_MIN = 50;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const db = createAdminClient();

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine (cron sends {} or nothing)
  }
  const force = body?.force === true;

  // --- Lock: skip if a run is already in flight (within the lock window) -----
  if (!force) {
    const cutoff = new Date(Date.now() - LOCK_WINDOW_MIN * 60_000).toISOString();
    const { data: active } = await db
      .from('seo_runs')
      .select('id, started_at')
      .eq('status', 'running')
      .gte('started_at', cutoff)
      .limit(1);
    if (active && active.length > 0) {
      return Response.json(
        { skipped: true, reason: 'a run is already in progress', run_id: active[0].id },
        { headers: corsHeaders },
      );
    }
  }

  // --- Open the run ---------------------------------------------------------
  const { data: run, error: runErr } = await db
    .from('seo_runs')
    .insert({ status: 'running', source: (body?.source as string) || 'cron', cadence: (body?.cadence as string) || 'hourly' })
    .select('id')
    .single();

  if (runErr || !run) {
    return Response.json({ error: `failed to open run: ${runErr?.message}` }, { status: 500, headers: corsHeaders });
  }

  // --- Seed the queue -------------------------------------------------------
  const now = Date.now();
  const tasks = PIPELINE.map((s) => ({
    run_id: run.id,
    task_type: s.task_type,
    priority: s.priority,
    payload: s.payload ?? {},
    run_after: new Date(now + s.delaySec * 1000).toISOString(),
  }));

  const { error: taskErr } = await db.from('seo_tasks').insert(tasks);
  if (taskErr) {
    await db.from('seo_runs').update({ status: 'failed', error: taskErr.message, finished_at: new Date().toISOString() }).eq('id', run.id);
    return Response.json({ error: `failed to enqueue: ${taskErr.message}` }, { status: 500, headers: corsHeaders });
  }

  await db.from('seo_runs').update({ stats: { enqueued: tasks.length } }).eq('id', run.id);

  // --- Best-effort: kick the worker now so we don't wait for its cron -------
  try {
    const workerUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/seo-worker`;
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ trigger: 'orchestrator', run_id: run.id }),
    }).catch(() => {});
  } catch {
    // worker cron will pick it up regardless
  }

  return Response.json({ run_id: run.id, enqueued: tasks.length }, { headers: corsHeaders });
});
