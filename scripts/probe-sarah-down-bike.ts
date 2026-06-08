/**
 * Probe Lightspeed API for Sarah Down's bike field (Ashburton Cycles).
 * Run: npx tsx --env-file=.env.local scripts/probe-sarah-down-bike.ts
 */

import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import fs from 'fs'

const USER_ID = '3acef09d-8b28-46e8-a0c3-45ce59c61972'
const ACCOUNT_ID = '168990'
const API_BASE = 'https://api.lightspeedapp.com/API/V3'
const BIKE_NEEDLE = /liv|flatbar|womens/i

function decryptToken(encryptedToken: string): string {
  const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY!, 'hex')
  const [ivHex, authTagHex, encrypted] = encryptedToken.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

async function getAccessToken(): Promise<string> {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data, error } = await supabase
    .from('lightspeed_connections')
    .select('*')
    .eq('user_id', USER_ID)
    .single()
  if (error) throw error

  let accessToken = decryptToken(data.access_token_encrypted)
  const expiresAt = new Date(data.token_expires_at).getTime()
  if (Date.now() > expiresAt - 60_000) {
    const refreshToken = decryptToken(data.refresh_token_encrypted)
    const res = await fetch('https://cloud.lightspeedapp.com/auth/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.LIGHTSPEED_CLIENT_ID!,
        client_secret: process.env.LIGHTSPEED_CLIENT_SECRET!,
        refresh_token: refreshToken,
      }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(json)}`)
    accessToken = json.access_token
    console.log('Refreshed access token')
  }
  return accessToken
}

async function api(token: string, endpoint: string) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  })
  const text = await res.text()
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  return { status: res.status, ok: res.ok, body }
}

function ensureArray<T>(v: T | T[] | undefined | null): T[] {
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

function deepFindNeedle(obj: unknown, path = ''): Array<{ path: string; value: string }> {
  const hits: Array<{ path: string; value: string }> = []
  if (obj == null) return hits
  if (typeof obj === 'string') {
    if (BIKE_NEEDLE.test(obj) || /sarah/i.test(obj)) hits.push({ path, value: obj })
    return hits
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => hits.push(...deepFindNeedle(item, `${path}[${i}]`)))
    return hits
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      hits.push(...deepFindNeedle(v, path ? `${path}.${k}` : k))
    }
  }
  return hits
}

function summarize(label: string, result: { status: number; ok: boolean; body: unknown }) {
  console.log(`\n=== ${label} ===`)
  console.log(`HTTP ${result.status}`)
  if (!result.ok) {
    const preview =
      typeof result.body === 'string'
        ? result.body.slice(0, 500)
        : JSON.stringify(result.body).slice(0, 500)
    console.log(preview)
    return
  }
  const hits = deepFindNeedle(result.body)
  if (hits.length) {
    console.log('NEEDLE HITS:')
    for (const h of hits.slice(0, 40)) console.log(`  ${h.path}: ${String(h.value).slice(0, 220)}`)
  } else {
    const preview = JSON.stringify(result.body, null, 2)
    console.log(preview.length > 3000 ? `${preview.slice(0, 3000)}\n...[truncated]` : preview)
  }
}

async function main() {
  const token = await getAccessToken()
  console.log('Got token for Ashburton account', ACCOUNT_ID)

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const customerSearch = await api(
    token,
    `/Account/${ACCOUNT_ID}/Customer.json?firstName=Sarah&lastName=Down&load_relations=%5B%22Contact%22%5D&limit=25`,
  )
  summarize('Customer search firstName=Sarah lastName=Down', customerSearch)

  let customers = ensureArray(
    (customerSearch.body as { Customer?: unknown })?.Customer as
      | Array<{ customerID: string; firstName: string; lastName: string; contactID?: string }>
      | undefined,
  )

  if (!customers.length) {
    const broad = await api(
      token,
      `/Account/${ACCOUNT_ID}/Customer.json?lastName=Down&load_relations=%5B%22Contact%22%5D&limit=50`,
    )
    summarize('Customer search lastName=Down', broad)
    customers = ensureArray(
      (broad.body as { Customer?: unknown })?.Customer as
        | Array<{ customerID: string; firstName: string; lastName: string; contactID?: string }>
        | undefined,
    ).filter((c) => /sarah/i.test(`${c.firstName} ${c.lastName}`))
  }

  if (!customers.length) {
    const { data: rows } = await supabase
      .from('lightspeed_sales_report_lines')
      .select('customer_id, customer_full_name, description, sku, category')
      .eq('user_id', USER_ID)
      .ilike('customer_full_name', '%Sarah%Down%')
      .limit(20)
    console.log('\nSQL sales lines for Sarah Down:', JSON.stringify(rows, null, 2))
    const cid = rows?.[0]?.customer_id ? String(rows[0].customer_id) : null
    if (cid) {
      const one = await api(
        token,
        `/Account/${ACCOUNT_ID}/Customer/${cid}.json?load_relations=%5B%22Contact%22%5D`,
      )
      summarize(`Customer/${cid} from SQL`, one)
      const customer = (one.body as { Customer?: (typeof customers)[0] })?.Customer
      if (customer) customers = [customer]
    }
  }

  const customer = customers[0]
  if (!customer?.customerID) {
    console.error('Could not resolve Sarah Down customer ID')
    process.exit(1)
  }

  const cid = customer.customerID
  console.log(`\nUsing customer ID: ${cid} (${customer.firstName} ${customer.lastName})`)

  const endpoints: Array<[string, string]> = [
    [`Customer/${cid} full`, `/Account/${ACCOUNT_ID}/Customer/${cid}.json?load_relations=%5B%22Contact%22%5D`],
    [
      `Customer/${cid} + CreditAccount`,
      `/Account/${ACCOUNT_ID}/Customer/${cid}.json?load_relations=%5B%22Contact%22%2C%22CreditAccount%22%5D`,
    ],
    [
      `Customer/${cid} + CustomerType`,
      `/Account/${ACCOUNT_ID}/Customer/${cid}.json?load_relations=%5B%22Contact%22%2C%22CustomerType%22%5D`,
    ],
    [
      `Customer/${cid} + Note`,
      `/Account/${ACCOUNT_ID}/Customer/${cid}.json?load_relations=%5B%22Contact%22%2C%22Note%22%5D`,
    ],
    [
      `Customer/${cid} + Tags`,
      `/Account/${ACCOUNT_ID}/Customer/${cid}.json?load_relations=%5B%22Contact%22%2C%22Tag%22%5D`,
    ],
    [
      `Customer/${cid} + Serialized`,
      `/Account/${ACCOUNT_ID}/Customer/${cid}.json?load_relations=%5B%22Contact%22%2C%22Serialized%22%5D`,
    ],
    [
      `Customer/${cid} + CustomerItem`,
      `/Account/${ACCOUNT_ID}/Customer/${cid}.json?load_relations=%5B%22Contact%22%2C%22CustomerItem%22%5D`,
    ],
    [
      `Customer/${cid} + Item`,
      `/Account/${ACCOUNT_ID}/Customer/${cid}.json?load_relations=%5B%22Contact%22%2C%22Item%22%5D`,
    ],
    [`Customer/${cid}/Serialized`, `/Account/${ACCOUNT_ID}/Customer/${cid}/Serialized.json`],
    [`Customer/${cid}/CustomerItem`, `/Account/${ACCOUNT_ID}/Customer/${cid}/CustomerItem.json`],
    [`Customer/${cid}/Item`, `/Account/${ACCOUNT_ID}/Customer/${cid}/Item.json`],
    [`Customer/${cid}/Note`, `/Account/${ACCOUNT_ID}/Customer/${cid}/Note.json`],
    [`Customer/${cid}/Sale`, `/Account/${ACCOUNT_ID}/Customer/${cid}/Sale.json?limit=25`],
    [`Customer/${cid}/Workorder`, `/Account/${ACCOUNT_ID}/Customer/${cid}/Workorder.json?limit=25`],
    [`Customer/${cid}/CustomField`, `/Account/${ACCOUNT_ID}/Customer/${cid}/CustomField.json`],
    [`Customer/${cid}/CustomerCustomField`, `/Account/${ACCOUNT_ID}/Customer/${cid}/CustomerCustomField.json`],
    [`Serialized?customerID=${cid}`, `/Account/${ACCOUNT_ID}/Serialized.json?customerID=${cid}&limit=50`],
    [`Serialized?description=liv`, `/Account/${ACCOUNT_ID}/Serialized.json?description=%25liv%25&limit=50`],
    [`Item?description=liv flatbar`, `/Account/${ACCOUNT_ID}/Item.json?description=%25liv%25flatbar%25&limit=25`],
    [
      `Workorder?customerID=${cid}`,
      `/Account/${ACCOUNT_ID}/Workorder.json?customerID=${cid}&limit=25&load_relations=%5B%22WorkorderLines%22%2C%22WorkorderItems%22%2C%22Customer%22%5D`,
    ],
    [
      `Sale?customerID=${cid}`,
      `/Account/${ACCOUNT_ID}/Sale.json?customerID=${cid}&limit=25&load_relations=%5B%22SaleLines%22%5D`,
    ],
  ]

  if (customer.contactID) {
    endpoints.push([
      `Contact/${customer.contactID}`,
      `/Account/${ACCOUNT_ID}/Contact/${customer.contactID}.json`,
    ])
  }

  for (const [label, ep] of endpoints) {
    const result = await api(token, ep)
    summarize(label, result)
    await new Promise((r) => setTimeout(r, 120))
  }

  for (const term of ['liv blue', 'flatbar', 'liv blue womens flatbar']) {
    const { data } = await supabase
      .from('lightspeed_sales_report_lines')
      .select('customer_id, customer_full_name, description, sku, category, complete_time')
      .eq('user_id', USER_ID)
      .or(`description.ilike.%${term}%,customer_full_name.ilike.%Sarah%Down%`)
      .limit(20)
    console.log(`\n=== SQL search term "${term}" ===`)
    console.log(JSON.stringify(data, null, 2))
  }

  const outPath = '/tmp/sarah-down-probe-results.json'
  fs.writeFileSync(outPath, JSON.stringify({ customerId: cid, customer }, null, 2))
  console.log(`\nWrote summary to ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
