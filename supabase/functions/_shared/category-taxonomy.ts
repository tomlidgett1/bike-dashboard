import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import type { CategoryLevel, ProductInput } from './ai-categorisation.ts';

interface CategoryRow {
  id: string;
  parent_id: string | null;
  level: 1 | 2 | 3;
  name: string;
}

export interface ResolvedCategory {
  id: string;
  level1: string;
  level2: string;
  level3: string | null;
}

function pathKey(level1: string, level2: string, level3: string | null): string {
  return [level1, level2, level3 ?? '']
    .map((value) => value.trim().toLocaleLowerCase())
    .join('\u0000');
}

export async function loadCanonicalTaxonomy(
  supabase: SupabaseClient,
): Promise<{ paths: ResolvedCategory[]; promptTaxonomy: CategoryLevel[] }> {
  const { data, error } = await supabase
    .from('marketplace_categories')
    .select('id, parent_id, level, name')
    .eq('is_active', true)
    .order('level')
    .order('sort_order');

  if (error) {
    throw new Error(`Failed to load canonical marketplace taxonomy: ${error.message}`);
  }

  const rows = (data ?? []) as CategoryRow[];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const paths: ResolvedCategory[] = [];

  for (const row of rows) {
    if (row.level === 2) {
      const level1 = row.parent_id ? byId.get(row.parent_id) : null;
      if (!level1 || level1.level !== 1) continue;
      paths.push({
        id: row.id,
        level1: level1.name,
        level2: row.name,
        level3: null,
      });
      continue;
    }

    if (row.level === 3) {
      const level2 = row.parent_id ? byId.get(row.parent_id) : null;
      const level1 = level2?.parent_id ? byId.get(level2.parent_id) : null;
      if (!level1 || !level2 || level1.level !== 1 || level2.level !== 2) continue;
      paths.push({
        id: row.id,
        level1: level1.name,
        level2: level2.name,
        level3: row.name,
      });
    }
  }

  const promptTaxonomy = paths
    .filter((path) => {
      if (path.level3 !== null) return true;
      return !paths.some(
        (candidate) =>
          candidate.level1 === path.level1 &&
          candidate.level2 === path.level2 &&
          candidate.level3 !== null,
      );
    })
    .map(({ level1, level2, level3 }) => ({ level1, level2, level3 }));

  return { paths, promptTaxonomy };
}

export function resolveCategoryPath(
  paths: ResolvedCategory[],
  level1: string,
  level2: string,
  level3: string | null,
): ResolvedCategory | null {
  const exact = new Map(
    paths.map((path) => [pathKey(path.level1, path.level2, path.level3), path]),
  );
  return (
    exact.get(pathKey(level1, level2, level3)) ??
    (level3 === null ? exact.get(pathKey(level1, level2, null)) : undefined) ??
    null
  );
}

export async function inferDeterministicCategory(
  supabase: SupabaseClient,
  product: ProductInput,
): Promise<string | null> {
  const { data, error } = await supabase.rpc('infer_marketplace_category_id', {
    p_name: product.normalized_name,
    p_provider_category: product.category ?? null,
  });

  if (error) {
    console.warn(
      `[CATEGORY TAXONOMY] Deterministic inference failed for ${product.id}: ${error.message}`,
    );
    return null;
  }

  return typeof data === 'string' && data ? data : null;
}
