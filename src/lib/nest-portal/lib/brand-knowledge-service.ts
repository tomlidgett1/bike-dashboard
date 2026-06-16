import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildChatKnowledgeBlock,
  buildPhoneKnowledgeBlock,
  injectKnowledgeBlock,
  injectOutboundCallBlock,
  legacySeedRowsFromConfig,
  LEGACY_KNOWLEDGE_SEED_FIELDS,
  normaliseKnowledgeProducts,
  stripKnowledgeBlock,
  stripOutboundCallBlock,
  summariseKnowledgeContent,
  type BrandKnowledgeItem,
  type BrandKnowledgeProduct,
  type LegacyKnowledgeConfigKeys,
} from './brand-knowledge'
import { sentenceAwareChunks, vectorString } from './brand-knowledge-ingest'
import {
  buildElevenLabsPatchBody,
  detailElevenLabsAgent,
} from './elevenlabs-portal'
import { pickServerEnv } from './server-env'

const KNOWLEDGE_BUCKET = 'brand-knowledge-files'
const ELEVENLABS_API = 'https://api.elevenlabs.io/v1'

export function mapKnowledgeRow(row: Record<string, unknown>): BrandKnowledgeItem {
  return {
    id: String(row.id),
    brand_key: String(row.brand_key),
    title: String(row.title ?? ''),
    source_type: String(row.source_type ?? 'text') as BrandKnowledgeItem['source_type'],
    content_text: String(row.content_text ?? ''),
    summary: String(row.summary ?? ''),
    assigned_products: normaliseKnowledgeProducts(row.assigned_products),
    status: String(row.status ?? 'ready') as BrandKnowledgeItem['status'],
    legacy_field_key: row.legacy_field_key ? String(row.legacy_field_key) : null,
    file_name: row.file_name ? String(row.file_name) : null,
    file_mime_type: row.file_mime_type ? String(row.file_mime_type) : null,
    file_size_bytes: typeof row.file_size_bytes === 'number' ? row.file_size_bytes : null,
    storage_bucket: row.storage_bucket ? String(row.storage_bucket) : null,
    storage_path: row.storage_path ? String(row.storage_path) : null,
    error_message: row.error_message ? String(row.error_message) : null,
    metadata: (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<string, unknown>,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
    deleted_at: row.deleted_at ? String(row.deleted_at) : null,
  }
}

export async function listKnowledgeItems(
  supabase: SupabaseClient,
  brandKey: string,
  product?: BrandKnowledgeProduct | null,
): Promise<BrandKnowledgeItem[]> {
  const { data, error } = await supabase
    .from('nest_brand_knowledge_items')
    .select('*')
    .eq('brand_key', brandKey)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(error.message)

  let items = (data ?? []).map((row) => mapKnowledgeRow(row as Record<string, unknown>))
  if (product) {
    items = items.filter((item) => item.assigned_products.includes(product))
  }
  return items
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
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
      input: texts,
      dimensions: 3072,
    }),
  })

  const payload = await response.json().catch(() => ({})) as {
    data?: Array<{ embedding: number[]; index: number }>
    error?: { message?: string }
  }

  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Embedding failed (${response.status})`)
  }

  const sorted = [...(payload.data ?? [])].sort((a, b) => a.index - b.index)
  return sorted.map((row) => row.embedding)
}

export async function replaceKnowledgeChunks(
  supabase: SupabaseClient,
  item: Pick<BrandKnowledgeItem, 'id' | 'brand_key' | 'title' | 'content_text'>,
): Promise<void> {
  await supabase.from('nest_brand_knowledge_chunks').delete().eq('knowledge_item_id', item.id)

  const content = String(item.content_text ?? '').trim()
  if (!content) return

  const chunks = sentenceAwareChunks(content, `Knowledge: ${item.title}`)
  const embeddings = await embedTexts(chunks.map((chunk) => chunk.split('\n---\n').slice(-1)[0] ?? chunk))

  const rows = chunks.map((chunkText, index) => ({
    brand_key: item.brand_key,
    knowledge_item_id: item.id,
    chunk_index: index,
    content_text: chunkText,
    embedding: vectorString(embeddings[index] ?? []),
    metadata: { title: item.title },
  }))

  if (rows.length === 0) return

  const { error } = await supabase.from('nest_brand_knowledge_chunks').insert(rows)
  if (error) throw new Error(error.message)
}

export async function seedKnowledgeFromConfigIfNeeded(
  supabase: SupabaseClient,
  brandKey: string,
): Promise<boolean> {
  const { data: configRow, error: configError } = await supabase
    .from('nest_brand_chat_config')
    .select('*')
    .eq('brand_key', brandKey)
    .maybeSingle()

  if (configError) throw new Error(configError.message)
  if (!configRow) return false
  if (configRow.knowledge_base_seeded_at) return false

  const { count, error: countError } = await supabase
    .from('nest_brand_knowledge_items')
    .select('id', { count: 'exact', head: true })
    .eq('brand_key', brandKey)
    .is('deleted_at', null)

  if (countError) throw new Error(countError.message)
  if ((count ?? 0) > 0) {
    await supabase
      .from('nest_brand_chat_config')
      .update({ knowledge_base_seeded_at: new Date().toISOString() })
      .eq('brand_key', brandKey)
    return false
  }

  const seedRows = legacySeedRowsFromConfig(brandKey, configRow as Partial<LegacyKnowledgeConfigKeys>)
  if (seedRows.length === 0) {
    await supabase
      .from('nest_brand_chat_config')
      .update({ knowledge_base_seeded_at: new Date().toISOString() })
      .eq('brand_key', brandKey)
    return false
  }

  const { data: inserted, error: insertError } = await supabase
    .from('nest_brand_knowledge_items')
    .insert(seedRows)
    .select('*')

  if (insertError) throw new Error(insertError.message)

  for (const row of inserted ?? []) {
    const item = mapKnowledgeRow(row as Record<string, unknown>)
    try {
      await replaceKnowledgeChunks(supabase, item)
    } catch (err) {
      console.warn('[brand-knowledge] chunk seed failed:', err)
    }
  }

  await supabase
    .from('nest_brand_chat_config')
    .update({ knowledge_base_seeded_at: new Date().toISOString() })
    .eq('brand_key', brandKey)

  return true
}

export async function syncLegacyConfigField(
  supabase: SupabaseClient,
  brandKey: string,
  legacyFieldKey: string | null | undefined,
  contentText: string,
): Promise<void> {
  if (!legacyFieldKey) return
  const allowed = LEGACY_KNOWLEDGE_SEED_FIELDS.some((field) => field.legacy_field_key === legacyFieldKey)
  if (!allowed) return

  await supabase
    .from('nest_brand_chat_config')
    .upsert(
      {
        brand_key: brandKey,
        [legacyFieldKey]: contentText,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'brand_key' },
    )
}

export async function syncPhoneAgentKnowledge(
  supabase: SupabaseClient,
  brandKey: string,
): Promise<void> {
  const apiKey = pickServerEnv(['ELEVENLABS_API_KEY', 'NEST_ELEVENLABS_API_KEY'])
  if (!apiKey) return

  const { data: configRow } = await supabase
    .from('nest_brand_chat_config')
    .select('elevenlabs_voice_agent_id')
    .eq('brand_key', brandKey)
    .maybeSingle()

  const agentId = typeof configRow?.elevenlabs_voice_agent_id === 'string'
    ? configRow.elevenlabs_voice_agent_id.trim()
    : ''
  if (!agentId) return

  const items = await listKnowledgeItems(supabase, brandKey, 'phone_assistant')
  const kbBlock = buildPhoneKnowledgeBlock(items)

  const upstream = await fetch(`${ELEVENLABS_API}/convai/agents/${encodeURIComponent(agentId)}`, {
    headers: { 'xi-api-key': apiKey, Accept: 'application/json' },
  })
  const agentPayload = await upstream.json().catch(() => ({})) as Record<string, unknown>
  if (!upstream.ok) {
    console.warn('[brand-knowledge] ElevenLabs agent fetch failed:', agentPayload)
    return
  }

  const detail = detailElevenLabsAgent(agentPayload)
  const core = stripKnowledgeBlock(stripOutboundCallBlock(detail.systemPrompt ?? ''))
  const withOutbound = injectOutboundCallBlock(core)
  const nextPrompt = injectKnowledgeBlock(withOutbound, kbBlock)
  const patchBody = buildElevenLabsPatchBody({ systemPrompt: nextPrompt })

  await fetch(`${ELEVENLABS_API}/convai/agents/${encodeURIComponent(agentId)}`, {
    method: 'PATCH',
    headers: {
      'xi-api-key': apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patchBody),
  })
}

export async function createKnowledgeItem(
  supabase: SupabaseClient,
  brandKey: string,
  input: {
    title: string
    content_text: string
    assigned_products?: BrandKnowledgeProduct[]
    source_type?: BrandKnowledgeItem['source_type']
    legacy_field_key?: string | null
    file_name?: string | null
    file_mime_type?: string | null
    file_size_bytes?: number | null
    storage_path?: string | null
  },
): Promise<BrandKnowledgeItem> {
  const content = String(input.content_text ?? '').trim()
  if (!content) throw new Error('Content is required')

  const { data, error } = await supabase
    .from('nest_brand_knowledge_items')
    .insert({
      brand_key: brandKey,
      title: String(input.title ?? '').trim() || 'Untitled',
      source_type: input.source_type ?? 'text',
      content_text: content,
      summary: summariseKnowledgeContent(content),
      assigned_products: normaliseKnowledgeProducts(input.assigned_products),
      status: 'ready',
      legacy_field_key: input.legacy_field_key ?? null,
      file_name: input.file_name ?? null,
      file_mime_type: input.file_mime_type ?? null,
      file_size_bytes: input.file_size_bytes ?? null,
      storage_bucket: input.storage_path ? KNOWLEDGE_BUCKET : null,
      storage_path: input.storage_path ?? null,
    })
    .select('*')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Could not create knowledge item')

  const item = mapKnowledgeRow(data as Record<string, unknown>)
  await syncLegacyConfigField(supabase, brandKey, item.legacy_field_key, item.content_text)
  return item
}

/** Embeddings + phone prompt sync — safe to run in waitUntil after the HTTP response. */
export async function finalizeKnowledgeItemIndexing(
  supabase: SupabaseClient,
  brandKey: string,
  item: BrandKnowledgeItem,
): Promise<void> {
  try {
    await replaceKnowledgeChunks(supabase, item)
  } catch (err) {
    console.warn('[brand-knowledge] chunk indexing failed:', err)
  }
  if (item.assigned_products.includes('phone_assistant')) {
    try {
      await syncPhoneAgentKnowledge(supabase, brandKey)
    } catch (err) {
      console.warn('[brand-knowledge] phone knowledge sync failed:', err)
    }
  }
}

export async function updateKnowledgeItem(
  supabase: SupabaseClient,
  brandKey: string,
  itemId: string,
  patch: {
    title?: string
    content_text?: string
    assigned_products?: BrandKnowledgeProduct[]
  },
): Promise<BrandKnowledgeItem> {
  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) update.title = String(patch.title).trim() || 'Untitled'
  if (patch.content_text !== undefined) {
    const content = String(patch.content_text).trim()
    update.content_text = content
    update.summary = summariseKnowledgeContent(content)
  }
  if (patch.assigned_products !== undefined) {
    update.assigned_products = normaliseKnowledgeProducts(patch.assigned_products)
  }

  const { data, error } = await supabase
    .from('nest_brand_knowledge_items')
    .update(update)
    .eq('id', itemId)
    .eq('brand_key', brandKey)
    .is('deleted_at', null)
    .select('*')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Could not update knowledge item')

  const item = mapKnowledgeRow(data as Record<string, unknown>)
  if (patch.content_text !== undefined) {
    await syncLegacyConfigField(supabase, brandKey, item.legacy_field_key, item.content_text)
  }
  return item
}

export async function deleteKnowledgeItem(
  supabase: SupabaseClient,
  brandKey: string,
  itemId: string,
): Promise<void> {
  const { data: existing } = await supabase
    .from('nest_brand_knowledge_items')
    .select('storage_bucket, storage_path, legacy_field_key')
    .eq('id', itemId)
    .eq('brand_key', brandKey)
    .maybeSingle()

  const { error } = await supabase
    .from('nest_brand_knowledge_items')
    .update({ deleted_at: new Date().toISOString(), status: 'archived' })
    .eq('id', itemId)
    .eq('brand_key', brandKey)

  if (error) throw new Error(error.message)

  await supabase.from('nest_brand_knowledge_chunks').delete().eq('knowledge_item_id', itemId)

  if (existing?.storage_bucket && existing?.storage_path) {
    await supabase.storage.from(String(existing.storage_bucket)).remove([String(existing.storage_path)])
  }

  if (existing?.legacy_field_key) {
    await syncLegacyConfigField(supabase, brandKey, String(existing.legacy_field_key), '')
  }

  await syncPhoneAgentKnowledge(supabase, brandKey)
}

export { KNOWLEDGE_BUCKET, buildChatKnowledgeBlock, stripKnowledgeBlock }
