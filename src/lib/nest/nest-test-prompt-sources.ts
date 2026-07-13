import {
  COACH_CONFIG_FIELDS,
  coachFieldLabel,
  type CoachConfigField,
} from "@/lib/nest/prompt-coach-types";
import type { NestProductionTestTrace } from "@/lib/nest/nest-workspace-types";

export type NestTestPromptSource = {
  title: string;
  excerpt: string;
};

const FIELD_TOPIC_HINTS: Partial<Record<CoachConfigField, string[]>> = {
  hours_text: ["hour", "hours", "open", "opening", "close", "closed", "today", "weekend"],
  prices_text: ["price", "prices", "cost", "much", "fee", "charge", "$", "aud"],
  services_products_text: [
    "service",
    "services",
    "repair",
    "repairs",
    "product",
    "products",
    "bike",
    "tyre",
    "tyres",
    "scooter",
    "fit",
  ],
  booking_info_text: ["book", "booking", "appointment", "schedule", "availability"],
  policies_text: ["policy", "policies", "warranty", "return", "refund"],
  contact_text: ["contact", "phone", "call", "email", "address", "location"],
  opening_line: ["hello", "welcome", "greeting"],
  style_notes: ["tone", "style", "friendly", "formal"],
  escalation_text: ["escalate", "manager", "human", "team"],
  extra_knowledge: ["know", "information", "details"],
};

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "are",
  "you",
  "your",
  "can",
  "how",
  "what",
  "when",
  "where",
  "does",
  "do",
  "is",
  "a",
  "an",
  "to",
  "of",
  "in",
  "it",
  "we",
  "our",
  "this",
  "that",
  "with",
  "about",
  "much",
  "any",
  "have",
  "get",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9$]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function excerptText(value: string, max = 280): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function scoreContent(args: {
  queryTokens: string[];
  field?: CoachConfigField;
  title: string;
  content: string;
  reply: string;
}): number {
  const haystack = `${args.title} ${args.content}`.toLowerCase();
  let score = 0;

  for (const token of args.queryTokens) {
    if (haystack.includes(token)) score += 3;
  }

  if (args.field) {
    for (const hint of FIELD_TOPIC_HINTS[args.field] ?? []) {
      if (args.queryTokens.some((token) => token.includes(hint) || hint.includes(token))) {
        score += 4;
      }
    }
  }

  const numericMatches = args.reply.match(/\$?\d+(?:\.\d+)?/g) ?? [];
  for (const match of numericMatches) {
    if (haystack.includes(match.replace("$", "")) || haystack.includes(match)) {
      score += 8;
    }
  }

  return score;
}

export function selectNestTestPromptSources(args: {
  question: string;
  reply: string;
  config: Record<string, string>;
  knowledge: Array<{ title: string; content_text: string; summary?: string }>;
  limit?: number;
}): NestTestPromptSource[] {
  const queryTokens = [
    ...new Set([...tokenize(args.question), ...tokenize(args.reply)]),
  ];
  const candidates: Array<{ score: number; title: string; excerpt: string }> = [];

  for (const field of COACH_CONFIG_FIELDS) {
    const value = args.config[field]?.trim();
    if (!value) continue;
    const score = scoreContent({
      queryTokens,
      field,
      title: coachFieldLabel(field),
      content: value,
      reply: args.reply,
    });
    if (score <= 0) continue;
    candidates.push({
      score,
      title: coachFieldLabel(field),
      excerpt: excerptText(value),
    });
  }

  for (const item of args.knowledge) {
    const content = item.summary?.trim() || item.content_text.trim();
    if (!content) continue;
    const score = scoreContent({
      queryTokens,
      title: item.title,
      content,
      reply: args.reply,
    });
    if (score <= 0) continue;
    candidates.push({
      score,
      title: item.title,
      excerpt: excerptText(content),
    });
  }

  const ranked = candidates
    .sort((left, right) => right.score - left.score)
    .slice(0, args.limit ?? 3);

  if (ranked.length > 0) {
    return ranked.map(({ title, excerpt }) => ({ title, excerpt }));
  }

  const fallback = COACH_CONFIG_FIELDS.map((field) => {
    const value = args.config[field]?.trim();
    if (!value) return null;
    return {
      title: coachFieldLabel(field),
      excerpt: excerptText(value),
    };
  }).filter(Boolean) as NestTestPromptSource[];

  return fallback.slice(0, 2);
}

export function buildNestTestTrace(args: {
  question: string;
  reply: string;
  config: Record<string, string>;
  knowledge: Array<{ title: string; content_text: string; summary?: string }>;
  model?: string | null;
  route?: string | null;
}): NestProductionTestTrace {
  return {
    model: args.model ?? null,
    route: args.route ?? null,
    totalLatencyMs: null,
    inputTokens: null,
    outputTokens: null,
    toolsUsed: [],
    context: [],
    promptSources: selectNestTestPromptSources({
      question: args.question,
      reply: args.reply,
      config: args.config,
      knowledge: args.knowledge,
    }),
  };
}
