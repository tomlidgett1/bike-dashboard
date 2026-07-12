import assert from 'node:assert/strict'
import {
  fetchUnpaidWorkorderSource,
  isPaidWorkorderStatus,
} from '../src/lib/services/lightspeed/workorder-queries'
import type {
  LightspeedWorkorderStatus,
  LightspeedWorkorderWithRelations,
} from '../src/lib/services/lightspeed/types'

const statuses: LightspeedWorkorderStatus[] = [
  { workorderStatusID: '1', name: 'In progress', systemValue: 'open' },
  { workorderStatusID: '2', name: 'Ready for pickup', systemValue: 'finished' },
  { workorderStatusID: '3', name: 'Paid', systemValue: 'paid' },
]

const rows = [
  { workorderID: '100', workorderStatusID: '1', archived: 'false' },
  { workorderID: '101', workorderStatusID: '2', archived: 'false' },
  { workorderID: '102', workorderStatusID: '3', archived: 'false' },
] as LightspeedWorkorderWithRelations[]

let statusCalls = 0
let workorderCalls = 0
let requestedParams: Record<string, unknown> | undefined
let requestedOptions: Record<string, unknown> | undefined

const source = {
  async getWorkorderStatuses() {
    statusCalls += 1
    return statuses
  },
  async getRecentWorkorders(
    params?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) {
    workorderCalls += 1
    requestedParams = params
    requestedOptions = options
    return rows
  },
} as unknown as Parameters<typeof fetchUnpaidWorkorderSource>[0]

async function main() {
  const result = await fetchUnpaidWorkorderSource(source, 60)

  assert.equal(statusCalls, 1, 'statuses should be loaded once')
  assert.equal(workorderCalls, 1, 'workorders must use one unscoped cursor scan, not one call per status')
  assert.equal(
    requestedParams?.workorderStatusID,
    undefined,
    'the bounded scan must not fan out by workorderStatusID',
  )
  assert.equal(requestedParams?.archived, 'false')
  assert.equal(requestedOptions?.maxPages, 4)
  assert.equal(result.scanTarget, 240)
  assert.equal(result.rawWorkorders.length, 3)

  assert.equal(isPaidWorkorderStatus(statuses[0]), false)
  assert.equal(isPaidWorkorderStatus(statuses[1]), false)
  assert.equal(isPaidWorkorderStatus(statuses[2]), true)

  console.log('✓ open workorders use one bounded scan and preserve paid-status filtering')
}

void main()
