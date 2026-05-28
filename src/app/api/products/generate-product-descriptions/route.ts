import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const MODEL = 'gpt-5.4-mini'

const DESCRIPTION_PROMPT = `You are an expert ecommerce copywriter for Yellow Jersey, an Australian online cycling marketplace.

Write compelling, conversion-optimised product descriptions for cycling products. Use web search to find accurate specifications, key features, and unique selling points for each product.

RULES:
- Benefits-first language — focus on what it does for the rider, not just what it is
- Australian English spelling (colour, aluminium, tyres, etc.)
- Under 200 words total
- No pricing mentions
- No promotional fluff ("amazing", "incredible", "revolutionary")
- Authoritative, knowledgeable tone — like an expert bike shop staff member
- Accurate specs sourced from manufacturer data via web search
- Use **bold** for product names, key component names, and standout specs inline
- NEVER include URLs, website addresses, domain names, or source citations of any kind

FORMAT (use exactly this structure, with no preamble or extra text):
[2-3 sentence opening paragraph using **bold** for the product name and key terms]

**Key Features**
• **[Component or feature name]** — [benefit to the rider]
• **[Component or feature name]** — [benefit to the rider]
• **[Component or feature name]** — [benefit to the rider]
• **[Component or feature name]** — [benefit to the rider]
[• **[Additional feature]** — [benefit] if warranted]

[1 sentence about the ideal rider or primary use case, with **bold** on the rider type]`

// Used when specs are generated AFTER a description (reuses web search context via previous_response_id)
const SPECS_CHAINED_PROMPT = `You are a technical cycling product specialist. Using the product information and web search results already in context, produce a comprehensive, accurate specification sheet.

RULES:
- Group specs into logical sections relevant to the product type (see FORMAT below)
- Every spec must be accurate — only include what you know from manufacturer data
- Use exact model numbers, measurements, and material names where known
- Australian English spelling (colour, aluminium, tyres, etc.)
- NEVER include URLs, website addresses, domain names, or source citations of any kind
- NEVER guess or fabricate specs — omit a spec entirely rather than guess

FORMAT for COMPLETE BIKES (use all relevant sections):
**Frame & Fork**
• Frame: [material, construction, key technologies]
• Fork: [material, steerer diameter, axle standard]
• Headset: [type and dimensions]

**Drivetrain**
• Shifters: [brand, model, speed]
• Front derailleur: [brand and model]
• Rear derailleur: [brand and model]
• Crankset: [brand, model, chainring sizes]
• Cassette: [brand, model, range, speed]
• Chain: [brand and model]
• Bottom bracket: [type and standard]

**Brakes**
• Brakes: [type, brand and model]
• Rotors: [size and model, if disc]

**Wheels & Tyres**
• Wheelset: [brand and model]
• Tyres: [brand, model, size, type]

**Cockpit**
• Handlebar: [brand, model, clamp diameter]
• Stem: [brand, model, angle]
• Bar tape / grips: [brand and model]
• Seatpost: [material, offset]
• Saddle: [brand and model]

**General**
• Weight: [complete weight at a specific size]
• Sizes available: [full range]
• Colours: [available colourways]

FORMAT for PARTS & COMPONENTS (use relevant sections only):
**Specifications**
• [Key spec]: [value — dimensions, weight, material, speeds, ratios, etc.]

**Compatibility**
• [What it works with — groupsets, standards, frame types, etc.]

FORMAT for APPAREL:
**Materials**
• [Shell / main fabric composition]
• [Lining or padding details]

**Fit & Sizing**
• Cut: [race / endurance / casual]
• Sizes: [full range]
• [Key dimension at a reference size]

**Features**
• [Notable technical features, pockets, closures, UPF rating, etc.]

FORMAT for ACCESSORIES & OTHER:
**Specifications**
• [Key spec]: [value — dimensions, weight, capacity, materials, etc.]

**Compatibility**
• [Bike types, standards, or use cases it suits]

Return ONLY the spec sheet — no preamble, no summary, no extra text.`

// Used when specs are generated STANDALONE (no prior description call — performs its own web search)
const SPECS_STANDALONE_PROMPT = `You are a technical cycling product specialist. Search the web for accurate manufacturer data and produce a comprehensive, accurate specification sheet for the given product.

RULES:
- Use web search to find official manufacturer specifications
- Group specs into logical sections relevant to the product type (see FORMAT below)
- Every spec must be accurate — only include what you find from manufacturer data
- Use exact model numbers, measurements, and material names where known
- Australian English spelling (colour, aluminium, tyres, etc.)
- NEVER include URLs, website addresses, domain names, or source citations of any kind
- NEVER guess or fabricate specs — omit a spec entirely rather than guess

FORMAT for COMPLETE BIKES (use all relevant sections):
**Frame & Fork**
• Frame: [material, construction, key technologies]
• Fork: [material, steerer diameter, axle standard]
• Headset: [type and dimensions]

**Drivetrain**
• Shifters: [brand, model, speed]
• Front derailleur: [brand and model]
• Rear derailleur: [brand and model]
• Crankset: [brand, model, chainring sizes]
• Cassette: [brand, model, range, speed]
• Chain: [brand and model]
• Bottom bracket: [type and standard]

**Brakes**
• Brakes: [type, brand and model]
• Rotors: [size and model, if disc]

**Wheels & Tyres**
• Wheelset: [brand and model]
• Tyres: [brand, model, size, type]

**Cockpit**
• Handlebar: [brand, model, clamp diameter]
• Stem: [brand, model, angle]
• Bar tape / grips: [brand and model]
• Seatpost: [material, offset]
• Saddle: [brand and model]

**General**
• Weight: [complete weight at a specific size]
• Sizes available: [full range]
• Colours: [available colourways]

FORMAT for PARTS & COMPONENTS (use relevant sections only):
**Specifications**
• [Key spec]: [value — dimensions, weight, material, speeds, ratios, etc.]

**Compatibility**
• [What it works with — groupsets, standards, frame types, etc.]

FORMAT for APPAREL:
**Materials**
• [Shell / main fabric composition]
• [Lining or padding details]

**Fit & Sizing**
• Cut: [race / endurance / casual]
• Sizes: [full range]
• [Key dimension at a reference size]

**Features**
• [Notable technical features, pockets, closures, UPF rating, etc.]

FORMAT for ACCESSORIES & OTHER:
**Specifications**
• [Key spec]: [value — dimensions, weight, capacity, materials, etc.]

**Compatibility**
• [Bike types, standards, or use cases it suits]

Return ONLY the spec sheet — no preamble, no summary, no extra text.`

function send(controller: ReadableStreamDefaultController, encoder: TextEncoder, data: object) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
}

function sanitise(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\(https?:\/\/[^\)]+\)/g, '$1')
    .replace(/https?:\/\/[^\s\])"',]+/g, '')
    .replace(/\(?(?:source|via|from|see|ref(?:erence)?):?\s*[\w.-]+\.[a-z]{2,}[^\s)]*\)?/gi, '')
    .replace(/\s+[,.:]\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorised' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const body = await request.json()
    const {
      productIds,
      mode = 'both',
    }: { productIds: string[]; mode?: 'both' | 'description' | 'specs' } = body

    if (!productIds?.length) {
      return new Response(JSON.stringify({ error: 'No product IDs provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const runDesc = mode === 'both' || mode === 'description'
    const runSpecs = mode === 'both' || mode === 'specs'

    const { data: products, error: dbError } = await supabase
      .from('products')
      .select('id, description, display_name, brand, model, marketplace_category, price, bike_type, frame_size, condition_rating')
      .eq('user_id', user.id)
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
            const productName = (product as any).display_name || product.description

            emit({
              event: 'product_start',
              productId: product.id,
              name: productName,
              index: i + 1,
              total: products.length,
            })

            try {
              const details = [
                `Product: ${productName}`,
                (product as any).brand && `Brand: ${(product as any).brand}`,
                (product as any).model && `Model: ${(product as any).model}`,
                (product as any).marketplace_category && `Category: ${(product as any).marketplace_category}`,
                (product as any).bike_type && `Type: ${(product as any).bike_type}`,
                (product as any).frame_size && `Size: ${(product as any).frame_size}`,
                product.description && product.description !== productName && `Original description: ${product.description}`,
              ].filter(Boolean).join('\n')

              const searchTerms = [
                (product as any).brand,
                (product as any).model,
                productName,
              ].filter(Boolean).join(' ')

              let description: string = ''
              let specs: string = ''
              let descResponseId: string | null = null

              // ── Description ──────────────────────────────────────────
              if (runDesc) {
                emit({ event: 'product_phase', productId: product.id, phase: 'description' })

                const descResponse = await openai.responses.create({
                  model: MODEL,
                  instructions: DESCRIPTION_PROMPT,
                  tools: [{ type: 'web_search_preview' as const }],
                  input: `Write an ecommerce product description for this cycling product:\n\n${details}\n\nSearch for "${searchTerms}" to find accurate specifications and features. Return ONLY the formatted description text — no preamble, no labels, no metadata.`,
                })

                for (const item of descResponse.output ?? []) {
                  if (item.type === 'message') {
                    for (const content of (item as any).content ?? []) {
                      if (content.type === 'output_text') description += content.text
                    }
                  }
                }
                description = sanitise(description)
                descResponseId = descResponse.id
              }

              // ── Specs ─────────────────────────────────────────────────
              if (runSpecs) {
                emit({ event: 'product_phase', productId: product.id, phase: 'specs' })

                let specsResponse

                if (runDesc && descResponseId) {
                  // Chain off description — reuse web search context, no extra search needed
                  specsResponse = await openai.responses.create({
                    model: MODEL,
                    instructions: SPECS_CHAINED_PROMPT,
                    previous_response_id: descResponseId,
                    input: `Now produce the full specification sheet for the same product using the web search results already in context. Return ONLY the formatted spec sheet — no preamble, no extra text.`,
                  })
                } else {
                  // Standalone — run its own web search
                  specsResponse = await openai.responses.create({
                    model: MODEL,
                    instructions: SPECS_STANDALONE_PROMPT,
                    tools: [{ type: 'web_search_preview' as const }],
                    input: `Produce a full specification sheet for this cycling product:\n\n${details}\n\nSearch for "${searchTerms}" to find accurate manufacturer specifications. Return ONLY the formatted spec sheet — no preamble, no extra text.`,
                  })
                }

                for (const item of specsResponse.output ?? []) {
                  if (item.type === 'message') {
                    for (const content of (item as any).content ?? []) {
                      if (content.type === 'output_text') specs += content.text
                    }
                  }
                }
                specs = sanitise(specs)
              }

              // ── Save ──────────────────────────────────────────────────
              const updateData: Record<string, string> = {}
              if (description) updateData.product_description = description
              if (specs) updateData.product_specs = specs

              let saveError: string | null = null

              if (Object.keys(updateData).length > 0) {
                const { error: dbSaveErr } = await supabase
                  .from('products')
                  .update(updateData)
                  .eq('id', product.id)
                  .eq('user_id', user.id)

                if (dbSaveErr) {
                  // Fallback: try description-only if combined save fails
                  if (description) {
                    const { error: fallbackErr } = await supabase
                      .from('products')
                      .update({ product_description: description })
                      .eq('id', product.id)
                      .eq('user_id', user.id)
                    if (fallbackErr) saveError = 'Failed to save'
                  } else {
                    saveError = 'Failed to save'
                  }
                }
              }

              emit({
                event: 'product_complete',
                productId: product.id,
                success: !saveError && !!(description || specs),
                description: description || null,
                specs: specs || null,
                error: saveError,
              })

              if (i < products.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 400))
              }
            } catch (err) {
              emit({
                event: 'product_complete',
                productId: product.id,
                success: false,
                description: null,
                specs: null,
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
