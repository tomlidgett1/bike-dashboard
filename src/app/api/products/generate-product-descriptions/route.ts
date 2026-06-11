import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import {
  brandWebsiteDomain,
  isOfficialBrandUrl,
  resolveBrandWebsite,
} from '@/lib/bikes/brand-websites'
import { isOfficialSpecSourceUrl } from '@/lib/bikes/official-spec-sources'
import { detectBicycleProduct } from '@/lib/ai/detect-bicycle-product'
import {
  buildBikeSpecsFromProductSpecs,
  syncBikeSpecsFromProductSpecs,
} from '@/lib/bikes/sync-bike-specs-from-product-specs'
import type { BikeSpecsData } from '@/lib/types/bike-specs'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
// Full model for manufacturer-grade detail (matches the bike specs build-out)
const MODEL = 'gpt-5.4'

interface SpecSource {
  url: string
  title: string
  is_official_brand: boolean
}

type ResponseOutputItem = {
  type?: string
  content?: Array<{
    type?: string
    text?: string
    annotations?: Array<{
      type?: string
      url?: string
      title?: string
    }>
  }>
}

const DESCRIPTION_PROMPT = `You are an expert ecommerce copywriter for Yellow Jersey, an Australian online cycling marketplace.

Write compelling, conversion-optimised product descriptions for cycling products. You MUST use web search to confirm accurate specifications, key features, and unique selling points — and you must prioritise the manufacturer's official website.

SEARCH STRATEGY (follow in order):
1. Identify the brand and its official website (you may be given the official brand URL and domain).
2. Search the official manufacturer website FIRST using site: queries on that domain.
3. Open the official product/technology page for the exact model to confirm features and specs.
4. Only fall back to a reputable source if the official site has no page for this exact product.

RULES:
- Benefits-first language — focus on what it does for the rider, not just what it is
- Australian English spelling (colour, aluminium, tyres, etc.)
- Under 200 words total
- No pricing mentions
- No promotional fluff ("amazing", "incredible", "revolutionary")
- Authoritative, knowledgeable tone — like an expert bike shop staff member
- Accurate specs sourced from the manufacturer's official data via web search
- Use **bold** for product names, key component names, and standout specs inline
- NEVER include URLs, website addresses, domain names, or source citations inside the copy text — sources are recorded separately

FORMAT (use exactly this structure, with no preamble or extra text):
[2-3 sentence opening paragraph using **bold** for the product name and key terms]

**Key Features**
• **[Component or feature name]** — [benefit to the rider]
• **[Component or feature name]** — [benefit to the rider]
• **[Component or feature name]** — [benefit to the rider]
• **[Component or feature name]** — [benefit to the rider]
[• **[Additional feature]** — [benefit] if warranted]

[1 sentence about the ideal rider or primary use case, with **bold** on the rider type]`

// Shared spec-sheet formatting guidance, reused by chained + standalone prompts.
const SPECS_FORMAT = `Group specs into logical sections relevant to the product type. Be thorough — include every component-level detail the manufacturer publishes.

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
• [Key spec]: [value — model number, dimensions, weight, material, speeds, ratios, etc.]

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

// Used when specs are generated AFTER a description (reuses web search context via previous_response_id)
const SPECS_CHAINED_PROMPT = `You are a technical cycling product specialist. Using the product information and web search results already in context — prioritising the manufacturer's official website — produce a comprehensive, accurate specification sheet.

RULES:
- Every spec must be accurate and verified against the manufacturer's official data — only include what you know
- Use exact model numbers, measurements, and material names where known
- Australian English spelling (colour, aluminium, tyres, etc.)
- NEVER include URLs, website addresses, domain names, or source citations inside the spec text
- NEVER guess or fabricate specs — omit a spec entirely rather than guess

${SPECS_FORMAT}`

// Used when specs are generated STANDALONE (no prior description call — performs its own web search)
const SPECS_STANDALONE_PROMPT = `You are a technical cycling product specialist. Search the web — the manufacturer's official website FIRST (use site: queries on the brand domain) — and produce a comprehensive, accurate specification sheet for the given product.

RULES:
- Search the official manufacturer website first; only fall back to a reputable source if the official site lacks a page for this exact product
- Every spec must be accurate — only include what you find from official manufacturer data
- Use exact model numbers, measurements, and material names where known
- Australian English spelling (colour, aluminium, tyres, etc.)
- NEVER include URLs, website addresses, domain names, or source citations inside the spec text
- NEVER guess or fabricate specs — omit a spec entirely rather than guess

${SPECS_FORMAT}`

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

function collectText(output: ResponseOutputItem[] | undefined): string {
  let text = ''
  for (const item of output ?? []) {
    if (item.type !== 'message') continue
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && content.text) text += content.text
    }
  }
  return text
}

function collectCitations(
  output: ResponseOutputItem[] | undefined,
  into: Map<string, string>,
) {
  for (const item of output ?? []) {
    if (item.type !== 'message') continue
    for (const content of item.content ?? []) {
      for (const ann of content.annotations ?? []) {
        if (ann.type === 'url_citation' && ann.url && !into.has(ann.url)) {
          into.set(ann.url, ann.title || ann.url)
        }
      }
    }
  }
}

// Classify citations as official (brand or component manufacturer), rank official-first, cap.
function rankSources(
  citations: Map<string, string>,
  brand: string | undefined,
  productName: string,
): SpecSource[] {
  const sources: SpecSource[] = []
  for (const [url, title] of citations) {
    const official =
      isOfficialBrandUrl(url, brand) ||
      isOfficialSpecSourceUrl(url, { bikeBrand: brand, specValue: productName })
    sources.push({ url, title, is_official_brand: official })
  }

  sources.sort((a, b) => Number(b.is_official_brand) - Number(a.is_official_brand))

  const hasOfficial = sources.some((s) => s.is_official_brand)
  // Prefer official sources; if any official exist, drop unofficial noise.
  const filtered = hasOfficial ? sources.filter((s) => s.is_official_brand) : sources

  return filtered.slice(0, 6)
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
    const {
      productIds,
      mode = 'both',
      bicycleOverrides = {},
    }: {
      productIds: string[]
      mode?: 'both' | 'description' | 'specs' | 'bicycle'
      bicycleOverrides?: Record<string, boolean>
    } = body

    if (!productIds?.length) {
      return new Response(JSON.stringify({ error: 'No product IDs provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const runBicycleOnly = mode === 'bicycle'
    const runDesc = !runBicycleOnly && (mode === 'both' || mode === 'description')
    const runSpecs = !runBicycleOnly && (mode === 'both' || mode === 'specs')

    const { data: products, error: dbError } = await supabase
      .from('products')
      .select('id, description, display_name, brand, model, manufacturer_name, marketplace_category, price, bike_type, frame_size, condition_rating, is_bicycle, bike_specs, product_specs, product_spec_sources')
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
            const productName = (product as any).display_name || product.description
            const brand = (product as any).brand || (product as any).manufacturer_name || undefined
            const brandWebsite = resolveBrandWebsite(brand)
            const brandDomain = brandWebsite ? brandWebsiteDomain(brandWebsite) : null

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
                brand && `Brand: ${brand}`,
                (product as any).model && `Model: ${(product as any).model}`,
                (product as any).marketplace_category && `Category: ${(product as any).marketplace_category}`,
                (product as any).bike_type && `Type: ${(product as any).bike_type}`,
                (product as any).frame_size && `Size: ${(product as any).frame_size}`,
                product.description && product.description !== productName && `Original description: ${product.description}`,
              ].filter(Boolean).join('\n')

              if (runBicycleOnly) {
                emit({ event: 'product_phase', productId: product.id, phase: 'bicycle' })

                const detectionContext = [
                  details,
                  (product as { product_description?: string | null }).product_description &&
                    `Description:\n${(product as { product_description?: string | null }).product_description!.slice(0, 600)}`,
                  (product as { product_specs?: string | null }).product_specs &&
                    `Specs:\n${(product as { product_specs?: string | null }).product_specs!.slice(0, 800)}`,
                ]
                  .filter(Boolean)
                  .join('\n\n')

                const detection = await detectBicycleProduct(openai, detectionContext)
                const isBicycle =
                  product.id in bicycleOverrides
                    ? !!bicycleOverrides[product.id]
                    : detection.is_bicycle

                const existingSources =
                  ((product as { product_spec_sources?: SpecSource[] | null })
                    .product_spec_sources ?? []) as SpecSource[]

                let bikeSpecs: BikeSpecsData | null = null
                if (isBicycle) {
                  bikeSpecs = syncBikeSpecsFromProductSpecs({
                    productSpecs: (product as { product_specs?: string | null }).product_specs,
                    existingBikeSpecs: (product as { bike_specs?: unknown }).bike_specs,
                    productSpecSources: existingSources,
                    brand,
                  })
                }

                const updateData: Record<string, unknown> = { is_bicycle: isBicycle }
                if (bikeSpecs) updateData.bike_specs = bikeSpecs

                let saveError: string | null = null
                const { error: dbSaveErr } = await supabase
                  .from('products')
                  .update(updateData)
                  .eq('id', product.id)
                  .eq('user_id', userId)

                if (dbSaveErr) saveError = 'Failed to save bicycle classification'

                emit({
                  event: 'product_complete',
                  productId: product.id,
                  success: !saveError,
                  description: null,
                  specs: null,
                  sources: [],
                  bicycle_detected: true,
                  is_bicycle: isBicycle,
                  bicycle_confidence: detection.confidence,
                  bike_specs: bikeSpecs,
                  error: saveError,
                })

                if (i < products.length - 1) {
                  await new Promise(resolve => setTimeout(resolve, 200))
                }
                continue
              }

              const searchTerms = [brand, (product as any).model, productName]
                .filter(Boolean)
                .join(' ')

              const officialSearchBlock = brandDomain
                ? `Official manufacturer website (search this first): ${brandWebsite} (domain: ${brandDomain})\nRun site:${brandDomain} "${(product as any).model || productName}" before any other source.`
                : `Identify the manufacturer's official website, then search that domain first before any other source.`

              let description = ''
              let specs = ''
              let descResponseId: string | null = null
              const citations = new Map<string, string>()

              // ── Description ──────────────────────────────────────────
              if (runDesc) {
                emit({ event: 'product_phase', productId: product.id, phase: 'description' })

                const descResponse = await openai.responses.create({
                  model: MODEL,
                  instructions: DESCRIPTION_PROMPT,
                  tools: [
                    {
                      type: 'web_search_preview' as const,
                      search_context_size: 'high' as const,
                      user_location: { type: 'approximate' as const, country: 'AU' },
                    },
                  ],
                  input: `Write an ecommerce product description for this cycling product:\n\n${details}\n\n${officialSearchBlock}\nSearch for "${searchTerms}" to confirm accurate specifications and features. Return ONLY the formatted description text — no preamble, no labels, no metadata.`,
                })

                description = sanitise(collectText(descResponse.output as ResponseOutputItem[] | undefined))
                collectCitations(descResponse.output as ResponseOutputItem[] | undefined, citations)
                descResponseId = descResponse.id
              }

              // ── Specs ─────────────────────────────────────────────────
              if (runSpecs) {
                emit({ event: 'product_phase', productId: product.id, phase: 'specs' })

                let specsResponse

                if (runDesc && descResponseId) {
                  // Chain off description — reuse official web search context
                  specsResponse = await openai.responses.create({
                    model: MODEL,
                    instructions: SPECS_CHAINED_PROMPT,
                    previous_response_id: descResponseId,
                    input: `Now produce the full specification sheet for the same product using the official web search results already in context. Return ONLY the formatted spec sheet — no preamble, no extra text.`,
                  })
                } else {
                  // Standalone — run its own official-first web search
                  specsResponse = await openai.responses.create({
                    model: MODEL,
                    instructions: SPECS_STANDALONE_PROMPT,
                    tools: [
                      {
                        type: 'web_search_preview' as const,
                        search_context_size: 'high' as const,
                        user_location: { type: 'approximate' as const, country: 'AU' },
                      },
                    ],
                    input: `Produce a full specification sheet for this cycling product:\n\n${details}\n\n${officialSearchBlock}\nSearch for "${searchTerms}" to find accurate manufacturer specifications. Return ONLY the formatted spec sheet — no preamble, no extra text.`,
                  })
                }

                specs = sanitise(collectText(specsResponse.output as ResponseOutputItem[] | undefined))
                collectCitations(specsResponse.output as ResponseOutputItem[] | undefined, citations)
              }

              const sources = rankSources(citations, brand, productName)

              // ── Bicycle detection ─────────────────────────────────────
              emit({ event: 'product_phase', productId: product.id, phase: 'bicycle' })

              const detectionContext = [
                details,
                description && `Generated description:\n${description.slice(0, 600)}`,
                specs && `Generated specs:\n${specs.slice(0, 800)}`,
              ]
                .filter(Boolean)
                .join('\n\n')

              const detection = await detectBicycleProduct(openai, detectionContext)
              const isBicycle =
                product.id in bicycleOverrides
                  ? !!bicycleOverrides[product.id]
                  : detection.is_bicycle

              let bikeSpecs: BikeSpecsData | null = null
              if (isBicycle && specs) {
                bikeSpecs = buildBikeSpecsFromProductSpecs(specs, sources, brand)
              } else if (isBicycle && !specs) {
                bikeSpecs = syncBikeSpecsFromProductSpecs({
                  productSpecs: (product as { product_specs?: string | null }).product_specs,
                  existingBikeSpecs: (product as { bike_specs?: unknown }).bike_specs,
                  productSpecSources: sources.length
                    ? sources
                    : ((product as { product_spec_sources?: SpecSource[] | null })
                        .product_spec_sources ?? []),
                  brand,
                })
              }

              // ── Save ──────────────────────────────────────────────────
              const updateData: Record<string, unknown> = {
                is_bicycle: isBicycle,
              }
              if (description) updateData.product_description = description
              if (specs) updateData.product_specs = specs
              if (sources.length > 0) updateData.product_spec_sources = sources
              if (bikeSpecs) updateData.bike_specs = bikeSpecs

              let saveError: string | null = null

              if (Object.keys(updateData).length > 0) {
                const { error: dbSaveErr } = await supabase
                  .from('products')
                  .update(updateData)
                  .eq('id', product.id)
                  .eq('user_id', userId)

                if (dbSaveErr) {
                  // Fallback: try description-only if combined save fails
                  if (description) {
                    const { error: fallbackErr } = await supabase
                      .from('products')
                      .update({ product_description: description })
                      .eq('id', product.id)
                      .eq('user_id', userId)
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
                sources,
                bicycle_detected: true,
                is_bicycle: isBicycle,
                bicycle_confidence: detection.confidence,
                bike_specs: bikeSpecs,
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
                sources: [],
                is_bicycle: false,
                bicycle_confidence: 'low',
                bike_specs: null,
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
