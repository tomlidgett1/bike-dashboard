/**
 * Test: getAllCategories pagination logic
 *
 * Verifies that getAllCategories stops correctly in each scenario:
 *   1. Short page (<100) → stops after 1 request (no @attributes)
 *   2. @attributes.count present → stops exactly at totalCount
 *   3. Infinite-loop scenario (API always returns 100 same items) → stops at MAX_ITERATIONS
 *   4. Exactly 100 items with @attributes.count=100 → stops after 1 request
 *   5. String() key coercion: numeric categoryID resolves correctly
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

type ResponsePage = {
  categories: any[]
  count?: string // @attributes.count
}

/**
 * Build a mock LightspeedClient whose request() returns controlled pages.
 * `pages` is a list of responses in call order; the last one repeats.
 */
function makeMockClient(pages: ResponsePage[]): LightspeedClient {
  let callCount = 0
  const client = new LightspeedClient('test-user-id')

  // Override private request<T> and getAccountId
  ;(client as any).accountId = 'ACCOUNT123'
  ;(client as any).request = async (_endpoint: string) => {
    const page = pages[Math.min(callCount, pages.length - 1)]
    callCount++
    const response: any = { Category: page.categories.length === 1 ? page.categories[0] : page.categories }
    if (page.count !== undefined) {
      response['@attributes'] = { count: page.count, offset: '0', limit: '100' }
    }
    return response
  }

  return client
}

function makeCats(n: number, startId = 1) {
  return Array.from({ length: n }, (_, i) => ({
    categoryID: String(startId + i),
    name: `Category ${startId + i}`,
    nodeDepth: '1',
    fullPathName: `Category ${startId + i}`,
    leftNode: '0',
    rightNode: '0',
    createTime: '',
    timeStamp: '',
  }))
}

// ── Tests ──────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n📋 Test: getAllCategories pagination\n')

  // ── Test 1: short page, no @attributes ──────────────────────────────────
  console.log('Test 1: short page (<100) — no @attributes.count')
  {
    let requestCount = 0
    const client = makeMockClient([{ categories: makeCats(42) }])
    ;(client as any).request = async (_ep: string) => {
      requestCount++
      return { Category: makeCats(42) }
    }
    const cats = await client.getAllCategories({ archived: 'false' })
    assert(cats.length === 42, `got 42 categories (got ${cats.length})`)
    assert(requestCount === 1, `made exactly 1 API request (made ${requestCount})`)
  }

  // ── Test 2: @attributes.count stops at exactly right place ───────────────
  console.log('\nTest 2: 150 categories, @attributes.count=150, 2 pages')
  {
    let requestCount = 0
    const pages: ResponsePage[] = [
      { categories: makeCats(100, 1), count: '150' },  // page 1: 100 cats, total=150
      { categories: makeCats(50, 101) },               // page 2: 50 cats
    ]
    const client = makeMockClient(pages)
    ;(client as any).request = async (_ep: string) => {
      const page = pages[Math.min(requestCount, pages.length - 1)]
      requestCount++
      const resp: any = { Category: page.categories }
      if (page.count) resp['@attributes'] = { count: page.count, offset: '0', limit: '100' }
      return resp
    }
    const cats = await client.getAllCategories({ archived: 'false' })
    assert(cats.length === 150, `got 150 categories (got ${cats.length})`)
    assert(requestCount === 2, `made exactly 2 API requests (made ${requestCount})`)
  }

  // ── Test 3: exactly 100 categories with @attributes.count=100 ─────────────
  console.log('\nTest 3: exactly 100 categories, @attributes.count=100')
  {
    let requestCount = 0
    const client = makeMockClient([])
    ;(client as any).request = async (_ep: string) => {
      requestCount++
      return {
        '@attributes': { count: '100', offset: '0', limit: '100' },
        Category: makeCats(100),
      }
    }
    const cats = await client.getAllCategories({ archived: 'false' })
    assert(cats.length === 100, `got 100 categories (got ${cats.length})`)
    assert(requestCount === 1, `stopped after 1 request — did not loop (made ${requestCount})`)
  }

  // ── Test 4: infinite loop guard (API always returns 100, no @attributes) ──
  console.log('\nTest 4: infinite loop guard — API always returns 100, MAX_ITERATIONS=50 stops it')
  {
    let requestCount = 0
    const client = makeMockClient([])
    ;(client as any).request = async (_ep: string) => {
      requestCount++
      return { Category: makeCats(100) } // always 100, no count
    }
    const cats = await client.getAllCategories({ archived: 'false' })
    assert(requestCount === 50, `stopped at MAX_ITERATIONS=50 (made ${requestCount})`)
    assert(cats.length === 5000, `accumulated 5000 entries (got ${cats.length})`)
  }

  // ── Test 5: String() coercion — numeric categoryID resolves in a Map ──────
  console.log('\nTest 5: String() coercion — numeric categoryID key matches string product.category_id')
  {
    // Simulate what inventory-overview/route.ts now does
    const categoryNamesMap = new Map<string, string>()

    // Lightspeed returns numeric ID at runtime (despite TS type saying string)
    const lightspeedCats = [
      { categoryID: 1403 as any, name: 'Road Bikes', fullPathName: 'Bikes > Road' },
      { categoryID: 1405 as any, name: 'Mountain Bikes', fullPathName: 'Bikes > Mountain' },
    ]
    lightspeedCats.forEach((cat: any) => {
      categoryNamesMap.set(String(cat.categoryID), cat.fullPathName || cat.name)
    })

    // DB returns category_id as string
    const productCategoryIdFromDb: string = '1403'
    const resolved = categoryNamesMap.get(String(productCategoryIdFromDb ?? ''))
    assert(resolved === 'Bikes > Road', `resolved "1403" → "Bikes > Road" (got "${resolved}")`)

    // DB returns category_id as number (Postgres integer column)
    const productCategoryIdAsNumber: number = 1405 as any
    const resolved2 = categoryNamesMap.get(String(productCategoryIdAsNumber ?? ''))
    assert(resolved2 === 'Bikes > Mountain', `resolved numeric 1405 → "Bikes > Mountain" (got "${resolved2}")`)
  }

  // ── Test 6: empty category list — no categories returned ──────────────────
  console.log('\nTest 6: empty response — returns empty array, no crash')
  {
    let requestCount = 0
    const client = makeMockClient([])
    ;(client as any).request = async (_ep: string) => {
      requestCount++
      return {} // no Category key at all
    }
    const cats = await client.getAllCategories({ archived: 'false' })
    assert(cats.length === 0, `got 0 categories (got ${cats.length})`)
    assert(requestCount === 1, `made 1 request then stopped (made ${requestCount})`)
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`)
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
