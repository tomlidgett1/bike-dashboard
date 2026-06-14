import type { GmailSuggestionIntent, GmailSuggestionPriority } from '@/lib/composio/gmail-response-suggestions'

export type CustomerInquiryStatus =
  | 'new'
  | 'processing'
  | 'draft_ready'
  | 'sent'
  | 'ignored'
  | 'error'

export type CustomerInquiryIntent = GmailSuggestionIntent | 'technical_question'

export type CustomerInquiryPriority = GmailSuggestionPriority

export type InquiryCitation = {
  url: string
  title: string
  excerpt?: string | null
}

export type LightspeedInquiryContext = {
  matched: boolean
  customer_id?: string | null
  customer_name?: string | null
  customer_email?: string | null
  customer_phone?: string | null
  bikes?: Array<{
    label: string | null
    serial: string | null
    item_id: string | null
  }>
  recent_workorders?: Array<{
    id: string
    title: string | null
    status: string | null
    updated_at: string | null
  }>
  recent_sales_count?: number
  sales_summary?: {
    sale_count: number
    total_spend: number
    last_purchase_at: string | null
    last_purchase_total: number | null
    last_purchase_summary: string | null
  } | null
  summary?: string | null
}

export type EmailStyleProfile = {
  greeting_style: string
  signoff_style: string
  tone: string
  brevity: string
  common_phrases: string[]
  policy_notes: string[]
  sample_excerpt?: string | null
}

export type CustomerInquiryRow = {
  id: string
  user_id: string
  gmail_message_id: string
  gmail_thread_id: string | null
  connected_account_id: string | null
  sender_name: string
  sender_email: string
  subject: string
  snippet: string
  body_preview: string
  received_at: string | null
  intent: CustomerInquiryIntent
  priority: CustomerInquiryPriority
  status: CustomerInquiryStatus
  draft_body: string
  draft_subject: string | null
  citations: InquiryCitation[]
  lightspeed_context: LightspeedInquiryContext
  style_profile_version: number | null
  reasoning: string
  error_message: string | null
  retry_count: number
  last_synced_at: string | null
  draft_generated_at: string | null
  sent_at: string | null
  ignored_at: string | null
  created_at: string
  updated_at: string
}

export type CustomerInquiryListItem = Pick<
  CustomerInquiryRow,
  | 'id'
  | 'sender_name'
  | 'sender_email'
  | 'subject'
  | 'snippet'
  | 'body_preview'
  | 'received_at'
  | 'intent'
  | 'priority'
  | 'status'
  | 'draft_body'
  | 'updated_at'
>

export type CustomerInquiryEventType =
  | 'synced'
  | 'draft_generated'
  | 'draft_edited'
  | 'regenerated'
  | 'ignored'
  | 'sender_banned'
  | 'sent'
  | 'gmail_draft_created'
  | 'error'
