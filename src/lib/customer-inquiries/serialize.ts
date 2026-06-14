import type {
  CustomerInquiryListItem,
  CustomerInquiryRow,
} from '@/lib/customer-inquiries/types'

export function serializeInquiryListItem(row: CustomerInquiryRow): CustomerInquiryListItem {
  return {
    id: row.id,
    sender_name: row.sender_name,
    sender_email: row.sender_email,
    subject: row.subject,
    snippet: row.snippet,
    body_preview: row.body_preview,
    received_at: row.received_at,
    intent: row.intent,
    priority: row.priority,
    status: row.status,
    draft_body: row.draft_body,
    thread_message_count: row.thread_message_count,
    updated_at: row.updated_at,
  }
}

export function serializeInquiryDetail(row: CustomerInquiryRow) {
  return {
    id: row.id,
    sender_name: row.sender_name,
    sender_email: row.sender_email,
    subject: row.subject,
    snippet: row.snippet,
    body_preview: row.body_preview,
    received_at: row.received_at,
    intent: row.intent,
    priority: row.priority,
    status: row.status,
    draft_body: row.draft_body,
    draft_subject: row.draft_subject,
    citations: row.citations,
    lightspeed_context: row.lightspeed_context,
    reasoning: row.reasoning,
    error_message: row.error_message,
    last_synced_at: row.last_synced_at,
    draft_generated_at: row.draft_generated_at,
    sent_at: row.sent_at,
    ignored_at: row.ignored_at,
    thread_messages: row.thread_messages,
    thread_message_count: row.thread_message_count,
    last_customer_at: row.last_customer_at,
    last_shop_reply_at: row.last_shop_reply_at,
    updated_at: row.updated_at,
  }
}
