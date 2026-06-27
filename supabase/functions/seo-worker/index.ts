// ============================================================================
// seo-worker — drains the seo_tasks queue.
//
// Claims a batch via claim_seo_tasks() (SKIP LOCKED, so many concurrent worker
// invocations never collide), dispatches each task to its handler, and records
// done / requeue-with-backoff / error. Loops until the queue is empty or a time
// budget is hit, then returns — the worker cron (every few minutes) and the
// orchestrator's best-effort kick keep it warm.
// ============================================================================
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient, siteUrl } from '../_shared/seo-db.ts';
import type { SeoTask, HandlerCtx, Handler } from '../_shared/seo-types.ts';

import { gscSync } from './handlers/gsc-sync.ts';
import { inventorySync } from './handlers/inventory-sync.ts';
import { keywordEngine } from './handlers/keyword-engine.ts';
import { pagePlanner } from './handlers/page-planner.ts';
import { pageGenerator } from './handlers/page-generator.ts';
import { pageValidator } from './handlers/page-validator.ts';
import { sitemap } from './handlers/sitemap.ts';
import { urlInspection } from './handlers/url-inspection.ts';
import { merchantSync } from './handlers/merchant-sync.ts';
import { businessProfileSync } from './handlers/business-profile-sync.ts';
import { internalLinks } from './handlers/internal-links.ts';
import { alerts } from './handlers/alerts.ts';

const HANDLERS: Record<string, Handler> = {
  'gsc-sync': gscSync,
  'inventory-sync': inventorySync,
  'keyword-engine': keywordEngine,
  'page-planner': pagePlanner,
  'page-generator': pageGenerator,
  'page-validator': pageValidator,
  'sitemap': sitemap,
  'url-inspection': urlInspection,
  'merchant-sync': merchantSync,
  'business-profile-sync': businessProfileSync,
  'internal-links': internalLinks,
  'alerts': alerts,
};

const TIME_BUDGET_MS = 100_000;
const BATCH = 4;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const db = createAdminClient();
  const ctx: HandlerCtx = { db, site: siteUrl() };
  const workerId = `w_${crypto.randomUUID().slice(0, 8)}`;
  const startedAt = Date.now();

  let processed = 0;
  let done = 0;
  let failed = 0;

  while (Date.now() - startedAt < TIME_BUDGET_MS) {
    const { data: claimed, error } = await db.rpc('claim_seo_tasks', { p_worker: workerId, p_limit: BATCH });
    if (error) {
      console.error('[seo-worker] claim failed:', error.message);
      break;
    }
    const tasks = (claimed ?? []) as SeoTask[];
    if (tasks.length === 0) break; // queue drained

    for (const task of tasks) {
      processed++;
      const handler = HANDLERS[task.task_type];
      if (!handler) {
        await db.from('seo_tasks').update({ status: 'error', last_error: `no handler for ${task.task_type}` }).eq('id', task.id);
        failed++;
        continue;
      }
      try {
        const result = await handler(task, ctx);
        await db.from('seo_tasks').update({ status: 'done', result, locked_by: null }).eq('id', task.id);
        done++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const canRetry = task.attempts < task.max_attempts;
        const backoffSec = Math.min(60 * task.attempts, 600);
        await db.from('seo_tasks').update(
          canRetry
            ? { status: 'queued', last_error: msg, run_after: new Date(Date.now() + backoffSec * 1000).toISOString(), locked_by: null }
            : { status: 'error', last_error: msg, locked_by: null },
        ).eq('id', task.id);
        failed++;
        console.error(`[seo-worker] ${task.task_type} failed (attempt ${task.attempts}):`, msg);
      }
    }
  }

  return Response.json({ worker: workerId, processed, done, failed }, { headers: corsHeaders });
});
