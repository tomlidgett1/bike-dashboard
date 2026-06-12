import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import type { Stream } from 'openai/core/streaming'
import type {
  Response as OpenAIResponse,
  ResponseInput,
  ResponseStreamEvent,
  Tool,
} from 'openai/resources/responses/responses'
import { createClient } from '@/lib/supabase/server'
import { compactGenieProgressText } from '@/lib/genie/progress-text'
import { runMarketplaceSearch } from '@/lib/genie/marketplace-search'
import { searchWebImages, maybeSearchWebImagesForUserMessage } from '@/lib/genie/web-image-search'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const MODEL = 'gpt-5.4'
const STREAM_HEARTBEAT_MS = 15_000

const SYSTEM_PROMPT = `You are the Yellow Jersey Genius — a warm, sharp cycling expert on Yellow Jersey, Australia's bike & gear marketplace. Talk like a knowledgeable mate working the floor of a great bike shop: friendly, genuine, direct. Never robotic. Never a pushy salesperson.

YOUR GOAL
Help people make great cycling decisions. Actually understand what they need first — their riding, budget, experience, the problem they're solving. If intent is genuinely unclear, ask ONE quick clarifying question. Otherwise, just help.

ANSWER QUALITY
- Be concise and structured by default: one direct verdict line, then 1-3 labelled bullets only if needed.
- Only go long for fit, compatibility, safety, detailed comparisons, or when the user asks for depth.
- Start with the answer, not setup. Avoid generic caveats, padded intros, and shopping-guide filler.
- For yes/no questions, lead with "Yes", "No", "Probably", or "I'd be cautious" before context.
- Make every reply decision-useful: fit, value, compatibility, likely catch, or the next thing to verify.

RESPONSE STRUCTURE
- For simple questions: one sentence only.
- For recommendations or judgements, use:
  **Verdict:** ...
  **Why:** ...
  **Check:** ... (only if something needs verifying)
- For multiple options, use 2-4 bullets. For real comparisons, use a tiny table.
- Never write more than ~90 words unless the user asks for detail or safety/fit/compatibility requires it.

TOOLS (use them silently — never say "let me search"):
- search_marketplace_products → Yellow Jersey's live, in-stock inventory. This is your home turf.
- search_web_images → find reference photos from the web when the user wants to SEE something: bike models, parts, gear, colours, setup examples, "what does X look like", "show me pictures of". Use 1–3 focused queries for identifiable items. Do NOT use for rankings, analytics, or abstract questions with no visual subject.
- web search → live specs, reviews, comparisons, current pricing, model-year info, technique.

HOW TO HELP
- Lean toward Yellow Jersey stock. For ANY product question — "what should I buy", "best X", "in stock", comparisons — search the marketplace FIRST and build your answer around real, in-stock listings.
- Use the web to make those picks trustworthy: pull real specs and show how the in-stock options stack up against the wider market. Blend the two — "Here's what we've got, and here's why it's a solid choice."
- If we genuinely have nothing relevant in stock, say so honestly, then give real web-informed advice.
- Pure knowledge (maintenance, fit, training, technique, rules) — answer from expertise; only web-search when it needs current or specific facts.

RECOMMENDING PRODUCTS
- Anchor on in-stock listings: name, price, condition, seller.
- Be honest about fit. Don't push a listing that doesn't match the need — that's how you earn trust.
- Listing metadata can be wrong. If a title, category, brand/model, year, or spec looks inconsistent with the product name or credible OEM info, say so briefly: "One thing I'd double-check: ..."
- Don't invent corrections. Flag what looks off and what should be verified.

STYLE
- Conversational and natural — write like you talk, but keep it tight.
- Concise but not curt: enough to genuinely help, zero padding. Most replies should fit in 1-4 lines.
- Lead with the answer, then the why.
- **Bold** for product names. Simple bullets when listing options. $ for prices.
- Avoid paragraph blocks. Prefer labelled lines: **Verdict:**, **Why:**, **Check:**, **Options:**.
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

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(1, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes <= 0) return `${seconds}s`
  if (seconds === 0) return `${minutes}m`
  return `${minutes}m ${seconds}s`
}

function extractCitations(response: OpenAIResponse | null | undefined): Citation[] {
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

export async function POST(request: NextRequest) {
  try {
    const { messages }: { messages: Message[] } = await request.json()

    // Public client — customer-facing, no auth required
    const supabase = await createClient()
    const encoder = new TextEncoder()
    const requestStartedAt = Date.now()

    const stream = new ReadableStream({
      async start(controller) {
        let lastStatusKey = ''
        let streamClosed = false
        const write = (data: object) => {
          if (streamClosed) return
          send(controller, encoder, data)
        }
        const emit = (data: object) => {
          if ('event' in data && data.event === 'status') {
            const status = data as { phase?: unknown; text?: unknown }
            const phase = String(status.phase ?? '')
            const text = compactGenieProgressText(String(status.text ?? ''), phase)
            const key = `${phase}:${text}`
            if (key === lastStatusKey) return
            lastStatusKey = key
            write({ event: 'status', phase, text })
            return
          }
          write(data)
        }
        const heartbeatTimer = setInterval(() => {
          const elapsedMs = Date.now() - requestStartedAt
          try {
            write({
              event: 'heartbeat',
              elapsed_ms: elapsedMs,
              text: `Still working (${formatElapsed(elapsedMs)})`,
            })
          } catch (error) {
            streamClosed = true
            clearInterval(heartbeatTimer)
            console.warn('[Genie] heartbeat stream closed', {
              error: error instanceof Error ? error.message : String(error),
            })
          }
        }, STREAM_HEARTBEAT_MS)

        try {
          emit({ event: 'status', phase: 'planning', text: 'Thinking' })

          const latestUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''
          const autoWebImages = await maybeSearchWebImagesForUserMessage(latestUserMessage)
          if (autoWebImages) {
            emit({ event: 'status', phase: 'image_search', text: 'Finding images' })
            emit({ event: 'web_images', images: autoWebImages.images, query: autoWebImages.query })
            emit({ event: 'status', phase: 'image_search_done', text: 'Images ready' })
          }

          const inputMessages = messages.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }))

          const tools: Tool[] = [
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
            {
              type: 'function' as const,
              name: 'search_web_images',
              description: 'Search the web for reference product or cycling photos when the user wants to see what something looks like. Use for specific bikes, parts, gear, colours, or setup examples — not for analytics or broad lists.',
              strict: null,
              parameters: {
                type: 'object',
                properties: {
                  query: {
                    type: 'string',
                    description: 'Specific visual search, e.g. "2024 Trek Fuel EX 8", "Shimano XT rear derailleur", "gravel bike setup photos".',
                  },
                  limit: {
                    type: 'integer',
                    description: 'Number of images to return (1–6). Defaults to 4.',
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
          let nextInput: ResponseInput = inputMessages
          const citations: Citation[] = []

          for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
            const isLastIteration = iteration === MAX_ITERATIONS - 1

            const response: Stream<ResponseStreamEvent> = await openai.responses.create({
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
                responseId = event.response?.id ?? null
              }

              if (type === 'response.web_search_call.in_progress') {
                emit({ event: 'status', phase: 'web_search', text: 'Searching web' })
              }
              if (type === 'response.web_search_call.searching') {
                emit({ event: 'status', phase: 'web_search', text: 'Searching web' })
              }
              if (type === 'response.web_search_call.completed') {
                emit({ event: 'status', phase: 'web_search_done', text: 'Web search done' })
              }

              if (type === 'response.output_item.added') {
                const item = event.item
                if (item?.type === 'function_call' && item.id && item.call_id) {
                  pendingFunctionCalls.set(item.id, { name: item.name, arguments: '', callId: item.call_id })
                  if (item.name === 'search_marketplace_products') {
                    emit({ event: 'status', phase: 'product_search', text: 'Marketplace' })
                  }
                  if (item.name === 'search_web_images') {
                    emit({ event: 'status', phase: 'image_search', text: 'Finding images' })
                  }
                }
              }

              if (type === 'response.function_call_arguments.delta') {
                const fc = pendingFunctionCalls.get(event.item_id)
                if (fc) fc.arguments += event.delta ?? ''
              }

              if (type === 'response.output_text.delta') {
                emit({ event: 'text_delta', text: event.delta ?? '' })
              }

              if (type === 'response.completed') {
                citations.push(...extractCitations(event.response))
              }
            }

            previousResponseId = responseId

            // No tool calls → the model has produced its final answer
            if (pendingFunctionCalls.size === 0) break

            // Run marketplace searches and feed the results back for the next turn
            const toolOutputs: ResponseInput = []
            for (const fc of pendingFunctionCalls.values()) {
              if (fc.name === 'search_marketplace_products') {
                try {
                  const args = JSON.parse(fc.arguments || '{}') as { query?: unknown }
                  const query = typeof args.query === 'string' ? args.query.trim() : ''
                  const { products, output } = await runMarketplaceSearch(supabase, query)
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
              if (fc.name === 'search_web_images') {
                try {
                  const args = JSON.parse(fc.arguments || '{}') as { query?: unknown; limit?: unknown }
                  const query = typeof args.query === 'string' ? args.query.trim() : ''
                  const limit = typeof args.limit === 'number' ? args.limit : undefined
                  const result = await searchWebImages(query, { limit })
                  if (result.images.length > 0) {
                    emit({ event: 'web_images', images: result.images, query: result.query })
                  }
                  emit({ event: 'status', phase: 'image_search_done', text: 'Images ready' })
                  toolOutputs.push({
                    type: 'function_call_output',
                    call_id: fc.callId,
                    output: JSON.stringify({
                      query: result.query,
                      found: result.images.length,
                      images: result.images.map(image => ({
                        title: image.title,
                        domain: image.domain,
                      })),
                      message: result.message,
                    }),
                  })
                } catch {
                  toolOutputs.push({
                    type: 'function_call_output',
                    call_id: fc.callId,
                    output: JSON.stringify({ error: 'Image search temporarily unavailable' }),
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
          try {
            emit({ event: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
          } catch {
            streamClosed = true
          }
        } finally {
          clearInterval(heartbeatTimer)
          if (!streamClosed) {
            streamClosed = true
            try {
              controller.close()
            } catch {
              // Client already disconnected.
            }
          }
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
