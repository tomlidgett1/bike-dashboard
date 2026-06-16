export const BRAND_KNOWLEDGE_PRODUCTS = [
  'nest_chat',
  'phone_assistant',
  'nest_outbound',
] as const

export type BrandKnowledgeProduct = (typeof BRAND_KNOWLEDGE_PRODUCTS)[number]

export type BrandKnowledgeSourceType = 'text' | 'pdf' | 'file' | 'legacy_field'

export type BrandKnowledgeStatus = 'processing' | 'ready' | 'failed' | 'archived'

export type BrandKnowledgeItem = {
  id: string
  brand_key: string
  title: string
  source_type: BrandKnowledgeSourceType
  content_text: string
  summary: string
  assigned_products: BrandKnowledgeProduct[]
  status: BrandKnowledgeStatus
  legacy_field_key: string | null
  file_name: string | null
  file_mime_type: string | null
  file_size_bytes: number | null
  storage_bucket: string | null
  storage_path: string | null
  error_message: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export const BRAND_KNOWLEDGE_PRODUCT_LABELS: Record<BrandKnowledgeProduct, string> = {
  nest_chat: 'Nest Chat',
  phone_assistant: 'Phone Assistant',
  nest_outbound: 'Outbound',
}

export const KB_PROMPT_START = '<!-- NEST_KB_START -->'
export const KB_PROMPT_END = '<!-- NEST_KB_END -->'

export const OUTBOUND_PROMPT_START = '<!-- NEST_OUTBOUND_CALLS -->'
export const OUTBOUND_PROMPT_END = '<!-- NEST_OUTBOUND_CALLS_END -->'

export const NEST_OUTBOUND_SYSTEM_PROMPT_BLOCK = [
  OUTBOUND_PROMPT_START,
  '## Nest outbound calls (work order ready)',
  '',
  'When `{{call_goal}}` is set for this conversation, you are placing an **outbound** call to tell the customer their work order is finished — not answering a general inbound enquiry.',
  '',
  'On outbound calls you must:',
  '1. Wait until the customer answers (do not speak over ringing).',
  '2. Introduce yourself as calling from {{brand_name}}.',
  '3. Follow **every step** in `{{call_goal}}`: describe what was done in natural spoken language (never read out line-item labels), state the total to pay on collection, and offer to answer questions.',
  '4. Do **not** mention the work order number unless the customer asks for it.',
  '5. Do **not** stop after a generic greeting such as only saying you are Ash or a customer service assistant — you must deliver the collection message and total.',
  '',
  'Quick facts for this call (also in `{{call_goal}}`): customer {{customer_first_name}} ({{customer_name}}), item {{item_summary}}, total {{total_price_display}}.',
  '',
  'If `{{call_goal}}` is empty, treat this as a normal inbound phone call and use your usual assistant behaviour below.',
  OUTBOUND_PROMPT_END,
].join('\n')

export type LegacyKnowledgeSeedField = {
  legacy_field_key: string
  title: string
  configKey: keyof LegacyKnowledgeConfigKeys
  defaultProducts: BrandKnowledgeProduct[]
}

export type LegacyKnowledgeConfigKeys = {
  business_display_name: string
  opening_line: string
  contact_text: string
  hours_text: string
  prices_text: string
  services_products_text: string
  booking_info_text: string
  policies_text: string
  extra_knowledge: string
  style_notes: string
  topics_to_avoid: string
  escalation_text: string
}

export const LEGACY_KNOWLEDGE_SEED_FIELDS: LegacyKnowledgeSeedField[] = [
  { legacy_field_key: 'business_display_name', title: 'Business name', configKey: 'business_display_name', defaultProducts: ['nest_chat', 'phone_assistant'] },
  { legacy_field_key: 'opening_line', title: 'Opening line', configKey: 'opening_line', defaultProducts: ['nest_chat'] },
  { legacy_field_key: 'contact_text', title: 'Contact details', configKey: 'contact_text', defaultProducts: ['nest_chat', 'phone_assistant', 'nest_outbound'] },
  { legacy_field_key: 'hours_text', title: 'Business hours', configKey: 'hours_text', defaultProducts: ['nest_chat', 'phone_assistant'] },
  { legacy_field_key: 'prices_text', title: 'Prices and packages', configKey: 'prices_text', defaultProducts: ['nest_chat', 'phone_assistant'] },
  { legacy_field_key: 'services_products_text', title: 'Services and products', configKey: 'services_products_text', defaultProducts: ['nest_chat', 'phone_assistant', 'nest_outbound'] },
  { legacy_field_key: 'booking_info_text', title: 'Booking and enquiries', configKey: 'booking_info_text', defaultProducts: ['nest_chat', 'phone_assistant'] },
  { legacy_field_key: 'policies_text', title: 'Policies', configKey: 'policies_text', defaultProducts: ['nest_chat', 'phone_assistant'] },
  { legacy_field_key: 'extra_knowledge', title: 'FAQs and extra facts', configKey: 'extra_knowledge', defaultProducts: ['nest_chat', 'phone_assistant', 'nest_outbound'] },
  { legacy_field_key: 'style_notes', title: 'Brand voice', configKey: 'style_notes', defaultProducts: ['nest_chat'] },
  { legacy_field_key: 'topics_to_avoid', title: 'Topics to avoid', configKey: 'topics_to_avoid', defaultProducts: ['nest_chat', 'phone_assistant'] },
  { legacy_field_key: 'escalation_text', title: 'Hand-off rules', configKey: 'escalation_text', defaultProducts: ['nest_chat', 'phone_assistant'] },
]

export function normaliseKnowledgeProducts(
  value: unknown,
  fallback: BrandKnowledgeProduct[] = [...BRAND_KNOWLEDGE_PRODUCTS],
): BrandKnowledgeProduct[] {
  if (!Array.isArray(value)) return fallback
  const picked = value
    .map((entry) => String(entry).trim())
    .filter((entry): entry is BrandKnowledgeProduct =>
      (BRAND_KNOWLEDGE_PRODUCTS as readonly string[]).includes(entry),
    )
  return picked.length > 0 ? [...new Set(picked)] : fallback
}

export function summariseKnowledgeContent(text: string, max = 180): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (!compact) return ''
  if (compact.length <= max) return compact
  return `${compact.slice(0, max - 1)}…`
}

export function buildKnowledgePromptBlock(
  items: Array<Pick<BrandKnowledgeItem, 'title' | 'content_text' | 'summary'>>,
  heading: string,
): string {
  const sections = items
    .map((item) => {
      const body = String(item.content_text ?? '').trim()
      if (!body) return ''
      const title = String(item.title ?? '').trim() || 'Knowledge'
      return `### ${title}\n${body}`
    })
    .filter(Boolean)

  if (sections.length === 0) return ''

  return [
    KB_PROMPT_START,
    `## ${heading}`,
    'The following entries come from the business Knowledge Base. Treat them as authoritative for this product.',
    sections.join('\n\n'),
    KB_PROMPT_END,
  ].join('\n\n')
}

export function stripOutboundCallBlock(prompt: string): string {
  const text = String(prompt ?? '')
  const start = text.indexOf(OUTBOUND_PROMPT_START)
  if (start === -1) return text.trim()
  const end = text.indexOf(OUTBOUND_PROMPT_END, start)
  if (end === -1) return text.slice(0, start).trim()
  const after = end + OUTBOUND_PROMPT_END.length
  let before = text.slice(0, start).trim()
  const tail = text.slice(after).trim()
  before = before.replace(/\n*---\s*$/u, '').trim()
  return [before, tail].filter(Boolean).join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function injectOutboundCallBlock(basePrompt: string): string {
  const base = stripOutboundCallBlock(stripKnowledgeBlock(String(basePrompt ?? '')))
  if (!base) return NEST_OUTBOUND_SYSTEM_PROMPT_BLOCK
  return `${NEST_OUTBOUND_SYSTEM_PROMPT_BLOCK}\n\n---\n\n${base}`
}

export function injectKnowledgeBlock(basePrompt: string, knowledgeBlock: string): string {
  const base = String(basePrompt ?? '').trim()
  const withoutManaged = stripKnowledgeBlock(base)
  const block = String(knowledgeBlock ?? '').trim()
  if (!block) return withoutManaged
  if (!withoutManaged) return block
  return `${withoutManaged}\n\n---\n\n${block}`
}

export function stripKnowledgeBlock(prompt: string): string {
  const text = String(prompt ?? '')
  const start = text.indexOf(KB_PROMPT_START)
  if (start === -1) return text.trim()
  const end = text.indexOf(KB_PROMPT_END, start)
  if (end === -1) return text.slice(0, start).trim()
  const after = end + KB_PROMPT_END.length
  let before = text.slice(0, start).trim()
  const tail = text.slice(after).trim()
  before = before.replace(/\n*---\s*$/u, '').trim()
  return [before, tail].filter(Boolean).join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function filterKnowledgeItemsForProduct(
  items: BrandKnowledgeItem[],
  product: BrandKnowledgeProduct,
): BrandKnowledgeItem[] {
  return items.filter(
    (item) =>
      item.status === 'ready' &&
      !item.deleted_at &&
      normaliseKnowledgeProducts(item.assigned_products).includes(product),
  )
}

export function buildChatKnowledgeBlock(items: BrandKnowledgeItem[]): string {
  return buildKnowledgePromptBlock(
    filterKnowledgeItemsForProduct(items, 'nest_chat'),
    'Knowledge Base (Nest Chat)',
  )
}

export function buildPhoneKnowledgeBlock(items: BrandKnowledgeItem[]): string {
  return buildKnowledgePromptBlock(
    filterKnowledgeItemsForProduct(items, 'phone_assistant'),
    'Knowledge Base (Phone Assistant)',
  )
}

export function buildOutboundKnowledgeBlock(items: BrandKnowledgeItem[]): string {
  return buildKnowledgePromptBlock(
    filterKnowledgeItemsForProduct(items, 'nest_outbound'),
    'Knowledge Base (Outbound)',
  )
}

export function legacySeedRowsFromConfig(
  brandKey: string,
  config: Partial<LegacyKnowledgeConfigKeys>,
): Array<{
  brand_key: string
  title: string
  source_type: 'legacy_field'
  content_text: string
  summary: string
  assigned_products: BrandKnowledgeProduct[]
  status: 'ready'
  legacy_field_key: string
}> {
  const rows: Array<{
    brand_key: string
    title: string
    source_type: 'legacy_field'
    content_text: string
    summary: string
    assigned_products: BrandKnowledgeProduct[]
    status: 'ready'
    legacy_field_key: string
  }> = []

  for (const field of LEGACY_KNOWLEDGE_SEED_FIELDS) {
    const raw = config[field.configKey]
    const content = typeof raw === 'string' ? raw.trim() : ''
    if (!content) continue
    rows.push({
      brand_key: brandKey,
      title: field.title,
      source_type: 'legacy_field',
      content_text: content,
      summary: summariseKnowledgeContent(content),
      assigned_products: [...field.defaultProducts],
      status: 'ready',
      legacy_field_key: field.legacy_field_key,
    })
  }

  return rows
}
