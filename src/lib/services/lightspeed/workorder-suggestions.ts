import {
  formatNestOutboundMessage,
  type NestMessageTemplateSettings,
} from '@/lib/nest/message-format'
import {
  buildWorkorderPickupSmsContext,
  generateWorkorderPickupSmsDraft,
} from '@/lib/nest/workorder-pickup-sms'
import { createLightspeedClient } from './lightspeed-client'
import { isFinishedWorkorderStatus } from './workorder-queries'
import type {
  LightspeedCustomer,
  LightspeedWorkorderItem,
  LightspeedWorkorderLine,
  LightspeedWorkorderWithRelations,
} from './types'

export type HomeV2WorkorderNestSuggestion = {
  id: string
  workorderId: string
  customerId: string
  customerName: string
  mobile: string | null
  workSummary: string
  label: string
  messageDraft: string
  finishedAt: string
  statusName: string
  canSend: boolean
}

function ensureArray<T>(data: T | T[] | undefined): T[] {
  if (!data) return []
  return Array.isArray(data) ? data : [data]
}

function customerDisplayName(customer: LightspeedCustomer | undefined, customerId: string): string {
  if (!customer) return `Customer ${customerId}`
  const name = [customer.firstName, customer.lastName]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(' ')
  return name || String(customer.company ?? '').trim() || `Customer ${customerId}`
}

function customerFirstName(customer: LightspeedCustomer | undefined, fallback: string): string {
  const first = String(customer?.firstName ?? '').trim()
  if (first) return first
  return fallback.split(/\s+/)[0] || fallback
}

function customerPhones(customer: LightspeedCustomer): string[] {
  const phones = customer.Contact?.Phones?.ContactPhone
  return ensureArray(phones)
    .map((phone) => String(phone.number ?? '').trim())
    .filter(Boolean)
}

function pickCustomerMobile(customer: LightspeedCustomer): string | null {
  const phones = ensureArray(customer.Contact?.Phones?.ContactPhone)
  const mobile = phones.find((phone) => String(phone.useType ?? '').toLowerCase().includes('mobile'))
  if (mobile?.number?.trim()) return mobile.number.trim()
  const first = phones.find((phone) => phone.number?.trim())
  return first?.number?.trim() ?? customerPhones(customer)[0] ?? null
}

function workorderLines(workorder: LightspeedWorkorderWithRelations): LightspeedWorkorderLine[] {
  return ensureArray(workorder.WorkorderLines?.WorkorderLine)
}

function workorderItemsFromRelation(workorder: LightspeedWorkorderWithRelations): LightspeedWorkorderItem[] {
  return ensureArray(workorder.WorkorderItems?.WorkorderItem)
}

function lineNotes(workorder: LightspeedWorkorderWithRelations): string[] {
  return workorderLines(workorder)
    .map((line) => String(line.note ?? '').trim())
    .filter((note) => note && note.toLowerCase() !== 'labor')
}

function itemDescriptions(items: LightspeedWorkorderItem[]): string[] {
  return items
    .map((item) => {
      const description = String(item.Item?.description ?? '').trim()
      if (description) return description
      const note = String(item.note ?? '').trim()
      return note
    })
    .filter(Boolean)
}

function summariseWorkFallback(workorder: LightspeedWorkorderWithRelations): string {
  const lines = lineNotes(workorder)

  if (lines.length > 0) {
    const unique = Array.from(new Set(lines))
    if (unique.length === 1) return unique[0]
    if (unique.length === 2) return `${unique[0]} and ${unique[1]}`
    return `${unique.slice(0, 2).join(', ')} and more`
  }

  const note = String(workorder.note ?? '').trim()
  if (note) return note.length > 60 ? `${note.slice(0, 57)}…` : note

  const statusName = String(workorder.WorkorderStatus?.name ?? '').trim()
  return statusName ? `${statusName.toLowerCase()} service` : 'bike service'
}

function shortWorkForSms(workSummary: string): string {
  const trimmed = workSummary.trim()
  if (!trimmed) return 'bike'

  if (/ and more$/i.test(trimmed) || / and /.test(trimmed)) {
    return 'bike service'
  }

  const lower = trimmed.toLowerCase()
  if (lower.length <= 36) return lower

  const shortened = trimmed.slice(0, 33).trim()
  return `${shortened}…`.toLowerCase()
}

function buildFallbackMessageDraft(
  firstName: string,
  workSummary: string,
  templates: Partial<NestMessageTemplateSettings> | null | undefined,
  storeName: string | null | undefined,
): string {
  const work = shortWorkForSms(workSummary)
  return formatNestOutboundMessage(`Your ${work} is ready for pickup.`, {
    firstName,
    storeName,
    templates,
  })
}

function buildSuggestionLabel(customerName: string, workSummary: string): string {
  const work = workSummary.toLowerCase()
  return `Message ${customerName} and let them know their ${work} is complete`
}

function parseTimestamp(value: string | undefined): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

export async function fetchHomeV2WorkorderNestSuggestions(
  userId: string,
  limit = 4,
  options?: {
    messageTemplates?: Partial<NestMessageTemplateSettings> | null
    storeName?: string | null
  },
): Promise<HomeV2WorkorderNestSuggestion[]> {
  const client = createLightspeedClient(userId)
  const statuses = await client.getWorkorderStatuses()
  const finishedStatusIds = new Set(
    statuses.filter(isFinishedWorkorderStatus).map((status) => status.workorderStatusID),
  )

  if (finishedStatusIds.size === 0) return []

  const loadRelations = '["Customer","WorkorderLines","WorkorderStatus"]'
  const batches = await Promise.all(
    [...finishedStatusIds].map((statusId) =>
      client.getWorkorders({
        archived: 'false',
        workorderStatusID: statusId,
        sort: '-timeStamp',
        limit: 12,
        load_relations: loadRelations,
      }),
    ),
  )

  const byId = new Map<string, LightspeedWorkorderWithRelations>()
  for (const workorder of batches.flat()) {
    byId.set(String(workorder.workorderID), workorder)
  }

  const finished = [...byId.values()]
    .filter((workorder) => String(workorder.customerID ?? '') && workorder.customerID !== '0')
    .sort((a, b) => parseTimestamp(b.timeStamp) - parseTimestamp(a.timeStamp))
    .slice(0, limit)

  const enriched = await Promise.all(
    finished.map(async (workorder) => {
      const customerId = String(workorder.customerID)
      let customer = workorder.Customer
      let mobile: string | null = null
      let items = workorderItemsFromRelation(workorder)

      const [profileResult, itemsResult] = await Promise.allSettled([
        client.getCustomer(customerId, { load_relations: '["Contact"]' }),
        items.length === 0
          ? client.getWorkorderItems(String(workorder.workorderID))
          : Promise.resolve(items),
      ])

      if (profileResult.status === 'fulfilled') {
        customer = profileResult.value
        mobile = pickCustomerMobile(profileResult.value)
      } else {
        mobile = customer ? pickCustomerMobile(customer) : null
      }

      if (itemsResult.status === 'fulfilled') {
        items = itemsResult.value
      }

      return { workorder, customer, customerId, mobile, items }
    }),
  )

  const smsDrafts = await Promise.all(
    enriched.map(async ({ workorder, items }) => {
      const statusName = String(workorder.WorkorderStatus?.name ?? 'Finished').trim()
      const context = buildWorkorderPickupSmsContext({
        lineNotes: lineNotes(workorder),
        workorderNote: workorder.note,
        itemDescriptions: itemDescriptions(items),
        statusName,
      })
      return generateWorkorderPickupSmsDraft(context)
    }),
  )

  const suggestions: HomeV2WorkorderNestSuggestion[] = []

  for (const [index, row] of enriched.entries()) {
    const { workorder, customer, customerId, mobile, items } = row
    const workorderId = String(workorder.workorderID ?? '').trim()
    if (!workorderId) continue

    const customerName = customerDisplayName(customer, customerId)
    const firstName = customerFirstName(customer, customerName)
    const statusName = String(workorder.WorkorderStatus?.name ?? 'Finished').trim()
    const finishedAt = workorder.timeStamp || workorder.etaOut || workorder.timeIn
    const fallbackSummary = summariseWorkFallback(workorder)
    const llmDraft = smsDrafts[index]

    const workSummary = llmDraft?.workPhrase ?? fallbackSummary
    const messageDraft = llmDraft
      ? formatNestOutboundMessage(llmDraft.body, {
          firstName,
          storeName: options?.storeName,
          templates: options?.messageTemplates,
        })
      : buildFallbackMessageDraft(
          firstName,
          fallbackSummary,
          options?.messageTemplates,
          options?.storeName,
        )

    suggestions.push({
      id: workorderId,
      workorderId,
      customerId,
      customerName,
      mobile,
      workSummary,
      label: buildSuggestionLabel(customerName, workSummary),
      messageDraft,
      finishedAt,
      statusName,
      canSend: Boolean(mobile),
    })
  }

  return suggestions
}
