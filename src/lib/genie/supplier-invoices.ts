// Supplier invoice pipeline: detect PDF invoices in the connected Gmail inbox,
// load invoice PDFs (Gmail attachment or uploaded file), and match extracted
// suppliers/lines against Lightspeed vendors and inventory.

import type { SupabaseClient } from '@supabase/supabase-js'

import { listGmailConnections } from '@/lib/composio/gmail'
import { getOrCreateGmailComposioSession } from '@/lib/composio/session'
import { listPdfAttachmentsFromPayload, downloadGmailPdfAttachment } from '@/lib/composio/gmail-attachments'
import { createLightspeedClient, type LightspeedClient } from '@/lib/services/lightspeed/lightspeed-client'
import type { ExtractedSupplierInvoice } from '@/lib/ai/supplier-invoice-extract'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, 'public', any>

export const SUPPLIER_INVOICE_BUCKET = 'supplier-invoices'

/** Gmail search for likely supplier invoices with PDF attachments. */
export const INVOICE_GMAIL_QUERY =
  'in:inbox has:attachment filename:pdf newer_than:14d -category:promotions -category:social'

const INVOICE_KEYWORDS = /invoice|inv[\s#_-]*\d|tax invoice|bill|order confirm|order no|purchase order|\bpo[\s#_-]*\d|statement|remittance|dispatch|shipment|backorder/i

export interface SupplierInvoiceRow {
  id: string
  user_id: string
  source: 'gmail' | 'upload'
  gmail_message_id: string | null
  gmail_attachment_id: string | null
  gmail_connected_account_id: string | null
  attachment_filename: string | null
  email_subject: string | null
  email_from: string | null
  email_date: string | null
  storage_path: string | null
  status: 'detected' | 'processing' | 'po_created' | 'dismissed' | 'failed'
  extracted: ExtractedSupplierInvoice | null
  lightspeed_order_id: string | null
  lightspeed_order_url: string | null
  error: string | null
  created_at: string
  updated_at: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function headerValue(headers: Array<{ name?: string; value?: string }>, name: string): string | null {
  return headers.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? null
}

/**
 * Scan connected Gmail mailboxes for new supplier-invoice PDF attachments and
 * upsert them as `detected` rows. Returns how many new invoices were found.
 */
export async function scanGmailForSupplierInvoices(
  supabase: Supa,
  userId: string,
): Promise<{ scanned: number; new_invoices: number }> {
  const connections = await listGmailConnections(userId)
  if (connections.length === 0) return { scanned: 0, new_invoices: 0 }

  const session = await getOrCreateGmailComposioSession({
    userId,
    connectedAccountIds: connections.map((connection) => connection.id),
  })

  let scanned = 0
  let newInvoices = 0

  for (const connection of connections) {
    let messages: Array<Record<string, unknown>> = []
    try {
      const result = await session.execute('GMAIL_FETCH_EMAILS', {
        query: INVOICE_GMAIL_QUERY,
        max_results: 25,
        ids_only: false,
        include_payload: true,
        verbose: false,
      }, connection.id)
      const data = isRecord(result) && isRecord(result.data) ? result.data : (result as Record<string, unknown>)
      messages = (Array.isArray(data.messages) ? data.messages : []) as Array<Record<string, unknown>>
    } catch (error) {
      console.warn('[supplier-invoices] gmail scan failed for account', connection.id, error)
      continue
    }

    for (const message of messages) {
      const raw = isRecord(message.message) ? message.message : message
      const messageId = String(raw.messageId ?? raw.message_id ?? raw.id ?? '').trim()
      if (!messageId) continue
      scanned++

      const payload = isRecord(raw.payload) ? raw.payload : undefined
      const headers = Array.isArray(payload?.headers)
        ? (payload.headers as Array<{ name?: string; value?: string }>)
        : []
      const subject = String(raw.subject ?? headerValue(headers, 'Subject') ?? '').trim()
      const from = String(raw.from ?? raw.sender ?? headerValue(headers, 'From') ?? '').trim()
      const dateHeader = headerValue(headers, 'Date')
      const emailDate = dateHeader && Number.isFinite(Date.parse(dateHeader))
        ? new Date(Date.parse(dateHeader)).toISOString()
        : null

      const attachments = listPdfAttachmentsFromPayload(payload)
      if (attachments.length === 0) continue

      for (const attachment of attachments) {
        // Keep recall reasonable: require an invoice-ish signal in the subject
        // or filename so newsletters with PDF brochures don't become pills.
        const signalText = `${subject} ${attachment.filename}`
        if (!INVOICE_KEYWORDS.test(signalText)) continue

        const { data: inserted, error } = await supabase
          .from('store_supplier_invoices')
          .upsert({
            user_id: userId,
            source: 'gmail',
            gmail_message_id: messageId,
            gmail_attachment_id: attachment.attachment_id,
            gmail_connected_account_id: connection.id,
            attachment_filename: attachment.filename,
            email_subject: subject || null,
            email_from: from || null,
            email_date: emailDate,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id,gmail_message_id,gmail_attachment_id',
            ignoreDuplicates: true,
          })
          .select('id')

        if (error) {
          console.warn('[supplier-invoices] upsert failed:', error.message)
          continue
        }
        if (inserted && inserted.length > 0) newInvoices++
      }
    }
  }

  return { scanned, new_invoices: newInvoices }
}

export async function getSupplierInvoice(
  supabase: Supa,
  userId: string,
  invoiceId: string,
): Promise<SupplierInvoiceRow | null> {
  const { data, error } = await supabase
    .from('store_supplier_invoices')
    .select('*')
    .eq('user_id', userId)
    .eq('id', invoiceId)
    .maybeSingle()
  if (error) throw new Error(`Could not load supplier invoice: ${error.message}`)
  return (data as SupplierInvoiceRow | null) ?? null
}

export async function updateSupplierInvoice(
  supabase: Supa,
  userId: string,
  invoiceId: string,
  patch: Partial<Pick<SupplierInvoiceRow, 'status' | 'extracted' | 'lightspeed_order_id' | 'lightspeed_order_url' | 'error'>>,
): Promise<void> {
  const { error } = await supabase
    .from('store_supplier_invoices')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', invoiceId)
  if (error) console.warn('[supplier-invoices] update failed:', error.message)
}

/** Load the invoice PDF bytes for a row — Gmail attachment or storage upload. */
export async function loadSupplierInvoicePdf(
  supabase: Supa,
  userId: string,
  invoice: SupplierInvoiceRow,
): Promise<{ pdf: Buffer; filename: string }> {
  const filename = invoice.attachment_filename || 'invoice.pdf'

  if (invoice.source === 'upload') {
    if (!invoice.storage_path) throw new Error('Uploaded invoice has no storage path.')
    const { data, error } = await supabase.storage
      .from(SUPPLIER_INVOICE_BUCKET)
      .download(invoice.storage_path)
    if (error || !data) throw new Error(`Could not download uploaded invoice PDF: ${error?.message ?? 'no data'}`)
    return { pdf: Buffer.from(await data.arrayBuffer()), filename }
  }

  if (!invoice.gmail_message_id || !invoice.gmail_attachment_id) {
    throw new Error('Gmail invoice row is missing message/attachment ids.')
  }

  const pdf = await downloadGmailPdfAttachment(userId, {
    message_id: invoice.gmail_message_id,
    attachment_id: invoice.gmail_attachment_id,
    filename,
    connected_account_id: invoice.gmail_connected_account_id ?? undefined,
  })
  return { pdf, filename }
}

// ── Vendor + item matching ───────────────────────────────────────────────────

export interface VendorMatchCandidate {
  vendor_id: string
  name: string
  score: number
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(pty|ltd|limited|inc|llc|co|company|australia|aus|distribution|distributors|wholesale|bicycles|bikes|cycling|cycles|imports|group)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.9
  const ta = new Set(na.split(' '))
  const tb = new Set(nb.split(' '))
  let shared = 0
  for (const token of ta) if (tb.has(token)) shared++
  const denom = Math.max(ta.size, tb.size)
  return denom === 0 ? 0 : (shared / denom) * 0.85
}

export async function matchLightspeedVendor(
  client: LightspeedClient,
  supplierName: string,
): Promise<{ best: VendorMatchCandidate | null; candidates: VendorMatchCandidate[] }> {
  const vendors = await client.getAllVendors({ archived: 'false' }).catch(() => [])
  const scored = vendors
    .map((vendor) => ({
      vendor_id: String(vendor.vendorID),
      name: vendor.name,
      score: Math.round(nameSimilarity(vendor.name, supplierName) * 100) / 100,
    }))
    .filter((candidate) => candidate.score >= 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)

  const best = scored[0] && scored[0].score >= 0.85 ? scored[0] : null
  return { best, candidates: scored }
}

export interface ItemMatchCandidate {
  item_id: string
  name: string
  sku: string | null
  upc: string | null
  default_cost: number | null
  qoh: number | null
  confidence: number
  matched_on: 'barcode' | 'sku' | 'description'
}

interface InventoryRow {
  lightspeed_item_id: string
  name: string | null
  description: string | null
  system_sku: string | null
  custom_sku: string | null
  manufacturer_sku: string | null
  upc: string | null
  ean: string | null
  default_cost: number | null
  total_qoh: number | null
}

function toCandidate(row: InventoryRow, confidence: number, matchedOn: ItemMatchCandidate['matched_on']): ItemMatchCandidate {
  return {
    item_id: row.lightspeed_item_id,
    name: row.name || row.description || `Item ${row.lightspeed_item_id}`,
    sku: row.custom_sku || row.manufacturer_sku || row.system_sku || null,
    upc: row.upc || row.ean || null,
    default_cost: row.default_cost == null ? null : Number(row.default_cost),
    qoh: row.total_qoh == null ? null : Number(row.total_qoh),
    confidence: Math.round(confidence * 100) / 100,
    matched_on: matchedOn,
  }
}

const STOP_TOKENS = /^(the|and|for|with|pack|each|qty|size|colou?r|black|white|new|inc|gst|unit|pcs|x\d*)$/

function descriptionTokens(description: string): string[] {
  return Array.from(new Set(
    description
      .toLowerCase()
      .replace(/[^a-z0-9.\-/]+/g, ' ')
      .split(' ')
      .map((token) => token.replace(/^[.\-/]+|[.\-/]+$/g, ''))
      .filter((token) => token.length >= 2 && !STOP_TOKENS.test(token) && !/^\d{1,2}$/.test(token)),
  )).slice(0, 8)
}

/** Model-number-ish tokens (m8100, cs-m8100-12, 10-51t) are the strongest name signals. */
function modelCodeTokens(tokens: string[]): string[] {
  return tokens.filter((token) => /\d/.test(token) && /[a-z]/.test(token) || /^\d{3,}[a-z]*$/.test(token))
}

function charBigrams(value: string): Set<string> {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
  const grams = new Set<string>()
  for (let index = 0; index < cleaned.length - 1; index++) {
    const gram = cleaned.slice(index, index + 2)
    if (gram.trim().length === 2) grams.add(gram)
  }
  return grams
}

/** Dice coefficient over character bigrams — order-insensitive fuzzy similarity. */
function bigramSimilarity(a: string, b: string): number {
  const ga = charBigrams(a)
  const gb = charBigrams(b)
  if (ga.size === 0 || gb.size === 0) return 0
  let shared = 0
  for (const gram of ga) if (gb.has(gram)) shared++
  return (2 * shared) / (ga.size + gb.size)
}

/**
 * Match one extracted invoice line against the store's Lightspeed inventory
 * mirror. Barcode > SKU > fuzzy description.
 */
export async function matchInvoiceLineToItems(
  supabase: Supa,
  userId: string,
  line: { description: string; sku: string | null; upc: string | null },
): Promise<ItemMatchCandidate[]> {
  const select = 'lightspeed_item_id, name, description, system_sku, custom_sku, manufacturer_sku, upc, ean, default_cost, total_qoh'
  const candidates = new Map<string, ItemMatchCandidate>()
  const put = (candidate: ItemMatchCandidate) => {
    const existing = candidates.get(candidate.item_id)
    if (!existing || candidate.confidence > existing.confidence) candidates.set(candidate.item_id, candidate)
  }

  const upc = line.upc?.replace(/\D/g, '') ?? ''
  if (upc.length >= 8) {
    const { data } = await supabase
      .from('lightspeed_inventory')
      .select(select)
      .eq('user_id', userId)
      .eq('archived', false)
      .or(`upc.eq.${upc},ean.eq.${upc}`)
      .limit(3)
    for (const row of (data ?? []) as InventoryRow[]) put(toCandidate(row, 1, 'barcode'))
  }

  const sku = line.sku?.trim() ?? ''
  if (sku.length >= 2 && candidates.size === 0) {
    const escaped = sku.replace(/[%_,()]/g, '')
    if (escaped.length >= 2) {
      const { data } = await supabase
        .from('lightspeed_inventory')
        .select(select)
        .eq('user_id', userId)
        .eq('archived', false)
        .or(`custom_sku.ilike.${escaped},manufacturer_sku.ilike.${escaped},system_sku.ilike.${escaped}`)
        .limit(3)
      for (const row of (data ?? []) as InventoryRow[]) put(toCandidate(row, 0.95, 'sku'))
    }
  }

  if (candidates.size === 0) {
    // Like-for-like name lookup: cast a wide net (any distinctive token OR any
    // model-code token in name/description), then score fuzzily client-side.
    const tokens = descriptionTokens(line.description)
    if (tokens.length > 0) {
      const codes = modelCodeTokens(tokens)
      const probeTokens = Array.from(new Set([...codes, ...tokens])).slice(0, 5)
      const safe = (token: string) => token.replace(/[%_,()]/g, '')
      const orFilters = probeTokens
        .map(safe)
        .filter((token) => token.length >= 2)
        .flatMap((token) => [`description.ilike.%${token}%`, `name.ilike.%${token}%`])

      const { data } = await supabase
        .from('lightspeed_inventory')
        .select(select)
        .eq('user_id', userId)
        .eq('archived', false)
        .or(orFilters.join(','))
        .limit(120)

      for (const row of (data ?? []) as InventoryRow[]) {
        const haystack = `${row.name ?? ''} ${row.description ?? ''} ${row.manufacturer_sku ?? ''} ${row.custom_sku ?? ''}`.toLowerCase()
        const tokenHits = tokens.filter((token) => haystack.includes(token)).length
        const tokenRatio = tokens.length > 0 ? tokenHits / tokens.length : 0
        const codeHits = codes.filter((code) => haystack.includes(code)).length
        const fuzzy = bigramSimilarity(line.description, `${row.name ?? ''} ${row.description ?? ''}`)
        // Blend: model-code hits dominate, then token overlap, then bigram fuzz.
        const score = Math.min(
          0.9,
          (codes.length > 0 ? (codeHits / codes.length) * 0.45 : 0)
            + tokenRatio * (codes.length > 0 ? 0.3 : 0.55)
            + fuzzy * 0.35,
        )
        if (score >= 0.3) put(toCandidate(row, score, 'description'))
      }
    }
  }

  return Array.from(candidates.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 4)
}

export function createLightspeedClientForInvoices(userId: string) {
  return createLightspeedClient(userId)
}
