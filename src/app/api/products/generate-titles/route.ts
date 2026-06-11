import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { ensureTitlePreservesSizes } from '@/lib/product-title-size-guard'
import { brandWebsiteDomain, resolveBrandWebsite } from '@/lib/bikes/brand-websites'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
// gpt-5.4-mini supports the Responses API with web_search_preview
const MODEL = 'gpt-5.4-mini'

interface ResponseWithOutput {
  output?: Array<{
    type: string
    content?: Array<{
      type: string
      text?: string
    }>
  }>
}

const TITLE_PROMPT = `You are an ecommerce product title specialist for Yellow Jersey, an Australian cycling marketplace.

You MUST search the web before generating any title. Raw product names come from a bike shop POS system and are often ALL CAPS, abbreviated, or include internal codes. Only the manufacturer's official product name (found via web search) is authoritative — never guess or invent a name.

STEPS (follow in order):
1. Search the web for the product using the raw name and brand/model if available
2. Find the manufacturer's official product page or a trusted retailer
3. Use the exact official product name as the basis for the title

TITLE RULES (apply after searching):
- Use the manufacturer's official capitalisation (e.g. Wahoo stylises as "ELEMNT", not "Elemnt")
- Include the correct model suffix/generation if found (e.g. "v2", "Gen 3", "2024")
- CRITICAL SIZE RULE: If the raw POS name or official product page includes a size, dimension, fit, capacity, speed, tooth count, width, length, diameter, wheel size, frame size, clothing size, shoe size, volume, or other variant size, the final title MUST include it.
- Never drop size details such as 700x25c, 29x2.4, 27.5x2.6, 160mm, 172.5mm, 31.8mm, 11-34T, 12-speed, 42cm, 56cm, S, M, L, XL, 500ml, 1-1/8", EU 43, or similar sizing.
- Remove generic filler words only if the real product name doesn't include them
- Keep it concise, but preserving size is more important than hitting the word target
- Australian English spelling
- Return ONLY the final title — no explanation, no quotes, no trailing punctuation

Examples of correct output:
"WAHOO ELEMNT ROAM BIKE COMPUTER" → Wahoo ELEMNT Roam GPS Computer
"SHIMANO DURA ACE R9200 CRANKSET FC-R9200" → Shimano Dura-Ace R9200 Crankset
"GARMIN EDGE 530 CYCLING COMPUTER" → Garmin Edge 530 GPS Computer
"SPECIALIZED TARMAC SL7 EXPERT DISC BICYCLE" → Specialized Tarmac SL7 Expert Disc Road Bike
"MAXXIS ARDENT RACE 29X2.2 EXO/TR" → Maxxis Ardent Race 29×2.2 Tyre`

function send(controller: ReadableStreamDefaultController, encoder: TextEncoder, data: object) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
}

function extractOutputText(response: ResponseWithOutput): string {
  let text = ''
  for (const item of response.output ?? []) {
    if (item.type !== 'message') continue
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && content.text) text += content.text
    }
  }
  return text
}

export async function POST(request: NextRequest) {
  try {
    // Support internal auth from the batch runner (no browser cookies needed)
    const internalSecret = request.headers.get('x-internal-secret')
    const internalUserId = request.headers.get('x-internal-user-id')
    const cronSecret = process.env.CRON_SECRET

    let userId: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let supabase: any

    if (cronSecret && internalSecret === cronSecret && internalUserId) {
      userId = internalUserId
      supabase = createServiceRoleClient()
    } else {
      const client = await createClient()
      const { data: { user }, error: authError } = await client.auth.getUser()
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorised' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      userId = user.id
      supabase = client
    }

    const body = await request.json()
    const { productIds }: { productIds: string[] } = body

    if (!productIds?.length) {
      return new Response(JSON.stringify({ error: 'No product IDs provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Fetch the products — must belong to this user
    const { data: products, error: dbError } = await supabase
      .from('products')
      .select('id, description, display_name, brand, model, manufacturer_name, marketplace_category, price')
      .eq('user_id', userId)
      .in('id', productIds)

    if (dbError || !products?.length) {
      return new Response(JSON.stringify({ error: 'Failed to fetch products' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        const emit = (data: object) => send(controller, encoder, data)

        try {
          emit({ event: 'start', total: products.length })

          for (let i = 0; i < products.length; i++) {
            const product = products[i]
            const rawName = product.description
            const searchTerms = [product.brand, product.model, rawName].filter(Boolean).join(' ')

            emit({ event: 'product_start', productId: product.id, index: i + 1, total: products.length })

            try {
              const brand = product.brand || (product as any).manufacturer_name || undefined
              const brandWebsite = resolveBrandWebsite(brand)
              const brandDomain = brandWebsite ? brandWebsiteDomain(brandWebsite) : null

              const context = [
                `Raw product name: ${rawName}`,
                brand && `Brand: ${brand}`,
                product.model && `Model: ${product.model}`,
                product.marketplace_category && `Category: ${product.marketplace_category}`,
                brandDomain && `Official manufacturer website: ${brandWebsite} (search site:${brandDomain} first for the exact official product name)`,
              ].filter(Boolean).join('\n')

              const response = await openai.responses.create({
                model: MODEL,
                instructions: TITLE_PROMPT,
                tools: [{ type: 'web_search_preview' as const }],
                tool_choice: 'required',
                input: `Search the web for "${searchTerms}" — prioritising the official manufacturer website${brandDomain ? ` (site:${brandDomain})` : ''} — then return the clean ecommerce title for this product:\n\n${context}\n\nReturn ONLY the title.`,
              })

              const title = ensureTitlePreservesSizes(extractOutputText(response), {
                rawTitle: rawName,
                category: product.marketplace_category,
              })

              if (!title) throw new Error('No title generated')

              // Save to DB
              const { error: saveError } = await supabase
                .from('products')
                .update({ display_name: title, updated_at: new Date().toISOString() })
                .eq('id', product.id)
                .eq('user_id', userId)

              emit({
                event: 'product_complete',
                productId: product.id,
                success: !saveError,
                title: saveError ? null : title,
                error: saveError ? 'Failed to save' : null,
              })

              if (i < products.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 300))
              }
            } catch (err) {
              emit({
                event: 'product_complete',
                productId: product.id,
                success: false,
                title: null,
                error: err instanceof Error ? err.message : 'Generation failed',
              })
            }
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
