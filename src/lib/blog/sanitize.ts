/** Strip em dashes, URLs, and source citations from published blog copy. */

const EM_DASH = /\u2014/g;
const MARKDOWN_LINK = /\[([^\]]+)\]\([^)]*\)/g;
const BARE_URL = /https?:\/\/[^\s)\]>,"']+/gi;
const SOURCE_TAG = /\(?\s*(?:Source|Via|Read more|Originally published)(?::|\s+at)\s*[^).\n]+[).]?/gi;

export function sanitizeBlogText(text: string | null | undefined): string {
  if (!text) return '';

  let s = text
    .replace(EM_DASH, ', ')
    .replace(MARKDOWN_LINK, '$1')
    .replace(BARE_URL, '')
    .replace(SOURCE_TAG, '');

  // Tidy punctuation left behind after URL removal
  s = s
    .replace(/\s+,/g, ',')
    .replace(/,\s*,/g, ',')
    .replace(/,\s*\./g, '.')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return s;
}

/** Drop credits that are just a URL; otherwise keep a clean attribution string. */
export function sanitizeBlogCredit(credit: string | null | undefined): string | null {
  if (!credit?.trim()) return null;
  const cleaned = sanitizeBlogText(credit);
  if (!cleaned || /^https?:\/\//i.test(cleaned)) return null;
  return cleaned;
}

export function sanitizeBlogTags(tags: string[]): string[] {
  return tags.map((t) => sanitizeBlogText(t)).filter(Boolean);
}
