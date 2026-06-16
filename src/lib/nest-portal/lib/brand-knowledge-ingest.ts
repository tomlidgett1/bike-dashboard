const MAX_CHUNK_CHARS = 2000
const CHUNK_OVERLAP_CHARS = 300
const MAX_CHUNKS = 64

function splitSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?])\s+|\n{2,}/)
  const result: string[] = []
  for (const part of parts) {
    const trimmed = part.trim()
    if (trimmed) result.push(trimmed)
  }
  if (result.length <= 1 && text.includes('\n')) {
    return text.split(/\n/).map((line) => line.trim()).filter(Boolean)
  }
  return result
}

function splitAtWordBoundary(text: string, maxChars: number): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length)
    if (end < text.length) {
      const slice = text.slice(start, end)
      const lastSpace = slice.lastIndexOf(' ')
      if (lastSpace > maxChars * 0.5) end = start + lastSpace
    }
    chunks.push(text.slice(start, end).trim())
    start = end
  }
  return chunks.filter(Boolean)
}

export function sentenceAwareChunks(
  text: string,
  contextHeader: string,
  maxChars = MAX_CHUNK_CHARS,
  overlapChars = CHUNK_OVERLAP_CHARS,
): string[] {
  if (!text.trim()) return []

  const sentences = splitSentences(text)
  const chunks: string[] = []
  let current: string[] = []
  let currentLen = 0

  for (const sentence of sentences) {
    const trimmed = sentence.trim()
    if (!trimmed) continue

    if (trimmed.length > maxChars) {
      if (current.length > 0) {
        chunks.push(current.join(' '))
        current = []
        currentLen = 0
      }
      chunks.push(...splitAtWordBoundary(trimmed, maxChars))
      continue
    }

    if (currentLen + trimmed.length + 1 > maxChars && current.length > 0) {
      chunks.push(current.join(' '))
      const overlap: string[] = []
      let overlapLen = 0
      for (let i = current.length - 1; i >= 0; i--) {
        if (overlapLen + current[i].length + 1 > overlapChars) break
        overlap.unshift(current[i])
        overlapLen += current[i].length + 1
      }
      current = [...overlap, trimmed]
      currentLen = overlap.reduce((sum, s) => sum + s.length + 1, 0) + trimmed.length
    } else {
      current.push(trimmed)
      currentLen += trimmed.length + 1
    }
  }

  if (current.length > 0) chunks.push(current.join(' '))

  return chunks.slice(0, MAX_CHUNKS).map((chunk) => `${contextHeader}\n---\n${chunk}`)
}

export function vectorString(values: number[]): string {
  return '[' + values.map((v) => v.toFixed(8)).join(',') + ']'
}
