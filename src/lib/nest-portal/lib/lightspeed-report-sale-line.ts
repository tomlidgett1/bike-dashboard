export type PortalReportSaleLine = {
  saleId: number
  date: string
  description: string
  quantity: number
  retail: number
  subtotal: number
  discount: number
  total: number
  customerFullName: string | null
  employeeName: string | null
  category: string | null
  cost: number
  profit: number
  marginPct: number | null
}

export type ReportSaleLineDbRow = {
  brand_key: string
  sale_id: number
  sale_line_id: number
  complete_time: string | null
  line_time: string | null
  description: string
  quantity: number | string
  retail: number | string
  subtotal: number | string
  discount: number | string
  total: number | string
  customer_full_name: string | null
  employee_name: string | null
  category: string | null
  cost: number | string
  profit: number | string
  margin_pct: number | string | null
  synced_at: string
}

function formatMelbourneDateTime(iso: string | null | undefined): string {
  if (!iso?.trim()) return '—'
  try {
    const d = new Date(iso.trim())
    if (Number.isNaN(d.getTime())) return '—'
    return new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Melbourne',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d)
  } catch {
    return '—'
  }
}

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function toNullableNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

export function reportDbRowToApiRow(row: ReportSaleLineDbRow): PortalReportSaleLine {
  const lineTime = row.line_time ?? row.complete_time
  return {
    saleId: Number(row.sale_id),
    date: formatMelbourneDateTime(lineTime),
    description: row.description || '(No description)',
    quantity: toNumber(row.quantity),
    retail: toNumber(row.retail),
    subtotal: toNumber(row.subtotal),
    discount: toNumber(row.discount),
    total: toNumber(row.total),
    customerFullName: row.customer_full_name,
    employeeName: row.employee_name,
    category: row.category,
    cost: toNumber(row.cost),
    profit: toNumber(row.profit),
    marginPct: toNullableNumber(row.margin_pct),
  }
}

export function reportDbRowToCsvCells(row: ReportSaleLineDbRow): (string | number)[] {
  const api = reportDbRowToApiRow(row)
  return [
    api.saleId,
    api.date,
    api.employeeName ?? '',
    api.category ?? '',
    api.description,
    api.quantity,
    api.retail,
    api.subtotal,
    api.discount,
    api.total,
    api.customerFullName ?? '',
    api.cost,
    api.profit,
    api.marginPct != null ? api.marginPct.toFixed(1) : '',
  ]
}

export const REPORT_SALE_LINE_CSV_HEADERS = [
  'Sale Id',
  'Date',
  'Employee',
  'Category',
  'Description',
  'Quantity',
  'Retail',
  'Subtotal',
  'Discount',
  'Total',
  'Customer full name',
  'Cost',
  'Profit',
  'Margin %',
]

export function csvCell(value: string | number | null | undefined): string {
  if (value == null) return ''
  const s = String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
