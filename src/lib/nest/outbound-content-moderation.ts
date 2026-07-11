/**
 * Outbound content moderation for Nest (SMS/iMessage) messages to customers.
 *
 * Three layers (all server-side, before Linq send):
 * 1. Fast local lexicon — blocks known expletives / slurs instantly.
 * 2. OpenAI Moderation API — category flags + score thresholds (catches near-misses
 *    the boolean `flagged` bit often misses on single-word insults).
 * 3. Shop-appropriateness LLM — gpt-4.1-mini yes/no for bike-shop → customer SMS.
 *
 * Fail-closed on lexicon hits. If Moderation/LLM APIs are unavailable, lexicon still
 * applies; we do not silently skip known bad words.
 */

export const NEST_CONTENT_BLOCKED_CODE = "CONTENT_BLOCKED" as const;

export type NestOutboundModerationResult =
  | { allowed: true }
  | {
      allowed: false;
      code: typeof NEST_CONTENT_BLOCKED_CODE;
      /** Staff-facing explanation (Australian English). */
      userMessage: string;
      categories: string[];
      layer: "lexicon" | "moderation_api" | "llm_policy";
    };

const STAFF_BLOCK_MESSAGE =
  "This message can't be sent — it looks inappropriate for a customer. Please rewrite it without swearing, insults, or offensive language.";

/**
 * Strong expletives / slurs. Mild AU slang (bloody, crap, arse) is allowed for shop tone.
 * Word-boundary matching avoids false positives (classic, assassin, cocktail, peacock).
 */
const BLOCKED_LEXICON: RegExp[] = [
  // Common expletives
  /\bf+u+c+k+(?:ing|er|ed|s)?\b/i,
  /\bsh+i+t+(?:ty|s|head)?\b/i,
  /\bass+h[o0]les?\b/i,
  /\barseholes?\b/i,
  /\bb+i+t+c+h+(?:es|y)?\b/i,
  /\bc+u+n+t+s?\b/i,
  /\bd+i+c+k+(?:head|s)?\b/i,
  /\bcocks?\b/i,
  /\bp+i+ss+(?:ed|ing|off)?\b/i,
  /\bbastards?\b/i,
  /\bwankers?\b/i,
  /\bpricks?\b/i,
  /\bsluts?\b/i,
  /\bwhores?\b/i,
  /\btwats?\b/i,
  /\bpuss(?:y|ies)\b/i,
  /\btitt(?:y|ies)\b/i,
  /\bcocksuckers?\b/i,
  /\bmotherfuckers?\b/i,
  /\bdumbass(?:es)?\b/i,
  /\bjackass(?:es)?\b/i,
  /\bbollocks\b/i,
  // Slurs / discriminatory
  /\bn+i+gg+(?:a|er)s?\b/i,
  /\bfagg?[o0]ts?\b/i,
  /\bretard(?:ed|s)?\b/i,
  /\btrann(?:y|ies)\b/i,
  /\bchinks?\b/i,
  /\bchinky\b/i,
  /\bgooks?\b/i,
  /\bspics?\b/i,
  /\bwetbacks?\b/i,
  /\bkikes?\b/i,
  /\bpakis?\b/i,
  /\bragheads?\b/i,
  /\btowelheads?\b/i,
  /\bcoons?\b/i,
  /\bdarkies?\b/i,
  /\babbo?s?\b/i,
  /\babos?\b/i,
  /\bboongs?\b/i,
  /\bjaps?\b/i,
  /\bdykes?\b/i,
  /\bhomo\b/i,
  /\bqueers?\b/i,
];

/** OpenAI moderation categories that must never go to a customer. */
const BLOCKED_MODERATION_CATEGORIES = new Set([
  "hate",
  "hate/threatening",
  "harassment",
  "harassment/threatening",
  "self-harm",
  "self-harm/intent",
  "self-harm/instructions",
  "sexual",
  "sexual/minors",
  "violence",
  "violence/graphic",
  "illicit",
  "illicit/violent",
]);

/**
 * Stricter than OpenAI's default `flagged` bit — single-word slurs often score
 * ~0.2–0.4 without flipping the boolean. Tuned for outbound shop → customer SMS.
 */
const MODERATION_SCORE_THRESHOLDS: Record<string, number> = {
  hate: 0.2,
  "hate/threatening": 0.12,
  harassment: 0.4,
  "harassment/threatening": 0.2,
  "self-harm": 0.2,
  "self-harm/intent": 0.12,
  "self-harm/instructions": 0.12,
  sexual: 0.28,
  "sexual/minors": 0.05,
  violence: 0.35,
  "violence/graphic": 0.2,
  illicit: 0.35,
  "illicit/violent": 0.2,
};

function normaliseForLexicon(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[^\S\n]+/g, " ")
    // Strip common obfuscation: f.u.c.k, f*ck, f_u_c_k
    .replace(/([a-zA-Z])[.@*_\-]+(?=[a-zA-Z])/g, "$1")
    .trim();
}

export function findLexiconViolations(content: string): string[] {
  const normalised = normaliseForLexicon(content);
  if (!normalised) return [];

  const hits: string[] = [];
  for (const pattern of BLOCKED_LEXICON) {
    const match = normalised.match(pattern);
    if (match?.[0]) {
      hits.push(match[0].toLowerCase());
    }
  }
  return hits;
}

type OpenAiModerationResponse = {
  results?: Array<{
    flagged?: boolean;
    categories?: Record<string, boolean>;
    category_scores?: Record<string, number>;
  }>;
};

function pickOpenAiKey(): string | null {
  const key =
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.NEST_OPENAI_API_KEY?.trim() ||
    "";
  return key || null;
}

async function runOpenAiModeration(
  content: string,
): Promise<{ flaggedCategories: string[] } | null> {
  const apiKey = pickOpenAiKey();
  if (!apiKey) {
    console.warn("[nest-outbound-moderation] No OpenAI API key — lexicon-only mode");
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8_000);

  try {
    const res = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "omni-moderation-latest",
        input: content.slice(0, 8_000),
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(
        "[nest-outbound-moderation] OpenAI Moderations error:",
        res.status,
        errText.slice(0, 200),
      );
      return null;
    }

    const data = (await res.json()) as OpenAiModerationResponse;
    const result = data.results?.[0];
    if (!result) return { flaggedCategories: [] };

    const flaggedCategories = new Set<string>();
    const categories = result.categories ?? {};
    for (const [name, flagged] of Object.entries(categories)) {
      if (flagged && BLOCKED_MODERATION_CATEGORIES.has(name)) {
        flaggedCategories.add(name);
      }
    }

    const scores = result.category_scores ?? {};
    for (const [name, threshold] of Object.entries(MODERATION_SCORE_THRESHOLDS)) {
      const score = scores[name];
      if (typeof score === "number" && score >= threshold) {
        flaggedCategories.add(name);
      }
    }

    if (result.flagged && flaggedCategories.size === 0) {
      flaggedCategories.add("flagged");
    }

    return { flaggedCategories: [...flaggedCategories] };
  } catch (error) {
    console.warn(
      "[nest-outbound-moderation] OpenAI Moderations unavailable:",
      error instanceof Error ? error.message : error,
    );
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

type LlmPolicyResponse = {
  appropriate?: boolean;
  reason?: string;
};

/**
 * Final gate: ask a small model whether this is OK to send from a bike shop to a customer.
 * Catches insults/slurs that Moderation's boolean flag misses.
 */
async function runShopAppropriatenessLlm(
  content: string,
): Promise<{ appropriate: boolean; reason: string } | null> {
  const apiKey = pickOpenAiKey();
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0,
        max_tokens: 80,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a content gate for outbound SMS/iMessage from an Australian bicycle shop to a customer.

Return JSON only: {"appropriate":boolean,"reason":"short"}

Set appropriate=false ONLY when the message clearly includes:
- Swearing used as an expletive or insult (fuck, shit, cock, cunt, dick, bitch, etc.)
- Slurs or discriminatory language (racial/ethnic/homophobic/ableist), e.g. chink, gook, retard
- Personal insults, harassment, threats, or sexual content aimed at a person

Set appropriate=true for normal shop messages. Allow mild AU tone (bloody, cheers, mate, crap, hell).
Do NOT block ordinary English words that merely look similar (cocktail, assess, classic, scrap, pitch).
If the message is a normal customer update and contains no clear swear/slur/insult, set appropriate=true.`,
          },
          {
            role: "user",
            content: content.slice(0, 2_000),
          },
        ],
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(
        "[nest-outbound-moderation] LLM policy error:",
        res.status,
        errText.slice(0, 200),
      );
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!raw) return null;

    const parsed = JSON.parse(raw) as LlmPolicyResponse;
    if (typeof parsed.appropriate !== "boolean") return null;

    return {
      appropriate: parsed.appropriate,
      reason:
        typeof parsed.reason === "string" && parsed.reason.trim()
          ? parsed.reason.trim().slice(0, 120)
          : parsed.appropriate
            ? "ok"
            : "inappropriate",
    };
  } catch (error) {
    console.warn(
      "[nest-outbound-moderation] LLM policy unavailable:",
      error instanceof Error ? error.message : error,
    );
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Moderate outbound Nest message body before it is sent to a customer.
 * Attachment-only sends (empty content) are allowed.
 */
export async function moderateNestOutboundMessage(
  content: string,
): Promise<NestOutboundModerationResult> {
  const trimmed = content.trim();
  if (!trimmed) {
    return { allowed: true };
  }

  const lexiconHits = findLexiconViolations(trimmed);
  if (lexiconHits.length > 0) {
    console.info("[nest-outbound-moderation] blocked by lexicon", {
      hits: lexiconHits.slice(0, 5),
      length: trimmed.length,
    });
    return {
      allowed: false,
      code: NEST_CONTENT_BLOCKED_CODE,
      userMessage: STAFF_BLOCK_MESSAGE,
      categories: ["profanity"],
      layer: "lexicon",
    };
  }

  const moderation = await runOpenAiModeration(trimmed);
  if (moderation && moderation.flaggedCategories.length > 0) {
    console.info("[nest-outbound-moderation] blocked by moderation API", {
      categories: moderation.flaggedCategories,
      length: trimmed.length,
    });
    return {
      allowed: false,
      code: NEST_CONTENT_BLOCKED_CODE,
      userMessage: STAFF_BLOCK_MESSAGE,
      categories: moderation.flaggedCategories,
      layer: "moderation_api",
    };
  }

  const llm = await runShopAppropriatenessLlm(trimmed);
  if (llm && !llm.appropriate) {
    console.info("[nest-outbound-moderation] blocked by LLM policy", {
      reason: llm.reason,
      length: trimmed.length,
    });
    return {
      allowed: false,
      code: NEST_CONTENT_BLOCKED_CODE,
      userMessage: STAFF_BLOCK_MESSAGE,
      categories: ["llm_policy"],
      layer: "llm_policy",
    };
  }

  return { allowed: true };
}

export function isNestContentBlockedError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes(NEST_CONTENT_BLOCKED_CODE) ||
      error.message.includes("inappropriate for a customer") ||
      error.message.includes("can't be sent"))
  );
}
