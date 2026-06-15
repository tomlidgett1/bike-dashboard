import { fetchCustomerSalesSummary } from '@/lib/customer-inquiries/customer-sales-summary'
import { findLightspeedCustomerForInquiry } from '@/lib/services/lightspeed/customer-search'
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

export async function buildLightspeedInquiryContext(args: {
  userId: string
  senderEmail: string
  senderName: string
}): Promise<LightspeedInquiryContext> {
  try {
    const customer = await findLightspeedCustomerForInquiry(args.userId, {
      senderEmail: args.senderEmail,
      senderName: args.senderName,
    })

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
