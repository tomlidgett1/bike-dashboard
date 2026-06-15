import type { LightspeedCategory } from '@/lib/services/lightspeed'
import {
  detectCategoryWithAi,
  directCategoryMatch,
  formatCategoryDisplayLabel,
  isConfidentCategoryDetection,
} from '@/lib/products/category-recognition'
import type { CategorySuggestion } from '@/lib/missing-categories/types'
import type { CategorySuggestionProductRow } from '@/lib/missing-categories/suggestion-cache'

export type ComputedCategorySuggestion = CategorySuggestion & { productId: string }

function categoryById(
  categories: LightspeedCategory[],
  categoryId: string,
): LightspeedCategory | undefined {
  return categories.find((row) => String(row.categoryID) === categoryId)
}

export async function computeCategorySuggestion(
  product: CategorySuggestionProductRow & {
    lightspeed_category_id?: string | null
    category_name?: string | null
    full_category_path?: string | null
  },
  categories: LightspeedCategory[],
): Promise<ComputedCategorySuggestion> {
  const productId = product.id
  const existingId = product.lightspeed_category_id?.trim()
  if (existingId && existingId !== '0') {
    const existing = categoryById(categories, existingId)
    return {
      productId,
      categoryId: existingId,
      categoryLabel: existing
        ? formatCategoryDisplayLabel(existing)
        : product.full_category_path || product.category_name || existingId,
      confidence: 'high',
      source: 'none',
    }
  }

  const productName = (product.display_name || product.description || '').trim()
  if (!productName) {
    return {
      productId,
      categoryId: null,
      categoryLabel: null,
      confidence: 'none',
      source: 'none',
    }
  }

  const direct = directCategoryMatch(productName, categories)
  if (direct) {
    return {
      productId,
      categoryId: String(direct.categoryID),
      categoryLabel: formatCategoryDisplayLabel(direct),
      confidence: 'high',
      source: 'direct_match',
    }
  }

  const detection = await detectCategoryWithAi({
    productName,
    brandLabel: product.manufacturer_name,
    categories,
  })

  if (!isConfidentCategoryDetection(detection)) {
    return {
      productId,
      categoryId: null,
      categoryLabel: null,
      confidence: detection?.confidence ?? 'none',
      source: 'none',
    }
  }

  const matched = categoryById(categories, detection.categoryId)
  if (!matched) {
    return {
      productId,
      categoryId: null,
      categoryLabel: null,
      confidence: 'none',
      source: 'none',
    }
  }

  return {
    productId,
    categoryId: String(matched.categoryID),
    categoryLabel: formatCategoryDisplayLabel(matched),
    confidence: detection.confidence,
    source: 'ai',
  }
}
