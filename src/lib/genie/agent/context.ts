// Genie agent conversation context: message shapes and private structured-context compaction.

import fs from 'fs'
import path from 'path'

import { assistant as assistantMessage, user as userMessage, type AgentInputItem } from '@openai/agents'

import {
  listGenieWorkorders,
} from '@/lib/services/lightspeed/workorder-queries'
import type {
  GenieAnalysisPlanPayload,
  GenieAnalysisQueryPayload,
  GenieCustomerProfilePayload,
  GenieWorkorderCardsPayload,
} from '@/lib/types/genie-agent'

import type {
  GenieProposal,
  GmailEmailsPayload,
} from '@/lib/types/genie-agent'

interface Message {
  role: 'user' | 'assistant'
  content: string
  charts?: unknown[]
  tables?: unknown[]
  pivotTables?: unknown[]
  proposals?: GenieProposal[]
  gmailEmails?: GmailEmailsPayload
  products?: unknown[]
  workorders?: GenieWorkorderCardsPayload
  customerProfile?: GenieCustomerProfilePayload
  analysisPlan?: GenieAnalysisPlanPayload
  analysisQueries?: GenieAnalysisQueryPayload[]
  sources?: unknown[]
}

interface ComposioSessionIds {
  gmail?: string
}

interface StreamToolItem {
  name?: string
  rawItem?: {
    name?: string
    toolName?: string
  }
}

interface RawModelDeltaEvent {
  type?: string
  delta?: unknown
  text?: unknown
  part?: {
    text?: unknown
  }
  event?: {
    type?: string
    delta?: unknown
    text?: unknown
    part?: {
      text?: unknown
    }
  }
}

const MAX_PRIVATE_CONTEXT_CHARS = 12_000

function compactContextText(value: unknown, maxLength = 260): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`
}

function compactJsonForContext(value: unknown, maxLength = 1_400): string {
  try {
    const json = JSON.stringify(value, (_key, nestedValue) => {
      if (Array.isArray(nestedValue)) return nestedValue.slice(0, 5)
      if (typeof nestedValue === 'string') return compactContextText(nestedValue, 260)
      return nestedValue
    })
    return compactContextText(json, maxLength)
  } catch {
    return ''
  }
}

function compactProductForContext(product: unknown): string {
  if (!product || typeof product !== 'object') return compactContextText(product)
  const row = product as Record<string, unknown>
  const fields = [
    ['id', row.id ?? row.product_id ?? row.lightspeed_item_id],
    ['name', row.name ?? row.title ?? row.description],
    ['sku', row.sku ?? row.custom_sku ?? row.system_sku],
    ['brand', row.brand ?? row.brand_name],
    ['category', row.category ?? row.category_name ?? row.category_path],
    ['price', row.price ?? row.current_price ?? row.retail_price],
    ['sale_price', row.sale_price],
    ['stock', row.stock ?? row.qoh ?? row.quantity_on_hand],
  ]
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${key}=${compactContextText(value, 120)}`)
  return fields.length > 0 ? fields.join(', ') : compactJsonForContext(product, 500)
}

function compactWorkordersForContext(payload: GenieWorkorderCardsPayload): string {
  if (!payload?.workorders?.length) return ''
  const rows = payload.workorders.slice(0, 6).map(workorder => {
    const header = [
      `#${workorder.workorder_id}`,
      `status=${compactContextText(workorder.status_name, 80)}`,
      workorder.is_finished ? 'finished=true' : 'finished=false',
      `customer=${compactContextText(workorder.customer_name, 120)}`,
      workorder.customer_id ? `customer_id=${workorder.customer_id}` : '',
      workorder.sale_id ? `sale_id=${workorder.sale_id}` : '',
      workorder.time_in ? `time_in=${workorder.time_in}` : '',
      workorder.eta_out ? `eta_out=${workorder.eta_out}` : '',
      workorder.updated_at ? `updated_at=${workorder.updated_at}` : '',
      workorder.items_subtotal != null ? `items_subtotal=${workorder.items_subtotal}` : '',
    ].filter(Boolean).join(', ')

    const details = [
      workorder.note ? `note=${compactContextText(workorder.note, 500)}` : '',
      workorder.internal_note ? `internal_note=${compactContextText(workorder.internal_note, 360)}` : '',
      workorder.lines.length
        ? `lines=${workorder.lines.slice(0, 5).map(line =>
          `${line.done ? 'done' : 'open'}:${compactContextText(line.note, 160)}`,
        ).join(' | ')}`
        : '',
      workorder.items.length
        ? `items=${workorder.items.slice(0, 6).map(item => [
          compactContextText(item.description || 'item', 120),
          item.sku ? `sku ${compactContextText(item.sku, 80)}` : '',
          item.quantity != null ? `qty ${item.quantity}` : '',
          item.unit_price != null ? `$${item.unit_price}` : '',
          item.note ? compactContextText(item.note, 120) : '',
        ].filter(Boolean).join(' ')).join(' | ')}`
        : '',
    ].filter(Boolean)

    return [`- ${header}`, ...details.map(detail => `  ${detail}`)].join('\n')
  })

  return [
    `workorders title=${compactContextText(payload.title, 160)} scope=${payload.scope}${payload.truncated ? ' truncated=true' : ''}`,
    ...rows,
  ].join('\n')
}

function compactCustomerProfileForContext(profile: GenieCustomerProfilePayload): string {
  const customer = profile.customer
  const summary = profile.sales_summary
  const lines = [
    `customer_profile status=${profile.status} title=${compactContextText(profile.title, 160)} query=${compactContextText(profile.query, 120)}`,
  ]

  if (customer) {
    lines.push([
      `customer_id=${customer.customer_id}`,
      `name=${compactContextText(customer.name, 160)}`,
      customer.company ? `company=${compactContextText(customer.company, 120)}` : '',
      customer.phones[0]?.number ? `phone=${compactContextText(customer.phones[0].number, 80)}` : '',
      customer.emails[0]?.address ? `email=${compactContextText(customer.emails[0].address, 120)}` : '',
      customer.addresses[0]?.address1 ? `address=${compactContextText([
        customer.addresses[0].address1,
        customer.addresses[0].city,
        customer.addresses[0].state,
        customer.addresses[0].zip,
      ].filter(Boolean).join(', '), 180)}` : '',
      customer.archived ? 'archived=true' : '',
    ].filter(Boolean).join(', '))
  }

  if (summary) {
    lines.push([
      `sales sale_count=${summary.sale_count}`,
      `total_spend=${summary.total_spend}`,
      `gross_profit=${summary.gross_profit ?? 'unknown'}`,
      `units=${summary.units}`,
      `first_purchase_at=${summary.first_purchase_at ?? ''}`,
      `last_purchase_at=${summary.last_purchase_at ?? ''}`,
    ].join(', '))
  }

  if (profile.bikes.length) {
    lines.push([
      `bikes count=${profile.bikes.length}`,
      ...profile.bikes.slice(0, 6).map(bike => [
        `- serialized_id=${bike.serialized_id}`,
        bike.label ? `label=${compactContextText(bike.label, 160)}` : '',
        bike.serial ? `serial=${compactContextText(bike.serial, 80)}` : '',
        bike.item_id ? `item_id=${bike.item_id}` : '',
        `source=${bike.source}`,
        bike.linked_workorder_ids.length ? `linked_workorders=${bike.linked_workorder_ids.join('|')}` : '',
      ].filter(Boolean).join(', ')),
    ].join('\n'))
  }

  if (profile.workorders.length) {
    lines.push([
      `profile_workorders count=${profile.workorders.length}`,
      ...profile.workorders.slice(0, 5).map(workorder => [
        `- #${workorder.workorder_id}`,
        `status=${compactContextText(workorder.status_name, 80)}`,
        workorder.time_in ? `time_in=${workorder.time_in}` : '',
        workorder.eta_out ? `eta_out=${workorder.eta_out}` : '',
        workorder.serialized_id ? `serialized_id=${workorder.serialized_id}` : '',
        workorder.note ? `note=${compactContextText(workorder.note, 220)}` : '',
        workorder.internal_note ? `internal_note=${compactContextText(workorder.internal_note, 220)}` : '',
      ].filter(Boolean).join(', ')),
    ].join('\n'))
  }

  if (profile.recent_sales.length) {
    lines.push([
      `recent_sales count=${profile.recent_sales.length}`,
      ...profile.recent_sales.slice(0, 5).map(sale => [
        `- sale_id=${sale.sale_id}`,
        sale.ticket_number ? `ticket=${sale.ticket_number}` : '',
        `date=${sale.completed_at ?? sale.completed_at_utc ?? ''}`,
        `total=${sale.total}`,
        sale.items ? `items=${compactContextText(sale.items, 180)}` : '',
      ].filter(Boolean).join(', ')),
    ].join('\n'))
  }

  if (profile.top_items.length) {
    lines.push([
      `top_items count=${profile.top_items.length}`,
      ...profile.top_items.slice(0, 5).map(item => [
        `- ${compactContextText(item.description, 160)}`,
        item.sku ? `sku=${compactContextText(item.sku, 80)}` : '',
        `qty=${item.quantity}`,
        `gross_sales=${item.gross_sales}`,
      ].filter(Boolean).join(', ')),
    ].join('\n'))
  }

  lines.push([
    `data_quality sales_rows_checked=${profile.data_quality.sales_rows_checked}`,
    profile.data_quality.sales_row_limit_reached ? 'sales_row_limit_reached=true' : '',
    profile.data_quality.workorders_truncated ? 'workorders_truncated=true' : '',
    profile.data_quality.serialized_status === 'error'
      ? `serialized_error=${compactContextText(profile.data_quality.serialized_error, 180)}`
      : '',
  ].filter(Boolean).join(', '))

  return compactContextText(lines.filter(Boolean).join('\n'), 4_000)
}

function fullWorkorderForAgent(row: Awaited<ReturnType<typeof listGenieWorkorders>>['workorders'][number]) {
  return {
    workorder_id: row.workorder_id,
    customer_id: row.customer_id,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    customer_email: row.customer_email,
    status_id: row.status_id,
    status_name: row.status_name,
    status_system_value: row.status_system_value,
    is_finished: row.is_finished,
    archived: row.archived,
    time_in: row.time_in,
    eta_out: row.eta_out,
    updated_at: row.updated_at,
    note: row.note,
    internal_note: row.internal_note,
    warranty: row.warranty,
    serialized_id: row.serialized_id,
    sale_id: row.sale_id,
    employee_id: row.employee_id,
    shop_id: row.shop_id,
    lines: row.lines.map(line => ({
      line_id: line.line_id,
      note: line.note,
      done: line.done,
    })),
    items: row.items.map(item => ({
      item_id: item.item_id,
      description: item.description,
      sku: item.sku,
      note: item.note,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: item.line_total,
    })),
    items_subtotal: row.items_subtotal,
  }
}

function compactGmailForContext(payload: GmailEmailsPayload): string {
  if (!payload?.emails?.length && !payload.agent_context?.message_bodies?.length) return ''

  const lines = [
    `gmail ui_mode=${payload.ui_mode ?? 'search_summary'} title=${compactContextText(payload.title, 120)} query=${compactContextText(payload.query, 160)}`,
    payload.connected_mailboxes?.length
      ? `mailboxes=${payload.connected_mailboxes.map((mailbox) => mailbox.email_address ?? mailbox.label).join(', ')}`
      : '',
    `emails count=${payload.emails.length}`,
    ...payload.emails.slice(0, 8).map((email) => {
      const parts = [
        `message_id=${email.message_id}`,
        email.connected_account_id ? `connected_account_id=${email.connected_account_id}` : '',
        email.thread_id ? `thread_id=${email.thread_id}` : '',
        email.mailbox_label ? `mailbox=${compactContextText(email.mailbox_label, 80)}` : '',
        `from=${compactContextText(email.from, 180)}`,
        email.to ? `to=${compactContextText(email.to, 120)}` : '',
        `subject=${compactContextText(email.subject, 160)}`,
        email.date_label ? `date=${email.date_label}` : '',
        `snippet=${compactContextText(email.snippet, 220)}`,
      ].filter(Boolean)
      return `- ${parts.join(', ')}`
    }),
  ]

  const bodies = payload.agent_context?.message_bodies ?? []
  if (bodies.length > 0) {
    lines.push('message_bodies:')
    for (const body of bodies.slice(0, 5)) {
      lines.push([
        `- message_id=${body.message_id}`,
        body.connected_account_id ? `connected_account_id=${body.connected_account_id}` : '',
        body.thread_id ? `thread_id=${body.thread_id}` : '',
        `from=${compactContextText(body.from, 180)}`,
        body.to ? `to=${compactContextText(body.to, 120)}` : '',
        `subject=${compactContextText(body.subject, 160)}`,
        `body=${compactContextText(body.body_text, 900)}`,
      ].filter(Boolean).join(', '))
    }
  }

  return lines.filter(Boolean).join('\n')
}

function gmailUiBodyExcerpt(bodyText: string): string {
  return compactContextText(bodyText, 520)
}

function buildVisibleGmailPayload(payload: GmailEmailsPayload): GmailEmailsPayload | null {
  if (payload.ui_mode === 'hidden') return null

  const hasVisibleContent =
    payload.emails.length > 0
    || Boolean(payload.message_bodies?.length)
    || Boolean(payload.contact_analysis)
    || payload.scan_stats?.total_matched === 0

  if (!hasVisibleContent) return null

  return {
    ...payload,
    message_bodies: payload.message_bodies?.slice(0, 4).map((message) => ({
      ...message,
      body_text: gmailUiBodyExcerpt(message.body_text),
      body_truncated: message.body_truncated || message.body_text.length > 520,
    })),
  }
}

function privateContextForMessage(message: Message): string {
  const sections: string[] = []

  if (message.gmailEmails?.emails?.length || message.gmailEmails?.agent_context?.message_bodies?.length) {
    sections.push(compactGmailForContext(message.gmailEmails))
  }

  if (message.workorders?.workorders?.length) {
    sections.push(compactWorkordersForContext(message.workorders))
  }

  if (message.customerProfile) {
    sections.push(compactCustomerProfileForContext(message.customerProfile))
  }

  if (message.products?.length) {
    sections.push([
      `products count=${message.products.length}`,
      ...message.products.slice(0, 8).map(product => `- ${compactProductForContext(product)}`),
    ].join('\n'))
  }

  if (message.proposals?.length) {
    sections.push(`proposals count=${message.proposals.length} latest=${compactJsonForContext(message.proposals.at(-1), 1_200)}`)
  }

  if (message.analysisPlan) {
    sections.push(`analysis_plan=${compactJsonForContext(message.analysisPlan, 1_200)}`)
  }

  if (message.analysisQueries?.length) {
    sections.push([
      `analysis_queries count=${message.analysisQueries.length}`,
      ...message.analysisQueries.slice(-6).map(query => [
        `- ${query.tool_name}`,
        `status=${query.status}`,
        query.purpose ? `purpose=${compactContextText(query.purpose, 160)}` : '',
        query.row_count != null ? `rows=${query.row_count}` : '',
        query.error ? `error=${compactContextText(query.error, 180)}` : '',
      ].filter(Boolean).join(', ')),
    ].join('\n'))
  }

  if (message.tables?.length) {
    sections.push(`tables count=${message.tables.length} latest=${compactJsonForContext(message.tables.at(-1), 1_400)}`)
  }

  if (message.charts?.length) {
    sections.push(`charts count=${message.charts.length} latest=${compactJsonForContext(message.charts.at(-1), 1_200)}`)
  }

  if (message.pivotTables?.length) {
    sections.push(`pivot_tables count=${message.pivotTables.length} latest=${compactJsonForContext(message.pivotTables.at(-1), 1_200)}`)
  }

  if (message.sources?.length) {
    sections.push(`sources count=${message.sources.length} latest=${compactJsonForContext(message.sources.slice(-5), 1_000)}`)
  }

  return compactContextText(sections.filter(Boolean).join('\n\n'), MAX_PRIVATE_CONTEXT_CHARS)
}

function contentForAgent(message: Message): string {
  if (message.role !== 'assistant') return message.content
  const privateContext = privateContextForMessage(message)
  if (!privateContext) return message.content
  return `${message.content}\n\n[Private structured context from previous Genie tool results. Use it to resolve follow-ups, but do not quote this marker to the user.]\n${privateContext}`
}

function toAgentInputMessages(messages: Message[]): AgentInputItem[] {
  return messages.map(message =>
    message.role === 'user'
      ? userMessage(contentForAgent(message))
      : assistantMessage(contentForAgent(message)),
  )
}

const ROUTER_MAX_MESSAGES = 6
const ROUTER_MAX_CHARS_PER_MESSAGE = 1_000

/**
 * Trimmed conversation for the LLM router: recent turns only, with each message
 * capped so the head of any private structured context (where resolved entity
 * names live) survives but the full 12k-char evidence blocks do not. Routing is
 * input-bound on the nano model, so this directly cuts router latency.
 */
function toRouterInputMessages(messages: Message[]): AgentInputItem[] {
  return messages.slice(-ROUTER_MAX_MESSAGES).map(message => {
    const content = contentForAgent(message)
    const trimmed = content.length > ROUTER_MAX_CHARS_PER_MESSAGE
      ? `${content.slice(0, ROUTER_MAX_CHARS_PER_MESSAGE)}\n…[context truncated for routing]`
      : content
    return message.role === 'user' ? userMessage(trimmed) : assistantMessage(trimmed)
  })
}

export {
  MAX_PRIVATE_CONTEXT_CHARS,
  compactContextText,
  compactJsonForContext,
  compactProductForContext,
  compactWorkordersForContext,
  compactCustomerProfileForContext,
  fullWorkorderForAgent,
  compactGmailForContext,
  gmailUiBodyExcerpt,
  buildVisibleGmailPayload,
  privateContextForMessage,
  contentForAgent,
  toAgentInputMessages,
  toRouterInputMessages,
}
export type { Message, ComposioSessionIds, StreamToolItem, RawModelDeltaEvent }
