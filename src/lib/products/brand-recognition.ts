import OpenAI from 'openai'
import type { LightspeedManufacturer } from '@/lib/services/lightspeed'

export const BRAND_RECOGNITION_MODEL = 'gpt-5.4-nano'

export const BRAND_PROMPT = `You identify the brand (manufacturer) of cycling products sold in an Australian bike shop.

You are given a raw product name from a POS system (often ALL CAPS or abbreviated) plus optional category context, and a list of brands already known to the store.

Rules:
- If the product clearly belongs to one of the known brands, return that brand EXACTLY as written in the known list.
- If the brand is obvious but not in the known list (e.g. "SHIMANO" appears in the name), return the properly capitalised brand name (e.g. "Shimano").
- Return null if you cannot confidently identify a brand. Never guess.
- The brand must be a real cycling industry manufacturer (bikes, parts, apparel, accessories, nutrition).`

export const BRAND_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['brand', 'confidence'],
  properties: {
    brand: { type: ['string', 'null'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
} as const

export type BrandConfidence = 'high' | 'medium' | 'low'
export type BrandDetection = { brand: string | null; confidence: BrandConfidence }

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

export function parseBrandDetection(raw: string): BrandDetection | null {
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
export function directBrandMatch(
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

export async function detectBrandWithAi(args: {
  productName: string
  categoryLabel?: string | null
  knownBrandNames: string[]
  openai?: OpenAI
}): Promise<BrandDetection | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  const openai = args.openai ?? new OpenAI({ apiKey })
  const detailLines = [
    `Product name: ${args.productName}`,
    args.categoryLabel ? `Category: ${args.categoryLabel}` : null,
    args.knownBrandNames.length > 0
      ? `Known brands: ${args.knownBrandNames.join(', ')}`
      : 'Known brands: (none yet)',
  ].filter(Boolean)

  const response = await openai.responses.create({
    model: BRAND_RECOGNITION_MODEL,
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

  return parseBrandDetection(extractOutputText(response.output as ResponseOutputItem[] | undefined))
}

export function isConfidentBrandDetection(
  detection: BrandDetection | null,
  options?: { allowMedium?: boolean },
): detection is BrandDetection & { brand: string } {
  if (!detection?.brand) return false
  if (detection.confidence === 'high') return true
  return Boolean(options?.allowMedium && detection.confidence === 'medium')
}
