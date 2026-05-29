import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { buildCloudinaryImageUrl, extractCloudinaryPublicId } from '@/lib/utils/cloudinary-transforms'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const MODEL = 'gpt-5.4'

const SYSTEM_PROMPT = `You are the Yellow Jersey Genius — a warm, sharp cycling expert on Yellow Jersey, Australia's bike & gear marketplace. Talk like a knowledgeable mate working the floor of a great bike shop: friendly, genuine, direct. Never robotic. Never a pushy salesperson.

YOUR GOAL
Help people make great cycling decisions. Actually understand what they need first — their riding, budget, experience, the problem they're solving. If intent is genuinely unclear, ask ONE quick clarifying question. Otherwise, just help.

TOOLS (use them silently — never say "let me search"):
- search_marketplace_products → Yellow Jersey's live, in-stock inventory. This is your home turf.
- web search → live specs, reviews, comparisons, current pricing, model-year info, technique.

HOW TO HELP
- Lean toward Yellow Jersey stock. For ANY product question — "what should I buy", "best X", "in stock", comparisons — search the marketplace FIRST and build your answer around real, in-stock listings.
- Use the web to make those picks trustworthy: pull real specs and show how the in-stock options stack up against the wider market. Blend the two — "Here's what we've got, and here's why it's a solid choice."
- If we genuinely have nothing relevant in stock, say so honestly, then give real web-informed advice.
- Pure knowledge (maintenance, fit, training, technique, rules) — answer from expertise; only web-search when it needs current or specific facts.

RECOMMENDING PRODUCTS
- Anchor on in-stock listings: name, price, condition, seller.
- Be honest about fit. Don't push a listing that doesn't match the need — that's how you earn trust.

STYLE
- Conversational and natural — write like you talk, vary your rhythm.
- Concise but not curt: enough to genuinely help, zero padding.
- Lead with the answer, then the why.
- **Bold** for product names. Simple bullets when listing options. $ for prices.
- Never output URLs or links in your text — sources are shown separately.

Cycling only. Off-topic → redirect warmly: "Ha — I'm all bikes. But ask me anything cycling and I'm your guy."`

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Citation {
  url: string
  title: string
}

function send(controller: ReadableStreamDefaultController, encoder: TextEncoder, data: object) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
}

function extractCitations(response: any): Citation[] {
  const citations: Citation[] = []
  for (const item of response?.output ?? []) {
    if (item.type !== 'message') continue
    for (const content of item.content ?? []) {
      if (content.type !== 'output_text') continue
      for (const ann of content.annotations ?? []) {
        if (ann.type === 'url_citation' && ann.url) {
          citations.push({ url: ann.url, title: ann.title ?? ann.url })
        }
      }
    }
  }
  return citations
}

// Stem keywords to handle plurals and common suffixes
function toStems(query: string): string[] {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length >= 3)
  const stems = new Set<string>()
  for (const w of words) {
    stems.add(w)
    if (w.endsWith('s') && w.length > 3) stems.add(w.slice(0, -1))
    if (w.endsWith('es') && w.length > 4) stems.add(w.slice(0, -2))
    if (w.endsWith('ing') && w.length > 6) stems.add(w.slice(0, -3))
  }
  return Array.from(stems)
}

// Search live marketplace inventory, ranked by how many query keywords each listing matches
async function runMarketplaceSearch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rawQuery: string,
) {
  const stems = toStems(rawQuery)

  const { data: allProducts } = await supabase
    .from('marketplace_ready_products')
    .select(`
      id, display_name, description, price, qoh, marketplace_category,
      listing_type, resolved_cloudinary_public_id, resolved_cloudinary_url, resolved_external_url,
      brand, model, condition_rating, user_id
    `)
    .gt('qoh', 0)
    .limit(200)

  const pool = allProducts ?? []

  // Relevance ranking: score each listing by how many query stems it contains
  const ranked = stems.length > 0
    ? pool
        .map(p => {
          const haystack = [p.display_name, p.description, p.marketplace_category, p.brand, p.model]
            .filter(Boolean).join(' ').toLowerCase()
          const score = stems.reduce((n, s) => n + (haystack.includes(s) ? 1 : 0), 0)
          return { p, score }
        })
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(x => x.p)
    : pool.slice(0, 8)

  if (ranked.length === 0) {
    return {
      products: [] as any[],
      output: { found: 0, products: [], message: 'No matching in-stock listings right now.' },
    }
  }

  // Resolve seller business names
  const userIds = [...new Set(ranked.map(p => p.user_id).filter(Boolean))]
  const storeMap: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: stores } = await supabase
      .from('users')
      .select('user_id, business_name')
      .in('user_id', userIds)
    for (const s of stores ?? []) {
      if (s.business_name) storeMap[s.user_id] = s.business_name
    }
  }

  const enriched = ranked.map(p => ({
    id: p.id,
    name: p.display_name ?? p.description,
    category: p.marketplace_category,
    price: p.price,
    qoh: p.qoh,
    listing_type: p.listing_type,
    condition: p.condition_rating,
    image: buildCloudinaryImageUrl(
      p.resolved_cloudinary_public_id ?? extractCloudinaryPublicId(p.resolved_cloudinary_url),
      'thumbnail'
    ) ?? p.resolved_external_url ?? p.resolved_cloudinary_url ?? null,
    store_name: p.user_id ? (storeMap[p.user_id] ?? null) : null,
  }))

  return {
    products: enriched,
    output: {
      found: enriched.length,
      products: enriched.map(p => ({
        name: p.name,
        price: p.price ? `$${Number(p.price).toFixed(2)}` : null,
        quantity: p.qoh,
        category: p.category,
        condition: p.condition ?? 'New',
        seller: p.store_name ?? 'Yellow Jersey seller',
        type: p.listing_type === 'store_inventory' ? 'Shop stock' : 'Private listing',
      })),
    },
  }
}

export async function POST(request: NextRequest) {
  try {
    const { messages }: { messages: Message[] } = await request.json()

    // Public client — customer-facing, no auth required
    const supabase = await createClient()
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        const emit = (data: object) => send(controller, encoder, data)

        try {
          emit({ event: 'status', phase: 'planning', text: 'Thinking...' })

          const inputMessages = messages.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }))

          const tools: any[] = [
            { type: 'web_search_preview' as const },
            {
              type: 'function' as const,
              name: 'search_marketplace_products',
              description: "Search Yellow Jersey's live, in-stock marketplace inventory. Use this FIRST for any product recommendation, comparison, or availability question so you can anchor your answer on what's actually purchasable.",
              strict: null,
              parameters: {
                type: 'object',
                properties: {
                  query: {
                    type: 'string',
                    description: 'Short keyword(s): simple nouns like "gravel bike", "helmet", "wheelset". Avoid adjectives and full sentences.',
                  },
                },
                required: ['query'],
              },
            },
          ]

          // ── Agentic loop ──────────────────────────────────────────────────
          // The model can chain tools across turns (e.g. marketplace → web →
          // answer). We feed tool results back in and let it keep reasoning,
          // capped at MAX_ITERATIONS. Tools are dropped on the final turn to
          // guarantee a written answer.
          const MAX_ITERATIONS = 4
          let previousResponseId: string | null = null
          let nextInput: any = inputMessages
          let hasSignalledResponding = false
          const citations: Citation[] = []

          for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
            const isLastIteration = iteration === MAX_ITERATIONS - 1

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const response: any = await openai.responses.create({
              model: MODEL,
              instructions: SYSTEM_PROMPT,
              ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
              ...(isLastIteration ? {} : { tools }),
              input: nextInput,
              stream: true,
            })

            const pendingFunctionCalls = new Map<string, { name: string; arguments: string; callId: string }>()
            let responseId: string | null = null

            for await (const event of response) {
              const type = event.type

              if (type === 'response.created') {
                responseId = (event as any).response?.id ?? null
              }

              if (type === 'response.web_search_call.in_progress') {
                emit({ event: 'status', phase: 'web_search', text: 'Searching the web...' })
              }
              if (type === 'response.web_search_call.searching') {
                emit({ event: 'status', phase: 'web_search', text: 'Browsing cycling resources...' })
              }
              if (type === 'response.web_search_call.completed') {
                emit({ event: 'status', phase: 'web_search_done', text: 'Web research done' })
              }

              if (type === 'response.output_item.added') {
                const item = (event as any).item
                if (item?.type === 'function_call') {
                  pendingFunctionCalls.set(item.id, { name: item.name, arguments: '', callId: item.call_id })
                  if (item.name === 'search_marketplace_products') {
                    emit({ event: 'status', phase: 'product_search', text: 'Checking the marketplace...' })
                  }
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
                  emit({ event: 'status', phase: 'responding', text: 'Composing answer...' })
                }
                emit({ event: 'text_delta', text: (event as any).delta ?? '' })
              }

              if (type === 'response.completed') {
                citations.push(...extractCitations((event as any).response))
              }
            }

            previousResponseId = responseId

            // No tool calls → the model has produced its final answer
            if (pendingFunctionCalls.size === 0) break

            // Run marketplace searches and feed the results back for the next turn
            const toolOutputs: any[] = []
            for (const fc of pendingFunctionCalls.values()) {
              if (fc.name === 'search_marketplace_products') {
                try {
                  const args = JSON.parse(fc.arguments || '{}')
                  const { products, output } = await runMarketplaceSearch(supabase, (args.query ?? '').trim())
                  if (products.length > 0) emit({ event: 'products', products })
                  toolOutputs.push({ type: 'function_call_output', call_id: fc.callId, output: JSON.stringify(output) })
                } catch {
                  toolOutputs.push({
                    type: 'function_call_output',
                    call_id: fc.callId,
                    output: JSON.stringify({ error: 'Search temporarily unavailable' }),
                  })
                }
              }
            }

            if (toolOutputs.length === 0) break
            nextInput = toolOutputs
          }

          // Emit deduplicated citations as source pills
          if (citations.length > 0) {
            const seen = new Set<string>()
            const unique = citations.filter(c => {
              if (seen.has(c.url)) return false
              seen.add(c.url)
              return true
            })
            emit({ event: 'sources', sources: unique })
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
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
