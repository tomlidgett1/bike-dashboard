// ============================================================================
// page-validator — the publish gate. GLM/template drafts NEVER go live without
// passing every hard gate here (doc §14). Pass + intended-index => published;
// any failure => held as draft/noindex with reasons recorded.
// ============================================================================
import type { Handler, SeoPageRow } from '../../_shared/seo-types.ts';
import { MIN_INDEXABLE_SUPPLY } from '../../_shared/seo-scoring.ts';

export const pageValidator: Handler = async (task, { db }) => {
  const url = task.payload.page_url as string;
  if (!url) throw new Error('page-validator: missing page_url');

  const { data: pageRow, error } = await db.from('seo_pages').select('*').eq('url', url).maybeSingle();
  if (error) throw new Error(error.message);
  if (!pageRow) return { skipped: `no seo_page ${url}` };
  const page = pageRow as SeoPageRow;

  const content = page.content ?? {};
  const storeKind = page.page_type === 'store_directory' || page.page_type === 'owned_store';
  const supplyOk = storeKind ? page.supply_count >= 1 : page.supply_count >= MIN_INDEXABLE_SUPPLY;

  const fails: string[] = [];
  if (!page.title || page.title.length < 10) fails.push('missing/short title');
  if (!page.h1) fails.push('missing h1');
  if (!content.intro || content.intro.length < 20) fails.push('missing intro');
  if (!content.blocks || content.blocks.length < 1) fails.push('no content blocks');
  if (!page.canonical_url) fails.push('no canonical');
  if (!content.schema || content.schema.length === 0) fails.push('no schema');
  if (!supplyOk) fails.push(`thin supply (${page.supply_count})`);

  // Uniqueness: no other PUBLISHED page may share this title or h1. Compared in
  // JS — titles contain '|' and other chars that would break a PostgREST .or()
  // filter string.
  if (page.title) {
    const { data: others } = await db
      .from('seo_pages')
      .select('title, h1')
      .eq('status', 'published')
      .neq('url', url);
    const titleLc = page.title.trim().toLowerCase();
    const h1Lc = (page.h1 ?? '').trim().toLowerCase();
    const clash = ((others ?? []) as Array<{ title: string | null; h1: string | null }>).some(
      (o) =>
        (o.title && o.title.trim().toLowerCase() === titleLc) ||
        (!!h1Lc && o.h1 && o.h1.trim().toLowerCase() === h1Lc),
    );
    if (clash) fails.push('duplicate title/h1 vs another published page');
  }

  const intendedIndex = page.indexability === 'index';
  const now = new Date().toISOString();

  if (fails.length === 0 && intendedIndex && supplyOk) {
    await db.from('seo_pages').update({ status: 'published', indexability: 'index', last_published_at: now }).eq('url', url);
    return { url, decision: 'published' };
  }

  // Held back — record why, keep out of the index.
  const heldContent = { ...content, validation: { fails, checked_at: now } };
  await db.from('seo_pages').update({
    status: page.status === 'published' ? 'published' : 'draft',
    indexability: fails.length === 0 ? page.indexability : 'noindex',
    content: heldContent,
  }).eq('url', url);

  return { url, decision: fails.length ? 'held' : 'draft', fails };
};
