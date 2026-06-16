import type { VercelRequest, VercelResponse } from '@/lib/nest-portal/vercel-adapter'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  BRAND_KNOWLEDGE_PRODUCTS,
  type BrandKnowledgeItem,
  type BrandKnowledgeProduct,
  LEGACY_KNOWLEDGE_SEED_FIELDS,
  normaliseKnowledgeProducts,
} from '../lib/brand-knowledge'
import {
  createKnowledgeItem,
  deleteKnowledgeItem,
  finalizeKnowledgeItemIndexing,
  listKnowledgeItems,
  mapKnowledgeRow,
  seedKnowledgeFromConfigIfNeeded,
  syncPhoneAgentKnowledge,
  updateKnowledgeItem,
  KNOWLEDGE_BUCKET,
} from '../lib/brand-knowledge-service'
import { analyseKnowledgeDraft } from '../lib/brand-knowledge-analyse'
import { vectorString } from '../lib/brand-knowledge-ingest'
import { pickServerEnv } from '../lib/server-env'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

function getSupabaseAdmin(): SupabaseClient | null {
  const url = pickServerEnv(['SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_URL'])
  const key = pickServerEnv(['SUPABASE_SECRET_KEY', 'NEW_SUPABASE_SECRET_KEY'])
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function resolveSession(
  supabase: SupabaseClient,
  req: VercelRequest,
): Promise<{ brandKey: string } | null> {
  const auth = (req.headers.authorization || '') as string
  const legacy = (req.headers['x-portal-token'] as string | undefined)?.trim()
  const token = auth.replace(/^Bearer\s+/i, '').trim() || legacy || ''
  if (!token) return null

  const { data, error } = await supabase
    .from('nest_brand_portal_sessions')
    .select('brand_key, expires_at')
    .eq('id', token)
    .maybeSingle()

  if (error || !data?.brand_key || !data.expires_at) return null
  if (new Date(data.expires_at).getTime() < Date.now()) return null
  return { brandKey: data.brand_key }
}

async function embedQuery(text: string): Promise<number[]> {
  const apiKey = pickServerEnv(['OPENAI_API_KEY', 'NEST_OPENAI_API_KEY'])
  if (!apiKey) throw new Error('OpenAI is not configured for knowledge search')

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-large',
      input: text,
      dimensions: 3072,
    }),
  })

  const payload = await response.json().catch(() => ({})) as {
    data?: Array<{ embedding: number[] }>
    error?: { message?: string }
  }

  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Embedding failed (${response.status})`)
  }

  return payload.data?.[0]?.embedding ?? []
}

async function searchKnowledge(
  supabase: SupabaseClient,
  brandKey: string,
  query: string,
  product?: BrandKnowledgeProduct | null,
) {
  const trimmed = query.trim()
  if (!trimmed) return { summary: 'Enter a search query.', results: [] as Array<Record<string, unknown>> }

  const embedding = await embedQuery(trimmed)
  const { data: chunkHits, error } = await supabase.rpc('match_brand_knowledge_chunks', {
    p_brand_key: brandKey,
    p_query_embedding: vectorString(embedding),
    p_match_count: 12,
  })

  if (error) throw new Error(error.message)

  const itemIds = [...new Set((chunkHits ?? []).map((row: { knowledge_item_id: string }) => row.knowledge_item_id))]
  if (itemIds.length === 0) {
    const items = await listKnowledgeItems(supabase, brandKey, product ?? null)
    const needle = trimmed.toLowerCase()
    const textHits = items.filter((item) =>
      item.title.toLowerCase().includes(needle) ||
      item.summary.toLowerCase().includes(needle) ||
      item.content_text.toLowerCase().includes(needle),
    ).slice(0, 8)

    return {
      summary: textHits.length > 0
        ? `Found ${textHits.length} matching ${textHits.length === 1 ? 'entry' : 'entries'} in your Knowledge Base.`
        : 'No matching knowledge entries yet. Try adding the detail in Knowledge Base.',
      results: textHits.map((item) => ({
        itemId: item.id,
        title: item.title,
        summary: item.summary,
        relevance: 'primary',
        reason: 'Matched title or content text.',
        assigned_products: item.assigned_products,
      })),
    }
  }

  const { data: items } = await supabase
    .from('nest_brand_knowledge_items')
    .select('*')
    .eq('brand_key', brandKey)
    .in('id', itemIds)
    .is('deleted_at', null)

  const itemMap = new Map((items ?? []).map((row) => [String(row.id), mapKnowledgeRow(row as Record<string, unknown>)]))

  const results = (chunkHits ?? [])
    .map((hit: { knowledge_item_id: string; content_text: string; similarity: number }, index: number) => {
      const item = itemMap.get(String(hit.knowledge_item_id))
      if (!item) return null
      if (product && !item.assigned_products.includes(product)) return null
      return {
        itemId: item.id,
        title: item.title,
        summary: item.summary,
        excerpt: String(hit.content_text ?? '').split('\n---\n').slice(-1)[0]?.slice(0, 240) ?? '',
        relevance: index === 0 ? 'primary' : 'secondary',
        reason: `Semantic match (${Math.round((hit.similarity ?? 0) * 100)}% similar).`,
        assigned_products: item.assigned_products,
      }
    })
    .filter(Boolean)

  return {
    summary: results.length > 0
      ? `Found ${results.length} relevant ${results.length === 1 ? 'entry' : 'entries'} in your Knowledge Base.`
      : 'No matching knowledge entries for that product filter.',
    results,
  }
}

async function upsertLegacyField(
  supabase: SupabaseClient,
  brandKey: string,
  legacyFieldKey: string,
  contentText: string,
  assignedProducts?: BrandKnowledgeProduct[],
) {
  const field = LEGACY_KNOWLEDGE_SEED_FIELDS.find((entry) => entry.legacy_field_key === legacyFieldKey)
  if (!field) throw new Error('Unknown legacy field')

  const { data: existing } = await supabase
    .from('nest_brand_knowledge_items')
    .select('*')
    .eq('brand_key', brandKey)
    .eq('legacy_field_key', legacyFieldKey)
    .is('deleted_at', null)
    .maybeSingle()

  if (existing) {
    return updateKnowledgeItem(supabase, brandKey, String(existing.id), {
      content_text: contentText,
      assigned_products: assignedProducts,
    })
  }

  return createKnowledgeItem(supabase, brandKey, {
    title: field.title,
    content_text: contentText,
    assigned_products: assignedProducts ?? field.defaultProducts,
    source_type: 'legacy_field',
    legacy_field_key: legacyFieldKey,
  })
}

function scheduleKnowledgeIndexing(
  supabase: SupabaseClient,
  brandKey: string,
  item: BrandKnowledgeItem,
): void {
  const run = () => finalizeKnowledgeItemIndexing(supabase, brandKey, item)
  void import('@vercel/functions')
    .then(({ waitUntil }) => waitUntil(run()))
    .catch(() => {
      void run()
    })
}

function parseJsonBody(req: VercelRequest): Record<string, unknown> {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return (req.body ?? {}) as Record<string, unknown>
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-portal-token')
    res.status(204).end()
    return
  }

  try {
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      res.status(500).json({ error: 'Server missing Supabase configuration' })
      return
    }

    const session = await resolveSession(supabase, req)
    if (!session) {
      res.status(401).json({ error: 'Unauthorised' })
      return
    }

    const { brandKey } = session

    if (req.method === 'GET') {
      const itemId = typeof req.query.id === 'string' ? req.query.id.trim() : ''
      const productRaw = typeof req.query.product === 'string' ? req.query.product.trim() : ''
      const product = (BRAND_KNOWLEDGE_PRODUCTS as readonly string[]).includes(productRaw)
        ? (productRaw as BrandKnowledgeProduct)
        : null

      await seedKnowledgeFromConfigIfNeeded(supabase, brandKey)

      if (itemId) {
        const { data, error } = await supabase
          .from('nest_brand_knowledge_items')
          .select('*')
          .eq('id', itemId)
          .eq('brand_key', brandKey)
          .is('deleted_at', null)
          .maybeSingle()

        if (error) throw new Error(error.message)
        if (!data) {
          res.status(404).json({ error: 'Knowledge item not found' })
          return
        }

        res.status(200).json({ item: mapKnowledgeRow(data as Record<string, unknown>) })
        return
      }

      const items = await listKnowledgeItems(supabase, brandKey, product)
      res.status(200).json({ items })
      return
    }

    if (req.method === 'POST') {
      const contentType = String(req.headers['content-type'] ?? '')
      if (contentType.includes('multipart/form-data')) {
        const chunks: Buffer[] = []
        let total = 0
        await new Promise<void>((resolve, reject) => {
          req.on('data', (chunk: Buffer) => {
            total += chunk.length
            if (total > MAX_UPLOAD_BYTES) {
              reject(new Error('file_too_large'))
              return
            }
            chunks.push(chunk)
          })
          req.on('end', resolve)
          req.on('error', reject)
        }).catch((err: Error) => {
          if (err.message === 'file_too_large') {
            res.status(413).json({ error: 'File is too large (max 10 MB)' })
          } else {
            res.status(400).json({ error: err.message })
          }
        })
        if (res.headersSent) return

        const rawBody = Buffer.concat(chunks)
        const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/)
        if (!boundaryMatch) {
          res.status(400).json({ error: 'Invalid multipart boundary' })
          return
        }
        const boundary = boundaryMatch[1] ?? boundaryMatch[2]
        const bodyStr = rawBody.toString('binary')
        const parts = bodyStr.split(`--${boundary}`)

        let fileBuffer: Buffer | null = null
        let fileMime = 'application/octet-stream'
        let fileName = 'upload'
        let extractedText = ''
        let title = 'Uploaded file'
        let assignedProducts: BrandKnowledgeProduct[] = [...BRAND_KNOWLEDGE_PRODUCTS]

        for (const part of parts) {
          if (part.includes('name="file"')) {
            const headerEnd = part.indexOf('\r\n\r\n')
            if (headerEnd === -1) continue
            const headers = part.slice(0, headerEnd)
            const mimeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i)
            if (mimeMatch) fileMime = mimeMatch[1].trim().toLowerCase()
            const nameMatch = headers.match(/filename="([^"]+)"/i)
            if (nameMatch) fileName = nameMatch[1]
            let data = part.slice(headerEnd + 4)
            if (data.endsWith('\r\n')) data = data.slice(0, -2)
            fileBuffer = Buffer.from(data, 'binary')
          }
          if (part.includes('name="extractedText"')) {
            const headerEnd = part.indexOf('\r\n\r\n')
            if (headerEnd === -1) continue
            let data = part.slice(headerEnd + 4)
            if (data.endsWith('\r\n')) data = data.slice(0, -2)
            extractedText = Buffer.from(data, 'binary').toString('utf8').trim()
          }
          if (part.includes('name="title"')) {
            const headerEnd = part.indexOf('\r\n\r\n')
            if (headerEnd === -1) continue
            let data = part.slice(headerEnd + 4)
            if (data.endsWith('\r\n')) data = data.slice(0, -2)
            title = Buffer.from(data, 'binary').toString('utf8').trim() || title
          }
          if (part.includes('name="assignedProducts"')) {
            const headerEnd = part.indexOf('\r\n\r\n')
            if (headerEnd === -1) continue
            let data = part.slice(headerEnd + 4)
            if (data.endsWith('\r\n')) data = data.slice(0, -2)
            try {
              assignedProducts = normaliseKnowledgeProducts(JSON.parse(Buffer.from(data, 'binary').toString('utf8')))
            } catch {
              assignedProducts = [...BRAND_KNOWLEDGE_PRODUCTS]
            }
          }
        }

        if (!fileBuffer?.length) {
          res.status(400).json({ error: 'file is required' })
          return
        }

        const content = extractedText || (fileMime.startsWith('text/') ? fileBuffer.toString('utf8').trim() : '')
        if (!content) {
          res.status(400).json({ error: 'Could not read text from this file. Paste the text or upload a PDF with readable text.' })
          return
        }

        const storagePath = `${brandKey}/${crypto.randomUUID()}-${fileName.replace(/[^\w.\-]+/g, '_')}`
        const { error: uploadError } = await supabase.storage
          .from(KNOWLEDGE_BUCKET)
          .upload(storagePath, fileBuffer, { contentType: fileMime, upsert: false })

        if (uploadError) throw new Error(uploadError.message)

        const sourceType = fileMime.includes('pdf') ? 'pdf' : 'file'
        const item = await createKnowledgeItem(supabase, brandKey, {
          title,
          content_text: content,
          assigned_products: assignedProducts,
          source_type: sourceType,
          file_name: fileName,
          file_mime_type: fileMime,
          file_size_bytes: fileBuffer.length,
          storage_path: storagePath,
        })

        res.status(200).json({ item })
        scheduleKnowledgeIndexing(supabase, brandKey, item)
        return
      }

      const body = parseJsonBody(req)
      const action = String(body.action ?? '').trim()

      if (action === 'search') {
        const query = String(body.query ?? '').trim()
        const product = typeof body.product === 'string'
          ? (BRAND_KNOWLEDGE_PRODUCTS as readonly string[]).includes(body.product)
            ? (body.product as BrandKnowledgeProduct)
            : null
          : null
        const payload = await searchKnowledge(supabase, brandKey, query, product)
        res.status(200).json(payload)
        return
      }

      if (action === 'seed') {
        const seeded = await seedKnowledgeFromConfigIfNeeded(supabase, brandKey)
        const items = await listKnowledgeItems(supabase, brandKey)
        res.status(200).json({ seeded, items })
        return
      }

      if (action === 'upsert_legacy') {
        const legacyFieldKey = String(body.legacyFieldKey ?? '').trim()
        const contentText = String(body.contentText ?? '').trim()
        const assignedProducts = normaliseKnowledgeProducts(body.assignedProducts)
        const item = await upsertLegacyField(supabase, brandKey, legacyFieldKey, contentText, assignedProducts)
        res.status(200).json({ item })
        scheduleKnowledgeIndexing(supabase, brandKey, item)
        return
      }

      if (action === 'sync_phone') {
        await syncPhoneAgentKnowledge(supabase, brandKey)
        res.status(200).json({ ok: true })
        return
      }

      if (action === 'analyse') {
        const title = String(body.title ?? '').trim()
        const contentText = String(body.content_text ?? body.contentText ?? '').trim()
        const excludeItemId = typeof body.exclude_item_id === 'string'
          ? body.exclude_item_id
          : typeof body.excludeItemId === 'string'
            ? body.excludeItemId
            : null
        const result = await analyseKnowledgeDraft(supabase, brandKey, {
          title,
          content_text: contentText,
          exclude_item_id: excludeItemId,
        })
        res.status(200).json({ analysis: result })
        return
      }

      const title = String(body.title ?? '').trim()
      const contentText = String(body.content_text ?? body.contentText ?? '').trim()
      const assignedProducts = normaliseKnowledgeProducts(body.assigned_products ?? body.assignedProducts)

      if (!contentText) {
        res.status(400).json({ error: 'content_text is required' })
        return
      }

      const item = await createKnowledgeItem(supabase, brandKey, {
        title: title || 'Untitled',
        content_text: contentText,
        assigned_products: assignedProducts,
        source_type: 'text',
      })

      res.status(200).json({ item })
      scheduleKnowledgeIndexing(supabase, brandKey, item)
      return
    }

    if (req.method === 'PATCH') {
      const body = parseJsonBody(req)
      const itemId = String(body.id ?? '').trim()
      if (!itemId) {
        res.status(400).json({ error: 'id is required' })
        return
      }

      const patch: {
        title?: string
        content_text?: string
        assigned_products?: BrandKnowledgeProduct[]
      } = {}

      if (body.title !== undefined) patch.title = String(body.title)
      if (body.content_text !== undefined || body.contentText !== undefined) {
        patch.content_text = String(body.content_text ?? body.contentText)
      }
      if (body.assigned_products !== undefined || body.assignedProducts !== undefined) {
        patch.assigned_products = normaliseKnowledgeProducts(body.assigned_products ?? body.assignedProducts)
      }

      const item = await updateKnowledgeItem(supabase, brandKey, itemId, patch)
      res.status(200).json({ item })
      if (patch.content_text !== undefined || patch.assigned_products !== undefined) {
        scheduleKnowledgeIndexing(supabase, brandKey, item)
      }
      return
    }

    if (req.method === 'DELETE') {
      const itemId = typeof req.query.id === 'string'
        ? req.query.id.trim()
        : String(parseJsonBody(req).id ?? '').trim()

      if (!itemId) {
        res.status(400).json({ error: 'id is required' })
        return
      }

      await deleteKnowledgeItem(supabase, brandKey, itemId)
      res.status(200).json({ ok: true })
      return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err: unknown) {
    console.error('[brand-portal-knowledge]', err)
    const message = err instanceof Error ? err.message : 'Request failed'
    res.status(500).json({ error: message })
  }
}
