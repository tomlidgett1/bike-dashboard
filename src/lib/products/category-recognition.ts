import OpenAI from 'openai'
import type { LightspeedCategory } from '@/lib/services/lightspeed'
import { findCategoryByPath } from '@/lib/services/lightspeed/category-helpers'

export const CATEGORY_RECOGNITION_MODEL = 'gpt-5.4-nano'

export const CATEGORY_PROMPT = `You assign cycling retail products to the best matching Lightspeed POS category.

You are given a product name, optional brand, and a list of existing Lightspeed categories for this bike shop (each with an id and full path).

Rules:
- Pick exactly one category id from the provided list when you are confident it fits.
- Prefer the most specific leaf category that matches (e.g. "Drivetrain/Derailleurs" over "Drivetrain").
- Return null if no category is a reasonable fit. Never invent a category id.
- Use Australian cycling retail context (bikes, parts, apparel, workshop, nutrition).`

export const CATEGORY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['categoryId', 'confidence'],
  properties: {
    categoryId: { type: ['string', 'null'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
} as const

export type CategoryConfidence = 'high' | 'medium' | 'low'
export type CategoryDetection = { categoryId: string | null; confidence: CategoryConfidence }

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

export function parseCategoryDetection(raw: string): CategoryDetection | null {
  try {
    const parsed = JSON.parse(raw.trim()) as Partial<CategoryDetection>
    if (parsed.categoryId !== null && typeof parsed.categoryId !== 'string') return null
    const confidence =
      parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
        ? parsed.confidence
        : 'low'
    return { categoryId: parsed.categoryId ?? null, confidence }
  } catch {
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0]) as CategoryDetection
    } catch {
      return null
    }
  }
}

export function formatCategoryDisplayLabel(category: {
  fullPathName?: string | null
  name: string
}): string {
  const path = (category.fullPathName || category.name).trim()
  return path.replace(/\s*\/\s*/g, ' · ')
}

export function directCategoryMatch(
  productName: string,
  categories: LightspeedCategory[],
): LightspeedCategory | null {
  const haystack = productName.trim()
  if (!haystack) return null

  const byPath = findCategoryByPath(categories, haystack)
  if (byPath) return byPath

  const normalisedName = haystack.toLowerCase()
  let best: LightspeedCategory | null = null
  for (const category of categories) {
    const leaf = (category.fullPathName || category.name).split('/').pop()?.trim().toLowerCase()
    if (!leaf || leaf.length < 4) continue
    if (!normalisedName.includes(leaf)) continue
    const pathLen = (category.fullPathName || category.name).length
    if (!best || pathLen > (best.fullPathName || best.name).length) best = category
  }
  return best
}

export async function detectCategoryWithAi(args: {
  productName: string
  brandLabel?: string | null
  categories: LightspeedCategory[]
  openai?: OpenAI
}): Promise<CategoryDetection | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || args.categories.length === 0) return null

  const openai = args.openai ?? new OpenAI({ apiKey })
  const categoryLines = args.categories
    .slice(0, 400)
    .map((category) => `${category.categoryID}: ${category.fullPathName || category.name}`)
    .join('\n')

  const detailLines = [
    `Product name: ${args.productName}`,
    args.brandLabel ? `Brand: ${args.brandLabel}` : null,
    'Existing Lightspeed categories:',
    categoryLines,
  ].filter(Boolean)

  const response = await openai.responses.create({
    model: CATEGORY_RECOGNITION_MODEL,
    instructions: CATEGORY_PROMPT,
    text: {
      format: {
        type: 'json_schema',
        name: 'category_detection',
        strict: true,
        schema: CATEGORY_JSON_SCHEMA,
      },
    },
    input: detailLines.join('\n'),
  })

  return parseCategoryDetection(extractOutputText(response.output as ResponseOutputItem[] | undefined))
}

export function isConfidentCategoryDetection(
  detection: CategoryDetection | null,
  options?: { allowMedium?: boolean },
): detection is CategoryDetection & { categoryId: string } {
  if (!detection?.categoryId) return false
  if (detection.confidence === 'high') return true
  return Boolean(options?.allowMedium && detection.confidence === 'medium')
}
