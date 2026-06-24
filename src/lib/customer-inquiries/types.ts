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

export type InquiryThreadMessage = {
  message_id: string
  role: 'customer' | 'shop'
  from: string
  from_name: string
  body: string
  received_at: string | null
  date_label: string | null
  is_latest_customer?: boolean
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
    recent_purchases?: Array<{
      description: string
      purchased_at: string
      total: number | null
      quantity: number | null
    }>
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
  thread_messages: InquiryThreadMessage[]
  thread_message_count: number
  last_customer_at: string | null
  last_shop_reply_at: string | null
  connected_account_id: string | null
  sender_name: string
  sender_email: string
  lightspeed_customer_name: string | null
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
  | 'lightspeed_customer_name'
  | 'subject'
  | 'snippet'
  | 'body_preview'
  | 'received_at'
  | 'intent'
  | 'priority'
  | 'status'
  | 'draft_body'
  | 'thread_message_count'
  | 'last_customer_at'
  | 'updated_at'
> & {
  /** Precomputed from the full thread row — do not re-derive from list fields alone. */
  needs_action: boolean
}

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
