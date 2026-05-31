/**
 * Genie Store Agent — streaming, READ + PROPOSE only.
 *
 * Authenticated to verified bicycle stores. Lets a store manage their storefront
 * conversationally: reorder/show/hide carousels, and apply percentage discounts.
 *
 * This endpoint NEVER mutates. Read tools fetch state; "propose_*" tools compute
 * an exact change and emit a `proposal` SSE event. The UI previews it and, on
 * Apply, POSTs the proposal to /api/genie/agent/apply which does the mutation.
 */

import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import type {
  CarouselSizeOption,
  GenieProposal,
  CarouselLayoutProposal,
  DiscountApplyProposal,
  DiscountRemoveProposal,
} from '@/lib/types/genie-agent'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const MODEL = 'gpt-5.4'

function buildSystemPrompt(storeName: string): string {
  const today = new Date().toISOString().slice(0, 10)
  return `You are the Yellow Jersey Store Agent — a sharp, efficient assistant that helps "${storeName}" manage their storefront on Yellow Jersey. Today is ${today}.

WHAT YOU CAN DO
1. Carousels — the rows of products on the store's public page. You can reorder them, show/hide them, and set a size (featured | normal | compact). The FIRST carousel is the featured collection.
2. Discounts — apply a percentage discount to one or more products (e.g. "50% off all Clif bars"), optionally with an end date after which it lapses.

HOW TO WORK
- Read first: call get_store_carousels / search_store_products / list_active_discounts to ground yourself in the store's ACTUAL data before proposing anything.
- Then propose: call exactly one propose_* tool to stage the change. You never apply changes yourself — the store reviews a preview and clicks Apply.
- For discounts by description ("all Clif bars"), pass the keyword as "match" and let the system find the products. Only pass product_ids if the store picked specific items.
- Expiry: if the store gives a deadline ("until Sunday"), compute the ISO date from today (${today}) and pass it as ends_at. No deadline → omit it.

STYLE
- Concise and confident. One or two sentences. No preamble, no "let me…".
- After proposing, briefly say what's staged and that they can review & Apply. Don't restate every item — the preview card shows detail.
- If a request is ambiguous or matches nothing, say so in one line and ask a single sharp question.
- Stay on storefront management. Politely redirect anything else.`
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

function send(controller: ReadableStreamDefaultController, encoder: TextEncoder, data: object) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
}

/** Strip characters that would break a PostgREST .or() ilike filter. */
function sanitizeMatch(term: string): string {
  return term.replace(/[,()*]/g, ' ').trim()
}

const SIZE_VALUES: CarouselSizeOption[] = ['featured', 'normal', 'compact']
function normalizeSize(v: unknown): CarouselSizeOption {
  return SIZE_VALUES.includes(v as CarouselSizeOption) ? (v as CarouselSizeOption) : 'normal'
}

type Supa = Awaited<ReturnType<typeof createClient>>

// ── Read helpers ────────────────────────────────────────────────────────────

async function getStoreCarousels(supabase: Supa, userId: string) {
  const { data } = await supabase
    .from('store_categories')
    .select('id, name, source, display_order, is_active, carousel_size, product_ids')
    .eq('user_id', userId)
    .order('display_order', { ascending: true })

  return (data ?? []).map((c: any) => ({
    id: c.id as string,
    name: c.name as string,
    source: c.source as string,
    display_order: c.display_order as number,
    is_active: c.is_active !== false,
    carousel_size: normalizeSize(c.carousel_size),
    product_count: Array.isArray(c.product_ids) ? c.product_ids.length : 0,
  }))
}

async function searchStoreProducts(supabase: Supa, userId: string, query: string) {
  const term = sanitizeMatch(query)
  let q = supabase
    .from('products')
    .select('id, display_name, description, price, category_name, manufacturer_name, discount_percent, discount_active')
    .eq('user_id', userId)
    .limit(40)

  if (term) {
    const like = `%${term}%`
    q = q.or(
      [
        `display_name.ilike.${like}`,
        `description.ilike.${like}`,
        `category_name.ilike.${like}`,
        `manufacturer_name.ilike.${like}`,
        `full_category_path.ilike.${like}`,
      ].join(','),
    )
  }

  const { data } = await q
  return (data ?? []).map((p: any) => ({
    id: p.id as string,
    name: (p.display_name || p.description) as string,
    price: Number(p.price) || 0,
    currently_discounted: p.discount_active === true && p.discount_percent != null,
    discount_percent: p.discount_percent != null ? Number(p.discount_percent) : null,
  }))
}

async function listActiveDiscounts(supabase: Supa, userId: string) {
  const { data } = await supabase
    .from('products')
    .select('id, display_name, description, price, discount_percent, discount_ends_at, sale_price')
    .eq('user_id', userId)
    .eq('discount_active', true)

  return (data ?? []).map((p: any) => ({
    id: p.id as string,
    name: (p.display_name || p.description) as string,
    price: Number(p.price) || 0,
    discount_percent: p.discount_percent != null ? Number(p.discount_percent) : null,
    sale_price: p.sale_price != null ? Number(p.sale_price) : null,
    ends_at: p.discount_ends_at ?? null,
  }))
}

// ── Proposal builders ─────────────────────────────────────────────────────────

async function buildCarouselProposal(
  supabase: Supa,
  userId: string,
  args: { summary?: string; layout?: Array<{ id: string; is_active?: boolean; carousel_size?: string }> },
): Promise<{ proposal?: CarouselLayoutProposal; output: object }> {
  const current = await getStoreCarousels(supabase, userId)
  if (current.length === 0) {
    return { output: { error: 'This store has no carousels yet. Create one in Store Settings first.' } }
  }
  const byId = new Map(current.map(c => [c.id, c]))
  const layout = (args.layout ?? []).filter(l => byId.has(l.id))

  // Final order: layout entries first (in given order), then any untouched carousels.
  const orderedIds = layout.map(l => l.id)
  for (const c of current) if (!orderedIds.includes(c.id)) orderedIds.push(c.id)

  const layoutById = new Map(layout.map(l => [l.id, l]))
  const changes: CarouselLayoutProposal['changes'] = []
  const order_preview: CarouselLayoutProposal['order_preview'] = []

  orderedIds.forEach((id, index) => {
    const cur = byId.get(id)!
    const ov = layoutById.get(id)
    const nextActive = ov?.is_active ?? cur.is_active
    const nextSize = ov?.carousel_size ? normalizeSize(ov.carousel_size) : cur.carousel_size

    order_preview.push({ name: cur.name, is_active: nextActive, carousel_size: nextSize })

    if (
      index !== cur.display_order ||
      nextActive !== cur.is_active ||
      nextSize !== cur.carousel_size
    ) {
      changes.push({
        id,
        name: cur.name,
        display_order: index,
        is_active: nextActive,
        carousel_size: nextSize,
        prev_display_order: cur.display_order,
        prev_is_active: cur.is_active,
        prev_carousel_size: cur.carousel_size,
      })
    }
  })

  if (changes.length === 0) {
    return { output: { status: 'no_change', message: 'The requested layout already matches the current one.' } }
  }

  const proposal: CarouselLayoutProposal = {
    kind: 'carousel_layout',
    summary: args.summary?.trim() || 'Update carousel layout',
    changes,
    order_preview,
  }
  return {
    proposal,
    output: {
      status: 'proposed',
      kind: 'carousel_layout',
      changed_count: changes.length,
      new_order: order_preview.map(o => o.name),
    },
  }
}

async function resolveDiscountTargets(
  supabase: Supa,
  userId: string,
  match: string | undefined,
  productIds: string[] | undefined,
) {
  let q = supabase
    .from('products')
    .select('id, display_name, description, price')
    .eq('user_id', userId)

  if (productIds && productIds.length > 0) {
    q = q.in('id', productIds)
  } else if (match && sanitizeMatch(match)) {
    const like = `%${sanitizeMatch(match)}%`
    q = q.or(
      [
        `display_name.ilike.${like}`,
        `description.ilike.${like}`,
        `category_name.ilike.${like}`,
        `manufacturer_name.ilike.${like}`,
        `full_category_path.ilike.${like}`,
      ].join(','),
    )
  } else {
    return []
  }

  const { data } = await q.limit(500)
  return (data ?? []).map((p: any) => ({
    id: p.id as string,
    name: (p.display_name || p.description) as string,
    price: Number(p.price) || 0,
  }))
}

async function buildDiscountProposal(
  supabase: Supa,
  userId: string,
  args: { summary?: string; match?: string; product_ids?: string[]; discount_percent?: number; ends_at?: string | null },
): Promise<{ proposal?: DiscountApplyProposal; output: object }> {
  const pct = Number(args.discount_percent)
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
    return { output: { error: 'discount_percent must be a number between 1 and 100.' } }
  }

  let endsAt: string | null = null
  if (args.ends_at) {
    const d = new Date(args.ends_at)
    if (isNaN(d.getTime())) {
      return { output: { error: 'ends_at is not a valid date.' } }
    }
    endsAt = d.toISOString()
  }

  const targets = await resolveDiscountTargets(supabase, userId, args.match, args.product_ids)
  if (targets.length === 0) {
    return { output: { error: `No products found${args.match ? ` matching "${args.match}"` : ''}.` } }
  }

  const round2 = (n: number) => Math.round(n * 100) / 100
  const products_preview = targets.slice(0, 12).map(t => ({
    id: t.id,
    name: t.name,
    price: t.price,
    sale_price: round2(t.price * (1 - pct / 100)),
  }))

  const match_label = args.product_ids?.length
    ? `${targets.length} selected product${targets.length === 1 ? '' : 's'}`
    : `${targets.length} product${targets.length === 1 ? '' : 's'} matching "${args.match}"`

  const proposal: DiscountApplyProposal = {
    kind: 'discount_apply',
    summary: args.summary?.trim() || `Apply ${Math.round(pct)}% discount`,
    match_label,
    discount_percent: round2(pct),
    ends_at: endsAt,
    product_ids: targets.map(t => t.id),
    products_preview,
  }
  return {
    proposal,
    output: {
      status: 'proposed',
      kind: 'discount_apply',
      percent: Math.round(pct),
      product_count: targets.length,
      ends_at: endsAt,
    },
  }
}

async function buildRemoveDiscountProposal(
  supabase: Supa,
  userId: string,
  args: { summary?: string; match?: string; product_ids?: string[] },
): Promise<{ proposal?: DiscountRemoveProposal; output: object }> {
  // Only consider currently-discounted products.
  let q = supabase
    .from('products')
    .select('id, display_name, description')
    .eq('user_id', userId)
    .eq('discount_active', true)

  if (args.product_ids && args.product_ids.length > 0) {
    q = q.in('id', args.product_ids)
  } else if (args.match && sanitizeMatch(args.match)) {
    const like = `%${sanitizeMatch(args.match)}%`
    q = q.or(
      [
        `display_name.ilike.${like}`,
        `description.ilike.${like}`,
        `category_name.ilike.${like}`,
        `manufacturer_name.ilike.${like}`,
        `full_category_path.ilike.${like}`,
      ].join(','),
    )
  }

  const { data } = await q.limit(500)
  const targets = (data ?? []).map((p: any) => ({ id: p.id as string, name: (p.display_name || p.description) as string }))
  if (targets.length === 0) {
    return { output: { error: 'No matching products currently have an active discount.' } }
  }

  const proposal: DiscountRemoveProposal = {
    kind: 'discount_remove',
    summary: args.summary?.trim() || 'Remove discount',
    match_label: args.match ? `products matching "${args.match}"` : `${targets.length} discounted product${targets.length === 1 ? '' : 's'}`,
    product_ids: targets.map(t => t.id),
    products_preview: targets.slice(0, 12),
  }
  return {
    proposal,
    output: { status: 'proposed', kind: 'discount_remove', product_count: targets.length },
  }
}

// ── Tools definition ──────────────────────────────────────────────────────────

const TOOLS: any[] = [
  {
    type: 'function', name: 'get_store_carousels', strict: null,
    description: 'List the store\'s carousels in display order, with id, name, source, visibility (is_active), size and product count. Call before proposing any layout change.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    type: 'function', name: 'search_store_products', strict: null,
    description: 'Search THIS store\'s own products by keyword (matches name, description, category, brand). Use to find products to discount.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Keyword, e.g. "Clif", "helmet", "Shimano".' } },
      required: ['query'],
    },
  },
  {
    type: 'function', name: 'list_active_discounts', strict: null,
    description: 'List the store\'s products that currently have an active discount.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    type: 'function', name: 'propose_carousel_layout', strict: null,
    description: 'Stage a new carousel layout for review. Pass the carousels in the desired display order. The first is the featured collection. Omitted carousels keep their position after the listed ones.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'One concise sentence describing the change.' },
        layout: {
          type: 'array',
          description: 'Carousels in desired order.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Carousel id from get_store_carousels.' },
              is_active: { type: 'boolean', description: 'false to hide this carousel.' },
              carousel_size: { type: 'string', enum: ['featured', 'normal', 'compact'] },
            },
            required: ['id'],
          },
        },
      },
      required: ['summary', 'layout'],
    },
  },
  {
    type: 'function', name: 'propose_discount', strict: null,
    description: 'Stage a percentage discount on products for review. Use "match" for description-based targeting ("all Clif bars" → match:"Clif"); use product_ids only for specific picks.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'One concise sentence describing the discount.' },
        match: { type: 'string', description: 'Keyword to match products by (name/brand/category).' },
        product_ids: { type: 'array', items: { type: 'string' }, description: 'Specific product ids, if the store picked items.' },
        discount_percent: { type: 'number', description: 'Percent off, 1–100.' },
        ends_at: { type: 'string', description: 'Optional ISO date when the discount ends (e.g. 2026-06-07). Omit for no expiry.' },
      },
      required: ['summary', 'discount_percent'],
    },
  },
  {
    type: 'function', name: 'propose_remove_discount', strict: null,
    description: 'Stage removal of discounts for review. Use "match" or product_ids to target; omit both to clear ALL active discounts.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'One concise sentence describing the removal.' },
        match: { type: 'string', description: 'Keyword to match discounted products by.' },
        product_ids: { type: 'array', items: { type: 'string' }, description: 'Specific product ids.' },
      },
      required: ['summary'],
    },
  },
]

export async function POST(request: NextRequest) {
  try {
    const { messages }: { messages: Message[] } = await request.json()
    const supabase = await createClient()

    // ── Auth: verified bicycle store only ──────────────────────────────────
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized. Please log in.' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      })
    }
    const { data: profile } = await supabase
      .from('users')
      .select('account_type, bicycle_store, business_name')
      .eq('user_id', user.id)
      .single()

    if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
      return new Response(JSON.stringify({ error: 'Store agent is only available to verified bicycle stores.' }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      })
    }

    const storeName = profile.business_name || 'your store'
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        const emit = (data: object) => send(controller, encoder, data)
        try {
          emit({ event: 'status', phase: 'planning', text: 'Thinking...' })

          const inputMessages = messages.map(m => ({ role: m.role, content: m.content }))

          const MAX_ITERATIONS = 5
          let previousResponseId: string | null = null
          let nextInput: any = inputMessages
          let hasSignalledResponding = false

          for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
            const isLastIteration = iteration === MAX_ITERATIONS - 1

            const response: any = await openai.responses.create({
              model: MODEL,
              instructions: buildSystemPrompt(storeName),
              ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
              ...(isLastIteration ? {} : { tools: TOOLS }),
              input: nextInput,
              stream: true,
            })

            const pendingFunctionCalls = new Map<string, { name: string; arguments: string; callId: string }>()
            let responseId: string | null = null

            for await (const event of response) {
              const type = event.type
              if (type === 'response.created') responseId = (event as any).response?.id ?? null

              if (type === 'response.output_item.added') {
                const item = (event as any).item
                if (item?.type === 'function_call') {
                  pendingFunctionCalls.set(item.id, { name: item.name, arguments: '', callId: item.call_id })
                  const label =
                    item.name === 'get_store_carousels' ? 'Reading your carousels...' :
                    item.name === 'search_store_products' ? 'Finding products...' :
                    item.name === 'list_active_discounts' ? 'Checking active discounts...' :
                    item.name.startsWith('propose_') ? 'Preparing changes...' : 'Working...'
                  emit({ event: 'status', phase: 'tool', text: label })
                }
              }

              if (type === 'response.function_call_arguments.delta') {
                const ev = event as any
                const fc = pendingFunctionCalls.get(ev.item_id)
                if (fc) fc.arguments += ev.delta ?? ''
              }

              if (type === 'response.output_text.delta') {
                if (!hasSignalledResponding) {
                  hasSignalledResponding = true
                  emit({ event: 'status', phase: 'responding', text: 'Composing...' })
                }
                emit({ event: 'text_delta', text: (event as any).delta ?? '' })
              }
            }

            previousResponseId = responseId
            if (pendingFunctionCalls.size === 0) break

            const toolOutputs: any[] = []
            for (const fc of pendingFunctionCalls.values()) {
              let args: any = {}
              try { args = JSON.parse(fc.arguments || '{}') } catch { /* keep {} */ }

              let result: { proposal?: GenieProposal; output: object } = { output: { error: 'Unknown tool' } }
              try {
                switch (fc.name) {
                  case 'get_store_carousels':
                    result = { output: { carousels: await getStoreCarousels(supabase, user.id) } }
                    break
                  case 'search_store_products':
                    result = { output: { products: await searchStoreProducts(supabase, user.id, (args.query ?? '').toString()) } }
                    break
                  case 'list_active_discounts':
                    result = { output: { discounts: await listActiveDiscounts(supabase, user.id) } }
                    break
                  case 'propose_carousel_layout':
                    result = await buildCarouselProposal(supabase, user.id, args)
                    break
                  case 'propose_discount':
                    result = await buildDiscountProposal(supabase, user.id, args)
                    break
                  case 'propose_remove_discount':
                    result = await buildRemoveDiscountProposal(supabase, user.id, args)
                    break
                }
              } catch (e) {
                result = { output: { error: e instanceof Error ? e.message : 'Tool failed' } }
              }

              if (result.proposal) emit({ event: 'proposal', proposal: result.proposal })
              toolOutputs.push({ type: 'function_call_output', call_id: fc.callId, output: JSON.stringify(result.output) })
            }

            if (toolOutputs.length === 0) break
            nextInput = toolOutputs
          }

          emit({ event: 'done' })
        } catch (err) {
          emit({ event: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
