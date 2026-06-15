import { createHash } from 'crypto'
import type { CategorySuggestion } from '@/lib/missing-categories/types'

export type CategorySuggestionProductRow = {
  id: string
  description?: string | null
  display_name?: string | null
  manufacturer_name?: string | null
  suggested_category_id?: string | null
  suggested_category_label?: string | null
  suggested_category_source?: string | null
  suggested_category_confidence?: string | null
  suggested_category_fingerprint?: string | null
}

export function categorySuggestionFingerprint(row: CategorySuggestionProductRow): string {
  const payload = [
    (row.display_name || '').trim().toLowerCase(),
    (row.description || '').trim().toLowerCase(),
    (row.manufacturer_name || '').trim().toLowerCase(),
  ].join('\n')

  return createHash('sha256').update(payload).digest('hex')
}

function normaliseSource(value: string | null | undefined): CategorySuggestion['source'] {
  if (value === 'direct_match' || value === 'ai') return value
  if (value === 'none') return 'none'
  return undefined
}

function normaliseConfidence(
  value: string | null | undefined,
): CategorySuggestion['confidence'] {
  if (value === 'high' || value === 'medium' || value === 'low' || value === 'none') {
    return value
  }
  return undefined
}

export function readCachedCategorySuggestion(
  row: CategorySuggestionProductRow,
): CategorySuggestion | null | undefined {
  const fingerprint = categorySuggestionFingerprint(row)
  if (!row.suggested_category_fingerprint || row.suggested_category_fingerprint !== fingerprint) {
    return undefined
  }

  const source = normaliseSource(row.suggested_category_source) ?? 'none'

  if (!row.suggested_category_id?.trim()) {
    return source === 'none' ? null : undefined
  }

  return {
    categoryId: row.suggested_category_id.trim(),
    categoryLabel: row.suggested_category_label?.trim() || null,
    confidence: normaliseConfidence(row.suggested_category_confidence),
    source,
  }
}

export function categorySuggestionCacheUpdate(
  row: CategorySuggestionProductRow,
  suggestion: CategorySuggestion & { productId?: string },
): Record<string, string | null> {
  const fingerprint = categorySuggestionFingerprint(row)
  const categoryId = suggestion.categoryId?.trim() || null

  return {
    suggested_category_id: categoryId,
    suggested_category_label: suggestion.categoryLabel?.trim() || null,
    suggested_category_source: suggestion.source ?? (categoryId ? 'ai' : 'none'),
    suggested_category_confidence: suggestion.confidence ?? (categoryId ? 'medium' : 'none'),
    suggested_category_fingerprint: fingerprint,
    suggested_category_at: new Date().toISOString(),
  }
}

export function clearCategorySuggestionCacheUpdate(): Record<string, null> {
  return {
    suggested_category_id: null,
    suggested_category_label: null,
    suggested_category_source: null,
    suggested_category_confidence: null,
    suggested_category_fingerprint: null,
    suggested_category_at: null,
  }
}
