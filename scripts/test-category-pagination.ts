/**
 * Test: getAllCategories cursor-based pagination
 *
 * Lightspeed deprecated offset for Category.json — returns 400 if offset is used.
 * getAllCategories now follows @attributes.next cursor URLs instead.
 *
 * Scenarios:
 *   1. Single page (<100 cats, no next URL) → 1 request
 *   2. Two pages via next cursor → exactly 2 requests, 150 cats total
 *   3. Exactly 100 cats with next=null → 1 request (stops, no runaway)
 *   4. API always returns next URL (infinite pages) → MAX_PAGES=50 hard stop
 *   5. String() coercion: numeric categoryID maps correctly against string/number product.category_id
 *   6. Empty/null Category response → 0 cats, no crash
 *   7. No offset in first request URL (offset=400 would be rejected by Lightspeed)
 */

import { LightspeedClient } from '../src/lib/services/lightspeed/lightspeed-client'

// ── Helpers ────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ ${message}`)
    passed++
  } else {
    console.error(`  ❌ FAIL: ${message}`)
    failed++
  }
}

function makeCats(n: number, startId = 1) {
  return Array.from({ length: n }, (_, i) => ({
    categoryID: String(startId + i),
    name: `Category ${startId + i}`,
    nodeDepth: '1',
    fullPathName: `Full > Category ${startId + i}`,
    leftNode: '0',
    rightNode: '0',
    createTime: '',
    timeStamp: '',
  }))
}

// ── Tests ──────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n📋 Test: getAllCategories cursor-based pagination\n')

  // ── Test 1: single page, no next URL ───────────────────────────────────
  console.log('Test 1: single page (42 cats), no @attributes.next')
  {
    let requestCount = 0
    const client = new LightspeedClient('test-user')
    ;(client as any).accountId = 'ACC1'
    ;(client as any).request = async (endpoint: string) => {
      requestCount++
      assert(!endpoint.includes('offset='), `request URL must NOT contain offset (got: ${endpoint})`)
      return { Category: makeCats(42), '@attributes': { count: '42', limit: '100' } }
    }
    const cats = await client.getAllCategories({ archived: 'false' })
    assert(cats.length === 42, `got 42 cats (got ${cats.length})`)
    assert(requestCount === 1, `made 1 request (made ${requestCount})`)
  }

  // ── Test 2: two pages via cursor URL ──────────────────────────────────
  console.log('\nTest 2: 150 cats across 2 pages via @attributes.next cursor')
  {
    let requestCount = 0
    const NEXT_URL = 'https://api.lightspeedapp.com/API/V3/Account/ACC1/Category.json?limit=100&after=CURSOR_ABC'
    const client = new LightspeedClient('test-user')
    ;(client as any).accountId = 'ACC1'
    ;(client as any).request = async (endpoint: string) => {
      requestCount++
      if (requestCount === 1) {
        return {
          Category: makeCats(100, 1),
          '@attributes': { count: '150', limit: '100', next: NEXT_URL },
        }
      }
      // Second call must use the full next URL
      assert(endpoint === NEXT_URL, `2nd request must use next URL (got: ${endpoint})`)
      return { Category: makeCats(50, 101), '@attributes': { count: '150', limit: '100' } }
    }
    const cats = await client.getAllCategories({ archived: 'false' })
    assert(cats.length === 150, `got 150 cats (got ${cats.length})`)
    assert(requestCount === 2, `made exactly 2 requests (made ${requestCount})`)
  }

  // ── Test 3: exactly 100 cats, @attributes.next absent → stop after 1 ──
  console.log('\nTest 3: exactly 100 cats, no next URL → stops after 1 request')
  {
    let requestCount = 0
    const client = new LightspeedClient('test-user')
    ;(client as any).accountId = 'ACC1'
    ;(client as any).request = async (_endpoint: string) => {
      requestCount++
      return { Category: makeCats(100), '@attributes': { count: '100', limit: '100' } }
    }
    const cats = await client.getAllCategories()
    assert(cats.length === 100, `got 100 cats (got ${cats.length})`)
    assert(requestCount === 1, `stopped after 1 request — no runaway loop (made ${requestCount})`)
  }

  // ── Test 4: runaway guard — always returns next URL ────────────────────
  console.log('\nTest 4: runaway guard — API always provides next URL → hard stop at MAX_PAGES=50')
  {
    let requestCount = 0
    const client = new LightspeedClient('test-user')
    ;(client as any).accountId = 'ACC1'
    ;(client as any).request = async (_endpoint: string) => {
      requestCount++
      return {
        Category: makeCats(100),
        '@attributes': { count: '99999', limit: '100', next: `https://api.ls.com/next?page=${requestCount}` },
      }
    }
    const cats = await client.getAllCategories()
    assert(requestCount === 50, `stopped at MAX_PAGES=50 (made ${requestCount})`)
    assert(cats.length === 5000, `accumulated 5000 cats (got ${cats.length})`)
  }

  // ── Test 5: String() coercion ──────────────────────────────────────────
  console.log('\nTest 5: String() coercion — numeric categoryID vs string/number product.category_id')
  {
    const categoryNamesMap = new Map<string, string>()

    // Lightspeed runtime returns numeric IDs despite TS type saying string
    const lightspeedCats = [
      { categoryID: 1403 as any, name: 'Road Bikes', fullPathName: 'Bikes > Road' },
      { categoryID: 1405 as any, name: 'Mountain Bikes', fullPathName: 'Bikes > Mountain' },
    ]
    lightspeedCats.forEach((cat: any) => {
      categoryNamesMap.set(String(cat.categoryID), cat.fullPathName || cat.name)
    })

    // product.category_id comes back as string from Supabase text column
    assert(
      categoryNamesMap.get(String('1403')) === 'Bikes > Road',
      `string "1403" resolves to "Bikes > Road"`,
    )
    // product.category_id comes back as number from Supabase integer column
    assert(
      categoryNamesMap.get(String(1405 as any)) === 'Bikes > Mountain',
      `numeric 1405 resolves to "Bikes > Mountain"`,
    )
  }

  // ── Test 6: empty / null Category ─────────────────────────────────────
  console.log('\nTest 6: empty response → 0 cats, no crash')
  {
    let requestCount = 0
    const client = new LightspeedClient('test-user')
    ;(client as any).accountId = 'ACC1'
    ;(client as any).request = async (_endpoint: string) => {
      requestCount++
      return {}  // no Category key
    }
    const cats = await client.getAllCategories()
    assert(cats.length === 0, `got 0 cats (got ${cats.length})`)
    assert(requestCount === 1, `made 1 request then stopped (made ${requestCount})`)
  }

  // ── Test 7: offset NOT in first request URL ────────────────────────────
  console.log('\nTest 7: first request URL must not contain "offset" (Lightspeed rejects it with 400)')
  {
    let capturedEndpoint = ''
    const client = new LightspeedClient('test-user')
    ;(client as any).accountId = 'ACC1'
    ;(client as any).request = async (endpoint: string) => {
      capturedEndpoint = endpoint
      return { Category: makeCats(5), '@attributes': { count: '5', limit: '100' } }
    }
    await client.getAllCategories({ archived: 'false' })
    assert(
      !capturedEndpoint.includes('offset'),
      `first request URL has no "offset" param (URL: ${capturedEndpoint})`,
    )
    assert(
      capturedEndpoint.includes('limit=100'),
      `first request URL includes limit=100 (URL: ${capturedEndpoint})`,
    )
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(55)}`)
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`)
  if (failed > 0) {
    console.error('\n❌ Some tests failed')
    process.exit(1)
  } else {
    console.log('\n✅ All tests passed')
  }
}

runTests().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
