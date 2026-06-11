/**
 * Xero Accounting API client
 *
 * Thin authenticated GET wrapper plus typed helpers for the endpoints the
 * Genie needs: financial reports (P&L, Balance Sheet, Trial Balance, aged
 * payables/receivables, bank summary, executive summary, budget summary),
 * invoices/bills, bank transactions, purchase orders, payments, contacts,
 * chart of accounts, and organisation details.
 *
 * Every call needs both the Bearer token and the Xero-tenant-id header.
 * Rate limits: 60 calls/min and 5,000/day per tenant — 429s are retried
 * once using the Retry-After header.
 */

import { XERO_CONFIG } from './config'
import { getValidXeroAccessToken, getXeroConnection, updateXeroConnectionStatus } from './token-manager'
import type {
  FlattenedXeroReport,
  XeroReport,
  XeroReportResponse,
  XeroReportRow,
} from './types'

export class XeroNotConnectedError extends Error {
  constructor(message = 'Xero is not connected for this store.') {
    super(message)
    this.name = 'XeroNotConnectedError'
  }
}

async function xeroAuthContext(userId: string): Promise<{ accessToken: string; tenantId: string }> {
  const connection = await getXeroConnection(userId)
  if (!connection || connection.status !== 'connected' || !connection.tenant_id) {
    throw new XeroNotConnectedError()
  }

  const accessToken = await getValidXeroAccessToken(userId)
  if (!accessToken) {
    throw new XeroNotConnectedError('Xero token is expired or revoked. Please reconnect Xero.')
  }

  return { accessToken, tenantId: connection.tenant_id }
}

/**
 * Authenticated GET against the Xero Accounting API.
 * `params` values that are undefined/null/'' are dropped.
 */
export async function xeroGet<T = unknown>(
  userId: string,
  path: string,
  params: Record<string, string | number | boolean | undefined | null> = {},
): Promise<T> {
  const { accessToken, tenantId } = await xeroAuthContext(userId)

  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const query = search.toString()
  const url = `${XERO_CONFIG.API_BASE_URL}${path}${query ? `?${query}` : ''}`

  const doFetch = (token: string) => fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Xero-tenant-id': tenantId,
      Accept: 'application/json',
    },
  })

  let response = await doFetch(accessToken)

  // Rate limited — wait per Retry-After (capped) and retry once
  if (response.status === 429) {
    const retryAfter = Math.min(Number(response.headers.get('Retry-After') || '2'), 15)
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000))
    response = await doFetch(accessToken)
  }

  if (response.status === 401 || response.status === 403) {
    await updateXeroConnectionStatus(userId, 'error', `Xero API auth error (${response.status})`)
    throw new XeroNotConnectedError('Xero authorisation failed. Please reconnect Xero.')
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Xero API error ${response.status} on ${path}: ${body.slice(0, 500)}`)
  }

  return response.json()
}

// ============================================================
// Date helpers — Xero JSON uses /Date(1552348800000+0000)/
// ============================================================

export function parseXeroDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const msMatch = value.match(/\/Date\((\d+)/)
  if (msMatch) {
    return new Date(Number(msMatch[1])).toISOString().slice(0, 10)
  }
  // DateString style: 2019-03-12T00:00:00
  const isoMatch = value.match(/^(\d{4}-\d{2}-\d{2})/)
  return isoMatch ? isoMatch[1] : null
}

// ============================================================
// Report flattening (ReportWithRows → compact LLM table)
// ============================================================

function cellValues(cells: XeroReportRow['Cells']): string[] {
  return (cells ?? []).map(cell => cell.Value ?? '')
}

export function flattenXeroReport(report: XeroReport): FlattenedXeroReport {
  let columns: string[] = []
  const sections: FlattenedXeroReport['sections'] = []
  let currentSection: FlattenedXeroReport['sections'][number] | null = null

  const pushRow = (row: XeroReportRow, sectionTitle: string) => {
    if (!currentSection || currentSection.title !== sectionTitle) {
      currentSection = { title: sectionTitle, rows: [] }
      sections.push(currentSection)
    }
    const values = cellValues(row.Cells)
    currentSection.rows.push({
      label: values[0] ?? '',
      values: values.slice(1),
      is_summary: row.RowType === 'SummaryRow',
    })
  }

  const walk = (rows: XeroReportRow[], sectionTitle: string) => {
    for (const row of rows) {
      if (row.RowType === 'Header') {
        columns = cellValues(row.Cells)
      } else if (row.RowType === 'Section') {
        const title = row.Title?.trim() || sectionTitle
        if (row.Rows?.length) walk(row.Rows, title)
      } else {
        pushRow(row, sectionTitle)
      }
    }
  }

  walk(report.Rows ?? [], '')

  return {
    report_name: report.ReportName,
    report_titles: report.ReportTitles ?? [],
    columns,
    sections,
  }
}

async function fetchFlattenedReport(
  userId: string,
  path: string,
  params: Record<string, string | number | boolean | undefined | null>,
): Promise<FlattenedXeroReport | null> {
  const data = await xeroGet<XeroReportResponse>(userId, path, params)
  const report = data.Reports?.[0]
  return report ? flattenXeroReport(report) : null
}

// ============================================================
// Reports
// ============================================================

export function getXeroProfitAndLoss(userId: string, args: {
  fromDate?: string
  toDate?: string
  periods?: number
  timeframe?: 'MONTH' | 'QUARTER' | 'YEAR'
  paymentsOnly?: boolean
}) {
  return fetchFlattenedReport(userId, '/Reports/ProfitAndLoss', {
    fromDate: args.fromDate,
    toDate: args.toDate,
    periods: args.periods,
    timeframe: args.timeframe,
    standardLayout: true,
    paymentsOnly: args.paymentsOnly,
  })
}

export function getXeroBalanceSheet(userId: string, args: {
  date?: string
  periods?: number
  timeframe?: 'MONTH' | 'QUARTER' | 'YEAR'
  paymentsOnly?: boolean
}) {
  return fetchFlattenedReport(userId, '/Reports/BalanceSheet', {
    date: args.date,
    periods: args.periods,
    timeframe: args.timeframe,
    standardLayout: true,
    paymentsOnly: args.paymentsOnly,
  })
}

export function getXeroTrialBalance(userId: string, args: { date?: string; paymentsOnly?: boolean }) {
  return fetchFlattenedReport(userId, '/Reports/TrialBalance', {
    date: args.date,
    paymentsOnly: args.paymentsOnly,
  })
}

export function getXeroAgedPayables(userId: string, args: { contactId: string; date?: string; fromDate?: string; toDate?: string }) {
  return fetchFlattenedReport(userId, '/Reports/AgedPayablesByContact', {
    contactID: args.contactId,
    date: args.date,
    fromDate: args.fromDate,
    toDate: args.toDate,
  })
}

export function getXeroAgedReceivables(userId: string, args: { contactId: string; date?: string; fromDate?: string; toDate?: string }) {
  return fetchFlattenedReport(userId, '/Reports/AgedReceivablesByContact', {
    contactID: args.contactId,
    date: args.date,
    fromDate: args.fromDate,
    toDate: args.toDate,
  })
}

export function getXeroBankSummary(userId: string, args: { fromDate?: string; toDate?: string }) {
  return fetchFlattenedReport(userId, '/Reports/BankSummary', {
    fromDate: args.fromDate,
    toDate: args.toDate,
  })
}

export function getXeroExecutiveSummary(userId: string, args: { date?: string }) {
  return fetchFlattenedReport(userId, '/Reports/ExecutiveSummary', { date: args.date })
}

export function getXeroBudgetSummary(userId: string, args: { date?: string; periods?: number; timeframe?: number }) {
  return fetchFlattenedReport(userId, '/Reports/BudgetSummary', {
    date: args.date,
    periods: args.periods,
    timeframe: args.timeframe,
  })
}

// ============================================================
// Transactional endpoints (compact mappers keep LLM payloads small)
// ============================================================

type XeroRawRecord = Record<string, unknown>

function num(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function contactName(record: XeroRawRecord): string | null {
  const contact = record.Contact as XeroRawRecord | undefined
  return typeof contact?.Name === 'string' ? contact.Name : null
}

export async function listXeroInvoices(userId: string, args: {
  invoiceType?: 'ACCREC' | 'ACCPAY'
  statuses?: string[]
  dateFrom?: string
  dateTo?: string
  contactName?: string
  page?: number
  pageSize?: number
}) {
  const where: string[] = []
  if (args.invoiceType) where.push(`Type=="${args.invoiceType}"`)
  if (args.dateFrom) {
    const [y, m, d] = args.dateFrom.split('-').map(Number)
    where.push(`Date>=DateTime(${y},${m},${d})`)
  }
  if (args.dateTo) {
    const [y, m, d] = args.dateTo.split('-').map(Number)
    where.push(`Date<=DateTime(${y},${m},${d})`)
  }
  if (args.contactName) where.push(`Contact.Name.Contains("${args.contactName.replace(/"/g, '')}")`)

  const data = await xeroGet<{ Invoices?: XeroRawRecord[]; pagination?: XeroRawRecord }>(userId, '/Invoices', {
    where: where.length ? where.join(' AND ') : undefined,
    Statuses: args.statuses?.length ? args.statuses.join(',') : undefined,
    order: 'Date DESC',
    page: args.page ?? 1,
    pageSize: Math.min(args.pageSize ?? 50, 100),
    summaryOnly: true,
  })

  return {
    pagination: data.pagination ?? null,
    invoices: (data.Invoices ?? []).map(invoice => ({
      invoice_id: invoice.InvoiceID,
      invoice_number: invoice.InvoiceNumber ?? null,
      type: invoice.Type, // ACCREC = sales invoice, ACCPAY = supplier bill
      status: invoice.Status,
      contact: contactName(invoice),
      date: parseXeroDate(invoice.DateString ?? invoice.Date),
      due_date: parseXeroDate(invoice.DueDateString ?? invoice.DueDate),
      sub_total: num(invoice.SubTotal),
      total_tax: num(invoice.TotalTax),
      total: num(invoice.Total),
      amount_due: num(invoice.AmountDue),
      amount_paid: num(invoice.AmountPaid),
      currency: invoice.CurrencyCode ?? null,
    })),
  }
}

export async function listXeroBankTransactions(userId: string, args: {
  dateFrom?: string
  dateTo?: string
  type?: string
  page?: number
  pageSize?: number
}) {
  const where: string[] = []
  if (args.dateFrom) {
    const [y, m, d] = args.dateFrom.split('-').map(Number)
    where.push(`Date>=DateTime(${y},${m},${d})`)
  }
  if (args.dateTo) {
    const [y, m, d] = args.dateTo.split('-').map(Number)
    where.push(`Date<=DateTime(${y},${m},${d})`)
  }
  if (args.type) where.push(`Type=="${args.type}"`)

  const data = await xeroGet<{ BankTransactions?: XeroRawRecord[]; pagination?: XeroRawRecord }>(userId, '/BankTransactions', {
    where: where.length ? where.join(' AND ') : undefined,
    order: 'Date DESC',
    page: args.page ?? 1,
    pageSize: Math.min(args.pageSize ?? 50, 100),
  })

  return {
    pagination: data.pagination ?? null,
    bank_transactions: (data.BankTransactions ?? []).map(txn => ({
      bank_transaction_id: txn.BankTransactionID,
      type: txn.Type, // SPEND, RECEIVE, SPEND-TRANSFER, etc.
      status: txn.Status,
      contact: contactName(txn),
      date: parseXeroDate(txn.DateString ?? txn.Date),
      reference: txn.Reference ?? null,
      bank_account: (txn.BankAccount as XeroRawRecord | undefined)?.Name ?? null,
      sub_total: num(txn.SubTotal),
      total_tax: num(txn.TotalTax),
      total: num(txn.Total),
      is_reconciled: txn.IsReconciled ?? null,
    })),
  }
}

export async function listXeroPurchaseOrders(userId: string, args: {
  status?: 'DRAFT' | 'SUBMITTED' | 'AUTHORISED' | 'BILLED' | 'DELETED'
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}) {
  const data = await xeroGet<{ PurchaseOrders?: XeroRawRecord[]; pagination?: XeroRawRecord }>(userId, '/PurchaseOrders', {
    Status: args.status,
    DateFrom: args.dateFrom,
    DateTo: args.dateTo,
    order: 'Date DESC',
    page: args.page ?? 1,
    pageSize: Math.min(args.pageSize ?? 50, 100),
  })

  return {
    pagination: data.pagination ?? null,
    purchase_orders: (data.PurchaseOrders ?? []).map(po => ({
      purchase_order_id: po.PurchaseOrderID,
      purchase_order_number: po.PurchaseOrderNumber ?? null,
      status: po.Status,
      supplier: contactName(po),
      date: parseXeroDate(po.DateString ?? po.Date),
      delivery_date: parseXeroDate(po.DeliveryDateString ?? po.DeliveryDate),
      reference: po.Reference ?? null,
      sub_total: num(po.SubTotal),
      total_tax: num(po.TotalTax),
      total: num(po.Total),
      currency: po.CurrencyCode ?? null,
      line_items: ((po.LineItems as XeroRawRecord[] | undefined) ?? []).slice(0, 30).map(line => ({
        description: line.Description ?? null,
        quantity: num(line.Quantity),
        unit_amount: num(line.UnitAmount),
        line_amount: num(line.LineAmount),
        item_code: line.ItemCode ?? null,
      })),
    })),
  }
}

export async function listXeroPayments(userId: string, args: {
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}) {
  const where: string[] = []
  if (args.dateFrom) {
    const [y, m, d] = args.dateFrom.split('-').map(Number)
    where.push(`Date>=DateTime(${y},${m},${d})`)
  }
  if (args.dateTo) {
    const [y, m, d] = args.dateTo.split('-').map(Number)
    where.push(`Date<=DateTime(${y},${m},${d})`)
  }

  const data = await xeroGet<{ Payments?: XeroRawRecord[]; pagination?: XeroRawRecord }>(userId, '/Payments', {
    where: where.length ? where.join(' AND ') : undefined,
    order: 'Date DESC',
    page: args.page ?? 1,
    pageSize: Math.min(args.pageSize ?? 50, 100),
  })

  return {
    pagination: data.pagination ?? null,
    payments: (data.Payments ?? []).map(payment => {
      const invoice = payment.Invoice as XeroRawRecord | undefined
      return {
        payment_id: payment.PaymentID,
        payment_type: payment.PaymentType,
        status: payment.Status,
        date: parseXeroDate(payment.Date),
        amount: num(payment.Amount),
        reference: payment.Reference ?? null,
        invoice_number: invoice?.InvoiceNumber ?? null,
        invoice_contact: invoice ? contactName(invoice) : null,
        account_code: (payment.Account as XeroRawRecord | undefined)?.Code ?? null,
      }
    }),
  }
}

export async function searchXeroContacts(userId: string, args: { query: string; page?: number }) {
  const data = await xeroGet<{ Contacts?: XeroRawRecord[] }>(userId, '/Contacts', {
    searchTerm: args.query,
    page: args.page ?? 1,
    summaryOnly: true,
  })

  return {
    contacts: (data.Contacts ?? []).map(contact => ({
      contact_id: contact.ContactID,
      name: contact.Name,
      status: contact.ContactStatus,
      email: contact.EmailAddress ?? null,
      is_supplier: contact.IsSupplier ?? null,
      is_customer: contact.IsCustomer ?? null,
    })),
  }
}

export async function listXeroAccounts(userId: string) {
  const data = await xeroGet<{ Accounts?: XeroRawRecord[] }>(userId, '/Accounts')

  return {
    accounts: (data.Accounts ?? []).map(account => ({
      account_id: account.AccountID,
      code: account.Code ?? null,
      name: account.Name,
      type: account.Type,
      tax_type: account.TaxType ?? null,
      class: account.Class ?? null,
      status: account.Status,
      description: account.Description ?? null,
    })),
  }
}

export async function getXeroOrganisation(userId: string) {
  const data = await xeroGet<{ Organisations?: XeroRawRecord[] }>(userId, '/Organisation')
  const org = data.Organisations?.[0]
  if (!org) return null
  return {
    name: org.Name,
    legal_name: org.LegalName ?? null,
    base_currency: org.BaseCurrency ?? null,
    country_code: org.CountryCode ?? null,
    organisation_type: org.OrganisationType ?? null,
    financial_year_end_day: org.FinancialYearEndDay ?? null,
    financial_year_end_month: org.FinancialYearEndMonth ?? null,
    sales_tax_basis: org.SalesTaxBasis ?? null,
  }
}
