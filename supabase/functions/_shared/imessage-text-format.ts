/**
 * Outbound iMessage text normalisation and Linq v3 text-decoration extraction.
 *
 * Model replies use markdown-style **bold** and *italic* markers. `cleanResponse`
 * normalises the text (citations, em-dashes, stray URL wrapping, whitespace) but
 * leaves the markers in place. `extractTextDecorations` then parses the markers
 * into Linq v3 `text_decorations` arrays and returns the clean delivered string.
 *
 * Ranges are [start, end) in UTF-16 code units, which matches JavaScript string
 * indices — see the Linq v3 API docs for the rule.
 */

export interface TextDecoration {
  range: [number, number];
  style: 'bold' | 'italic';
}

function uppercaseFirst(s: string): string {
  if (!s) return s;
  const i = s.search(/[a-zA-Z]/);
  if (i < 0) return s;
  return s.slice(0, i) + s[i].toUpperCase() + s.slice(i + 1);
}

/** Normalise model output for delivery. Leaves `**bold**` / `*italic*` markers intact. */
export function cleanResponse(text: string): string {
  const cleaned = text
    .replace(/<cite[^>]*>|<\/cite>/g, '')
    .replace(/\s*cite(?:turn\d+search\d+)+/gi, '')
    .replace(/[\u3010\u3011][^\u3010\u3011]*[\u3010\u3011]?/g, '')
    .replace(/\s*\((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/\S*)?\)/gi, '')
    .replace(/\u2014/g, '-')
    .replace(/\u2013/g, '-')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$2')
    .replace(/[''`'](https?:\/\/[^\s''`']+)[''`']?/g, '$1')
    .replace(/`(https?:\/\/[^\s`]+)`/g, '$1')
    .replace(/\n[ \t]+\n/g, '\n\n')
    .replace(/\n([,.:;!?])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/  +/g, ' ')
    .trim();
  return uppercaseFirst(cleaned);
}

/**
 * Parse `**bold**` and `*italic*` markers out of a string and return the plain
 * `value` plus Linq v3 `text_decorations` covering the stripped ranges.
 *
 * - `**...**` maps to `{ style: 'bold' }`.
 * - `*...*` maps to `{ style: 'italic' }` (single * only — will not fire on `**`).
 * - Italic open/close must not touch whitespace (so `5 * 3` is left alone).
 * - Unmatched markers are left in the output as literal characters.
 * - Ranges are measured against the returned `value` string.
 */
export function extractTextDecorations(input: string): { value: string; text_decorations: TextDecoration[] } {
  const decorations: TextDecoration[] = [];
  let out = '';
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    // **bold**
    if (ch === '*' && input[i + 1] === '*') {
      const close = input.indexOf('**', i + 2);
      if (close > i + 2) {
        const inner = input.slice(i + 2, close);
        // Guard: don't match if inner is empty, starts/ends with whitespace, or spans a blank line.
        if (inner.length > 0 && !/^\s|\s$/.test(inner) && !inner.includes('\n\n')) {
          const start = out.length;
          out += inner;
          decorations.push({ range: [start, out.length], style: 'bold' });
          i = close + 2;
          continue;
        }
      }
    }

    // *italic* — open * must be followed by non-whitespace, close * must be preceded by non-whitespace,
    // and we must not cross into a `**` sequence.
    if (ch === '*' && input[i + 1] !== '*' && input[i + 1] !== undefined && !/\s/.test(input[i + 1])) {
      let j = i + 1;
      let found = -1;
      while (j < input.length) {
        const cj = input[j];
        if (cj === '\n') break;
        if (cj === '*' && input[j + 1] !== '*' && !/\s/.test(input[j - 1])) {
          found = j;
          break;
        }
        j++;
      }
      if (found > i + 1) {
        const inner = input.slice(i + 1, found);
        const start = out.length;
        out += inner;
        decorations.push({ range: [start, out.length], style: 'italic' });
        i = found + 1;
        continue;
      }
    }

    out += ch;
    i++;
  }

  return { value: out, text_decorations: decorations };
}
