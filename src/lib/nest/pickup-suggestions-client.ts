import type { HiddenNestPickupSuggestion, NestPickupSuggestion } from '@/lib/nest/pickup-suggestions'

export async function hideNestPickupSuggestion(
  suggestion: NestPickupSuggestion,
): Promise<void> {
  const res = await fetch('/api/store/nest-pickup-suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'hide', suggestion }),
  })
  const data = (await res.json()) as { error?: string }
  if (!res.ok) {
    throw new Error(data.error || 'Could not hide suggestion.')
  }
}

export async function restoreNestPickupSuggestion(workorderId: string): Promise<void> {
  const res = await fetch('/api/store/nest-pickup-suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'restore', workorderId }),
  })
  const data = (await res.json()) as { error?: string }
  if (!res.ok) {
    throw new Error(data.error || 'Could not restore suggestion.')
  }
}

export async function fetchHiddenNestPickupSuggestions(): Promise<HiddenNestPickupSuggestion[]> {
  const res = await fetch('/api/store/nest-pickup-suggestions', { cache: 'no-store' })
  const data = (await res.json()) as {
    suggestions?: HiddenNestPickupSuggestion[]
    error?: string
  }
  if (!res.ok) {
    throw new Error(data.error || 'Could not load hidden suggestions.')
  }
  return Array.isArray(data.suggestions) ? data.suggestions : []
}
