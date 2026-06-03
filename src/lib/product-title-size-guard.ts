const APPAREL_SIZE_RE = /^(?:XXS|XS|S|M|L|XL|XXL|XXXL)$/i

interface PreserveSizeOptions {
  rawTitle: string
  category?: string | null
}

function normaliseForComparison(value: string): string {
  return value
    .toLowerCase()
    .replace(/[×]/g, 'x')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, '')
    .replace(/\binch(?:es)?\b/g, '"')
    .replace(/\bspd\b/g, 'speed')
    .replace(/[^a-z0-9/."-]/g, '')
}

function cleanToken(token: string): string {
  return token
    .trim()
    .replace(/[×]/g, 'x')
    .replace(/[–—]/g, '-')
    .replace(/\s*([x/-])\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:]+$/g, '')
}

function addToken(tokens: string[], token: string) {
  const cleaned = cleanToken(token)
  if (!cleaned) return

  const key = normaliseForComparison(cleaned)
  if (!key || tokens.some((existing) => normaliseForComparison(existing) === key)) return
  if (
    APPAREL_SIZE_RE.test(cleaned) &&
    tokens.some((existing) => normaliseForComparison(existing) === normaliseForComparison(`size ${cleaned}`))
  ) {
    return
  }
  tokens.push(cleaned)
}

function looksLikeApparelOrWearable(text: string, category?: string | null): boolean {
  return /\b(apparel|clothing|jersey|shorts?|bibs?|jacket|gilet|gloves?|shoes?|helmet|pads?|protection|wear)\b/i.test(
    `${category ?? ''} ${text}`,
  )
}

function looksLikeBikeOrFrame(text: string, category?: string | null): boolean {
  return /\b(bicycles?|bikes?|e-bikes?|frames?(?:et)?|road|gravel|mountain|mtb|hybrid|commuter|bmx|kids?)\b/i.test(
    `${category ?? ''} ${text}`,
  )
}

export function extractProductSizeTokens({ rawTitle, category }: PreserveSizeOptions): string[] {
  const tokens: string[] = []
  const text = rawTitle.replace(/[“”]/g, '"').replace(/[–—]/g, '-')

  const tokenPatterns = [
    /\b\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*(?:c|mm|cm|in|inch(?:es)?|")?\b/gi,
    /\b\d+(?:-\d+\/\d+|\/\d+)?\s*(?:"|in\b|inch(?:es)?\b)/gi,
    /\b\d+(?:\.\d+)?\s*(?:mm|cm|ml|oz|kg|g)\b/gi,
    /\b\d+(?:\.\d+)?\s*l\b/gi,
    /\b\d{2,3}\s*c\b/gi,
    /\b\d{1,2}\s*(?:-| )?\s*(?:speed|spd)\b/gi,
    /\b\d{1,3}(?:[-/]\d{1,3})+\s*t\b/gi,
    /\b(?:EU|US|UK)\s*\d+(?:\.\d+)?\b/gi,
    /\bsize\s*(?:XXS|XS|S|M|L|XL|XXL|XXXL|EU\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?)\b/gi,
  ]

  for (const pattern of tokenPatterns) {
    for (const match of text.matchAll(pattern)) {
      addToken(tokens, match[0])
    }
  }

  if (looksLikeApparelOrWearable(text, category)) {
    for (const match of text.matchAll(/\b(?:XXS|XS|S|M|L|XL|XXL|XXXL)\b/gi)) {
      addToken(tokens, match[0].toUpperCase())
    }
  }

  if (looksLikeBikeOrFrame(text, category)) {
    for (const match of text.matchAll(/\b(?:4[4-9]|5[0-9]|6[0-4])\b/g)) {
      addToken(tokens, match[0])
    }
  }

  return tokens
}

export function ensureTitlePreservesSizes(
  generatedTitle: string,
  options: PreserveSizeOptions,
): string {
  const title = generatedTitle.trim().replace(/^["']|["']$/g, '').replace(/\.$/, '')
  if (!title) return title

  const titleKey = normaliseForComparison(title)
  const missingTokens = extractProductSizeTokens(options).filter((token) => {
    const tokenKey = normaliseForComparison(token)
    if (!tokenKey) return false

    if (APPAREL_SIZE_RE.test(token)) {
      return !new RegExp(`\\b${token}\\b`, 'i').test(title)
    }

    if (titleKey.includes(tokenKey)) return false

    const withoutSizePrefix = token.replace(/^size\s+/i, '')
    if (withoutSizePrefix !== token && titleKey.includes(normaliseForComparison(withoutSizePrefix))) {
      return false
    }

    return true
  })

  if (!missingTokens.length) return title
  return `${title} ${missingTokens.join(' ')}`
}
