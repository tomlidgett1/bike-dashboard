import type { GmailResponseSuggestion } from '@/lib/composio/gmail-response-suggestions'

export type GmailSuggestionsResponse = {
  suggestions?: GmailResponseSuggestion[]
  gmail?: {
    configured?: boolean
    connected?: boolean
    connectUrl?: string | null
    accounts?: Array<{
      id: string
      label: string
      email_address: string | null
      status: string
    }>
  }
  error?: string
}

export async function fetchGmailResponseSuggestions(): Promise<GmailSuggestionsResponse> {
  const res = await fetch('/api/store/homev2-gmail-suggestions', { cache: 'no-store' })
  const data = (await res.json()) as GmailSuggestionsResponse
  if (!res.ok) {
    throw new Error(data.error || 'Could not load Gmail suggestions.')
  }
  return data
}

export async function hideGmailResponseSuggestion(
  suggestion: GmailResponseSuggestion,
): Promise<void> {
  const res = await fetch('/api/store/homev2-gmail-suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'hide', suggestion }),
  })
  const data = (await res.json()) as { error?: string }
  if (!res.ok) {
    throw new Error(data.error || 'Could not hide Gmail suggestion.')
  }
}

export async function createGmailResponseDraft(
  suggestion: GmailResponseSuggestion,
  responseDraft: string,
): Promise<{ message: string }> {
  const res = await fetch('/api/store/homev2-gmail-suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'draft', suggestion, responseDraft }),
  })
  const data = (await res.json()) as { error?: string; message?: string }
  if (!res.ok) {
    throw new Error(data.error || 'Could not create Gmail draft.')
  }
  return { message: data.message || 'Created Gmail draft.' }
}
