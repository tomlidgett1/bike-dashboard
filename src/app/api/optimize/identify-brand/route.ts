/**
 * Bulk brand identification + Lightspeed write-back.
 *
 * POST /api/optimize/identify-brand
 * Body: { productIds: string[] }
 *
 * For each product missing a Lightspeed brand (manufacturer):
 * 1. Try a direct match of the product name against the store's existing
 *    Lightspeed manufacturers.
 * 2. Fall back to AI identification constrained by the known brand list
 *    (creating a new Lightspeed manufacturer only when confidently detected).
 * 3. Write manufacturerID back to the Lightspeed item, then mirror the brand
 *    onto the local products row (and the lightspeed_inventory cache).
 */

import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { createLightspeedClient } from '@/lib/services/lightspeed'
import type { LightspeedManufacturer } from '@/lib/services/lightspeed'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MODEL = 'gpt-5.4-mini'
const MAX_PRODUCTS_PER_REQUEST = 25

const BRAND_PROMPT = `You identify the brand (manufacturer) of cycling products sold in an Australian bike shop.

You are given a raw product name from a POS system (often ALL CAPS or abbreviated) plus optional category context, and a list of brands already known to the store.

Rules:
- If the product clearly belongs to one of the known brands, return that brand EXACTLY as written in the known list.
- If the brand is obvious but not in the known list (e.g. "SHIMANO" appears in the name), return the properly capitalised brand name (e.g. "Shimano").
- Return null if you cannot confidently identify a brand. Never guess.
- The brand must be a real cycling industry manufacturer (bikes, parts, apparel, accessories, nutrition).`

const BRAND_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['brand', 'confidence'],
  properties: {
    brand: { type: ['string', 'null'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
} as const

type BrandDetection = { brand: string | null; confidence: 'high' | 'medium' | 'low' }

type ResponseOutputItem = {
  type?: string
  content?: Array<{ type?: string; text?: string }>
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

function parseDetection(raw: string): BrandDetection | null {
  try {
    const parsed = JSON.parse(raw.trim()) as Partial<BrandDetection>
    if (parsed.brand !== null && typeof parsed.brand !== 'string') return null
    const confidence =
      parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
        ? parsed.confidence
        : 'low'
    return { brand: parsed.brand ?? null, confidence }
  } catch {
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0]) as BrandDetection
    } catch {
      return null
    }
  }
}

/** Direct (non-AI) match: a known manufacturer name appearing as a whole word in the product name. */
function directMatch(
  productName: string,
  manufacturers: LightspeedManufacturer[],
): LightspeedManufacturer | null {
  const haystack = ` ${productName.toLowerCase().replace(/[^a-z0-9]+/gi, ' ')} `
  let best: LightspeedManufacturer | null = null
  for (const manufacturer of manufacturers) {
    const name = (manufacturer.name || '').trim()
    if (name.length < 3) continue
    const needle = ` ${name.toLowerCase().replace(/[^a-z0-9]+/gi, ' ')} `
    if (!haystack.includes(needle)) continue
    if (!best || name.length > (best.name || '').length) best = manufacturer
  }
  return best
}

export interface IdentifyBrandResult {
  productId: string
  brand: string | null
  manufacturerId: string | null
  createdManufacturer: boolean
  updatedLightspeed: boolean
  error?: string
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised. Please log in first.' }, { status: 401 })
    }

    const body = await request.json()
    const productIds: string[] = Array.isArray(body?.productIds)
      ? body.productIds.filter((id: unknown): id is string => typeof id === 'string')
      : []

    if (productIds.length === 0) {
      return NextResponse.json({ error: 'productIds is required.' }, { status: 400 })
    }
    if (productIds.length > MAX_PRODUCTS_PER_REQUEST) {
      return NextResponse.json(
        { error: `A maximum of ${MAX_PRODUCTS_PER_REQUEST} products per request is supported.` },
        { status: 400 },
      )
    }

    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, description, display_name, manufacturer_name, manufacturer_id, lightspeed_item_id, category_name, full_category_path')
      .eq('user_id', user.id)
      .in('id', productIds)

    if (productsError) {
      console.error('[identify-brand] Failed to load products:', productsError)
      return NextResponse.json({ error: 'Failed to load products.' }, { status: 500 })
    }

    const client = createLightspeedClient(user.id)
    let manufacturers: LightspeedManufacturer[] = []
    let lightspeedAvailable = true
    try {
      manufacturers = await client.getAllManufacturers()
    } catch (error) {
      console.warn('[identify-brand] Could not load Lightspeed manufacturers:', error)
      lightspeedAvailable = false
    }

    const manufacturersByName = new Map(
      manufacturers.map((m) => [(m.name || '').trim().toLowerCase(), m]),
    )
    const knownBrandNames = manufacturers
      .map((m) => (m.name || '').trim())
      .filter(Boolean)
      .slice(0, 400)

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const results: IdentifyBrandResult[] = []

    for (const product of products ?? []) {
      const result: IdentifyBrandResult = {
        productId: product.id,
        brand: product.manufacturer_name || null,
        manufacturerId: product.manufacturer_id || null,
        createdManufacturer: false,
        updatedLightspeed: false,
      }

      // Already has a brand — nothing to do.
      if (product.manufacturer_name?.trim()) {
        results.push(result)
        continue
      }

      const productName = (product.display_name || product.description || '').trim()
      if (!productName) {
        result.error = 'Product has no name to identify a brand from.'
        results.push(result)
        continue
      }

      try {
        let matched = directMatch(productName, manufacturers)
        let detectedName: string | null = matched?.name ?? null

        if (!matched) {
          const detailLines = [
            `Product name: ${productName}`,
            product.full_category_path || product.category_name
              ? `Category: ${product.full_category_path || product.category_name}`
              : null,
            knownBrandNames.length > 0
              ? `Known brands: ${knownBrandNames.join(', ')}`
              : 'Known brands: (none yet)',
          ].filter(Boolean)

          const response = await openai.responses.create({
            model: MODEL,
            instructions: BRAND_PROMPT,
            text: {
              format: {
                type: 'json_schema',
                name: 'brand_detection',
                strict: true,
                schema: BRAND_JSON_SCHEMA,
              },
            },
            input: detailLines.join('\n'),
          })

          const detection = parseDetection(
            extractOutputText(response.output as ResponseOutputItem[] | undefined),
          )

          if (!detection?.brand || detection.confidence === 'low') {
            result.error = 'Could not confidently identify a brand.'
            results.push(result)
            continue
          }

          detectedName = detection.brand.trim()
          matched = manufacturersByName.get(detectedName.toLowerCase()) ?? null

          if (!matched && lightspeedAvailable && detection.confidence === 'high') {
            const created = await client.createManufacturer(detectedName)
            matched = created
            manufacturers.push(created)
            manufacturersByName.set(detectedName.toLowerCase(), created)
            result.createdManufacturer = true
          }
        }

        if (!detectedName) {
          result.error = 'Could not confidently identify a brand.'
          results.push(result)
          continue
        }

        const manufacturerId = matched ? String(matched.manufacturerID) : null
        const brandName = matched?.name || detectedName

        // Write back to Lightspeed first so the POS stays the source of truth.
        if (manufacturerId && product.lightspeed_item_id && lightspeedAvailable) {
          await client.updateItem(String(product.lightspeed_item_id), {
            manufacturerID: manufacturerId,
          })
          result.updatedLightspeed = true
        }

        const { error: updateError } = await supabase
          .from('products')
          .update({
            manufacturer_name: brandName,
            manufacturer_id: manufacturerId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', product.id)
          .eq('user_id', user.id)

        if (updateError) throw updateError

        // Best-effort: keep the inventory mirror in sync.
        if (product.lightspeed_item_id) {
          await supabase
            .from('lightspeed_inventory')
            .update({ brand_id: manufacturerId, brand_name: brandName })
            .eq('user_id', user.id)
            .eq('lightspeed_item_id', product.lightspeed_item_id)
        }

        result.brand = brandName
        result.manufacturerId = manufacturerId
      } catch (error) {
        console.error(`[identify-brand] Failed for product ${product.id}:`, error)
        result.error = error instanceof Error ? error.message : 'Brand identification failed.'
      }

      results.push(result)
    }

    return NextResponse.json({ success: true, lightspeedAvailable, results })
  } catch (error) {
    console.error('Error in POST /api/optimize/identify-brand:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
