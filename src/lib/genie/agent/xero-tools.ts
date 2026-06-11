// Genie agent Xero tools: read-only accounting access (P&L, balance sheet,
// trial balance, aged payables/receivables, invoices/bills, bank transactions,
// purchase orders, payments, contacts, chart of accounts).

import { tool } from '@openai/agents'
import { z } from 'zod'

import { compactGenieProgressText } from '@/lib/genie/progress-text'
import {
  XeroNotConnectedError,
  getXeroAgedPayables,
  getXeroAgedReceivables,
  getXeroBalanceSheet,
  getXeroBankSummary,
  getXeroBudgetSummary,
  getXeroConnection,
  getXeroExecutiveSummary,
  getXeroOrganisation,
  getXeroProfitAndLoss,
  getXeroTrialBalance,
  isXeroConfigured,
  listXeroAccounts,
  listXeroBankTransactions,
  listXeroInvoices,
  listXeroPayments,
  listXeroPurchaseOrders,
  searchXeroContacts,
} from '@/lib/services/xero'

type Emit = (data: object) => void

function emitXeroStatus(emit: Emit, phase: string, text: string) {
  emit({ event: 'status', phase, text: compactGenieProgressText(text, phase) })
}

const XERO_NOT_CONNECTED_OUTPUT = {
  connected: false,
  message:
    'Xero is not connected for this store. Ask the user to connect Xero using the "Connect Xero" pill on the Home page (it links to /api/xero/auth/initiate). Do not invent accounting figures.',
}

async function withXero<T extends object>(run: () => Promise<T>): Promise<T | typeof XERO_NOT_CONNECTED_OUTPUT | { error: string }> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof XeroNotConnectedError) {
      return { ...XERO_NOT_CONNECTED_OUTPUT, message: `${error.message} ${XERO_NOT_CONNECTED_OUTPUT.message}` }
    }
    console.error('[Xero tool] error:', error)
    return { error: error instanceof Error ? error.message : 'Xero request failed' }
  }
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

export function buildXeroTools(userId: string, emit: Emit) {
  return [
    tool({
      name: 'get_xero_connection_status',
      description: 'Check whether the store has connected Xero (accounting). Use when the user asks to connect/check Xero, or before answering accounting questions if a Xero tool just reported not-connected. Returns organisation name and base currency when connected.',
      parameters: z.object({}),
      async execute() {
        emitXeroStatus(emit, 'xero', 'Checking Xero connection...')
        if (!isXeroConfigured()) {
          return { configured: false, connected: false, message: 'Xero integration is not configured on this environment.' }
        }
        const connection = await getXeroConnection(userId)
        if (connection?.status !== 'connected') {
          return {
            configured: true,
            connected: false,
            status: connection?.status ?? 'disconnected',
            message: 'Xero is not connected. The user can connect with the "Connect Xero" pill on the Home page, which starts the secure Xero sign-in at /api/xero/auth/initiate.',
          }
        }
        const organisation = await withXero(async () => (await getXeroOrganisation(userId)) ?? {})
        return {
          configured: true,
          connected: true,
          organisation_name: connection.organisation_name ?? connection.tenant_name ?? null,
          base_currency: connection.base_currency ?? null,
          connected_at: connection.connected_at,
          organisation,
        }
      },
    }),
    tool({
      name: 'get_xero_financial_report',
      description: 'Run a Xero financial report: profit_and_loss (P&L / income statement; from_date+to_date, optional periods+timeframe for comparisons), balance_sheet (as-at date, optional periods+timeframe), trial_balance (as-at date), bank_summary (cash movement per bank account; from_date+to_date), executive_summary (monthly KPI snapshot: cash, profitability, debtors/creditors; date), budget_summary, aged_payables / aged_receivables (require contact_id from search_xero_contacts). Set payments_only=true for cash basis instead of accrual. Returns the report flattened into sections/rows/columns with exact figures in the organisation base currency.',
      parameters: z.object({
        report: z.enum([
          'profit_and_loss',
          'balance_sheet',
          'trial_balance',
          'bank_summary',
          'executive_summary',
          'budget_summary',
          'aged_payables',
          'aged_receivables',
        ]),
        from_date: isoDate.optional().describe('Start date for profit_and_loss / bank_summary / aged reports.'),
        to_date: isoDate.optional().describe('End date for profit_and_loss / bank_summary / aged reports.'),
        date: isoDate.optional().describe('As-at date for balance_sheet / trial_balance / executive_summary / aged reports.'),
        periods: z.number().int().min(1).max(12).optional().describe('Number of comparison periods (P&L and balance sheet).'),
        timeframe: z.enum(['MONTH', 'QUARTER', 'YEAR']).optional().describe('Comparison period size when periods is set.'),
        payments_only: z.boolean().optional().describe('true = cash basis; default accrual.'),
        contact_id: z.string().optional().describe('Xero ContactID — required for aged_payables / aged_receivables.'),
      }),
      async execute(args) {
        emitXeroStatus(emit, 'xero', `Running Xero ${args.report.replace(/_/g, ' ')} report...`)
        return withXero(async () => {
          if ((args.report === 'aged_payables' || args.report === 'aged_receivables') && !args.contact_id) {
            return { error: 'aged_payables / aged_receivables require contact_id. Call search_xero_contacts first to resolve the supplier/customer ContactID.' }
          }
          const common = { fromDate: args.from_date, toDate: args.to_date, paymentsOnly: args.payments_only }
          const report =
            args.report === 'profit_and_loss'
              ? await getXeroProfitAndLoss(userId, { ...common, periods: args.periods, timeframe: args.timeframe })
              : args.report === 'balance_sheet'
                ? await getXeroBalanceSheet(userId, { date: args.date, periods: args.periods, timeframe: args.timeframe, paymentsOnly: args.payments_only })
                : args.report === 'trial_balance'
                  ? await getXeroTrialBalance(userId, { date: args.date, paymentsOnly: args.payments_only })
                  : args.report === 'bank_summary'
                    ? await getXeroBankSummary(userId, { fromDate: args.from_date, toDate: args.to_date })
                    : args.report === 'executive_summary'
                      ? await getXeroExecutiveSummary(userId, { date: args.date })
                      : args.report === 'budget_summary'
                        ? await getXeroBudgetSummary(userId, { date: args.date })
                        : args.report === 'aged_payables'
                          ? await getXeroAgedPayables(userId, { contactId: args.contact_id!, date: args.date, fromDate: args.from_date, toDate: args.to_date })
                          : await getXeroAgedReceivables(userId, { contactId: args.contact_id!, date: args.date, fromDate: args.from_date, toDate: args.to_date })
          if (!report) return { error: 'Xero returned no report data for these parameters.' }
          return { report }
        })
      },
    }),
    tool({
      name: 'list_xero_invoices',
      description: 'List Xero invoices: sales invoices (ACCREC, money owed to the store) or supplier bills (ACCPAY, money the store owes). Filter by date range, statuses (DRAFT, SUBMITTED, AUTHORISED, PAID, VOIDED), or contact name. Returns totals, amounts due/paid, and due dates — use for historical transactions, outstanding receivables/payables, and supplier spend questions.',
      parameters: z.object({
        invoice_type: z.enum(['ACCREC', 'ACCPAY']).optional().describe('ACCREC = sales invoices; ACCPAY = supplier bills. Omit for both.'),
        statuses: z.array(z.enum(['DRAFT', 'SUBMITTED', 'AUTHORISED', 'PAID', 'VOIDED'])).optional(),
        date_from: isoDate.optional(),
        date_to: isoDate.optional(),
        contact_name: z.string().optional().describe('Filter by contact (customer/supplier) name contains.'),
        page: z.number().int().min(1).optional(),
      }),
      async execute(args) {
        emitXeroStatus(emit, 'xero', 'Fetching Xero invoices...')
        return withXero(() => listXeroInvoices(userId, {
          invoiceType: args.invoice_type,
          statuses: args.statuses,
          dateFrom: args.date_from,
          dateTo: args.date_to,
          contactName: args.contact_name,
          page: args.page,
        }))
      },
    }),
    tool({
      name: 'list_xero_purchase_orders',
      description: 'List Xero purchase orders with supplier, status (DRAFT, SUBMITTED, AUTHORISED, BILLED), dates, totals, and line items. Use for "what have we ordered", supplier PO history, incoming stock commitments, and open-order value questions.',
      parameters: z.object({
        status: z.enum(['DRAFT', 'SUBMITTED', 'AUTHORISED', 'BILLED']).optional(),
        date_from: isoDate.optional(),
        date_to: isoDate.optional(),
        page: z.number().int().min(1).optional(),
      }),
      async execute(args) {
        emitXeroStatus(emit, 'xero', 'Fetching Xero purchase orders...')
        return withXero(() => listXeroPurchaseOrders(userId, {
          status: args.status,
          dateFrom: args.date_from,
          dateTo: args.date_to,
          page: args.page,
        }))
      },
    }),
    tool({
      name: 'list_xero_bank_transactions',
      description: 'List Xero bank transactions (SPEND / RECEIVE money including transfers) with bank account, contact, reference, totals, and reconciliation state. Use for historical cash movements, expense payments, and "what did we spend/receive" questions not covered by invoices.',
      parameters: z.object({
        type: z.enum(['SPEND', 'RECEIVE']).optional(),
        date_from: isoDate.optional(),
        date_to: isoDate.optional(),
        page: z.number().int().min(1).optional(),
      }),
      async execute(args) {
        emitXeroStatus(emit, 'xero', 'Fetching Xero bank transactions...')
        return withXero(() => listXeroBankTransactions(userId, {
          type: args.type,
          dateFrom: args.date_from,
          dateTo: args.date_to,
          page: args.page,
        }))
      },
    }),
    tool({
      name: 'list_xero_payments',
      description: 'List Xero payments applied to invoices/bills (date, amount, invoice number, contact, account). Use for "when was invoice X paid", payment-run history, and cash-in/cash-out reconciliation questions.',
      parameters: z.object({
        date_from: isoDate.optional(),
        date_to: isoDate.optional(),
        page: z.number().int().min(1).optional(),
      }),
      async execute(args) {
        emitXeroStatus(emit, 'xero', 'Fetching Xero payments...')
        return withXero(() => listXeroPayments(userId, {
          dateFrom: args.date_from,
          dateTo: args.date_to,
          page: args.page,
        }))
      },
    }),
    tool({
      name: 'search_xero_contacts',
      description: 'Search Xero contacts (suppliers and customers) by name or email. Returns ContactID needed for aged_payables / aged_receivables reports, plus supplier/customer flags.',
      parameters: z.object({
        query: z.string().min(2).describe('Contact name or email fragment, e.g. "Shimano" or "Trek".'),
        page: z.number().int().min(1).optional(),
      }),
      async execute(args) {
        emitXeroStatus(emit, 'xero', `Searching Xero contacts for "${args.query.trim()}"...`)
        return withXero(() => searchXeroContacts(userId, { query: args.query, page: args.page }))
      },
    }),
    tool({
      name: 'list_xero_accounts',
      description: 'List the Xero chart of accounts (code, name, type, class, tax type). Use to understand how the store categorises revenue/expenses/assets/liabilities, or to interpret account names appearing in reports.',
      parameters: z.object({}),
      async execute() {
        emitXeroStatus(emit, 'xero', 'Fetching Xero chart of accounts...')
        return withXero(() => listXeroAccounts(userId))
      },
    }),
  ]
}
