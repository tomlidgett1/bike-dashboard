import { createServiceRoleClient } from '@/lib/supabase/server'
import { createLightspeedClient } from '@/lib/services/lightspeed'
import type { LightspeedSale } from '@/lib/services/lightspeed/types'

export type CustomerSalesSummary = {
  sale_count: number
  total_spend: number
  last_purchase_at: string | null
  last_purchase_total: number | null
  last_purchase_summary: string | null
}

function toNum(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function formatAud(value: number): string {
  return value.toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function saleTotal(sale: LightspeedSale): number {
  return toNum(sale.calcTotal || sale.total || sale.displayableTotal)
}

function saleLineSummary(sale: LightspeedSale): string {
  const lines = sale.SaleLines?.SaleLine
  if (!lines) return 'Purchase'
  const items = (Array.isArray(lines) ? lines : [lines])
    .map((line) => {
      const item = line.Item as { description?: string; customSku?: string } | undefined
      return String(item?.description ?? item?.customSku ?? '').trim()
    })
    .filter(Boolean)
    .slice(0, 3)
  if (items.length === 0) return 'Purchase'
  return items.join(', ')
}

function summariseFromSqlRows(
  rows: Array<{
    sale_id: string | null
    complete_time: string | null
    total: number | string | null
    subtotal: number | string | null
    description: string | null
  }>,
): CustomerSalesSummary {
  const bySale = new Map<
    string,
    {
      complete_time: string | null
      total: number
      descriptions: string[]
    }
  >()

  for (const row of rows) {
    const saleId = String(row.sale_id ?? '').trim()
    if (!saleId) continue
    const prev = bySale.get(saleId) ?? {
      complete_time: row.complete_time,
      total: 0,
      descriptions: [],
    }
    prev.total = Math.max(prev.total, toNum(row.total) || toNum(row.subtotal))
    if (!prev.complete_time && row.complete_time) prev.complete_time = row.complete_time
    const description = String(row.description ?? '').trim()
    if (description && !prev.descriptions.includes(description)) {
      prev.descriptions.push(description)
    }
    bySale.set(saleId, prev)
  }

  const sales = Array.from(bySale.values()).sort((a, b) =>
    (b.complete_time ?? '').localeCompare(a.complete_time ?? ''),
  )

  if (sales.length === 0) {
    return {
      sale_count: 0,
      total_spend: 0,
      last_purchase_at: null,
      last_purchase_total: null,
      last_purchase_summary: null,
    }
  }

  const totalSpend = roundMoney(sales.reduce((sum, sale) => sum + sale.total, 0))
  const latest = sales[0]

  return {
    sale_count: sales.length,
    total_spend: totalSpend,
    last_purchase_at: latest.complete_time,
    last_purchase_total: roundMoney(latest.total),
    last_purchase_summary: latest.descriptions.slice(0, 3).join(', ') || 'Purchase',
  }
}

async function fetchSalesSummaryFromReport(
  userId: string,
  customerId: string,
): Promise<CustomerSalesSummary | null> {
  const admin = createServiceRoleClient()
  const rows: Array<{
    sale_id: string | null
    complete_time: string | null
    total: number | string | null
    subtotal: number | string | null
    description: string | null
  }> = []

  const pageSize = 500
  const maxRows = 5000

  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(from + pageSize - 1, maxRows - 1)
    const { data, error } = await admin
      .from('lightspeed_sales_report_lines')
      .select('sale_id, complete_time, total, subtotal, description')
      .eq('user_id', userId)
      .eq('customer_id', customerId)
      .not('complete_time', 'is', null)
      .order('complete_time', { ascending: false })
      .range(from, to)

    if (error) {
      console.warn('[customer-inquiries] sales report lookup failed:', error.message)
      return null
    }

    const page = data ?? []
    rows.push(...page)
    if (page.length < pageSize) break
  }

  if (rows.length === 0) return null
  return summariseFromSqlRows(rows)
}

async function fetchSalesSummaryFromApi(
  userId: string,
  customerId: string,
): Promise<CustomerSalesSummary | null> {
  try {
    const client = createLightspeedClient(userId)
    const sales = await client.getSales({
      customerID: customerId,
      completed: 'true',
      limit: 100,
      sort: '-completeTime',
    })

    if (sales.length === 0) return null

    const sorted = [...sales].sort((a, b) =>
      String(b.completeTime ?? b.timeStamp ?? '').localeCompare(
        String(a.completeTime ?? a.timeStamp ?? ''),
      ),
    )

    const totalSpend = roundMoney(sorted.reduce((sum, sale) => sum + saleTotal(sale), 0))
    const latest = sorted[0]

    return {
      sale_count: sorted.length,
      total_spend: totalSpend,
      last_purchase_at: latest.completeTime ?? latest.timeStamp ?? null,
      last_purchase_total: roundMoney(saleTotal(latest)),
      last_purchase_summary: saleLineSummary(latest),
    }
  } catch (error) {
    console.warn('[customer-inquiries] Lightspeed sales API lookup failed:', error)
    return null
  }
}

export async function fetchCustomerSalesSummary(
  userId: string,
  customerId: string,
): Promise<CustomerSalesSummary | null> {
  const fromReport = await fetchSalesSummaryFromReport(userId, customerId)
  if (fromReport && fromReport.sale_count > 0) return fromReport
  return fetchSalesSummaryFromApi(userId, customerId)
}

export function formatCustomerSalesSummary(summary: CustomerSalesSummary): string {
  if (summary.sale_count === 0) return 'No completed purchases on record.'
  const parts = [
    `${summary.sale_count} purchase${summary.sale_count === 1 ? '' : 's'}`,
    `${formatAud(summary.total_spend)} lifetime spend`,
  ]
  if (summary.last_purchase_at) {
    const date = new Date(summary.last_purchase_at)
    const dateLabel = Number.isNaN(date.getTime())
      ? summary.last_purchase_at
      : date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
    parts.push(
      `last purchase ${dateLabel}${summary.last_purchase_total != null ? ` (${formatAud(summary.last_purchase_total)})` : ''}`,
    )
  }
  return parts.join(' · ')
}
