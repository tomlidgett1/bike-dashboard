import type {
  MissingBrandsResponse,
  SetMissingBrandResponse,
  SuggestBrandResponse,
  SuggestBrandsBatchResponse,
} from '@/lib/missing-brands/types'

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T
}

export async function fetchMissingBrandProducts(limit = 20): Promise<MissingBrandsResponse> {
  const res = await fetch(`/api/products/missing-brands?limit=${limit}`, { cache: 'no-store' })
  const data = await parseJson<MissingBrandsResponse>(res)
  if (!res.ok) {
    throw new Error(data.error || 'Could not load products missing brands.')
  }
  return data
}

export async function suggestProductBrand(productId: string): Promise<SuggestBrandResponse> {
  const res = await fetch('/api/products/suggest-brand', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId }),
  })
  const data = await parseJson<SuggestBrandResponse>(res)
  if (!res.ok) {
    throw new Error(data.error || 'Could not suggest a brand.')
  }
  return data
}

export async function suggestProductBrandsBatch(
  productIds: string[],
): Promise<SuggestBrandsBatchResponse> {
  const res = await fetch('/api/products/suggest-brands-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productIds }),
  })
  const data = await parseJson<SuggestBrandsBatchResponse>(res)
  if (!res.ok) {
    throw new Error(data.error || 'Could not suggest brands.')
  }
  return data
}

export async function saveProductBrand(
  productId: string,
  brandName: string,
): Promise<SetMissingBrandResponse> {
  const res = await fetch('/api/products/set-brand', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId, brandName }),
  })
  const data = await parseJson<SetMissingBrandResponse>(res)
  if (!res.ok) {
    throw new Error(data.error || 'Failed to save brand.')
  }
  return data
}
