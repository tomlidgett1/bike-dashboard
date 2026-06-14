export type BrandSuggestion = {
  brand: string | null
  manufacturerId?: string | null
  confidence?: 'high' | 'medium' | 'low' | 'none'
  source?: 'direct_match' | 'ai' | 'none'
}

export type MissingBrandProduct = {
  id: string
  name: string
  sku: string
  category: string | null
  preview: string
  lightspeedItemId: string | null
  suggestion?: BrandSuggestion | null
}

export type MissingBrandsResponse = {
  products?: MissingBrandProduct[]
  lightspeedConnected?: boolean
  error?: string
}

export type SuggestBrandResponse = BrandSuggestion & {
  error?: string
}

export type SuggestBrandsBatchResponse = {
  suggestions?: Array<BrandSuggestion & { productId: string }>
  error?: string
}

export type SetMissingBrandResponse = {
  success?: boolean
  result?: {
    productId: string
    brand: string
    manufacturerId: string | null
    createdManufacturer: boolean
    updatedLightspeed: boolean
  }
  lightspeedAvailable?: boolean
  error?: string
}
