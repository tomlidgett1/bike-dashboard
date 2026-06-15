export type CategorySuggestion = {
  categoryId: string | null
  categoryLabel: string | null
  confidence?: 'high' | 'medium' | 'low' | 'none'
  source?: 'direct_match' | 'ai' | 'none'
}

export type LightspeedCategoryOption = {
  categoryId: string
  label: string
  fullPathName: string
}

export type MissingCategoryProduct = {
  id: string
  name: string
  sku: string
  brand: string | null
  preview: string
  lightspeedItemId: string | null
  suggestion?: CategorySuggestion | null
}

export type MissingCategoriesResponse = {
  products?: MissingCategoryProduct[]
  categories?: LightspeedCategoryOption[]
  lightspeedConnected?: boolean
  error?: string
}

export type SuggestCategoryResponse = CategorySuggestion & {
  error?: string
}

export type SuggestCategoriesBatchResponse = {
  suggestions?: Array<CategorySuggestion & { productId: string }>
  error?: string
}

export type SetMissingCategoryResponse = {
  success?: boolean
  result?: {
    productId: string
    categoryId: string
    categoryLabel: string
    updatedLightspeed: boolean
  }
  lightspeedAvailable?: boolean
  error?: string
}
