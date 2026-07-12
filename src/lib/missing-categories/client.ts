import type {
  MissingCategoriesResponse,
  SetMissingCategoryResponse,
  SuggestCategoriesBatchResponse,
  SuggestCategoryResponse,
} from '@/lib/missing-categories/types'

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T
}

export async function fetchMissingCategoryProducts(
  limit = 20,
  options?: { includeCategories?: boolean },
): Promise<MissingCategoriesResponse> {
  const query = new URLSearchParams({ limit: String(limit) })
  if (options?.includeCategories === false) query.set('includeCategories', '0')
  const res = await fetch(`/api/products/missing-categories?${query.toString()}`, {
    cache: 'no-store',
  })
  const data = await parseJson<MissingCategoriesResponse>(res)
  if (!res.ok) {
    throw new Error(data.error || 'Could not load products missing categories.')
  }
  return data
}

export async function suggestProductCategory(productId: string): Promise<SuggestCategoryResponse> {
  const res = await fetch('/api/products/suggest-category', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId }),
  })
  const data = await parseJson<SuggestCategoryResponse>(res)
  if (!res.ok) {
    throw new Error(data.error || 'Could not suggest a category.')
  }
  return data
}

export async function suggestProductCategoriesBatch(
  productIds: string[],
): Promise<SuggestCategoriesBatchResponse> {
  const res = await fetch('/api/products/suggest-categories-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productIds }),
  })
  const data = await parseJson<SuggestCategoriesBatchResponse>(res)
  if (!res.ok) {
    throw new Error(data.error || 'Could not suggest categories.')
  }
  return data
}

export async function saveProductCategory(
  productId: string,
  categoryId: string,
): Promise<SetMissingCategoryResponse> {
  const res = await fetch('/api/products/set-category', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId, categoryId }),
  })
  const data = await parseJson<SetMissingCategoryResponse>(res)
  if (!res.ok) {
    throw new Error(data.error || 'Failed to save category.')
  }
  return data
}
