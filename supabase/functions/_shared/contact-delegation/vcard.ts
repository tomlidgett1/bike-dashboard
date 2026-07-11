import type { NormalisedIncomingMessage } from '../linq.ts';
import { normaliseToE164 } from '../phone-normalise.ts';

export interface ParsedContactCard {
  name: string | null;
  phoneE164: string;
  originalPhone: string;
  source: 'text' | 'attachment';
}

function unfoldVCard(text: string): string {
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

function cleanVCardValue(value: string): string {
  return value
    .replace(/\\n/g, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .trim();
}

export function parseVCardText(text: string, source: ParsedContactCard['source'] = 'text'): ParsedContactCard | null {
  if (!/BEGIN:VCARD/i.test(text)) return null;
  const unfolded = unfoldVCard(text);
  const lines = unfolded.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const fnLine = lines.find((line) => /^FN(?:;[^:]*)?:/i.test(line));
  const nLine = lines.find((line) => /^N(?:;[^:]*)?:/i.test(line));
  const telLines = lines.filter((line) => /^TEL(?:;[^:]*)?:/i.test(line));

  const name = fnLine
    ? cleanVCardValue(fnLine.slice(fnLine.indexOf(':') + 1))
    : nLine
    ? cleanVCardValue(nLine.slice(nLine.indexOf(':') + 1).split(';').filter(Boolean).reverse().join(' '))
    : null;

  for (const line of telLines) {
    const raw = cleanVCardValue(line.slice(line.indexOf(':') + 1));
    const e164 = normaliseToE164(raw);
    if (e164) {
      return {
        name,
        phoneE164: e164,
        originalPhone: raw,
        source,
      };
    }
  }

  return null;
}

function looksLikeVCardMime(mimeType: string): boolean {
  const value = mimeType.toLowerCase();
  return value.includes('vcard') || value.includes('x-vcard') || value.includes('text/directory');
}

function looksLikeVCardFilename(filename?: string): boolean {
  return Boolean(filename && /\.vcf$/i.test(filename.trim()));
}

export async function parseContactCardFromMessage(message: NormalisedIncomingMessage): Promise<ParsedContactCard | null> {
  const fromText = parseVCardText(message.text, 'text');
  if (fromText) return fromText;

  for (const file of message.files ?? []) {
    if (!looksLikeVCardMime(file.mimeType) && !looksLikeVCardFilename(file.filename)) continue;
    if (!file.url) {
      console.warn('[contact-delegation] vCard-like attachment missing URL', {
        mimeType: file.mimeType,
        filename: file.filename,
        attachmentId: file.attachmentId,
      });
      continue;
    }
    try {
      const response = await fetch(file.url);
      if (!response.ok) continue;
      const text = await response.text();
      const parsed = parseVCardText(text, 'attachment');
      if (parsed) return parsed;
    } catch (error) {
      console.warn('[contact-delegation] failed to fetch vCard attachment:', (error as Error).message);
    }
  }

  return null;
}
