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

function renderTable(rows: string[][], options: Required<RenderGenieMarkdownOptions>): string {
  const [head, ...body] = rows
  if (!head || body.length === 0) return ''

  const tableTextSize = options.compact ? 'text-xs' : 'text-sm'
  const cellPadding = options.compact ? 'px-2 py-1.5' : 'px-3 py-2'
  const containerMargin = options.compact ? 'my-2' : 'my-3'

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

  const closeList = () => {
    if (!listType) return
    html.push(`</${listType}>`)
    listType = null
  }

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const trimmed = line.trimStart()

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

    const unordered = /^[•\-*]\s+/.test(trimmed)
    const ordered = /^\d+\.\s+/.test(trimmed)

    if (unordered || ordered) {
      const nextType = ordered ? 'ol' : 'ul'
      if (listType !== nextType) {
        closeList()
        listType = nextType
        html.push(`<${nextType} class="${resolved.compact ? 'my-1 space-y-0.5 pl-4' : 'my-2 space-y-1 pl-5'}">`)
      }
      const content = trimmed.replace(/^[•\-*]\s+/, '').replace(/^\d+\.\s+/, '')
      html.push(`<li class="${ordered ? 'list-decimal' : 'list-disc'} ${resolved.compact ? 'leading-snug text-sm' : 'leading-relaxed'}">${renderInlineMarkdown(content, resolved.linkMode)}</li>`)
      continue
    }

    closeList()

    if (!trimmed) {
      if (index < lines.length - 1 && lines[index + 1]?.trim() !== '') {
        html.push(`<div class="${resolved.compact ? 'h-1' : 'h-2'}"></div>`)
      }
    } else if (/^#{1,4}\s/.test(trimmed)) {
      const headingText = trimmed.replace(/^#{1,4}\s+/, '')
      html.push(`<h3 class="${resolved.compact ? 'mt-1.5' : 'mt-3'} first:mt-0 text-sm font-semibold leading-snug text-foreground">${renderInlineMarkdown(headingText, resolved.linkMode)}</h3>`)
    } else if (/^---+$/.test(trimmed)) {
      html.push(`<hr class="${resolved.compact ? 'my-2' : 'my-3'} border-border/70" />`)
    } else {
      html.push(`<p class="${resolved.compact ? 'leading-snug text-sm' : 'leading-relaxed'}">${renderInlineMarkdown(trimmed, resolved.linkMode)}</p>`)
    }
  }

  closeList()
  return html.join('')
}
