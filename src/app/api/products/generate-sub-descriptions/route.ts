/**
 * Distil a short sub_description (max 2 sentences) from existing product copy.
 * Uses gpt-5.4-nano — no web search.
 *
 * POST /api/products/generate-sub-descriptions
 * Body: { productIds: string[] }
 * SSE events: start | product_start | product_complete | done | error
 */

import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const MODEL = 'gpt-5.4-nano'
const MAX_PRODUCTS_PER_REQUEST = 40

const SUB_DESCRIPTION_PROMPT = `You write short product blurbs for Yellow Jersey, an Australian cycling marketplace.

Given a product title and optional longer description, write a shopper-facing sub-description.

RULES:
- Maximum 2 sentences
- Ideally 1 sentence; use 2 only when needed
- Plain text only — no markdown, bullets, headings, or bold
- Australian English spelling
- No pricing, stock, shipping, or promotional fluff
- No URLs or brand slogans
- Focus on what the product is and the main benefit for the rider
- Keep under 220 characters when possible
- Return ONLY the sub-description text`

type ResponseOutputItem = {
  type?: string
  content?: Array<{ type?: string; text?: string }>
}

function send(controller: ReadableStreamDefaultController, encoder: TextEncoder, data: object) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
}

function extractOutputText(output: ResponseOutputItem[] | undefined): string {
  let text = ''
  for (const item of output ?? []) {
    if (item.type !== 'message') continue
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && content.text) text += content.text
    }
  }
  return text
}

function cleanSubDescription(raw: string): string {
  let text = raw.trim()
  // Strip wrapping quotes the model sometimes adds.
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1).trim()
  }
  // Drop markdown emphasis if the model ignores instructions.
  text = text.replace(/\*\*/g, '').replace(/__/g, '')
  // Cap at 2 sentences.
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text]
  text = sentences
    .slice(0, 2)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ')
  return text.slice(0, 400).trim()
}

function buildSourceText(product: {
  display_name?: string | null
  description?: string | null
  product_description?: string | null
  brand?: string | null
  manufacturer_name?: string | null
}): { source: string } | { error: string } {
  const title = (product.display_name || product.description || '').trim()
  const longCopy = (product.product_description || '').trim()
  const brand = (product.brand || product.manufacturer_name || '').trim()

  // Sub descriptions must distill the long marketing description — never invent
  // from the POS title alone.
  if (!longCopy) {
    return {
      error:
        'No product description to distill. Generate the main description first, then try again.',
    }
  }

  const parts = [
    title ? `Title: ${title}` : null,
    brand ? `Brand: ${brand}` : null,
    `Description:\n${longCopy.slice(0, 2500)}`,
  ].filter(Boolean)

  return { source: parts.join('\n') }
}

export async function POST(request: NextRequest) {
  try {
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
      const {
        data: { user },
        error: authError,
      } = await client.auth.getUser()
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
    const productIds = body.productIds as string[] | undefined

    if (!productIds?.length) {
      return new Response(JSON.stringify({ error: 'No product IDs provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (productIds.length > MAX_PRODUCTS_PER_REQUEST) {
      return new Response(
        JSON.stringify({ error: `Maximum ${MAX_PRODUCTS_PER_REQUEST} products per request` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const { data: products, error: dbError } = await supabase
      .from('products')
      .select(
        'id, description, display_name, brand, manufacturer_name, product_description',
      )
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
            const sourceResult = buildSourceText(product)

            emit({
              event: 'product_start',
              productId: product.id,
              index: i + 1,
              total: products.length,
            })

            if ('error' in sourceResult) {
              emit({
                event: 'product_complete',
                productId: product.id,
                success: false,
                sub_description: null,
                error: sourceResult.error,
              })
              continue
            }

            try {
              const response = await openai.responses.create({
                model: MODEL,
                instructions: SUB_DESCRIPTION_PROMPT,
                input: `${sourceResult.source}\n\nWrite the sub-description now.`,
              })

              const subDescription = cleanSubDescription(
                extractOutputText(response.output as ResponseOutputItem[] | undefined),
              )

              if (!subDescription) throw new Error('No sub-description generated')

              const { error: saveError } = await supabase
                .from('products')
                .update({
                  sub_description: subDescription,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', product.id)
                .eq('user_id', userId)

              emit({
                event: 'product_complete',
                productId: product.id,
                success: !saveError,
                sub_description: saveError ? null : subDescription,
                error: saveError ? 'Failed to save' : null,
              })

              if (i < products.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, 150))
              }
            } catch (err) {
              emit({
                event: 'product_complete',
                productId: product.id,
                success: false,
                sub_description: null,
                error: err instanceof Error ? err.message : 'Generation failed',
              })
            }
          }

          emit({ event: 'done' })
        } catch (err) {
          emit({
            event: 'error',
            message: err instanceof Error ? err.message : 'Unknown error',
          })
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
