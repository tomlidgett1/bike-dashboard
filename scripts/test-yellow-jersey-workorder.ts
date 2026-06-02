/**
 * Test: YELLOW JERSEY SALE workorder creation.
 *
 * Verifies the pure builders/assembler that drive
 * LightspeedClient.createYellowJerseySaleWorkorder — the note content (now
 * multi-item), the POST payload required by Lightspeed's Workorder endpoint,
 * entity selection, the walk-in customer fallback, and the required-entity guards.
 *
 * Run:  npx tsx scripts/test-yellow-jersey-workorder.ts
 *
 * Imports only isolated builders/helpers (no Supabase/Next chain) so it runs standalone.
 */

import { readFileSync } from 'node:fs'
import {
  YELLOW_JERSEY_WORKORDER_HOOK,
  YELLOW_JERSEY_WORKORDER_TITLE,
  assembleYellowJerseyWorkorderItemRequests,
  buildYellowJerseyWorkorderNote,
  buildYellowJerseyWorkorderItemPayload,
  buildYellowJerseyWorkorderPayload,
  assembleYellowJerseyWorkorderRequest,
  type WorkorderEntitySources,
} from '../src/lib/services/lightspeed/workorder'
import { CHECKOUT_PHONE_NUMBER_COLLECTION } from '../src/lib/stripe/checkout-customer'

let passed = 0
let failed = 0

function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name}`)
    if (extra !== undefined) console.error('      got:', extra)
  }
}

function assertThrows(name: string, fn: () => unknown, expectMatch: string) {
  try {
    fn()
    failed++
    console.error(`  ✗ ${name} (expected throw, none happened)`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    check(name, msg.includes(expectMatch), msg)
  }
}

const FIXED_NOW = new Date('2026-06-02T10:30:00.000Z')

// ------------------------------------------------------------
// 1. Note content (single item)
// ------------------------------------------------------------
console.log('Note content:')
{
  const note = buildYellowJerseyWorkorderNote({
    orderNumber: 'ORD-20260602-AB123',
    items: [
      {
        itemDescription: 'Trek Marlin 7 Mountain Bike',
        itemSku: 'TRK-MARLIN7-L',
        unitQuantity: 2,
        unitPrice: 1299.99,
      },
    ],
    buyerName: 'Jane Cyclist',
    buyerEmail: 'jane@example.com',
    buyerPhone: '+61400000000',
    deliveryDescription: 'Australia Post (2-5 business days)',
    shippingName: 'Jane Cyclist',
    shippingPhone: '+61400000000',
    shippingAddress: '12 Pedal St, Bristol, BS1 4XY, GB',
    shippingCost: 12,
    buyerFee: 6.5,
    voucherDiscount: 10,
    totalAmount: 2608.48,
  })

  check('starts with YELLOW JERSEY SALE title', note.startsWith(YELLOW_JERSEY_WORKORDER_TITLE), note.split('\n')[0])
  check('includes hookIn value in visible note', note.includes(`Hook in: ${YELLOW_JERSEY_WORKORDER_HOOK}`), note)
  check('includes order number', note.includes('ORD-20260602-AB123'))
  check('includes item description', note.includes('Trek Marlin 7 Mountain Bike'))
  check('includes SKU', note.includes('TRK-MARLIN7-L'))
  check('includes qty x price = line total', note.includes('2 x $1299.99 = $2599.98'), note)
  check('includes order total', note.includes('Order total: $2599.98'), note)
  check('includes buyer name', note.includes('Name: Jane Cyclist'))
  check('includes buyer email', note.includes('Email: jane@example.com'))
  check('includes buyer mobile', note.includes('Mobile: +61400000000'))
  check('includes delivery method', note.includes('Method: Australia Post (2-5 business days)'))
  check('includes shipping cost', note.includes('Shipping cost: $12.00'))
  check('includes shipping recipient', note.includes('Recipient: Jane Cyclist'))
  check('includes shipping address', note.includes('Ship to: 12 Pedal St, Bristol, BS1 4XY, GB'))
  check('includes buyer fee', note.includes('Buyer fee: $6.50'))
  check('includes voucher discount', note.includes('Voucher discount: -$10.00'))
  check('includes total paid online', note.includes('Total paid online: $2608.48'))
  check('includes manual-stock action instruction', note.includes('adjust stock-on-hand manually'))
  check('includes do-not-charge-again instruction', note.toLowerCase().includes('do not charge the customer again'))
}

// ------------------------------------------------------------
// 2. Note with missing optional fields degrades gracefully + Pickup
// ------------------------------------------------------------
console.log('Note with minimal data:')
{
  const note = buildYellowJerseyWorkorderNote({
    orderNumber: 'ORD-1',
    items: [{ unitQuantity: 1, unitPrice: 50 }],
  })
  check('still has title', note.includes(YELLOW_JERSEY_WORKORDER_TITLE))
  check('falls back when no description', note.includes('(see SKU below)'))
  check('omits Buyer details section when absent', !note.includes('Buyer details:'))
  check('shows Pickup when no shipping address', note.includes('Ship to: Pickup'), note)
  check('single-qty line total', note.includes('1 x $50.00 = $50.00'))
}

// ------------------------------------------------------------
// 2b. Note with multiple line items
// ------------------------------------------------------------
console.log('Note with multiple items:')
{
  const note = buildYellowJerseyWorkorderNote({
    orderNumber: 'ORD-MULTI',
    items: [
      { itemDescription: 'Helmet', itemSku: 'HLM-1', unitQuantity: 1, unitPrice: 80 },
      { itemDescription: 'Gloves', itemSku: 'GLV-2', unitQuantity: 2, unitPrice: 25 },
    ],
    buyerName: 'Multi Buyer',
    shippingAddress: '5 Cycle Way',
  })
  check('lists item count', note.includes('Items (2):'), note)
  check('includes first item', note.includes('1. Helmet') && note.includes('HLM-1'))
  check('includes second item', note.includes('2. Gloves') && note.includes('GLV-2'))
  check('first line total', note.includes('1 x $80.00 = $80.00'))
  check('second line total', note.includes('2 x $25.00 = $50.00'))
  check('order total sums all items', note.includes('Order total: $130.00'), note)
}

// ------------------------------------------------------------
// 3. Payload required fields & types
// ------------------------------------------------------------
console.log('POST payload:')
{
  const body = buildYellowJerseyWorkorderPayload(
    { shopID: '2', employeeID: '7', customerID: '5', workorderStatusID: '4' },
    { orderNumber: 'ORD-9', items: [{ unitQuantity: 1, unitPrice: 99.95 }] },
    FIXED_NOW
  )

  const required = [
    'timeIn', 'etaOut', 'note', 'internalNote', 'warranty', 'hookIn', 'hookOut',
    'saveParts', 'assignEmployeeToAll', 'customerID', 'discountID', 'employeeID',
    'serializedID', 'shopID', 'workorderStatusID',
  ]
  check('has all required fields', required.every((k) => k in body), Object.keys(body))
  check('all values are strings', Object.values(body).every((v) => typeof v === 'string'))
  check('timeIn is ISO of provided now', body.timeIn === FIXED_NOW.toISOString(), body.timeIn)
  check('etaOut equals timeIn', body.etaOut === body.timeIn)
  check('resolved shopID passed through', body.shopID === '2')
  check('resolved employeeID passed through', body.employeeID === '7')
  check('resolved customerID passed through', body.customerID === '5')
  check('resolved workorderStatusID passed through', body.workorderStatusID === '4')
  check('discountID defaults to 0', body.discountID === '0')
  check('serializedID defaults to 0', body.serializedID === '0')
  check('warranty false', body.warranty === 'false')
  check('hookIn is ONLINE', body.hookIn === 'ONLINE', body.hookIn)
  check('assignEmployeeToAll true', body.assignEmployeeToAll === 'true')
  check('internalNote references title + order', body.internalNote === `${YELLOW_JERSEY_WORKORDER_TITLE} — ORD-9`, body.internalNote)
  check('note is the YELLOW JERSEY note', body.note.startsWith(YELLOW_JERSEY_WORKORDER_TITLE))
}

// ------------------------------------------------------------
// 3b. WorkorderItem payloads for actual item rows
// ------------------------------------------------------------
console.log('WorkorderItem payload:')
{
  const body = buildYellowJerseyWorkorderItemPayload('7', {
    itemID: '99',
    unitQuantity: 3,
    unitPrice: 42.5,
    note: 'Marketplace item',
  })

  check('itemID passed through', body.itemID === '99', body)
  check('employeeID passed through', body.employeeID === '7', body)
  check('unit quantity sent as string', body.unitQuantity === '3', body)
  check('unit price sent with cents', body.unitPrice === '42.50', body)
  check('line is not approved by default', body.approved === 'false', body)
  check('line is not taxed by default', body.tax === 'false', body)
  check('line is not special order by default', body.isSpecialOrder === 'false', body)
}

console.log('WorkorderItem validation:')
{
  assertThrows('rejects missing itemID', () =>
    buildYellowJerseyWorkorderItemPayload('7', {
      itemID: ' ',
      unitQuantity: 1,
      unitPrice: 42.5,
    }), 'without itemID')
  assertThrows('rejects missing employeeID', () =>
    buildYellowJerseyWorkorderItemPayload(' ', {
      itemID: '99',
      unitQuantity: 1,
      unitPrice: 42.5,
    }), 'without employeeID')
  assertThrows('rejects zero quantity', () =>
    buildYellowJerseyWorkorderItemPayload('7', {
      itemID: '99',
      unitQuantity: 0,
      unitPrice: 42.5,
    }), 'quantity')
  assertThrows('rejects fractional quantity', () =>
    buildYellowJerseyWorkorderItemPayload('7', {
      itemID: '99',
      unitQuantity: 1.5,
      unitPrice: 42.5,
    }), 'quantity')
  assertThrows('rejects non-finite unit price', () =>
    buildYellowJerseyWorkorderItemPayload('7', {
      itemID: '99',
      unitQuantity: 1,
      unitPrice: Number.NaN,
    }), 'unit price')
}

// ------------------------------------------------------------
// 4. Assembler: entity selection + endpoint
// ------------------------------------------------------------
console.log('Assembler — full sources:')
{
  const sources: WorkorderEntitySources = {
    accountId: 'ACC42',
    shops: [{ shopID: '10' }, { shopID: '11' }],
    employees: [{ employeeID: '20' }, { employeeID: '21' }],
    statuses: [
      { workorderStatusID: '30', name: 'Open' },
      { workorderStatusID: '31', name: 'In Progress' },
    ],
    customers: [{ customerID: '40' }],
  }

  const { endpoint, body } = assembleYellowJerseyWorkorderRequest(
    sources,
    {
      items: [
        { unitQuantity: 1, unitPrice: 1200, item: { description: 'Specialized Allez', systemSku: 'SPZ-ALLEZ', customSku: 'CUSTOM-1' } },
      ],
      orderNumber: 'ORD-55',
      buyerName: 'Sam',
      buyerEmail: 'sam@example.com',
      buyerPhone: '0400000000',
      deliveryDescription: 'Standard Shipping',
      shippingName: 'Sam Receiver',
      shippingAddress: '1 A St',
      shippingCost: 20,
      totalAmount: 1220,
    },
    FIXED_NOW
  )

  check('endpoint targets Workorder.json for account', endpoint === '/Account/ACC42/Workorder.json', endpoint)
  check('selects first shop', body.shopID === '10')
  check('selects first employee', body.employeeID === '20')
  check('selects first status', body.workorderStatusID === '30')
  check('selects first customer', body.customerID === '40')
  check('note uses item systemSku', body.note.includes('SPZ-ALLEZ'))
  check('note uses item description', body.note.includes('Specialized Allez'))
  check('note includes buyer from params', body.note.includes('Name: Sam'))
  check('note includes buyer email from params', body.note.includes('Email: sam@example.com'))
  check('note includes shipping recipient from params', body.note.includes('Recipient: Sam Receiver'))
  check('note includes delivery total from params', body.note.includes('Total paid online: $1220.00'))
}

// ------------------------------------------------------------
// 5. Assembler: walk-in customer fallback + customSku fallback
// ------------------------------------------------------------
console.log('Assembler — no customers, no systemSku:')
{
  const sources: WorkorderEntitySources = {
    accountId: 'ACC1',
    shops: [{ shopID: '1' }],
    employees: [{ employeeID: '1' }],
    statuses: [{ workorderStatusID: '1', name: 'New' }],
    customers: [],
  }
  const { body } = assembleYellowJerseyWorkorderRequest(
    sources,
    { items: [{ unitQuantity: 1, unitPrice: 10, item: { customSku: 'ONLY-CUSTOM' } }], orderNumber: 'ORD-X' },
    FIXED_NOW
  )
  check('falls back to walk-in customer "0"', body.customerID === '0', body.customerID)
  check('falls back to customSku in note', body.note.includes('ONLY-CUSTOM'))
}

// ------------------------------------------------------------
// 6. Assembler: required-entity guards
// ------------------------------------------------------------
console.log('Assembler — required-entity guards:')
{
  const base = {
    accountId: 'A',
    shops: [{ shopID: '1' }],
    employees: [{ employeeID: '1' }],
    statuses: [{ workorderStatusID: '1', name: 'New' }],
  }
  const params = { items: [{ unitQuantity: 1, unitPrice: 1 }], orderNumber: 'O' }

  assertThrows('throws when no shop', () =>
    assembleYellowJerseyWorkorderRequest({ ...base, shops: [] }, params), 'No active shop')
  assertThrows('throws when no employee', () =>
    assembleYellowJerseyWorkorderRequest({ ...base, employees: [] }, params), 'No active employee')
  assertThrows('throws when no status', () =>
    assembleYellowJerseyWorkorderRequest({ ...base, statuses: [] }, params), 'No workorder status')
}

// ------------------------------------------------------------
// 7. Simulated end-to-end client flow (records the POST), multi-item
// ------------------------------------------------------------
// Mirrors what LightspeedClient.createYellowJerseySaleWorkorder does after it
// has fetched entities + resolved items: assemble the request, then "POST" it.
console.log('Simulated client POST (multi-item):')
{
  const fetchedEntities: WorkorderEntitySources = {
    accountId: 'STORE-7',
    shops: [{ shopID: '3' }],
    employees: [{ employeeID: '9' }],
    statuses: [{ workorderStatusID: '2', name: 'Awaiting' }],
    customers: [{ customerID: '88' }],
  }

  let sent: { method: string; endpoint: string; body: Record<string, string> } | null = null
  const fakeRequest = (endpoint: string, init: { method: string; body: string }) => {
    sent = { method: init.method, endpoint, body: JSON.parse(init.body) }
    return { Workorder: { workorderID: 'WO-1001' } }
  }

  const { endpoint, body } = assembleYellowJerseyWorkorderRequest(fetchedEntities, {
    items: [
      { unitQuantity: 3, unitPrice: 2100, item: { description: 'Cannondale Topstone', systemSku: 'CDALE-TOP' } },
      { unitQuantity: 1, unitPrice: 45, item: { description: 'Bottle Cage', systemSku: 'CAGE-1' } },
    ],
    orderNumber: 'ORD-77',
    buyerName: 'Pat Rider',
    buyerEmail: 'pat@example.com',
    buyerPhone: '0400111222',
    deliveryDescription: 'Courier',
    shippingName: 'Pat Rider',
    shippingAddress: '9 Hill Rd, Leeds',
    shippingCost: 15,
    buyerFee: 10,
    totalAmount: 6370,
  })
  const result = fakeRequest(endpoint, { method: 'POST', body: JSON.stringify(body) })
  const itemRequests = assembleYellowJerseyWorkorderItemRequests(
    fetchedEntities.accountId,
    result.Workorder.workorderID,
    fetchedEntities.employees[0].employeeID,
    [
      { itemID: 'LS-1', unitQuantity: 3, unitPrice: 2100 },
      { itemID: 'LS-2', unitQuantity: 1, unitPrice: 45 },
    ]
  )

  check('POST method used', sent!.method === 'POST')
  check('correct endpoint', sent!.endpoint === '/Account/STORE-7/Workorder.json', sent!.endpoint)
  check('body note titled YELLOW JERSEY SALE', sent!.body.note.startsWith(YELLOW_JERSEY_WORKORDER_TITLE))
  check('body lists both items', sent!.body.note.includes('Items (2):'))
  check('body carries first line total', sent!.body.note.includes('3 x $2100.00 = $6300.00'))
  check('body carries second line total', sent!.body.note.includes('1 x $45.00 = $45.00'))
  check('body order total sums lines', sent!.body.note.includes('Order total: $6345.00'))
  check('body hookIn is ONLINE', sent!.body.hookIn === 'ONLINE')
  check('body includes buyer email', sent!.body.note.includes('Email: pat@example.com'))
  check('body includes delivery method', sent!.body.note.includes('Method: Courier'))
  check('body includes total paid', sent!.body.note.includes('Total paid online: $6370.00'))
  check('creates one WorkorderItem request per purchased item', itemRequests.length === 2, itemRequests)
  check('first item request endpoint is nested under workorder', itemRequests[0].endpoint === '/Account/STORE-7/Workorder/WO-1001/WorkorderItem.json', itemRequests[0])
  check('first item request carries itemID/qty/price', itemRequests[0].body.itemID === 'LS-1' && itemRequests[0].body.unitQuantity === '3' && itemRequests[0].body.unitPrice === '2100.00', itemRequests[0])
  check('second item request carries itemID/qty/price', itemRequests[1].body.itemID === 'LS-2' && itemRequests[1].body.unitQuantity === '1' && itemRequests[1].body.unitPrice === '45.00', itemRequests[1])
  check('returns workorderID', result.Workorder.workorderID === 'WO-1001')
}

// ------------------------------------------------------------
// 8. Stripe Checkout phone collection + webhook mobile mapping
// ------------------------------------------------------------
console.log('Stripe Checkout mobile collection:')
{
  check('shared phone collection is enabled', CHECKOUT_PHONE_NUMBER_COLLECTION.enabled === true, CHECKOUT_PHONE_NUMBER_COLLECTION)

  const checkoutRoutes = [
    'src/app/api/stripe/create-checkout/route.ts',
    'src/app/api/stripe/create-cart-checkout/route.ts',
    'src/app/api/stripe/create-checkout-offer/route.ts',
  ]
  for (const route of checkoutRoutes) {
    const source = readFileSync(route, 'utf8')
    check(`${route} uses shared phone collection`, source.includes('phone_number_collection: CHECKOUT_PHONE_NUMBER_COLLECTION'))
  }

  const webhookSource = readFileSync('src/app/api/stripe/webhook/route.ts', 'utf8')
  check('webhook normalizes checkout mobile number', webhookSource.includes('checkoutMobileNumber(session, shippingDetails)'))
  check('workorder receives normalized buyer mobile', webhookSource.includes('buyerPhone: buyerMobile'))
}

// ------------------------------------------------------------
console.log('')
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
console.log('All YELLOW JERSEY SALE workorder tests passed ✓')
