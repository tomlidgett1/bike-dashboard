// Genie direct paths: prefetch + answer helpers for customer-profile, customer-bike, and sales-summary fast paths.

import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

import { createServiceRoleClient } from '@/lib/supabase/server'

import type {
  GenieCustomerBikeProfile,
  GenieCustomerProfilePayload,
} from '@/lib/types/genie-agent'

import { STORE_TIME_ZONE, getStoreToday } from './runtime'
import { compactContextText, type Message } from './context'

import {
  addUtcDays,
  buildGenericSqlTable,
  emitAnalysisQuery,
  formatAud,
  isoDateFromUtcDate,
  isoDateToUtcDate,
  normalizeText,
  roundMoney,
  roundPercent,
  sqlLiteral,
  storeLocalTimeToUtcTimestamp,
  toNum,
  toOptionalNum,
  type Emit,
  type VisualPrefs,
} from './tools'

interface DirectSalesSummaryLookup {
  startDate: string
  endDate: string
  label: string
}

interface DirectSalesSummaryResult {
  source: 'direct_sales_summary'
  date_range: {
    start_date: string
    end_date: string
    timezone: string
  }
  label: string
  sale_count: number
  line_count: number
  gross_sales: number
  net_sales: number
  tax_estimate: number
  discounts: number
  total_cost: number
  gross_profit: number
  gross_margin_percent: number | null
  average_sale_value: number
  line_limit_reached: boolean
}

const DIRECT_SALES_SUMMARY_LINE_LIMIT = 10_000

/**
 * Parses the LLM router's entity_query period phrase into a concrete store-time
 * date range. Routing intent is the router's job; this is pure date plumbing.
 */
function resolveDirectSalesSummaryPeriod(phrase: string): DirectSalesSummaryLookup | null {
  const text = normalizeText(phrase)
  if (!text) return null

  const today = getStoreToday()
  const todayDate = isoDateToUtcDate(today)

  if (/\byesterday\b/.test(text)) {
    const date = isoDateFromUtcDate(addUtcDays(todayDate, -1))
    return { startDate: date, endDate: date, label: 'yesterday' }
  }
  if (/\btoday\b/.test(text)) {
    return { startDate: today, endDate: today, label: 'today' }
  }

  // Weeks are Monday-based in store reporting.
  const dow = todayDate.getUTCDay() === 0 ? 7 : todayDate.getUTCDay()
  if (/\bthis week\b/.test(text)) {
    const monday = isoDateFromUtcDate(addUtcDays(todayDate, -(dow - 1)))
    return { startDate: monday, endDate: today, label: 'this week' }
  }
  if (/\blast week\b/.test(text)) {
    const monday = isoDateFromUtcDate(addUtcDays(todayDate, -(dow - 1) - 7))
    const sunday = isoDateFromUtcDate(addUtcDays(todayDate, -dow))
    return { startDate: monday, endDate: sunday, label: 'last week' }
  }

  const year = todayDate.getUTCFullYear()
  const month = todayDate.getUTCMonth()
  const iso = (y: number, m: number, d: number) =>
    `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()

  if (/\bthis month\b/.test(text)) {
    return { startDate: iso(year, month, 1), endDate: today, label: 'this month' }
  }
  if (/\blast month\b/.test(text)) {
    const y = month === 0 ? year - 1 : year
    const m = month === 0 ? 11 : month - 1
    return { startDate: iso(y, m, 1), endDate: iso(y, m, lastDayOfMonth(y, m)), label: 'last month' }
  }
  if (/\bthis year\b/.test(text)) {
    return { startDate: iso(year, 0, 1), endDate: today, label: 'this year' }
  }
  if (/\blast year\b/.test(text)) {
    return { startDate: iso(year - 1, 0, 1), endDate: iso(year - 1, 11, 31), label: 'last year' }
  }

  const explicitDate = phrase.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1]
  if (explicitDate) {
    return { startDate: explicitDate, endDate: explicitDate, label: explicitDate }
  }

  const namedMonth = text.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b(?:\s+(20\d{2}))?/)
  if (namedMonth) {
    const monthIndex = ['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(namedMonth[1])
    let y = namedMonth[2] ? Number(namedMonth[2]) : year
    // A bare month name means the most recent occurrence of that month.
    if (!namedMonth[2] && monthIndex > month) y -= 1
    return {
      startDate: iso(y, monthIndex, 1),
      endDate: iso(y, monthIndex, lastDayOfMonth(y, monthIndex)),
      label: `${namedMonth[1]}${namedMonth[2] ? ` ${namedMonth[2]}` : ''}`,
    }
  }

  const bareYear = text.match(/\b(20\d{2})\b/)
  if (bareYear) {
    const y = Number(bareYear[1])
    return { startDate: iso(y, 0, 1), endDate: y === year ? today : iso(y, 11, 31), label: bareYear[1] }
  }

  return null
}

function resolveDirectSalesSummaryLookup(message: string): DirectSalesSummaryLookup | null {
  const text = normalizeText(message)
  if (!text) return null

  const hasSalesIntent = /\b(any sales|sales?|takings?|revenue|turnover|gross sales|net sales|gross profit|profit|margin|made|took)\b/.test(text)
  if (!hasSalesIntent) return null

  const complexIntent = /\b(top|best|rank|ranking|list|every|each|transaction|transactions|receipt|receipts|orders?|line items?|products?|items?|services?|customers?|category|categories|breakdown|trend|chart|graph|compare|comparison|vs|versus|weekly|monthly|yearly|this month|last month|this week|last week|this year|last year|between|from .+ to)\b/.test(text)
  if (complexIntent) return null

  const today = getStoreToday()
  const todayDate = isoDateToUtcDate(today)
  if (/\byesterday\b/.test(text)) {
    const date = isoDateFromUtcDate(addUtcDays(todayDate, -1))
    return { startDate: date, endDate: date, label: 'yesterday' }
  }

  if (/\btoday\b/.test(text)) {
    return { startDate: today, endDate: today, label: 'today' }
  }

  const explicitDate = message.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1]
  if (explicitDate) {
    return { startDate: explicitDate, endDate: explicitDate, label: explicitDate }
  }

  return null
}

function directSalesSummarySqlForDisplay(lookup: DirectSalesSummaryLookup): string {
  const startUtc = storeLocalTimeToUtcTimestamp(lookup.startDate, '00:00:00')
  const endExclusiveDate = isoDateFromUtcDate(addUtcDays(isoDateToUtcDate(lookup.endDate), 1))
  const endExclusiveUtc = storeLocalTimeToUtcTimestamp(endExclusiveDate, '00:00:00')
  return [
    'SELECT sale_id, total, subtotal, cost, profit, discount, quantity',
    'FROM lightspeed_sales_report_lines',
    'WHERE user_id = <current_store>',
    `  AND complete_time >= ${sqlLiteral(startUtc)}`,
    `  AND complete_time < ${sqlLiteral(endExclusiveUtc)}`,
    'ORDER BY complete_time DESC',
    `LIMIT ${DIRECT_SALES_SUMMARY_LINE_LIMIT}`,
  ].join('\n')
}

async function getDirectSalesSummary(
  userId: string,
  lookup: DirectSalesSummaryLookup,
  emit: Emit,
  visualPrefs: VisualPrefs,
): Promise<DirectSalesSummaryResult> {
  const queryId = randomUUID()
  const startUtc = storeLocalTimeToUtcTimestamp(lookup.startDate, '00:00:00')
  const endExclusiveDate = isoDateFromUtcDate(addUtcDays(isoDateToUtcDate(lookup.endDate), 1))
  const endExclusiveUtc = storeLocalTimeToUtcTimestamp(endExclusiveDate, '00:00:00')
  const sql = directSalesSummarySqlForDisplay(lookup)

  emitAnalysisQuery(emit, {
    id: queryId,
    tool_name: 'direct_sales_summary',
    purpose: `Fast sales summary for ${lookup.label}`,
    sql,
    status: 'running',
  })

  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('lightspeed_sales_report_lines')
    .select('sale_id,total,subtotal,cost,profit,discount,quantity')
    .eq('user_id', userId)
    .not('complete_time', 'is', null)
    .gte('complete_time', startUtc)
    .lt('complete_time', endExclusiveUtc)
    .order('complete_time', { ascending: false })
    .range(0, DIRECT_SALES_SUMMARY_LINE_LIMIT - 1)

  if (error) {
    emitAnalysisQuery(emit, {
      id: queryId,
      tool_name: 'direct_sales_summary',
      purpose: `Fast sales summary for ${lookup.label}`,
      sql,
      status: 'error',
      error: error.message,
    })
    throw new Error(`Fast sales summary failed: ${error.message}`)
  }

  const lines = Array.isArray(data) ? data : []
  const saleIds = new Set(lines.map(line => String(line.sale_id ?? '')).filter(Boolean))
  const grossSales = lines.reduce((sum, line) => sum + toNum(line.total), 0)
  const netSales = lines.reduce((sum, line) => sum + toNum(line.subtotal), 0)
  const discounts = lines.reduce((sum, line) => sum + toNum(line.discount), 0)
  const totalCost = lines.reduce((sum, line) => sum + toNum(line.cost), 0)
  const grossProfit = lines.reduce((sum, line) => {
    const profit = toOptionalNum(line.profit)
    return sum + (profit ?? (toNum(line.subtotal) - toNum(line.cost)))
  }, 0)
  const saleCount = saleIds.size
  const lineLimitReached = lines.length >= DIRECT_SALES_SUMMARY_LINE_LIMIT
  const result: DirectSalesSummaryResult = {
    source: 'direct_sales_summary',
    date_range: {
      start_date: lookup.startDate,
      end_date: lookup.endDate,
      timezone: STORE_TIME_ZONE,
    },
    label: lookup.label,
    sale_count: saleCount,
    line_count: lines.length,
    gross_sales: roundMoney(grossSales),
    net_sales: roundMoney(netSales),
    tax_estimate: roundMoney(grossSales - netSales),
    discounts: roundMoney(discounts),
    total_cost: roundMoney(totalCost),
    gross_profit: roundMoney(grossProfit),
    gross_margin_percent: netSales > 0 ? roundPercent((grossProfit / netSales) * 100) : null,
    average_sale_value: saleCount > 0 ? roundMoney(grossSales / saleCount) : 0,
    line_limit_reached: lineLimitReached,
  }

  emitAnalysisQuery(emit, {
    id: queryId,
    tool_name: 'direct_sales_summary',
    purpose: `Fast sales summary for ${lookup.label}`,
    sql,
    status: 'ok',
    row_count: 1,
  })

  if (visualPrefs.table) {
    const table = buildGenericSqlTable([{
      date: lookup.startDate === lookup.endDate ? lookup.startDate : `${lookup.startDate} to ${lookup.endDate}`,
      sale_count: result.sale_count,
      gross_sales: result.gross_sales,
      net_sales: result.net_sales,
      gross_profit: result.gross_profit,
      gross_margin_percent: result.gross_margin_percent,
      average_sale_value: result.average_sale_value,
    }], {
      table_title: 'Sales summary',
      table_subtitle: `${lookup.label} · ${STORE_TIME_ZONE}`,
    }, false)
    if (table) emit({ event: 'table', table })
  }

  return result
}

function directSalesSummaryAnswer(result: DirectSalesSummaryResult): string {
  const period = result.date_range.start_date === result.date_range.end_date
    ? result.date_range.start_date
    : `${result.date_range.start_date} to ${result.date_range.end_date}`
  const margin = result.gross_margin_percent == null ? 'n/a' : `${result.gross_margin_percent}%`
  const caveat = result.line_limit_reached
    ? `\n\n**Caveat:** hit the ${DIRECT_SALES_SUMMARY_LINE_LIMIT.toLocaleString('en-AU')} line safety cap, so this should be rerun as a broader report.`
    : ''

  if (result.sale_count === 0) {
    return [
      `No — I found **0 completed sales** for **${result.label}**.`,
      '',
      `**Date range:** ${period} (${result.date_range.timezone})`,
      `**Checked:** synced Lightspeed sales report.`,
      caveat,
    ].filter(Boolean).join('\n')
  }

  return [
    `Yes — there were **${result.sale_count} completed sales** ${result.label}, totalling **${formatAud(result.gross_sales)} gross**.`,
    '',
    `- **Net sales:** ${formatAud(result.net_sales)}`,
    `- **Gross profit:** ${formatAud(result.gross_profit)} (${margin} margin)`,
    `- **Average sale:** ${formatAud(result.average_sale_value)}`,
    `- **Date range:** ${period} (${result.date_range.timezone})`,
    caveat,
  ].filter(Boolean).join('\n')
}

function latestCustomerReferenceFromMessages(messages: Message[]): {
  customer_id?: string
  query: string
  source: 'customer_profile' | 'workorders'
} | null {
  for (let index = messages.length - 2; index >= 0; index--) {
    const message = messages[index]
    if (!message || message.role !== 'assistant') continue

    const profile = message.customerProfile
    if (profile?.status === 'resolved' && profile.customer?.customer_id) {
      return {
        customer_id: profile.customer.customer_id,
        query: profile.customer.name || profile.customer.customer_id,
        source: 'customer_profile',
      }
    }

    const workorder = message.workorders?.workorders.find(candidate =>
      candidate.customer_id && candidate.customer_id !== '0',
    )
    if (workorder?.customer_id) {
      return {
        customer_id: workorder.customer_id,
        query: workorder.customer_name || workorder.customer_id,
        source: 'workorders',
      }
    }
  }

  return null
}

function customerProfileAnswer(profile: GenieCustomerProfilePayload): string {
  if (profile.status === 'ambiguous') {
    const candidates = profile.candidates
      .slice(0, 5)
      .map(candidate => `- ${candidate.name}${candidate.company ? ` (${candidate.company})` : ''} - customer #${candidate.customer_id}`)
      .join('\n')
    return [
      `I found multiple possible customers for "${profile.query ?? 'that customer'}".`,
      candidates || 'No candidate details were returned.',
      'Choose the customer ID and I can pull the full profile.',
    ].filter(Boolean).join('\n')
  }

  if (profile.status === 'not_found' || !profile.customer) {
    return `I could not find a matching Lightspeed customer for "${profile.query ?? 'that customer'}". Try the customer ID, phone number, or email.`
  }

  const summary = profile.sales_summary
  const directBikes = profile.bikes.filter(bike => bike.source !== 'sales_or_workorder_inference')
  const inferredBikeCount = profile.bikes.length - directBikes.length
  const bikeLines = directBikes.slice(0, 5).map(bike => {
    const label = bike.label?.trim() || `Serialized #${bike.serialized_id}`
    const facts = [
      bike.serial ? `serial ${bike.serial}` : '',
      bike.linked_workorder_ids.length ? `WO ${bike.linked_workorder_ids.map(id => `#${id}`).join(', ')}` : '',
    ].filter(Boolean).join('; ')
    return `- ${label}${facts ? ` (${facts})` : ''}`
  })
  if (inferredBikeCount > 0) {
    bikeLines.push(`- ${inferredBikeCount} weaker bike clue${inferredBikeCount === 1 ? '' : 's'} from sales/work-order text`)
  }

  const workorderLines = profile.workorders.slice(0, 4).map(workorder => [
    `- #${workorder.workorder_id}`,
    workorder.status_name,
    workorder.time_in ? workorder.time_in.slice(0, 10) : '',
    compactContextText(workorder.note || workorder.internal_note || '', 120),
  ].filter(Boolean).join(' - '))

  const topItemLines = profile.top_items.slice(0, 4).map(item =>
    `- ${compactContextText(item.description, 120)} (${item.quantity} sold, $${Math.round(item.gross_sales)})`,
  )

  return [
    `**Customer profile - ${profile.customer.name}**`,
    [
      `Customer #${profile.customer.customer_id}`,
      summary ? `${summary.sale_count} sale${summary.sale_count === 1 ? '' : 's'}` : '',
      summary ? `$${Math.round(summary.total_spend)} lifetime spend` : '',
      summary?.last_purchase_at ? `last purchase ${summary.last_purchase_at.slice(0, 10)}` : '',
    ].filter(Boolean).join(' | '),
    bikeLines.length ? `\n**Bikes**\n${bikeLines.join('\n')}` : '\n**Bikes**\nNo bike records found in Serialized/work-order evidence.',
    workorderLines.length ? `\n**Workshop history**\n${workorderLines.join('\n')}` : '',
    topItemLines.length ? `\n**Top items**\n${topItemLines.join('\n')}` : '',
    profile.data_quality.sales_row_limit_reached || profile.data_quality.workorders_truncated
      ? '\nData note: profile results were truncated, so use the card for the loaded evidence and rerun with a narrower question if needed.'
      : '',
  ].filter(Boolean).join('\n')
}

function customerBikeProfileAnswer(profile: GenieCustomerProfilePayload): string {
  if (profile.status === 'ambiguous') {
    const candidates = profile.candidates
      .slice(0, 5)
      .map(candidate => `- ${candidate.name}${candidate.company ? ` (${candidate.company})` : ''} - customer #${candidate.customer_id}`)
      .join('\n')
    return [
      `I found multiple possible customers for "${profile.query ?? 'that customer'}".`,
      candidates || 'No candidate details were returned.',
      'Choose the customer ID and I can pull the bike record.',
    ].filter(Boolean).join('\n')
  }

  if (profile.status === 'not_found' || !profile.customer) {
    return `I could not find a matching Lightspeed customer for "${profile.query ?? 'that customer'}". Try the customer ID, phone number, or email.`
  }

  const directBikes = profile.bikes.filter(bike => bike.source !== 'sales_or_workorder_inference')
  const inferredBikes = profile.bikes.filter(bike => bike.source === 'sales_or_workorder_inference')
  const bikeLine = (bike: GenieCustomerBikeProfile) => {
    const label = bike.label?.trim() || `Serialized #${bike.serialized_id}`
    const facts = [
      bike.serial ? `serial ${bike.serial}` : '',
      bike.item_id ? `item ${bike.item_id}` : '',
      bike.linked_workorder_ids.length ? `linked work order ${bike.linked_workorder_ids.map(id => `#${id}`).join(', ')}` : '',
      !bike.label?.trim() && bike.source === 'workorder_serialized' ? 'make/model not returned by Serialized API' : '',
    ].filter(Boolean).join('; ')
    return `- ${label}${facts ? ` (${facts})` : ''}`
  }

  if (directBikes.length > 0) {
    return [
      `${profile.customer.name} has ${directBikes.length} bike record${directBikes.length === 1 ? '' : 's'} in Lightspeed:`,
      directBikes.map(bikeLine).join('\n'),
      inferredBikes.length
        ? `I also found ${inferredBikes.length} weaker inferred bike clue${inferredBikes.length === 1 ? '' : 's'} from sales/work-order text, but I would not treat those as confirmed owned bikes.`
        : '',
    ].filter(Boolean).join('\n\n')
  }

  if (inferredBikes.length > 0) {
    return [
      `${profile.customer.name} has no confirmed Serialized bike record in the data I could load.`,
      `Possible bike clues from sales/work-order text:`,
      inferredBikes.map(bikeLine).join('\n'),
      'Treat these as clues, not confirmed owned-bike records.',
    ].join('\n\n')
  }

  return `${profile.customer.name} has no confirmed bike records in the customer Serialized lookup, work-order Serialized links, or bike-like sales/work-order history I checked.`
}

export {
  resolveDirectSalesSummaryLookup,
  resolveDirectSalesSummaryPeriod,
  directSalesSummarySqlForDisplay,
  getDirectSalesSummary,
  directSalesSummaryAnswer,
  latestCustomerReferenceFromMessages,
  customerProfileAnswer,
  customerBikeProfileAnswer,
}
export type { DirectSalesSummaryLookup, DirectSalesSummaryResult }
