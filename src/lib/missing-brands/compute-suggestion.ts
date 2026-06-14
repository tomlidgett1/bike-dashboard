import type { LightspeedManufacturer } from '@/lib/services/lightspeed'
import {
  detectBrandWithAi,
  directBrandMatch,
  isConfidentBrandDetection,
} from '@/lib/products/brand-recognition'
import { formatLightspeedCategory } from '@/lib/products/catalog-helpers'
import type { BrandSuggestion } from '@/lib/missing-brands/types'
import type { BrandSuggestionProductRow } from '@/lib/missing-brands/suggestion-cache'

export type ComputedBrandSuggestion = BrandSuggestion & { productId: string }

export async function computeBrandSuggestion(
  product: BrandSuggestionProductRow & { manufacturer_name?: string | null },
  manufacturers: LightspeedManufacturer[],
  knownBrandNames: string[],
): Promise<ComputedBrandSuggestion> {
  const productId = product.id

  if (product.manufacturer_name?.trim()) {
    return {
      productId,
      brand: product.manufacturer_name.trim(),
      manufacturerId: null,
      confidence: 'high',
      source: 'none',
    }
  }

  const productName = (product.display_name || product.description || '').trim()
  if (!productName) {
    return { productId, brand: null, manufacturerId: null, confidence: 'none', source: 'none' }
  }

  const direct = directBrandMatch(productName, manufacturers)
  if (direct?.name) {
    return {
      productId,
      brand: direct.name.trim(),
      manufacturerId: String(direct.manufacturerID),
      confidence: 'high',
      source: 'direct_match',
    }
  }

  const detection = await detectBrandWithAi({
    productName,
    categoryLabel: formatLightspeedCategory(product),
    knownBrandNames,
  })

  if (!isConfidentBrandDetection(detection)) {
    return {
      productId,
      brand: null,
      manufacturerId: null,
      confidence: detection?.confidence ?? 'none',
      source: 'none',
    }
  }

  const matched = manufacturers.find(
    (m) => (m.name || '').trim().toLowerCase() === detection.brand.trim().toLowerCase(),
  )

  return {
    productId,
    brand: detection.brand.trim(),
    manufacturerId: matched ? String(matched.manufacturerID) : null,
    confidence: detection.confidence,
    source: 'ai',
  }
}
