import type { SpecialsCandidate, SpecialsConfig, SpecialsStrategy } from '@/lib/types/specials';

/**
 * Deterministic, strategy-aware selection of a cycle's products from the ranked
 * candidate pool. Used directly when AI is off, and as the curated shortlist /
 * fallback when AI is on. Candidates arrive pre-sorted by clearance score.
 */

export interface SelectionResult {
  selected: SpecialsCandidate[];
  themeLabel: string | null;
}

function categoryKey(candidate: SpecialsCandidate): string {
  return (
    candidate.lightspeed_category_id ||
    candidate.category_name ||
    'uncategorised'
  );
}

function categoryLabel(candidate: SpecialsCandidate): string {
  return candidate.category_name || candidate.brand || 'Specials';
}

/** Group candidates by category, preserving the incoming (score) order. */
function groupByCategory(candidates: SpecialsCandidate[]): Map<string, SpecialsCandidate[]> {
  const groups = new Map<string, SpecialsCandidate[]>();
  for (const c of candidates) {
    const key = categoryKey(c);
    const list = groups.get(key);
    if (list) list.push(c);
    else groups.set(key, [c]);
  }
  return groups;
}

/** Pick the strongest products spread across categories (max 2 per category). */
function pickVaried(candidates: SpecialsCandidate[], count: number): SpecialsCandidate[] {
  const perCategory = new Map<string, number>();
  const picked: SpecialsCandidate[] = [];
  const cap = 2;

  for (const c of candidates) {
    if (picked.length >= count) break;
    const key = categoryKey(c);
    const used = perCategory.get(key) ?? 0;
    if (used >= cap) continue;
    perCategory.set(key, used + 1);
    picked.push(c);
  }

  // Top up with the next best regardless of category if we came up short.
  if (picked.length < count) {
    const chosen = new Set(picked.map((c) => c.product_id));
    for (const c of candidates) {
      if (picked.length >= count) break;
      if (!chosen.has(c.product_id)) picked.push(c);
    }
  }
  return picked.slice(0, count);
}

export function selectCandidates(
  candidates: SpecialsCandidate[],
  config: Pick<SpecialsConfig, 'strategy' | 'products_per_cycle'>,
): SelectionResult {
  const count = Math.max(1, config.products_per_cycle);
  const strategy: SpecialsStrategy = config.strategy;

  if (candidates.length === 0) return { selected: [], themeLabel: null };

  if (strategy === 'clearance') {
    return { selected: candidates.slice(0, count), themeLabel: 'Clearance' };
  }

  if (strategy === 'single_category') {
    // Choose the category with the strongest aggregate clearance signal.
    const groups = groupByCategory(candidates);
    let bestKey: string | null = null;
    let bestScore = -1;
    for (const [key, list] of groups) {
      if (list.length === 0) continue;
      const top = list.slice(0, count);
      const score = top.reduce((sum, c) => sum + c.proposal.clearance_score, 0) / top.length
        + Math.min(list.length, count) * 0.01; // tie-break toward fuller categories
      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
      }
    }
    const list = bestKey ? groups.get(bestKey) ?? [] : [];
    return {
      selected: list.slice(0, count),
      themeLabel: list[0] ? categoryLabel(list[0]) : null,
    };
  }

  if (strategy === 'one_per_category') {
    // One product (the strongest) from each of the top `count` categories.
    const groups = groupByCategory(candidates);
    const ranked = Array.from(groups.values())
      .filter((list) => list.length > 0)
      .sort((a, b) => b[0].proposal.clearance_score - a[0].proposal.clearance_score);
    const selected = ranked.slice(0, count).map((list) => list[0]);
    return { selected, themeLabel: null };
  }

  // random → a varied mix across categories.
  return { selected: pickVaried(candidates, count), themeLabel: null };
}
