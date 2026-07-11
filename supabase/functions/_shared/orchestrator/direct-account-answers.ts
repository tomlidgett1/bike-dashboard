import type { TurnContext, TurnInput } from "./types.ts";

type DirectAccountIntent =
  | "name"
  | "verification"
  | "connected_email"
  | "connected_accounts";

const NAME_PATTERN = /\b(what(?:s| is)\s+my\s+name|who\s+am\s+i)\b/i;
const VERIFICATION_PATTERN = /\b(am\s+i\s+verified|are\s+you\s+showing\s+me\s+as\s+verified|do\s+you\s+show\s+me\s+as\s+verified)\b/i;
const CONNECTED_EMAIL_PATTERN =
  /\b(what(?:s| is)\s+my\s+email(?:\s+address)?|what\s+email(?:s)?\s+do\s+you\s+(?:have|see)|which\s+email(?:s)?\s+do\s+you\s+(?:have|see)|what(?:s| is)\s+the\s+email\s+(?:you|youve|you have)\s+(?:got|have|see)|do\s+you\s+have\s+my\s+email|what\s+email(?:s)?\s+(?:have\s+)?i\s+(?:got\s+)?connected)\b/i;
const CONNECTED_ACCOUNTS_PATTERN =
  /\b(what(?:s| is)\s+connected|what\s+accounts?\s+are\s+connected|which\s+accounts?\s+are\s+connected|what\s+do\s+i\s+have\s+connected)\b/i;

const OTHER_TASK_HINTS =
  /\b(draft|write|send|book|remind|set|schedule|cancel|delete|create|update|forward|compose|add|move|find|search|look up|google|directions|route|weather|news|map|get to)\b/i;

const FILLER_ONLY_PATTERN =
  /^(?:i\s+said|tell\s+me|answer\s+me|just|seriously|bro|mate|man|dude|oi|ffs|wtf|please|pls|again|now|then|yeah|yep|nah|ok|okay|yo|hey|hi|hello|fuck|fucking|shit|cunt|bitch|\s)+$/i;

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[?!.,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSegments(message: string): string[] {
  const segments = message
    .replace(/\r/g, "")
    .split(/\n+|[?]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  return segments.length > 0 ? segments : [message.trim()].filter(Boolean);
}

function classifySegment(segment: string): DirectAccountIntent | null {
  const normalised = normalise(segment);
  if (!normalised) return null;
  if (OTHER_TASK_HINTS.test(normalised)) return null;
  if (NAME_PATTERN.test(normalised)) return "name";
  if (VERIFICATION_PATTERN.test(normalised)) return "verification";
  if (CONNECTED_EMAIL_PATTERN.test(normalised)) return "connected_email";
  if (CONNECTED_ACCOUNTS_PATTERN.test(normalised)) return "connected_accounts";
  return null;
}

function isIgnorableSegment(segment: string): boolean {
  const normalised = normalise(segment);
  if (!normalised) return true;
  return FILLER_ONLY_PATTERN.test(normalised);
}

function getKnownName(
  context: Pick<TurnContext, "memoryItems" | "senderProfile">,
): string | null {
  const memoryName = context.memoryItems.find((item) =>
    item.category === "name" &&
    item.status === "active" &&
    item.valueText.trim().length > 0
  )?.valueText?.trim();

  if (memoryName) return memoryName;
  return context.senderProfile?.name?.trim() || null;
}

function listConnectedEmails(
  context: Pick<TurnContext, "connectedAccounts">,
): string[] {
  return [...new Set(
    context.connectedAccounts
      .map((account) => account.email.trim())
      .filter(Boolean),
  )];
}

function formatConnectedAccounts(
  context: Pick<TurnContext, "connectedAccounts">,
): string[] {
  return context.connectedAccounts
    .map((account) => {
      const provider = account.provider === "microsoft"
        ? "Outlook"
        : account.provider === "google"
        ? "Google"
        : "Granola";
      return `${provider}: ${account.email}`;
    });
}

function renderIntent(
  intent: DirectAccountIntent,
  context: Pick<TurnContext, "memoryItems" | "senderProfile" | "connectedAccounts">,
  input: Pick<TurnInput, "isOnboarding">,
): string {
  switch (intent) {
    case "name": {
      const name = getKnownName(context);
      return name ? `${name}.` : "I don't have your name on file yet.";
    }
    case "verification":
      return input.isOnboarding ? "No, not yet." : "Yep, you're verified.";
    case "connected_email": {
      const emails = listConnectedEmails(context);
      if (emails.length === 0) {
        return input.isOnboarding
          ? "I don't have a connected email account on file yet."
          : "I don't have any connected email accounts on file.";
      }
      if (emails.length === 1) {
        return `The connected email I've got is ${emails[0]}.`;
      }
      return `I've got these connected: ${emails.join(", ")}.`;
    }
    case "connected_accounts": {
      const accounts = formatConnectedAccounts(context);
      if (accounts.length === 0) {
        return input.isOnboarding
          ? "I don't have any connected accounts on file yet."
          : "I don't have any connected accounts on file.";
      }
      if (accounts.length === 1) {
        return `I've got ${accounts[0]}.`;
      }
      return `I've got ${accounts.join("; ")}.`;
    }
  }
}

export function buildDirectAccountAnswer(
  context: Pick<TurnContext, "memoryItems" | "senderProfile" | "connectedAccounts">,
  input: Pick<TurnInput, "userMessage" | "isOnboarding" | "isGroupChat">,
): string | null {
  if (input.isGroupChat) return null;

  const segments = splitSegments(input.userMessage);
  const intents: DirectAccountIntent[] = [];

  for (const segment of segments) {
    const intent = classifySegment(segment);
    if (intent) {
      intents.push(intent);
      continue;
    }
    if (!isIgnorableSegment(segment)) {
      return null;
    }
  }

  if (intents.length === 0) return null;

  const deduped: DirectAccountIntent[] = [];
  for (const intent of intents) {
    if (!deduped.includes(intent)) deduped.push(intent);
  }

  return deduped
    .map((intent) => renderIntent(intent, context, input))
    .join("\n---\n");
}
