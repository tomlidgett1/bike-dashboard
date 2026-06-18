type LinkMode = 'anchor' | 'text'

interface RenderGenieMarkdownOptions {
  compact?: boolean
  linkMode?: LinkMode
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderEmphasis(escaped: string): string {
  return escaped
    .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+?)\*/g, '<em>$1</em>')
}

function renderBareUrls(escaped: string, linkMode: LinkMode): string {
  const urlPattern = /https?:\/\/[^\s<]+/g
  if (linkMode === 'text') {
    return escaped.replace(urlPattern, '')
  }
  return escaped.replace(urlPattern, (url) => {
    const trimmedUrl = url.replace(/[.,;:!?)]$/, '')
    const trailing = url.slice(trimmedUrl.length)
    return `<a class="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground" href="${trimmedUrl}" target="_blank" rel="noreferrer">${trimmedUrl}</a>${trailing}`
  })
}

function renderTextSegment(segment: string, linkMode: LinkMode): string {
  const markdownLinkPattern = /\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)\s]+)\)/g
  let output = ''
  let lastIndex = 0

  for (const match of segment.matchAll(markdownLinkPattern)) {
    const index = match.index ?? 0
    output += renderBareUrls(renderEmphasis(escapeHtml(segment.slice(lastIndex, index))), linkMode)

    const label = renderEmphasis(escapeHtml(match[1]))
    const href = escapeHtml(match[2])
    output += linkMode === 'anchor'
      ? `<a class="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground" href="${href}" target="_blank" rel="noreferrer">${label}</a>`
      : label

    lastIndex = index + match[0].length
  }

  output += renderBareUrls(renderEmphasis(escapeHtml(segment.slice(lastIndex))), linkMode)
  return output
}

function renderInlineMarkdown(value: string, linkMode: LinkMode): string {
  const codePattern = /`([^`]+?)`/g
  let output = ''
  let lastIndex = 0

  for (const match of value.matchAll(codePattern)) {
    const index = match.index ?? 0
    output += renderTextSegment(value.slice(lastIndex, index), linkMode)
    output += `<code class="rounded bg-background px-1 py-0.5 text-[0.85em] font-medium">${escapeHtml(match[1])}</code>`
    lastIndex = index + match[0].length
  }

  output += renderTextSegment(value.slice(lastIndex), linkMode)
  return output
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim()
  if (!trimmed.includes('|')) return []

  return trimmed
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim())
}

function isTableRow(line: string): boolean {
  return splitTableRow(line).length >= 2
}

function isTableSeparator(line: string): boolean {
  return isTableRow(line) && splitTableRow(line).every(cell => /^:?-{3,}:?$/.test(cell))
}

/**
 * Tiered headings so the agent can build real visual hierarchy (a large answer
 * title, section headers, and small section labels) instead of one flat size.
 * Compact mode (timeline rows) keeps everything small.
 */
function renderHeading(
  level: number,
  text: string,
  options: Required<RenderGenieMarkdownOptions>,
): string {
  const inner = renderInlineMarkdown(text, options.linkMode)
  if (options.compact) {
    return `<h4 class="mt-1.5 first:mt-0 text-sm font-semibold leading-snug text-foreground">${inner}</h4>`
  }
  const byLevel: Record<number, string> = {
    1: 'mt-3 first:mt-0 mb-1 text-[1.35em] font-semibold leading-tight tracking-[-0.01em] text-foreground',
    2: 'mt-2.5 first:mt-0 mb-0.5 text-[1.15em] font-semibold leading-snug tracking-[-0.005em] text-foreground',
    3: 'mt-2 first:mt-0 mb-0.5 text-[1em] font-semibold leading-snug text-foreground',
    4: 'mt-2 first:mt-0 mb-0.5 text-[0.8em] font-semibold uppercase tracking-wider text-muted-foreground',
  }
  const tag = level <= 1 ? 'h1' : level === 2 ? 'h2' : level === 3 ? 'h3' : 'h4'
  const cls = byLevel[Math.min(Math.max(level, 1), 4)]
  return `<${tag} class="${cls}">${inner}</${tag}>`
}

function renderTakeawayLine(line: string, linkMode: LinkMode): string {
  const colonIndex = line.indexOf(':')
  if (colonIndex > 0 && colonIndex <= 48) {
    const label = line.slice(0, colonIndex + 1)
    const body = line.slice(colonIndex + 1).trimStart()
    return `<span class="font-semibold text-gray-900">${renderInlineMarkdown(label, linkMode)}</span> ${renderInlineMarkdown(body, linkMode)}`
  }
  return renderInlineMarkdown(line, linkMode)
}

function renderBlockquote(
  lines: string[],
  options: Required<RenderGenieMarkdownOptions>,
): string {
  const inner = lines.map(line => renderTakeawayLine(line, options.linkMode)).join('<br/>')
  if (options.compact) {
    return `<blockquote class="my-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs leading-snug text-gray-600">${inner}</blockquote>`
  }
  return `<blockquote class="my-2 rounded-md border border-gray-200 bg-white px-3.5 py-2.5 leading-relaxed text-gray-700">${inner}</blockquote>`
}

function nextNonEmptyLine(lines: string[], startIndex: number): string | null {
  for (let i = startIndex; i < lines.length; i++) {
    const trimmed = lines[i].trimStart()
    if (trimmed) return trimmed
  }
  return null
}

function matchesListType(line: string, type: 'ul' | 'ol'): boolean {
  if (type === 'ol') return /^\d+\.\s+/.test(line)
  return /^[•\-*]\s+/.test(line)
}

function isBlockStarterLine(line: string): boolean {
  const trimmed = line.trimStart()
  if (!trimmed) return false
  if (/^#{1,6}\s/.test(trimmed)) return true
  if (/^>\s?/.test(trimmed)) return true
  if (/^---+$/.test(trimmed)) return true
  if (isTableRow(line)) return true
  if (/^[•\-*]\s+/.test(trimmed)) return true
  if (/^\d+\.\s+/.test(trimmed)) return true
  return false
}

function isListContinuationLine(line: string, listType: 'ul' | 'ol'): boolean {
  const trimmed = line.trimStart()
  if (!trimmed) return false
  if (matchesListType(trimmed, listType)) return false
  if (isBlockStarterLine(line)) return false
  return true
}

function openListTag(type: 'ul' | 'ol', compact: boolean): string {
  const marker = type === 'ol' ? 'list-decimal' : 'list-disc'
  const spacing = compact ? 'my-1 space-y-0.5 pl-5' : 'my-1.5 space-y-0.5 pl-5'
  return `<${type} class="${spacing} ${marker}">`
}

function renderTable(rows: string[][], options: Required<RenderGenieMarkdownOptions>): string {
  const [head, ...body] = rows
  if (!head || body.length === 0) return ''

  const tableTextSize = options.compact ? 'text-xs' : 'text-sm'
  const cellPadding = options.compact ? 'px-2 py-1.5' : 'px-3 py-2'
  const containerMargin = options.compact ? 'my-2' : 'my-1.5'

  return [
    `<div class="${containerMargin} max-w-full overflow-x-auto rounded-md border border-gray-200 bg-white">`,
    `<table class="min-w-full table-auto border-collapse ${tableTextSize}">`,
    '<thead><tr>',
    ...head.map(cell => `<th class="border-b border-gray-200 ${cellPadding} text-left font-semibold text-gray-900 whitespace-nowrap">${renderInlineMarkdown(cell, options.linkMode)}</th>`),
    '</tr></thead>',
    '<tbody>',
    ...body.map(row => [
      '<tr class="border-t border-gray-100">',
      ...row.map(cell => `<td class="${cellPadding} max-w-[18rem] align-top text-gray-700 whitespace-normal break-words">${renderInlineMarkdown(cell, options.linkMode)}</td>`),
      '</tr>',
    ].join('')),
    '</tbody></table></div>',
  ].join('')
}

export function renderGenieMarkdown(text: string, options: RenderGenieMarkdownOptions = {}): string {
  const resolved = {
    compact: options.compact ?? false,
    linkMode: options.linkMode ?? 'anchor',
  } satisfies Required<RenderGenieMarkdownOptions>
  const lines = text.split('\n')
  const html: string[] = []
  let listType: 'ul' | 'ol' | null = null
  let openListItemHtml: string | null = null

  const flushListItem = () => {
    if (openListItemHtml === null) return
    html.push(`<li class="${resolved.compact ? 'leading-snug text-sm' : 'leading-relaxed'}">${openListItemHtml}</li>`)
    openListItemHtml = null
  }

  const closeList = () => {
    flushListItem()
    if (!listType) return
    html.push(`</${listType}>`)
    listType = null
  }

  const appendListContinuation = (trimmed: string) => {
    const block = `<p class="${resolved.compact ? 'mt-1 leading-snug text-sm' : 'mt-1 leading-relaxed'}">${renderInlineMarkdown(trimmed, resolved.linkMode)}</p>`
    openListItemHtml = openListItemHtml === null ? block : `${openListItemHtml}${block}`
  }

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const trimmed = line.trimStart()

    if (!trimmed) {
      const nextLine = nextNonEmptyLine(lines, index + 1)
      if (listType && nextLine && (matchesListType(nextLine, listType) || isListContinuationLine(nextLine, listType))) {
        continue
      }
      closeList()
      if (nextLine) {
        html.push(`<div class="h-1"></div>`)
      }
      continue
    }

    if (isTableRow(line)) {
      const rows = [splitTableRow(line)]
      let nextIndex = index + 1

      if (nextIndex < lines.length && isTableSeparator(lines[nextIndex])) {
        nextIndex += 1
      }

      while (
        nextIndex < lines.length
        && isTableRow(lines[nextIndex])
        && !isTableSeparator(lines[nextIndex])
      ) {
        rows.push(splitTableRow(lines[nextIndex]))
        nextIndex += 1
      }

      if (rows.length >= 2) {
        closeList()
        index = nextIndex - 1
        html.push(renderTable(rows, resolved))
        continue
      }
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = []
      let nextIndex = index
      while (nextIndex < lines.length && /^>\s?/.test(lines[nextIndex].trimStart())) {
        quoteLines.push(lines[nextIndex].trimStart().replace(/^>\s?/, ''))
        nextIndex += 1
      }
      closeList()
      index = nextIndex - 1
      html.push(renderBlockquote(quoteLines, resolved))
      continue
    }

    const unordered = /^[•\-*]\s+/.test(trimmed)
    const ordered = /^\d+\.\s+/.test(trimmed)

    if (unordered || ordered) {
      const nextType = ordered ? 'ol' : 'ul'
      if (listType !== nextType) {
        closeList()
        listType = nextType
        html.push(openListTag(nextType, resolved.compact))
      } else {
        flushListItem()
      }
      const content = trimmed.replace(/^[•\-*]\s+/, '').replace(/^\d+\.\s+/, '')
      openListItemHtml = renderInlineMarkdown(content, resolved.linkMode)
      continue
    }

    if (listType && isListContinuationLine(trimmed, listType)) {
      appendListContinuation(trimmed)
      continue
    }

    closeList()

    if (/^#{1,6}\s/.test(trimmed)) {
      const level = trimmed.match(/^#+/)?.[0].length ?? 3
      const headingText = trimmed.replace(/^#{1,6}\s+/, '')
      html.push(renderHeading(level, headingText, resolved))
    } else if (/^---+$/.test(trimmed)) {
      html.push(`<hr class="${resolved.compact ? 'my-2' : 'my-2'} border-border/70" />`)
    } else {
      html.push(`<p class="${resolved.compact ? 'leading-snug text-sm' : 'leading-relaxed'}">${renderInlineMarkdown(trimmed, resolved.linkMode)}</p>`)
    }
  }

  closeList()
  return html.join('')
}
