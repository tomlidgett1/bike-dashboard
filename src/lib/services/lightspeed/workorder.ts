/**
 * Yellow Jersey "YELLOW JERSEY SALE" Workorder builders
 *
 * When a Lightspeed-sourced product is purchased on the Yellow Jersey
 * marketplace we do NOT complete a sale or deduct stock-on-hand in the
 * seller's Lightspeed account. Instead we create a Workorder titled
 * "YELLOW JERSEY SALE" whose note highlights every detail of the online
 * order. The store reviews the workorder and processes the sale (and the
 * stock adjustment) themselves — Lightspeed stays the source of truth.
 *
 * This module is intentionally free of runtime dependencies (only type-only
 * imports, which are erased at build time) so the payload/selection logic can
 * be unit-tested in isolation without pulling in the Supabase / Next request
 * chain that the API client depends on.
 */

import type { LightspeedWorkorderStatus } from './types'

/** The label that identifies these workorders in the store's Lightspeed. */
export const YELLOW_JERSEY_WORKORDER_TITLE = 'YELLOW JERSEY SALE'
export const YELLOW_JERSEY_WORKORDER_HOOK = 'ONLINE'

/**
 * The dedicated customer every marketplace-sale workorder is attached to. The
 * Lightspeed Workorder has no "description" field — the customer is the only
 * label shown — so naming this customer "YELLOW JERSEY" is what makes the
 * workorder read as a Yellow Jersey sale at a glance.
 */
export const YELLOW_JERSEY_CUSTOMER = {
  firstName: 'YELLOW',
  lastName: 'JERSEY',
  company: 'YELLOW JERSEY',
} as const

/** A single product line on a (possibly multi-item) marketplace order. */
export interface YellowJerseyWorkorderLineItem {
  /** Lightspeed item description, if resolvable. */
  itemDescription?: string | null
  /** Lightspeed SKU (systemSku / customSku), if resolvable. */
  itemSku?: string | null
  unitQuantity: number
  unitPrice: number
}

export interface YellowJerseyWorkorderDetails {
  /** Our marketplace order number (cross-reference). */
  orderNumber: string
  /** All products purchased from this seller in the one order. */
  items: YellowJerseyWorkorderLineItem[]
  /** Buyer's name from the Stripe checkout, if available. */
  buyerName?: string | null
  buyerEmail?: string | null
  buyerPhone?: string | null
  deliveryMethod?: string | null
  deliveryDescription?: string | null
  shippingName?: string | null
  shippingPhone?: string | null
  /**
   * Single-line formatted shipping address the buyer entered at Stripe
   * checkout. Null/empty means the order is a pickup (no delivery).
   */
  shippingAddress?: string | null
  shippingCost?: number | null
  buyerFee?: number | null
  voucherDiscount?: number | null
  totalAmount?: number | null
}

/** Resolved Lightspeed entity IDs required to POST a Workorder. */
export interface WorkorderResolvedContext {
  shopID: string
  employeeID: string
  customerID: string
  workorderStatusID: string
}

export function formatMoney(amount: number): string {
  return `$${amount.toFixed(2)}`
}

function hasFiniteAmount(amount: number | null | undefined): amount is number {
  return typeof amount === 'number' && Number.isFinite(amount)
}

function trimmed(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

function requireNonEmpty(value: string | null | undefined, field: string): string {
  const result = value?.trim() ?? ''
  if (!result) {
    throw new Error(`[Lightspeed] Cannot create YELLOW JERSEY SALE workorder item without ${field}`)
  }
  return result
}

function formatWorkorderItemQuantity(quantity: number): string {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error(`[Lightspeed] Invalid YELLOW JERSEY SALE workorder item quantity: ${quantity}`)
  }
  return String(quantity)
}

function formatWorkorderItemUnitPrice(unitPrice: number): string {
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new Error(`[Lightspeed] Invalid YELLOW JERSEY SALE workorder item unit price: ${unitPrice}`)
  }
  return unitPrice.toFixed(2)
}

/**
 * Build the human-readable note that the store sees on the workorder. Leads
 * with the YELLOW JERSEY SALE title and a clear action instruction so staff
 * know the customer has already paid and only the in-store fulfilment + stock
 * adjustment remain.
 */
export function buildYellowJerseyWorkorderNote(d: YellowJerseyWorkorderDetails): string {
  const items = d.items ?? []
  const itemsSubtotal = items.reduce((sum, it) => sum + it.unitPrice * it.unitQuantity, 0)
  const deliveryMethod = trimmed(d.deliveryDescription) || trimmed(d.deliveryMethod)

  const lines: string[] = [
    YELLOW_JERSEY_WORKORDER_TITLE,
    '================================',
    `Online order: ${d.orderNumber}`,
    `Hook in: ${YELLOW_JERSEY_WORKORDER_HOOK}`,
    `Items (${items.length}):`,
  ]

  items.forEach((it, idx) => {
    const lineTotal = it.unitPrice * it.unitQuantity
    const desc = it.itemDescription?.trim() || '(see SKU below)'
    lines.push(`  ${idx + 1}. ${desc}`)
    if (it.itemSku?.trim()) lines.push(`     SKU: ${it.itemSku.trim()}`)
    lines.push(
      `     Quantity: ${it.unitQuantity} x ${formatMoney(it.unitPrice)} = ${formatMoney(lineTotal)}`
    )
  })

  lines.push(`Order total: ${formatMoney(itemsSubtotal)}`)

  const buyerLines: string[] = []
  if (trimmed(d.buyerName)) buyerLines.push(`  Name: ${trimmed(d.buyerName)}`)
  if (trimmed(d.buyerEmail)) buyerLines.push(`  Email: ${trimmed(d.buyerEmail)}`)
  if (trimmed(d.buyerPhone)) buyerLines.push(`  Mobile: ${trimmed(d.buyerPhone)}`)
  if (buyerLines.length > 0) {
    lines.push('Buyer details:', ...buyerLines)
  }

  const shippingLines: string[] = []
  if (deliveryMethod) shippingLines.push(`  Method: ${deliveryMethod}`)
  if (hasFiniteAmount(d.shippingCost)) shippingLines.push(`  Shipping cost: ${formatMoney(d.shippingCost)}`)
  if (trimmed(d.shippingName)) shippingLines.push(`  Recipient: ${trimmed(d.shippingName)}`)
  // Shipping-only: show the address the buyer entered at checkout, or "Pickup"
  // when no shipping address was provided (in-store collection).
  shippingLines.push(`  Ship to: ${trimmed(d.shippingAddress) || 'Pickup'}`)
  if (trimmed(d.shippingPhone) && trimmed(d.shippingPhone) !== trimmed(d.buyerPhone)) {
    shippingLines.push(`  Recipient mobile: ${trimmed(d.shippingPhone)}`)
  }
  lines.push('Fulfilment:', ...shippingLines)

  const paymentLines: string[] = []
  if (hasFiniteAmount(d.buyerFee)) paymentLines.push(`  Buyer fee: ${formatMoney(d.buyerFee)}`)
  if (hasFiniteAmount(d.voucherDiscount) && d.voucherDiscount > 0) {
    paymentLines.push(`  Voucher discount: -${formatMoney(d.voucherDiscount)}`)
  }
  if (hasFiniteAmount(d.totalAmount)) paymentLines.push(`  Total paid online: ${formatMoney(d.totalAmount)}`)
  if (paymentLines.length > 0) {
    lines.push('Payment:', ...paymentLines)
  }

  lines.push(
    '--------------------------------',
    'Sold via the Yellow Jersey online marketplace — payment has already been collected by Yellow Jersey.',
    'ACTION: Process this sale in Lightspeed and adjust stock-on-hand manually. Do NOT charge the customer again.'
  )

  return lines.join('\n')
}

/**
 * Build the exact JSON body POSTed to /Account/{id}/Workorder.json.
 * All Lightspeed R-Series workorder fields are sent as strings.
 */
export function buildYellowJerseyWorkorderPayload(
  ctx: WorkorderResolvedContext,
  details: YellowJerseyWorkorderDetails,
  now: Date = new Date()
): Record<string, string> {
  const timestamp = now.toISOString()
  return {
    timeIn: timestamp,
    etaOut: timestamp,
    note: buildYellowJerseyWorkorderNote(details),
    internalNote: `${YELLOW_JERSEY_WORKORDER_TITLE} — ${details.orderNumber}`,
    warranty: 'false',
    hookIn: YELLOW_JERSEY_WORKORDER_HOOK,
    hookOut: '',
    saveParts: 'false',
    assignEmployeeToAll: 'true',
    customerID: ctx.customerID,
    discountID: '0',
    employeeID: ctx.employeeID,
    serializedID: '0',
    shopID: ctx.shopID,
    workorderStatusID: ctx.workorderStatusID,
  }
}

/** Minimal shapes of the Lightspeed entities the assembler selects from. */
export interface WorkorderEntitySources {
  accountId: string
  shops: Array<{ shopID: string }>
  employees: Array<{ employeeID: string }>
  statuses: LightspeedWorkorderStatus[]
  /** Optional — first customer is used; falls back to "0" walk-in if absent. */
  customers?: Array<{ customerID: string }>
}

/** One purchased product, with its (optional) resolved Lightspeed item. */
export interface WorkorderItemParam {
  unitQuantity: number
  unitPrice: number
  /** Resolved Lightspeed item, used to enrich the note. */
  item?: { description?: string; systemSku?: string; customSku?: string } | null
}

export interface WorkorderItemPostParam {
  itemID: string
  unitQuantity: number
  unitPrice: number
  note?: string | null
}

export interface AssembledWorkorderRequest {
  endpoint: string
  body: Record<string, string>
}

export interface AssembledWorkorderItemRequest {
  endpoint: string
  body: Record<string, string>
}

/**
 * Inventory products on a workorder are represented by Lightspeed's
 * WorkorderItem child endpoint. WorkorderLine is the labor/misc charge shape,
 * so marketplace products stay here to preserve itemID + quantity semantics.
 */
export function buildYellowJerseyWorkorderItemPayload(
  employeeID: string,
  item: WorkorderItemPostParam
): Record<string, string> {
  return {
    approved: 'false',
    unitPrice: formatWorkorderItemUnitPrice(item.unitPrice),
    unitQuantity: formatWorkorderItemQuantity(item.unitQuantity),
    warranty: 'false',
    tax: 'false',
    isSpecialOrder: 'false',
    note: trimmed(item.note) || YELLOW_JERSEY_WORKORDER_TITLE,
    employeeID: requireNonEmpty(employeeID, 'employeeID'),
    itemID: requireNonEmpty(item.itemID, 'itemID'),
    discountID: '0',
  }
}

export function assembleYellowJerseyWorkorderItemRequests(
  accountId: string,
  workorderID: string,
  employeeID: string,
  items: WorkorderItemPostParam[]
): AssembledWorkorderItemRequest[] {
  return items.map((item) => ({
    endpoint: `/Account/${accountId}/Workorder/${workorderID}/WorkorderItem.json`,
    body: buildYellowJerseyWorkorderItemPayload(employeeID, item),
  }))
}

/**
 * Pure selection + assembly: given the entities fetched from Lightspeed and the
 * order params, pick the shop/employee/status/customer and produce the POST
 * endpoint + body. Throws if a required entity is missing so the caller can
 * treat it as a (non-fatal) failure.
 */
export function assembleYellowJerseyWorkorderRequest(
  sources: WorkorderEntitySources,
  params: {
    items: WorkorderItemParam[]
    orderNumber: string
    buyerName?: string | null
    buyerEmail?: string | null
    buyerPhone?: string | null
    deliveryMethod?: string | null
    deliveryDescription?: string | null
    shippingName?: string | null
    shippingPhone?: string | null
    shippingAddress?: string | null
    shippingCost?: number | null
    buyerFee?: number | null
    voucherDiscount?: number | null
    totalAmount?: number | null
  },
  now: Date = new Date()
): AssembledWorkorderRequest {
  const shop = sources.shops[0]
  if (!shop) {
    throw new Error('[Lightspeed] No active shop found — cannot create YELLOW JERSEY SALE workorder')
  }

  const employee = sources.employees[0]
  if (!employee) {
    throw new Error('[Lightspeed] No active employee found — cannot create YELLOW JERSEY SALE workorder')
  }

  const status = sources.statuses[0]
  if (!status) {
    throw new Error('[Lightspeed] No workorder status configured — cannot create YELLOW JERSEY SALE workorder')
  }

  // customerID is required by the API; fall back to "0" (walk-in) if the
  // account has no customers to attach.
  const customerID = sources.customers?.[0]?.customerID ?? '0'

  const details: YellowJerseyWorkorderDetails = {
    orderNumber: params.orderNumber,
    items: params.items.map((it) => ({
      itemDescription: it.item?.description ?? null,
      itemSku: it.item?.systemSku ?? it.item?.customSku ?? null,
      unitQuantity: it.unitQuantity,
      unitPrice: it.unitPrice,
    })),
    buyerName: params.buyerName ?? null,
    buyerEmail: params.buyerEmail ?? null,
    buyerPhone: params.buyerPhone ?? null,
    deliveryMethod: params.deliveryMethod ?? null,
    deliveryDescription: params.deliveryDescription ?? null,
    shippingName: params.shippingName ?? null,
    shippingPhone: params.shippingPhone ?? null,
    shippingAddress: params.shippingAddress ?? null,
    shippingCost: params.shippingCost ?? null,
    buyerFee: params.buyerFee ?? null,
    voucherDiscount: params.voucherDiscount ?? null,
    totalAmount: params.totalAmount ?? null,
  }

  const body = buildYellowJerseyWorkorderPayload(
    {
      shopID: shop.shopID,
      employeeID: employee.employeeID,
      customerID,
      workorderStatusID: status.workorderStatusID,
    },
    details,
    now
  )

  return {
    endpoint: `/Account/${sources.accountId}/Workorder.json`,
    body,
  }
}
