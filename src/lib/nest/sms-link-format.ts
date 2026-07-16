/** Trailing characters SMS clients often absorb into the tap target, breaking the link. */
const URL_TRAILING_PUNCT = /[.,;:!?)\]}>]+$/;

/** Matches http(s) URLs with common URL characters. */
const URL_IN_TEXT_RE = /https?:\/\/[^\s<>\[\]"']+/gi;

/** Hosted Agent Pay checkout URLs (App Clip / web checkout). */
export const AGENT_PAY_CHECKOUT_URL_RE =
  /https?:\/\/(?:[\w-]+\.)*linqapp\.com\/pay\/[^\s<>\[\]"']+/gi;

export function stripUrlTrailingPunctuation(url: string): string {
  let result = url;
  while (URL_TRAILING_PUNCT.test(result)) {
    result = result.slice(0, -1);
  }
  return result;
}

/**
 * Reformats URLs in SMS/iMessage text so they are tappable on the widest range of
 * handsets. Puts each URL on its own line and strips trailing punctuation that
 * clients often swallow into the link.
 */
export function ensureSmsUrlsAreClickable(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return text;

  const matches = [...trimmed.matchAll(URL_IN_TEXT_RE)];
  if (matches.length === 0) return text;

  const chunks: string[] = [];
  let cursor = 0;

  for (const match of matches) {
    const rawUrl = match[0];
    const index = match.index ?? 0;
    const cleanUrl = stripUrlTrailingPunctuation(rawUrl);
    const trailing = rawUrl.slice(cleanUrl.length);

    if (index > cursor) {
      chunks.push(trimmed.slice(cursor, index).replace(/\s+$/, ""));
    }

    chunks.push(`\n\n${cleanUrl}${trailing}\n\n`);
    cursor = index + rawUrl.length;
  }

  if (cursor < trimmed.length) {
    chunks.push(trimmed.slice(cursor).replace(/^\s+/, ""));
  }

  return chunks
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** First Agent Pay checkout URL found in free text, or null. */
export function extractAgentPayCheckoutUrl(text: string): string | null {
  const matches = text.match(AGENT_PAY_CHECKOUT_URL_RE);
  if (!matches?.length) return null;
  return stripUrlTrailingPunctuation(matches[0]);
}

/** Remove a specific checkout URL from message text (keeps surrounding copy). */
export function stripCheckoutUrlFromText(text: string, checkoutUrl: string): string {
  const clean = stripUrlTrailingPunctuation(checkoutUrl.trim());
  if (!clean) return text;
  return text
    .split(clean)
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isAgentPayCheckoutUrl(url: string): boolean {
  const trimmed = stripUrlTrailingPunctuation(url.trim());
  if (!trimmed) return false;
  AGENT_PAY_CHECKOUT_URL_RE.lastIndex = 0;
  return AGENT_PAY_CHECKOUT_URL_RE.test(trimmed);
}

export function resolveAgentPayCheckoutUrl(
  text: string,
  explicitUrl?: string | null,
): string | null {
  if (explicitUrl && isAgentPayCheckoutUrl(explicitUrl)) {
    return stripUrlTrailingPunctuation(explicitUrl.trim());
  }
  return extractAgentPayCheckoutUrl(text);
}

export function buildPaymentLinkIntroMessage(opts: {
  amount: number;
  description?: string;
  formatAmount?: (amount: number) => string;
}): string {
  const formatAmount =
    opts.formatAmount ??
    ((amount: number) =>
      new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount));

  const forPart = opts.description?.trim() ? ` for ${opts.description.trim()}` : "";

  return [
    `Here's a secure payment link${forPart} (${formatAmount(opts.amount)}).`,
    "Tap the payment card below to pay with Apple Pay.",
    "",
    "Once paid, it's added to your store credit in Lightspeed.",
  ].join("\n");
}

export function buildPaymentLinkMessage(opts: {
  amount: number;
  description?: string;
  url: string;
  formatAmount?: (amount: number) => string;
}): string {
  const formatAmount =
    opts.formatAmount ??
    ((amount: number) =>
      new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount));

  const forPart = opts.description?.trim() ? ` for ${opts.description.trim()}` : "";
  const url = opts.url.trim();

  return [
    `Here's a secure payment link${forPart} (${formatAmount(opts.amount)}).`,
    "",
    "Tap to pay:",
    url,
    "",
    "Once paid, it's added to your store credit in Lightspeed.",
  ].join("\n");
}
