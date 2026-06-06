import { formatNestOutboundMessage, type NestMessageTemplateSettings } from '@/lib/nest/message-format'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { createLightspeedClient } from './lightspeed-client'
import type { LightspeedCustomer } from './types'

export type NestAutoServiceCustomer = {
  id: string
  customerId: string
  customerName: string
  mobile: string | null
  lastServiceAt: string
  lastServiceDescription: string
  daysSinceService: number
  messageDraft: string
  canSend: boolean
}

const PAGE_SIZE = 1000
const MAX_ROWS = 20_000

const SERVICE_OR_FILTER = [
  'description.ilike.%general service%',
  'description.ilike.%full service%',
  'category.ilike.%general service%',
  'category.ilike.%full service%',
].join(',')

function ensureArray<T>(data: T | T[] | undefined): T[] {
  if (!data) return []
  return Array.isArray(data) ? data : [data]
}

function subtractMonths(date: Date, months: number): Date {
  const next = new Date(date)
  next.setMonth(next.getMonth() - months)
  return next
}

function isGeneralOrFullServiceLine(description: string | null, category: string | null): boolean {
  const haystack = `${description ?? ''} ${category ?? ''}`.toLowerCase()
  return /\bgeneral\s+service\b/.test(haystack) || /\bfull\s+service\b/.test(haystack)
}

function pickCustomerMobile(customer: LightspeedCustomer): string | null {
  const phones = ensureArray(customer.Contact?.Phones?.ContactPhone)
  const mobile = phones.find((phone) =>
    String(phone.useType ?? '').toLowerCase().includes('mobile'),
  )
  if (mobile?.number?.trim()) return mobile.number.trim()
  const first = phones.find((phone) => phone.number?.trim())
  return first?.number?.trim() ?? null
}

function customerFirstName(customer: LightspeedCustomer | undefined, fallback: string): string {
  const first = String(customer?.firstName ?? '').trim()
  if (first) return first
  return fallback.split(/\s+/)[0] || fallback
}

export async function fetchNestAutoServiceCustomers(
  userId: string,
  options?: {
    messageTemplates?: Partial<NestMessageTemplateSettings> | null
    storeName?: string | null
    limit?: number
  },
): Promise<NestAutoServiceCustomer[]> {
  const admin = createServiceRoleClient()
  const now = new Date()
  const sixMonthsAgoIso = subtractMonths(now, 6).toISOString()
  const oneYearAgoIso = subtractMonths(now, 12).toISOString()
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 200)

  const byCustomer = new Map<
    string,
    {
      customerId: string
      customerName: string
      lastServiceAt: string
      lastServiceDescription: string
    }
  >()

  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await admin
      .from('lightspeed_sales_report_lines')
      .select('customer_id, customer_full_name, complete_time, description, category')
      .eq('user_id', userId)
      .not('complete_time', 'is', null)
      .not('customer_id', 'is', null)
      .neq('customer_id', '0')
      .gte('complete_time', oneYearAgoIso)
      .or(SERVICE_OR_FILTER)
      .order('complete_time', { ascending: false })
      .range(from, to)

    if (error) {
      throw new Error(`Failed to query service customers: ${error.message}`)
    }

    const rows = data ?? []
    for (const row of rows) {
      const customerId = String(row.customer_id ?? '').trim()
      if (!customerId || customerId === '0') continue
      if (!isGeneralOrFullServiceLine(row.description, row.category)) continue

      const completeTime = String(row.complete_time ?? '').trim()
      if (!completeTime) continue

      const previous = byCustomer.get(customerId)
      if (!previous || completeTime > previous.lastServiceAt) {
        byCustomer.set(customerId, {
          customerId,
          customerName:
            String(row.customer_full_name ?? '').trim() || `Customer ${customerId}`,
          lastServiceAt: completeTime,
          lastServiceDescription:
            String(row.description ?? row.category ?? 'General or full service').trim(),
        })
      }
    }

    if (rows.length < PAGE_SIZE) break
  }

  const dueCustomers = [...byCustomer.values()]
    .filter((customer) => customer.lastServiceAt < sixMonthsAgoIso)
    .sort((a, b) => a.lastServiceAt.localeCompare(b.lastServiceAt))
    .slice(0, limit)

  if (dueCustomers.length === 0) return []

  const client = createLightspeedClient(userId)

  return Promise.all(
    dueCustomers.map(async (customer) => {
      let mobile: string | null = null
      let firstName = customer.customerName.split(/\s+/)[0] || customer.customerName

      try {
        const profile = await client.getCustomer(customer.customerId, {
          load_relations: '["Contact"]',
        })
        mobile = pickCustomerMobile(profile)
        firstName = customerFirstName(profile, customer.customerName)
      } catch {
        // Keep aggregate row even if customer detail lookup fails.
      }

      const daysSinceService = Math.max(
        0,
        Math.floor(
          (now.getTime() - new Date(customer.lastServiceAt).getTime()) / (1000 * 60 * 60 * 24),
        ),
      )

      const messageDraft = formatNestOutboundMessage(
        "It's been a while since your last bike service. Reply to this message if you'd like to book a general or full service.",
        {
          firstName,
          storeName: options?.storeName,
          templates: options?.messageTemplates,
        },
      )

      return {
        id: customer.customerId,
        customerId: customer.customerId,
        customerName: customer.customerName,
        mobile,
        lastServiceAt: customer.lastServiceAt,
        lastServiceDescription: customer.lastServiceDescription,
        daysSinceService,
        messageDraft,
        canSend: Boolean(mobile),
      }
    }),
  )
}
