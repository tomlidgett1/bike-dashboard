import { createHash } from 'crypto'
import type { BrandSuggestion } from '@/lib/missing-brands/types'
import { formatLightspeedCategory } from '@/lib/products/catalog-helpers'

export type BrandSuggestionProductRow = {
  id: string
  description?: string | null
  display_name?: string | null
  category_name?: string | null
  full_category_path?: string | null
  suggested_brand_name?: string | null
  suggested_brand_manufacturer_id?: string | null
  suggested_brand_source?: string | null
  suggested_brand_confidence?: string | null
  suggested_brand_fingerprint?: string | null
}

export function brandSuggestionFingerprint(row: BrandSuggestionProductRow): string {
  const payload = [
    (row.display_name || '').trim().toLowerCase(),
    (row.description || '').trim().toLowerCase(),
    (formatLightspeedCategory(row) || '').trim().toLowerCase(),
  ].join('\n')

  return createHash('sha256').update(payload).digest('hex')
}

function normaliseSource(value: string | null | undefined): BrandSuggestion['source'] {
  if (value === 'direct_match' || value === 'ai') return value
  if (value === 'none') return 'none'
  return undefined
}

function normaliseConfidence(
  value: string | null | undefined,
): BrandSuggestion['confidence'] {
  if (value === 'high' || value === 'medium' || value === 'low' || value === 'none') {
    return value
  }
  return undefined
}

export function readCachedBrandSuggestion(
  row: BrandSuggestionProductRow,
): BrandSuggestion | null | undefined {
  const fingerprint = brandSuggestionFingerprint(row)
  if (!row.suggested_brand_fingerprint || row.suggested_brand_fingerprint !== fingerprint) {
    return undefined
  }

  const source = normaliseSource(row.suggested_brand_source) ?? 'none'

  if (!row.suggested_brand_name?.trim()) {
    return source === 'none' ? null : undefined
  }

  return {
    brand: row.suggested_brand_name.trim(),
    manufacturerId: row.suggested_brand_manufacturer_id ?? null,
    confidence: normaliseConfidence(row.suggested_brand_confidence),
    source,
  }
}

export function brandSuggestionCacheUpdate(
  row: BrandSuggestionProductRow,
  suggestion: BrandSuggestion & { productId?: string },
): Record<string, string | null> {
  const fingerprint = brandSuggestionFingerprint(row)
  const brand = suggestion.brand?.trim() || null

  return {
    suggested_brand_name: brand,
    suggested_brand_manufacturer_id: suggestion.manufacturerId ?? null,
    suggested_brand_source: suggestion.source ?? (brand ? 'ai' : 'none'),
    suggested_brand_confidence: suggestion.confidence ?? (brand ? 'medium' : 'none'),
    suggested_brand_fingerprint: fingerprint,
    suggested_brand_at: new Date().toISOString(),
  }
}

export function clearBrandSuggestionCacheUpdate(): Record<string, null> {
  return {
    suggested_brand_name: null,
    suggested_brand_manufacturer_id: null,
    suggested_brand_source: null,
    suggested_brand_confidence: null,
    suggested_brand_fingerprint: null,
    suggested_brand_at: null,
  }
}
