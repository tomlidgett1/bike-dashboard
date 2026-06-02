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
 * Imports only ./workorder (no Supabase/Next chain) so it runs standalone.
 */

import {
  YELLOW_JERSEY_WORKORDER_TITLE,
  buildYellowJerseyWorkorderNote,
  buildYellowJerseyWorkorderPayload,
  assembleYellowJerseyWorkorderRequest,
  type WorkorderEntitySources,
} from '../src/lib/services/lightspeed/workorder'

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
    shippingAddress: '12 Pedal St, Bristol, BS1 4XY, GB',
  })

  check('starts with YELLOW JERSEY SALE title', note.startsWith(YELLOW_JERSEY_WORKORDER_TITLE), note.split('\n')[0])
  check('includes order number', note.includes('ORD-20260602-AB123'))
  check('includes item description', note.includes('Trek Marlin 7 Mountain Bike'))
  check('includes SKU', note.includes('TRK-MARLIN7-L'))
  check('includes qty x price = line total', note.includes('2 x $1299.99 = $2599.98'), note)
  check('includes order total', note.includes('Order total: $2599.98'), note)
  check('includes buyer', note.includes('Buyer: Jane Cyclist'))
  check('includes shipping address', note.includes('Ship to: 12 Pedal St, Bristol, BS1 4XY, GB'))
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
  check('omits Buyer line when absent', !note.includes('Buyer:'))
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
      shippingAddress: '1 A St',
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
  check('note includes buyer from params', body.note.includes('Buyer: Sam'))
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
    shippingAddress: '9 Hill Rd, Leeds',
  })
  const result = fakeRequest(endpoint, { method: 'POST', body: JSON.stringify(body) })

  check('POST method used', sent!.method === 'POST')
  check('correct endpoint', sent!.endpoint === '/Account/STORE-7/Workorder.json', sent!.endpoint)
  check('body note titled YELLOW JERSEY SALE', sent!.body.note.startsWith(YELLOW_JERSEY_WORKORDER_TITLE))
  check('body lists both items', sent!.body.note.includes('Items (2):'))
  check('body carries first line total', sent!.body.note.includes('3 x $2100.00 = $6300.00'))
  check('body carries second line total', sent!.body.note.includes('1 x $45.00 = $45.00'))
  check('body order total sums lines', sent!.body.note.includes('Order total: $6345.00'))
  check('body hookIn is ONLINE', sent!.body.hookIn === 'ONLINE')
  check('returns workorderID', result.Workorder.workorderID === 'WO-1001')
}

// ------------------------------------------------------------
console.log('')
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
console.log('All YELLOW JERSEY SALE workorder tests passed ✓')
