import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const MODEL = 'gpt-5.4-mini'

const SYSTEM_PROMPT = `You are the Yellow Jersey Genius — expert AI cycling advisor on the Yellow Jersey marketplace (Australia).

ORCHESTRATION — follow this plan every time:

STEP 1 · IDENTIFY INTENT
- "in stock / available / for sale / what do you have" → search_marketplace_products
- "reviews / specs / best / compare / how to / buying advice / pricing" → web_search_preview
- Mixed intent (e.g. "best helmets in stock") → call BOTH tools
- Pure cycling knowledge (maintenance, fitting, technique) → answer directly

STEP 2 · ACT — call the right tool(s). For any product question, ALWAYS run web_search_preview to get up-to-date specs and reviews.

STEP 3 · RESPOND — synthesise web findings + marketplace results into one concise answer.

Response style — CRITICAL:
- Very concise. No fluff. Short sentences.
- NO double line breaks between list items
- **Bold** only for product names
- Simple bullet points, no nesting
- Max 2-3 sentences of prose at a time
- Products: name + price + one-line description + seller name
- Use $ for all prices

Persona: expert bike shop friend — knowledgeable, direct, not salesy.

ONLY cycling topics. Off-topic: "I only know bikes — ask me anything cycling-related!"`

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
              description: "Search Yellow Jersey's live marketplace for bikes and cycling products currently available to buy. Call this whenever the user asks what's in stock, available, for sale, or wants purchasable product recommendations.",
              strict: null,
              parameters: {
                type: 'object',
                properties: {
                  query: {
                    type: 'string',
                    description: 'Short keyword(s) — simple nouns like "bag", "helmet", "road bike". Avoid adjectives.',
                  },
                },
                required: ['query'],
              },
            },
          ]

          const firstResponse = await openai.responses.create({
            model: MODEL,
            instructions: SYSTEM_PROMPT,
            tools,
            input: inputMessages,
            stream: true,
          })

          let responseId: string | null = null
          const pendingFunctionCalls = new Map<string, { name: string; arguments: string; callId: string }>()
          let hasSignalledResponding = false
          const citations: Citation[] = []

          for await (const event of firstResponse) {
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
                pendingFunctionCalls.set(item.id, {
                  name: item.name,
                  arguments: '',
                  callId: item.call_id,
                })
                if (item.name === 'search_marketplace_products') {
                  emit({ event: 'status', phase: 'product_search', text: 'Searching the marketplace...' })
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

            // Capture citations from the completed response object
            if (type === 'response.completed') {
              const found = extractCitations((event as any).response)
              citations.push(...found)
            }
          }

          // Execute pending function calls (marketplace search)
          if (pendingFunctionCalls.size > 0 && responseId) {
            const toolOutputs: any[] = []

            for (const [, fc] of pendingFunctionCalls) {
              if (fc.name === 'search_marketplace_products') {
                try {
                  const args = JSON.parse(fc.arguments || '{}')
                  const rawQuery = (args.query ?? '').trim()
                  const stems = toStems(rawQuery)

                  const { data: allProducts } = await supabase
                    .from('marketplace_ready_products')
                    .select(`
                      id,
                      display_name,
                      description,
                      price,
                      qoh,
                      marketplace_category,
                      listing_type,
                      resolved_thumbnail_url,
                      resolved_card_url,
                      brand,
                      model,
                      condition_rating,
                      user_id
                    `)
                    .gt('qoh', 0)
                    .limit(200)

                  const matched = stems.length > 0
                    ? (allProducts ?? []).filter(p => {
                        const searchIn = [
                          p.display_name,
                          p.description,
                          p.marketplace_category,
                          p.brand,
                          p.model,
                        ].filter(Boolean).join(' ').toLowerCase()
                        return stems.some(s => searchIn.includes(s))
                      }).slice(0, 8)
                    : (allProducts ?? []).slice(0, 8)

                  if (matched.length > 0) {
                    const userIds = [...new Set(matched.map(p => p.user_id).filter(Boolean))]
                    const storeMap: Record<string, string> = {}
                    if (userIds.length > 0) {
                      const { data: stores } = await supabase
                        .from('users')
                        .select('user_id, business_name')
                        .in('user_id', userIds)
                      if (stores) {
                        for (const s of stores) {
                          if (s.business_name) storeMap[s.user_id] = s.business_name
                        }
                      }
                    }

                    const enriched = matched.map(p => ({
                      id: p.id,
                      name: p.display_name ?? p.description,
                      category: p.marketplace_category,
                      price: p.price,
                      qoh: p.qoh,
                      listing_type: p.listing_type,
                      condition: p.condition_rating,
                      image: p.resolved_thumbnail_url ?? p.resolved_card_url ?? null,
                      store_name: p.user_id ? (storeMap[p.user_id] ?? null) : null,
                    }))

                    emit({ event: 'products', products: enriched })

                    toolOutputs.push({
                      type: 'function_call_output',
                      call_id: fc.callId,
                      output: JSON.stringify({
                        found: enriched.length,
                        products: enriched.map(p => ({
                          name: p.name,
                          price: p.price ? `$${p.price.toFixed(2)}` : null,
                          quantity: p.qoh,
                          category: p.category,
                          seller: p.store_name ?? 'Unknown seller',
                          type: p.listing_type === 'store_inventory' ? 'Shop stock' : 'Private listing',
                          condition: p.condition ?? 'New',
                        })),
                      }),
                    })
                  } else {
                    toolOutputs.push({
                      type: 'function_call_output',
                      call_id: fc.callId,
                      output: JSON.stringify({
                        found: 0,
                        products: [],
                        message: 'No matching listings found right now.',
                      }),
                    })
                  }
                } catch {
                  toolOutputs.push({
                    type: 'function_call_output',
                    call_id: fc.callId,
                    output: JSON.stringify({ error: 'Search temporarily unavailable' }),
                  })
                }
              }
            }

            if (toolOutputs.length > 0) {
              if (!hasSignalledResponding) {
                hasSignalledResponding = true
                emit({ event: 'status', phase: 'responding', text: 'Composing answer...' })
              }

              const followUp = await openai.responses.create({
                model: MODEL,
                previous_response_id: responseId,
                input: toolOutputs,
                stream: true,
              })

              for await (const event of followUp) {
                if (event.type === 'response.output_text.delta') {
                  emit({ event: 'text_delta', text: (event as any).delta ?? '' })
                }
                if (event.type === 'response.completed') {
                  const found = extractCitations((event as any).response)
                  citations.push(...found)
                }
              }
            }
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
