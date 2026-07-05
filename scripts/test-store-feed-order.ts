import assert from 'node:assert/strict'
import type { PublicMarketplaceCardRow } from '../src/lib/marketplace/public-card-feed'
import {
  composeStoreBrowseRows,
  seededShuffle,
} from '../src/lib/marketplace/store-feed-order'

type Row = Pick<PublicMarketplaceCardRow, 'id' | 'discount_active'>

function row(id: string, discountActive = false): Row {
  return { id, discount_active: discountActive }
}

function testSpecialsLead() {
  const specials = [row('s1', true), row('s2', true)]
  const regular = [row('r1'), row('r2'), row('r3')]
  const ordered = composeStoreBrowseRows(
    specials as PublicMarketplaceCardRow[],
    regular as PublicMarketplaceCardRow[],
    'test-seed',
    4,
  )

  assert.equal(ordered.length, 4)
  const ids = ordered.map((item) => item.id)
  assert.ok(ids.includes('s1'))
  assert.ok(ids.includes('s2'))
  const firstSpecialIndex = Math.min(ids.indexOf('s1'), ids.indexOf('s2'))
  const regularIds = ['r1', 'r2', 'r3'].filter((id) => ids.includes(id))
  const firstRegularIndex = Math.min(...regularIds.map((id) => ids.indexOf(id)))
  assert.ok(firstSpecialIndex < firstRegularIndex, 'specials should appear before regular items')
}

function testSeededShuffleStable() {
  const items = ['a', 'b', 'c', 'd', 'e']
  const first = seededShuffle(items, 'stable')
  const second = seededShuffle(items, 'stable')
  assert.deepEqual(first, second)

  const different = seededShuffle(items, 'other-seed')
  assert.notDeepEqual(first, different)
}

function testDedupesSpecialsFromRegularPool() {
  const specials = [row('shared', true)]
  const regular = [row('shared'), row('r2')]
  const ordered = composeStoreBrowseRows(
    specials as PublicMarketplaceCardRow[],
    regular as PublicMarketplaceCardRow[],
    'dedupe',
    3,
  )

  assert.equal(ordered.filter((item) => item.id === 'shared').length, 1)
}

testSpecialsLead()
testSeededShuffleStable()
testDedupesSpecialsFromRegularPool()
console.log('store-feed-order tests passed')
