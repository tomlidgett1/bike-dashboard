import { ensureTitlePreservesSizes, extractProductSizeTokens } from '@/lib/product-title-size-guard'
import { extractVariantTokens } from '@/lib/variants/normalize'

/** Fields needed to derive Lightspeed title, cleaned title, and mandatory variant tokens. */
export interface ProductCopyFields {
  description?: string | null
  display_name?: string | null
  brand?: string | null
  manufacturer_name?: string | null
  model?: string | null
  marketplace_category?: string | null
  bike_type?: string | null
  frame_size?: string | null
  size?: string | null
  wheel_size?: string | null
  color_primary?: string | null
  color_secondary?: string | null
}

/** Lightspeed Item.description — the raw POS listing title. */
export function getLightspeedTitle(product: ProductCopyFields): string {
  return (product.description ?? '').trim()
}

/** Yellow Jersey optimised title; falls back to Lightspeed when not yet cleaned. */
export function getCleanedTitle(product: ProductCopyFields): string {
  const cleaned = (product.display_name ?? '').trim()
  if (cleaned) return cleaned
  return getLightspeedTitle(product)
}

function addUniqueToken(tokens: string[], token: string) {
  const cleaned = token.trim()
  if (!cleaned) return
  const key = cleaned.toLowerCase()
  if (tokens.some((existing) => existing.toLowerCase() === key)) return
  tokens.push(cleaned)
}

/** Sizes and colours that must appear in title, description, and specs when known. */
export function collectMandatoryVariantTokens(product: ProductCopyFields): {
  sizes: string[]
  colours: string[]
} {
  const lightspeedTitle = getLightspeedTitle(product)
  const fromListing = extractVariantTokens(lightspeedTitle)
  const sizeGuardTokens = extractProductSizeTokens({
    rawTitle: lightspeedTitle,
    category: product.marketplace_category,
  })

  const sizes: string[] = []
  const colours: string[] = []

  for (const token of [...fromListing.sizes, ...fromListing.others, ...sizeGuardTokens]) {
    addUniqueToken(sizes, token)
  }
  if (product.frame_size) addUniqueToken(sizes, product.frame_size)
  if (product.size) addUniqueToken(sizes, product.size)
  if (product.wheel_size) addUniqueToken(sizes, product.wheel_size)

  for (const token of fromListing.colours) {
    addUniqueToken(colours, token)
  }
  if (product.color_primary) addUniqueToken(colours, product.color_primary)
  if (product.color_secondary) addUniqueToken(colours, product.color_secondary)

  return { sizes, colours }
}

function titleContainsColour(title: string, colour: string): boolean {
  const titleLower = title.toLowerCase()
  const colourLower = colour.toLowerCase().trim()
  if (!colourLower) return true
  if (titleLower.includes(colourLower)) return true

  return colourLower
    .split(/\s+/)
    .filter((word) => word.length >= 3)
    .some((word) => titleLower.includes(word))
}

/** Ensures generated titles keep size and colour variant details from the Lightspeed listing. */
export function ensureTitlePreservesVariants(
  generatedTitle: string,
  product: ProductCopyFields,
): string {
  let title = ensureTitlePreservesSizes(generatedTitle, {
    rawTitle: getLightspeedTitle(product),
    category: product.marketplace_category,
  })

  const { colours } = collectMandatoryVariantTokens(product)
  const missingColours = colours.filter((colour) => !titleContainsColour(title, colour))
  if (!missingColours.length) return title

  return `${title} ${missingColours.join(' ')}`.trim()
}

export function buildTitleGenerationContext(product: ProductCopyFields): {
  lightspeedTitle: string
  searchTerms: string
  contextBlock: string
} {
  const lightspeedTitle = getLightspeedTitle(product)
  const brand = product.brand || product.manufacturer_name || undefined
  const { sizes, colours } = collectMandatoryVariantTokens(product)

  const searchTerms = [brand, product.model, lightspeedTitle].filter(Boolean).join(' ')

  const contextBlock = [
    `Raw Lightspeed title (source of truth — derive the clean title from this listing): ${lightspeedTitle}`,
    brand && `Brand: ${brand}`,
    product.model && `Model: ${product.model}`,
    product.marketplace_category && `Category: ${product.marketplace_category}`,
    sizes.length > 0 && `Mandatory sizes (must appear in final title): ${sizes.join(', ')}`,
    colours.length > 0 && `Mandatory colours (must appear in final title): ${colours.join(', ')}`,
  ]
    .filter(Boolean)
    .join('\n')

  return { lightspeedTitle, searchTerms, contextBlock }
}

export function buildCopyGenerationContext(product: ProductCopyFields): {
  cleanedTitle: string
  detailsBlock: string
  searchTerms: string
} {
  const cleanedTitle = getCleanedTitle(product)
  const lightspeedTitle = getLightspeedTitle(product)
  const brand = product.brand || product.manufacturer_name || undefined
  const { sizes, colours } = collectMandatoryVariantTokens(product)

  const detailsBlock = [
    `Optimised product title (use this exact name in all copy): ${cleanedTitle}`,
    lightspeedTitle &&
      lightspeedTitle.toLowerCase() !== cleanedTitle.toLowerCase() &&
      `Raw Lightspeed listing (variant reference only — do not use as the product name): ${lightspeedTitle}`,
    brand && `Brand: ${brand}`,
    product.model && `Model: ${product.model}`,
    product.marketplace_category && `Category: ${product.marketplace_category}`,
    product.bike_type && `Type: ${product.bike_type}`,
    sizes.length > 0 && `Required size(s) — must appear in description and specs: ${sizes.join(', ')}`,
    colours.length > 0 && `Required colour(s) — must appear in description and specs: ${colours.join(', ')}`,
    `CRITICAL: When size or colour is known, the description opening paragraph and spec sheet must state them explicitly.`,
  ]
    .filter(Boolean)
    .join('\n')

  const searchTerms = [brand, product.model, cleanedTitle].filter(Boolean).join(' ')

  return { cleanedTitle, detailsBlock, searchTerms }
}

export const TITLE_VARIANT_RULES = `- CRITICAL VARIANT RULE: The raw Lightspeed title is the source of truth for variant details. If it includes a size, dimension, fit, capacity, speed, tooth count, width, length, diameter, wheel size, frame size, clothing size, shoe size, volume, colour, colourway, or other variant attribute, the final title MUST include it.
- Never drop size details such as 700x25c, 29x2.4, 27.5x2.6, 160mm, 172.5mm, 31.8mm, 11-34T, 12-speed, 42cm, 56cm, S, M, L, XL, 500ml, 1-1/8", EU 43, or similar sizing.
- Never drop colour details such as Black, White, Red, Matte Black, Gunmetal, or other colourways when present in the Lightspeed title or structured product fields.
- Preserving size and colour is more important than hitting a word-count target.`

export const COPY_VARIANT_RULES = `- CRITICAL VARIANT RULE: Write copy for the optimised product title provided — not the raw Lightspeed listing name.
- When size or colour is provided in the context, state it explicitly in the opening paragraph and in the spec sheet (e.g. frame size, wheel size, clothing size, colourway).
- Australian English spelling (colour, aluminium, tyres, etc.).`
