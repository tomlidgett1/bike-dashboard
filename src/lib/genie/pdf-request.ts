/** Detect when the user asked Genie to produce a PDF report (not deep research). */
export function isGeniePdfRequest(question: string | undefined): boolean {
  if (!question) return false
  const text = question.toLowerCase().replace(/\s+/g, ' ')
  if (!text.includes('pdf')) return false

  return (
    /\b(create|generate|make|build|produce|prepare|write|export|download|save|send|email|mail)\b.{0,100}\bpdf\b/.test(text) ||
    /\bpdf\b.{0,80}\b(report|document|download|export|file|version|copy|send|email|mail)\b/.test(text) ||
    /\b(as|in|into)\s+(a\s+)?pdf\b/.test(text) ||
    /\bdo\s+a\s+pdf\b/.test(text)
  )
}

/** Pull the first email address from a natural-language PDF send request. */
export function extractPdfSendRecipient(question: string | undefined): string | null {
  if (!question) return null
  const match = question.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  return match?.[0]?.trim().toLowerCase() ?? null
}

export function isGeniePdfSendRequest(question: string | undefined): boolean {
  if (!question || !isGeniePdfRequest(question)) return false
  const text = question.toLowerCase()
  const hasSendIntent = /\b(send|email|mail)\b/.test(text)
  return hasSendIntent && Boolean(extractPdfSendRecipient(question))
}

export function defaultPdfEmailSubject(title: string): string {
  const trimmed = title.trim()
  return trimmed.length > 0 ? trimmed : 'Yellow Jersey Genie Report'
}

export function defaultPdfEmailBody(title: string): string {
  const trimmed = title.trim()
  if (trimmed.length > 0) {
    return `Hi,\n\nPlease find attached the ${trimmed}.\n\nKind regards`
  }
  return 'Hi,\n\nPlease find the attached Genie report.\n\nKind regards'
}

export function sanitisePdfFilename(title: string): string {
  const base = title
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80)
  return `${base || 'genie-report'}.pdf`
}
