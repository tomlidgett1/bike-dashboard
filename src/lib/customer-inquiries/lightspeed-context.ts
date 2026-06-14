import { fetchCustomerSalesSummary } from '@/lib/customer-inquiries/customer-sales-summary'
import { createLightspeedClient } from '@/lib/services/lightspeed'
import type { LightspeedCustomer } from '@/lib/services/lightspeed/types'
import type { LightspeedInquiryContext } from '@/lib/customer-inquiries/types'

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
  const phones = ensureArray(customer.Contact?.Phones?.ContactPhone)
  const mobile = phones.find((phone) =>
    String(phone.useType ?? '').toLowerCase().includes('mobile'),
  )
  if (mobile?.number?.trim()) return mobile.number.trim()
  const first = phones.find((phone) => phone.number?.trim())
  return first?.number?.trim() ?? null
}

async function findCustomerByEmailOrName(
  userId: string,
  senderEmail: string,
  senderName: string,
): Promise<LightspeedCustomer | null> {
  const client = createLightspeedClient(userId)
  const customerById = new Map<string, LightspeedCustomer>()
  const baseParams = {
    load_relations: '["Contact"]',
    archived: 'false' as const,
  }

  const fetchCustomers = async (
    params: Record<string, string | number | undefined>,
    maxPages = 2,
  ) => {
    const result = await client.getAllCustomersCursor({ ...baseParams, ...params }, {
      maxPages,
      limit: 100,
    })
    return result.customers
  }

  const email = senderEmail.trim().toLowerCase()
  const name = senderName.trim()

  if (email) {
    const fallbackCustomers = await fetchCustomers({}, 6)
    for (const customer of fallbackCustomers) {
      if (customerEmails(customer).includes(email)) {
        customerById.set(String(customer.customerID), customer)
      }
    }
  }

  if (customerById.size === 0 && name.length >= 2) {
    const tokens = name.split(/\s+/).filter((token) => token.length >= 2).slice(0, 3)
    const focusedResults = await Promise.all(
      tokens.flatMap((token) => [
        fetchCustomers({ firstName: `~,%${token}%` }),
        fetchCustomers({ lastName: `~,%${token}%` }),
      ]),
    )
    for (const customers of focusedResults) {
      for (const customer of customers) {
        customerById.set(String(customer.customerID), customer)
      }
    }
  }

  const ranked = Array.from(customerById.values())
    .map((customer) => {
      let score = 0
      if (email && customerEmails(customer).includes(email)) score += 200
      const fullName = customerName(customer).toLowerCase()
      if (name && fullName.includes(name.toLowerCase())) score += 80
      return { customer, score }
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)

  return ranked[0]?.customer ?? null
}

export async function buildLightspeedInquiryContext(args: {
  userId: string
  senderEmail: string
  senderName: string
}): Promise<LightspeedInquiryContext> {
  try {
    const customer = await findCustomerByEmailOrName(
      args.userId,
      args.senderEmail,
      args.senderName,
    )

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
        { customerID: customerId },
        { targetCount: 5, maxPages: 2, limit: 25 },
      ),
      fetchCustomerSalesSummary(args.userId, customerId),
    ])

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
      recent_workorders: workorders.slice(0, 5).map((workorder) => ({
        id: String(workorder.workorderID ?? ''),
        title: String(workorder.note ?? workorder.internalNote ?? '').trim() || null,
        status: String(workorder.workorderStatusID ?? '') || null,
        updated_at: String(workorder.timeStamp ?? '') || null,
      })),
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
