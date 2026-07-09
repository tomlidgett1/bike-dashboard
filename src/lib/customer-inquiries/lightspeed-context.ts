import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCustomerSalesSummary } from '@/lib/customer-inquiries/customer-sales-summary'
import {
  extractPhoneFromInquirySender,
  isLikelyPhone,
  loadPhoneContactsFromDb,
  normalizePhoneForDirectory,
  sanitizePhoneForLookup,
  upsertPhoneContactToDb,
} from '@/lib/customer-inquiries/lightspeed-phone-directory'
import {
  customerRecordMatchesPhone,
  findLightspeedCustomerForInquiry,
  lookupLightspeedCustomerForLab,
  normalizeAustralianMobileLocal,
} from '@/lib/services/lightspeed/customer-search'
import { createLightspeedClient } from '@/lib/services/lightspeed'
import type {
  LightspeedCustomer,
  LightspeedWorkorderItem,
  LightspeedWorkorderLine,
  LightspeedWorkorderWithRelations,
} from '@/lib/services/lightspeed/types'
import type { LightspeedInquiryContext } from '@/lib/customer-inquiries/types'

type InquiryWorkorder = NonNullable<LightspeedInquiryContext['recent_workorders']>[number]

function ensureWorkorderArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function parseLooseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function mapWorkorderItems(items: LightspeedWorkorderItem[]): InquiryWorkorder['items'] {
  return items
    .map((item) => {
      const description =
        String(item.Item?.description ?? '').trim() ||
        String(item.note ?? '').trim() ||
        null
      const note = String(item.note ?? '').trim() || null
      return {
        description,
        quantity: parseLooseNumber(item.unitQuantity),
        note: note && note !== description ? note : null,
      }
    })
    .filter((item) => item.description || item.note)
}

function mapWorkorderLines(lines: LightspeedWorkorderLine[]): InquiryWorkorder['lines'] {
  return lines
    .map((line) => ({
      note: String(line.note ?? '').trim(),
      done: String(line.done ?? '') === 'true',
    }))
    .filter((line) => line.note.length > 0)
}

async function mapRecentWorkorders(
  client: ReturnType<typeof createLightspeedClient>,
  workorders: LightspeedWorkorderWithRelations[],
): Promise<InquiryWorkorder[]> {
  const top = workorders.slice(0, 5)
  return Promise.all(
    top.map(async (workorder) => {
      const id = String(workorder.workorderID ?? '')
      let items = ensureWorkorderArray(workorder.WorkorderItems?.WorkorderItem)
      if (items.length === 0 && id) {
        try {
          items = await client.getWorkorderItems(id)
        } catch {
          items = []
        }
      }
      const lines = ensureWorkorderArray(workorder.WorkorderLines?.WorkorderLine)
      const statusName = String(workorder.WorkorderStatus?.name ?? '').trim()
      return {
        id,
        title: String(workorder.note ?? workorder.internalNote ?? '').trim() || null,
        status: statusName || String(workorder.workorderStatusID ?? '') || null,
        updated_at: String(workorder.timeStamp ?? workorder.timeIn ?? '') || null,
        items: mapWorkorderItems(items),
        lines: mapWorkorderLines(lines),
      }
    }),
  )
}

function ensureArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function customerName(customer: LightspeedCustomer): string {
  const name = [customer.firstName, customer.lastName]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(' ')
  return name || String(customer.company ?? '').trim() || `Customer ${customer.customerID}`
}

function customerEmails(customer: LightspeedCustomer): string[] {
  const emails = ensureArray(customer.Contact?.Emails?.ContactEmail)
  return emails
    .map((email) => String(email.address ?? '').trim().toLowerCase())
    .filter(Boolean)
}

function customerPhone(customer: LightspeedCustomer): string | null {
  const contact = customer.Contact
  const nested = ensureArray(contact?.Phones?.ContactPhone)
  const mobile = nested.find((phone) =>
    String(phone.useType ?? '').toLowerCase().includes('mobile'),
  )
  if (mobile?.number?.trim()) return mobile.number.trim()
  const flat = [contact?.mobile, contact?.phoneHome, contact?.phoneWork]
    .map((value) => String(value ?? '').trim())
    .find(Boolean)
  if (flat) return flat
  const first = nested.find((phone) => phone.number?.trim())
  return first?.number?.trim() ?? null
}

export async function buildLightspeedContextFromPhone(args: {
  userId: string
  phone: string
  supabase?: SupabaseClient
}): Promise<LightspeedInquiryContext> {
  const phone = sanitizePhoneForLookup(args.phone) ?? args.phone.trim()
  if (!phone || !isLikelyPhone(phone)) {
    return {
      matched: false,
      summary: 'No valid mobile number provided for Lightspeed lookup.',
    }
  }

  const normalizedPhone = normalizeAustralianMobileLocal(phone)

  try {
    let customer: LightspeedCustomer | null = null

    const lookup = await lookupLightspeedCustomerForLab(args.userId, {
      phone,
      maxScanPages: 10,
    })
    customer = lookup.customer

    if (!customer && args.supabase) {
      const cached = await loadPhoneContactsFromDb(args.supabase, args.userId, [phone])
      const contact = cached.get(phone)
      if (contact?.lightspeedCustomerId) {
        try {
          const client = createLightspeedClient(args.userId)
          const cachedCustomer = await client.getCustomer(contact.lightspeedCustomerId, {
            load_relations: '["Contact"]',
          })
          if (customerRecordMatchesPhone(cachedCustomer, phone)) {
            customer = cachedCustomer
          }
        } catch {
          customer = null
        }
      }
    }

    if (!customer) {
      return {
        matched: false,
        summary: normalizedPhone
          ? `No matching Lightspeed customer found for ${normalizedPhone}.`
          : 'No matching Lightspeed customer found for this mobile number.',
      }
    }

    if (args.supabase) {
      const phoneNormalized = normalizePhoneForDirectory(phone) ?? phone
      await upsertPhoneContactToDb(args.supabase, args.userId, phone, {
        phoneNormalized,
        firstName: customer.firstName ?? null,
        lastName: customer.lastName ?? null,
        displayName: customerName(customer),
        lightspeedCustomerId: String(customer.customerID),
      })
    }

    const client = createLightspeedClient(args.userId)
    const customerId = String(customer.customerID)
    const [bikes, workorders, salesSummary] = await Promise.all([
      client.getCustomerBikes(customerId),
      client.getRecentWorkorders(
        {
          customerID: customerId,
          sort: '-timeStamp',
          load_relations: '["WorkorderLines","WorkorderStatus","WorkorderItems"]',
        },
        { targetCount: 5, maxPages: 2, limit: 25 },
      ),
      fetchCustomerSalesSummary(args.userId, customerId),
    ])

    const recentWorkorders = await mapRecentWorkorders(client, workorders)

    return {
      matched: true,
      customer_id: customerId,
      customer_name: customerName(customer),
      customer_email: customerEmails(customer)[0] ?? null,
      customer_phone: customerPhone(customer),
      bikes: bikes.slice(0, 5).map((bike) => ({
        label: bike.label,
        serial: bike.serial,
        item_id: bike.itemId,
      })),
      recent_workorders: recentWorkorders,
      sales_summary: salesSummary,
      summary: `Matched Lightspeed customer ${customerName(customer)} (${customerId}).`,
    }
  } catch (error) {
    console.error('[customer-inquiries] lightspeed phone context failed:', error)
    return {
      matched: false,
      summary: 'Lightspeed lookup unavailable for this mobile number.',
    }
  }
}

export async function buildLightspeedInquiryContext(args: {
  userId: string
  senderEmail: string
  senderName: string
  supabase?: SupabaseClient
}): Promise<LightspeedInquiryContext> {
  try {
    const phone = extractPhoneFromInquirySender(args.senderEmail, args.senderName)
    if (phone) {
      return buildLightspeedContextFromPhone({
        userId: args.userId,
        phone,
        supabase: args.supabase,
      })
    }

    const customer = await findLightspeedCustomerForInquiry(args.userId, {
      senderEmail: args.senderEmail,
      senderName: args.senderName,
    }, { maxScanPages: 5 })

    if (!customer) {
      return {
        matched: false,
        summary: 'No matching Lightspeed customer found for this sender.',
      }
    }

    const client = createLightspeedClient(args.userId)
    const customerId = String(customer.customerID)
    const [bikes, workorders, salesSummary] = await Promise.all([
      client.getCustomerBikes(customerId),
      client.getRecentWorkorders(
        {
          customerID: customerId,
          sort: '-timeStamp',
          load_relations: '["WorkorderLines","WorkorderStatus","WorkorderItems"]',
        },
        { targetCount: 5, maxPages: 2, limit: 25 },
      ),
      fetchCustomerSalesSummary(args.userId, customerId),
    ])

    const recentWorkorders = await mapRecentWorkorders(client, workorders)

    const context: LightspeedInquiryContext = {
      matched: true,
      customer_id: customerId,
      customer_name: customerName(customer),
      customer_email: customerEmails(customer)[0] ?? null,
      customer_phone: customerPhone(customer),
      bikes: bikes.slice(0, 5).map((bike) => ({
        label: bike.label,
        serial: bike.serial,
        item_id: bike.itemId,
      })),
      recent_workorders: recentWorkorders,
      sales_summary: salesSummary,
      summary: `Matched Lightspeed customer ${customerName(customer)} (${customerId}).`,
    }

    return context
  } catch (error) {
    console.error('[customer-inquiries] lightspeed context failed:', error)
    return {
      matched: false,
      summary: 'Lightspeed lookup unavailable for this sender.',
    }
  }
}
