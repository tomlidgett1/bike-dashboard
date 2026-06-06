export type NestPickupSuggestion = {
  id: string
  workorderId: string
  customerId: string
  customerName: string
  mobile: string | null
  workSummary: string
  label: string
  messageDraft: string
  finishedAt: string
  statusName: string
  canSend: boolean
}

export type HiddenNestPickupSuggestion = NestPickupSuggestion & {
  hiddenAt: string
}

type HiddenPickupSuggestionRow = {
  workorder_id: string
  customer_id: string
  customer_name: string
  mobile: string | null
  work_summary: string
  label: string
  message_draft: string
  finished_at: string | null
  status_name: string
  can_send: boolean
  hidden_at: string
}

export function mapHiddenPickupSuggestionRow(row: HiddenPickupSuggestionRow): HiddenNestPickupSuggestion {
  return {
    id: row.workorder_id,
    workorderId: row.workorder_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    mobile: row.mobile,
    workSummary: row.work_summary,
    label: row.label,
    messageDraft: row.message_draft,
    finishedAt: row.finished_at ?? '',
    statusName: row.status_name,
    canSend: row.can_send,
    hiddenAt: row.hidden_at,
  }
}

export function pickupSuggestionToRow(
  userId: string,
  suggestion: NestPickupSuggestion,
): Record<string, unknown> {
  return {
    user_id: userId,
    workorder_id: suggestion.workorderId,
    customer_id: suggestion.customerId,
    customer_name: suggestion.customerName,
    mobile: suggestion.mobile,
    work_summary: suggestion.workSummary,
    label: suggestion.label,
    message_draft: suggestion.messageDraft,
    finished_at: suggestion.finishedAt || null,
    status_name: suggestion.statusName,
    can_send: suggestion.canSend,
    hidden_at: new Date().toISOString(),
  }
}
