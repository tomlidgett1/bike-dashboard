/** Shared detection for third-party app OAuth via Composio (not Nest Google/Microsoft dashboard). */

export const COMPOSIO_CONNECT_VERB =
  /\b(connect|link|reconnect|integrate|hook\s*up|set\s*up|add)\s+(?:to|with|my|our|the\s+)?/i;
/** Requires optional "my "/ "to "/ etc. before toolkit slug so "Connect my Xero" captures xero, not my. */
export const COMPOSIO_CONNECT_TAIL =
  /\b(connect|link|reconnect|integrate|hook\s*up|set\s*up|add)\s+(?:(?:to|with|my|our|the)\s+)?([a-z][a-z0-9_-]{2,40})\b/i;
export const COMPOSIO_EXCLUDED_TARGETS = new Set([
  "you",
  "me",
  "us",
  "it",
  "this",
  "that",
  "nest",
  "google",
  "microsoft",
  "gmail",
  "outlook",
  "calendar",
  "email",
  "contacts",
  "account",
  "inbox",
  "schedule",
  "phone",
  "number",
  "wifi",
  "internet",
  "bluetooth",
  "back",
  "here",
  "there",
  "again",
  "dashboard",
  "expert",
  "what",
  "how",
  "something",
  "anything",
  "someone",
  "everything",
]);
export const COMPOSIO_NATIVE_CONTEXT =
  /\b(google|microsoft|gmail|outlook|office\s*365|nest\.expert|nest\s+expert|dashboard)\b.*\b(account|calendar|email|inbox)?|\b(another|add)\s+(google|microsoft)\b|\b(primary|swap)\s+account\b/i;
export const COMPOSIO_TRIGGERISH =
  /\b(trigger|notify\s+me\s+when|let\s+me\s+know\s+when|let\s+me\s+know\s+whenever|watch\s+for|automation|whenever\s+i\b|when\s+i\s+get(\s+a|\s+an)?\s+new)\b/i;

/** Ongoing "tell me when I get mail…" — no connect|link verb, but needs Composio Gmail triggers. */
export const COMPOSIO_EMAIL_WATCH_NOTIFY =
  /(?:\b(?:let\s+me\s+know|notify\s+me|alert\s+me|tell\s+me|ping\s+me)\s+(?:when(?:ever)?|if)\b|\bwhen(?:ever)?\s+i\s+get\b|\bwatch\s+(?:for\s+)?(?:a\s+)?(?:new\s+)?(?:emails?|mail|messages?|gmail)\b)/i;
export const COMPOSIO_EMAIL_CONTEXT =
  /\b(email|emails?|e-?mail|inbox|gmail|message(?:s)?\s+from|mail\s+from|from\s+[\w.+-]+@[\w.-]+\.\w{2,})\b/i;

export function isComposioEmailWatchIntent(message: string): boolean {
  return COMPOSIO_EMAIL_WATCH_NOTIFY.test(message) &&
    COMPOSIO_EMAIL_CONTEXT.test(message);
}

export interface ParsedComposioConnectIntent {
  target: string;
  needsWrite: boolean;
}

export function parseComposioConnectIntent(message: string): ParsedComposioConnectIntent | null {
  if (!COMPOSIO_CONNECT_VERB.test(message)) return null;
  if (COMPOSIO_NATIVE_CONTEXT.test(message)) return null;

  const match = message.match(COMPOSIO_CONNECT_TAIL);
  const target = match?.[2]?.toLowerCase();
  if (!target || COMPOSIO_EXCLUDED_TARGETS.has(target)) return null;

  return {
    target,
    needsWrite: COMPOSIO_TRIGGERISH.test(message),
  };
}
