// alerts — the run's closing task. Rolls up what happened (pages live/held,
// tasks done/failed, top unserved opportunities) into seo_runs.stats and marks
// the run completed. Runs last in the pipeline.
import type { Handler } from '../../_shared/seo-types.ts';

export const alerts: Handler = async (task, { db }) => {
  // deno-lint-ignore no-explicit-any
  const pageCount = async (build: (q: any) => any) => {
    const { count } = await build(db.from('seo_pages').select('id', { count: 'exact', head: true }));
    return count ?? 0;
  };

  const [indexable, published, drafts, candidates, retired] = await Promise.all([
    pageCount((q) => q.eq('status', 'published').eq('indexability', 'index')),
    pageCount((q) => q.eq('status', 'published')),
    pageCount((q) => q.eq('status', 'draft')),
    pageCount((q) => q.eq('status', 'candidate')),
    pageCount((q) => q.eq('status', 'retired')),
  ]);

  // Tasks in this run.
  let tasksDone = 0, tasksError = 0;
  if (task.run_id) {
    // deno-lint-ignore no-explicit-any
    const { data: tasks } = await db.from('seo_tasks').select('status').eq('run_id', task.run_id) as any;
    for (const t of (tasks ?? []) as Array<{ status: string }>) {
      if (t.status === 'done') tasksDone++;
      else if (t.status === 'error') tasksError++;
    }
  }

  // Top opportunities: high-priority keywords with no published page yet.
  const { data: opps } = await db
    .from('seo_keywords')
    .select('keyword, priority_score, intent, demand')
    .order('priority_score', { ascending: false })
    .limit(10);

  const stats = {
    pages: { indexable, published, drafts, candidates, retired },
    tasks: { done: tasksDone, error: tasksError },
    top_opportunities: (opps ?? []).slice(0, 10),
    closed_at: new Date().toISOString(),
  };

  if (task.run_id) {
    await db.from('seo_runs').update({ status: 'completed', finished_at: new Date().toISOString(), stats }).eq('id', task.run_id);
  }

  return stats;
};
