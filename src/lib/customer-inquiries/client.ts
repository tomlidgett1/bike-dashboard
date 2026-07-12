import type {
  CustomerInquiryListItem,
  CustomerInquiryStatus,
} from '@/lib/customer-inquiries/types'
import { notifyInboxNeedsActionChanged } from '@/lib/customer-inquiries/inbox-needs-action-events'

export type CustomerInquiryDetail = {
  id: string
  sender_name: string
  sender_email: string
  lightspeed_customer_name: string | null
  subject: string
  snippet: string
  body_preview: string
  received_at: string | null
  intent: string
  priority: string
  status: CustomerInquiryStatus
  draft_body: string
  draft_subject: string | null
  citations: Array<{ url: string; title: string; excerpt?: string | null }>
  lightspeed_context: Record<string, unknown>
  reasoning: string
  error_message: string | null
  last_synced_at: string | null
  draft_generated_at: string | null
  sent_at: string | null
  ignored_at: string | null
  thread_messages: Array<{
    message_id: string
    role: 'customer' | 'shop'
    from: string
    from_name: string
    body: string
    received_at: string | null
    date_label: string | null
    is_latest_customer?: boolean
  }>
  thread_message_count: number
  last_customer_at: string | null
  last_shop_reply_at: string | null
  updated_at: string
}

export type CustomerInquiriesResponse = {
  inquiries?: CustomerInquiryListItem[]
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
  sync?: {
    inquiries_created?: number
    inquiries_processed?: number
    inquiries_failed?: number
  }
  error?: string
}

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T
}

export async function fetchCustomerInquiries(
  status?: CustomerInquiryStatus | 'all',
  options?: { summary?: boolean },
): Promise<CustomerInquiriesResponse> {
  const query = new URLSearchParams()
  if (status && status !== 'all') query.set('status', status)
  if (options?.summary) query.set('summary', '1')
  const suffix = query.size > 0 ? `?${query.toString()}` : ''
  const res = await fetch(`/api/store/customer-inquiries${suffix}`, { cache: 'no-store' })
  const data = await parseJson<CustomerInquiriesResponse>(res)
  if (!res.ok) {
    throw new Error(data.error || 'Could not load customer inquiries.')
  }
  return data
}

export async function refreshCustomerInquiries(): Promise<CustomerInquiriesResponse> {
  const res = await fetch('/api/store/customer-inquiries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'refresh' }),
  })
  const data = await parseJson<CustomerInquiriesResponse>(res)
  if (!res.ok) {
    throw new Error(data.error || 'Could not refresh customer inquiries.')
  }
  return data
}

export async function fetchCustomerInquiry(id: string): Promise<{ inquiry: CustomerInquiryDetail }> {
  const res = await fetch(`/api/store/customer-inquiries/${id}`, { cache: 'no-store' })
  const data = await parseJson<{ inquiry?: CustomerInquiryDetail; error?: string }>(res)
  if (!res.ok || !data.inquiry) {
    throw new Error(data.error || 'Could not load inquiry.')
  }
  return { inquiry: data.inquiry }
}

export async function updateCustomerInquiry(
  id: string,
  payload: { draft_body?: string; status?: 'ignored' | 'draft_ready' },
): Promise<{ inquiry: CustomerInquiryDetail }> {
  const res = await fetch(`/api/store/customer-inquiries/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await parseJson<{ inquiry?: CustomerInquiryDetail; error?: string }>(res)
  if (!res.ok || !data.inquiry) {
    throw new Error(data.error || 'Could not update inquiry.')
  }
  return { inquiry: data.inquiry }
}

export async function regenerateCustomerInquiryDraft(
  id: string,
): Promise<{ inquiry: CustomerInquiryDetail }> {
  const res = await fetch(`/api/store/customer-inquiries/${id}/regenerate`, {
    method: 'POST',
  })
  const data = await parseJson<{ inquiry?: CustomerInquiryDetail; error?: string }>(res)
  if (!res.ok || !data.inquiry) {
    throw new Error(data.error || 'Could not regenerate draft.')
  }
  return { inquiry: data.inquiry }
}

export async function sendCustomerInquiryReply(
  id: string,
  draftBody: string,
): Promise<{ message: string; inquiry: CustomerInquiryDetail }> {
  const res = await fetch(`/api/store/customer-inquiries/${id}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draft_body: draftBody }),
  })
  const data = await parseJson<{
    message?: string
    inquiry?: CustomerInquiryDetail
    error?: string
  }>(res)
  if (!res.ok || !data.inquiry) {
    throw new Error(data.error || 'Could not send reply.')
  }
  notifyInboxNeedsActionChanged()
  return {
    message: data.message || 'Reply sent.',
    inquiry: data.inquiry,
  }
}

export async function banCustomerInquirySender(
  id: string,
): Promise<{ message: string; inquiry: CustomerInquiryDetail }> {
  const res = await fetch(`/api/store/customer-inquiries/${id}/ban`, {
    method: 'POST',
  })
  const data = await parseJson<{
    message?: string
    inquiry?: CustomerInquiryDetail
    error?: string
  }>(res)
  if (!res.ok || !data.inquiry) {
    throw new Error(data.error || 'Could not ban sender.')
  }
  return {
    message: data.message || 'Sender banned.',
    inquiry: data.inquiry,
  }
}

export async function mintCustomerInquiriesGmailConnectUrl(): Promise<string> {
  const res = await fetch('/api/store/customer-inquiries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'connect' }),
  })
  const data = await parseJson<{ connectUrl?: string; error?: string }>(res)
  if (!res.ok || !data.connectUrl) {
    throw new Error(data.error || 'Could not start Gmail connection.')
  }
  return data.connectUrl
}

export type EmailStyleProfileResponse = {
  profile?: {
    greeting_style: string
    signoff_style: string
    tone: string
    brevity: string
    common_phrases: string[]
    policy_notes: string[]
    sample_excerpt?: string | null
  }
  error?: string
}

export async function fetchEmailStyleProfile(): Promise<EmailStyleProfileResponse['profile']> {
  const res = await fetch('/api/store/customer-inquiries/style-profile', { cache: 'no-store' })
  const data = await parseJson<EmailStyleProfileResponse>(res)
  if (!res.ok || !data.profile) {
    throw new Error(data.error || 'Could not load reply style.')
  }
  return data.profile
}

export async function updateEmailStyleProfile(payload: {
  greeting_style?: string
  signoff_style?: string
}): Promise<EmailStyleProfileResponse['profile']> {
  const res = await fetch('/api/store/customer-inquiries/style-profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await parseJson<EmailStyleProfileResponse>(res)
  if (!res.ok || !data.profile) {
    throw new Error(data.error || 'Could not save reply style.')
  }
  return data.profile
}

export async function reviseCustomerInquiryDraft(
  id: string,
  payload: { instruction: string; draft_body: string },
): Promise<{ inquiry: CustomerInquiryDetail }> {
  const res = await fetch(`/api/store/customer-inquiries/${id}/revise`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await parseJson<{ inquiry?: CustomerInquiryDetail; error?: string }>(res)
  if (!res.ok || !data.inquiry) {
    throw new Error(data.error || 'Could not revise draft.')
  }
  return { inquiry: data.inquiry }
}
