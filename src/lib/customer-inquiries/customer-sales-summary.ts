import { createServiceRoleClient } from '@/lib/supabase/server'
import { createLightspeedClient } from '@/lib/services/lightspeed'
import type { LightspeedSale, LightspeedSaleLine } from '@/lib/services/lightspeed/types'

export type CustomerRecentPurchase = {
  description: string
  purchased_at: string
  total: number | null
  quantity: number | null
}

export type CustomerSalesSummary = {
  sale_count: number
  total_spend: number
  last_purchase_at: string | null
  last_purchase_total: number | null
  last_purchase_summary: string | null
  recent_purchases: CustomerRecentPurchase[]
}

const RECENT_PURCHASES_LIMIT = 10

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

function ensureSaleLines(sale: LightspeedSale) {
  const lines = sale.SaleLines?.SaleLine
  if (!lines) return []
  return Array.isArray(lines) ? lines : [lines]
}

function saleLineDescription(line: LightspeedSaleLine): string {
  const item = line.Item as { description?: string; customSku?: string } | undefined
  return String(item?.description ?? item?.customSku ?? '').trim() || 'Item'
}

function saleLineSummary(sale: LightspeedSale): string {
  const items = ensureSaleLines(sale)
    .map((line) => saleLineDescription(line))
    .filter((description) => description !== 'Item')
    .slice(0, 3)
  if (items.length === 0) return 'Purchase'
  return items.join(', ')
}

function emptySalesSummary(): CustomerSalesSummary {
  return {
    sale_count: 0,
    total_spend: 0,
    last_purchase_at: null,
    last_purchase_total: null,
    last_purchase_summary: null,
    recent_purchases: [],
  }
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

  if (sales.length === 0) return emptySalesSummary()

  const totalSpend = roundMoney(sales.reduce((sum, sale) => sum + sale.total, 0))
  const latest = sales[0]

  return {
    sale_count: sales.length,
    total_spend: totalSpend,
    last_purchase_at: latest.complete_time,
    last_purchase_total: roundMoney(latest.total),
    last_purchase_summary: latest.descriptions.slice(0, 3).join(', ') || 'Purchase',
    recent_purchases: [],
  }
}

async function fetchRecentPurchasesFromReport(
  userId: string,
  customerId: string,
): Promise<CustomerRecentPurchase[]> {
  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('lightspeed_sales_report_lines')
    .select('description, complete_time, total, quantity, sale_line_id')
    .eq('user_id', userId)
    .eq('customer_id', customerId)
    .not('complete_time', 'is', null)
    .not('sale_line_id', 'like', '%:summary')
    .order('complete_time', { ascending: false })
    .limit(RECENT_PURCHASES_LIMIT)

  if (error) {
    console.warn('[customer-inquiries] recent purchases report lookup failed:', error.message)
    return []
  }

  return (data ?? []).map((row) => ({
    description: String(row.description ?? '').trim() || 'Item',
    purchased_at: String(row.complete_time),
    total: roundMoney(toNum(row.total)) || null,
    quantity: toNum(row.quantity) || null,
  }))
}

async function fetchRecentPurchasesFromApi(
  userId: string,
  customerId: string,
): Promise<CustomerRecentPurchase[]> {
  try {
    const client = createLightspeedClient(userId)
    const sales = await client.getSales({
      customerID: customerId,
      completed: 'true',
      limit: 30,
      sort: '-completeTime',
      load_relations: '["SaleLines","SaleLines.Item"]',
    })

    const purchases: CustomerRecentPurchase[] = []
    const sorted = [...sales].sort((a, b) =>
      String(b.completeTime ?? b.timeStamp ?? '').localeCompare(
        String(a.completeTime ?? a.timeStamp ?? ''),
      ),
    )

    for (const sale of sorted) {
      const purchasedAt = sale.completeTime ?? sale.timeStamp
      if (!purchasedAt) continue

      for (const line of ensureSaleLines(sale)) {
        if (purchases.length >= RECENT_PURCHASES_LIMIT) break
        purchases.push({
          description: saleLineDescription(line),
          purchased_at: purchasedAt,
          total: roundMoney(toNum(line.calcTotal || line.displayableSubtotal)) || null,
          quantity: toNum(line.unitQuantity) || null,
        })
      }

      if (purchases.length >= RECENT_PURCHASES_LIMIT) break
    }

    return purchases
  } catch (error) {
    console.warn('[customer-inquiries] Lightspeed recent purchases API lookup failed:', error)
    return []
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
      recent_purchases: [],
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
  const [fromReport, recentFromReport] = await Promise.all([
    fetchSalesSummaryFromReport(userId, customerId),
    fetchRecentPurchasesFromReport(userId, customerId),
  ])

  if (fromReport && fromReport.sale_count > 0) {
    return {
      ...fromReport,
      recent_purchases: recentFromReport,
    }
  }

  const [fromApi, recentFromApi] = await Promise.all([
    fetchSalesSummaryFromApi(userId, customerId),
    recentFromReport.length > 0
      ? Promise.resolve(recentFromReport)
      : fetchRecentPurchasesFromApi(userId, customerId),
  ])

  if (!fromApi) return null

  return {
    ...fromApi,
    recent_purchases: recentFromReport.length > 0 ? recentFromReport : recentFromApi,
  }
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
