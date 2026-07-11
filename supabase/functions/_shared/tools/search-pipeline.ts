import {
  geminiGroundedSearch,
  type GeminiGroundedSearchResult,
  type GeminiGroundingSource,
} from "../ai/gemini.ts";

export type SearchMode = "web" | "news";
export type SearchVariantPurpose =
  | "primary"
  | "corroboration"
  | "disambiguation"
  | "coverage";
export type SearchVerificationState =
  | "high_confidence"
  | "mixed_signals"
  | "single_source"
  | "stale_or_unclear";

export interface SearchQueryVariant {
  label: string;
  query: string;
  purpose: SearchVariantPurpose;
}

export interface SearchEvidenceSource {
  title: string;
  url: string;
  domain: string;
  snippet?: string;
  key: string;
  firstSeenIn: string;
  purposes: SearchVariantPurpose[];
  duplicateCount: number;
}

export interface SearchClaim {
  type: "score" | "price" | "percentage" | "date" | "time" | "ranking";
  value: string;
  normalisedValue: string;
  sentence: string;
  variantLabel: string;
}

export interface SearchVariantResult {
  label: string;
  purpose: SearchVariantPurpose;
  query: string;
  answerText: string;
  sources: SearchEvidenceSource[];
  claims: SearchClaim[];
  domainCount: number;
}

export interface SearchVerificationSummary {
  status: SearchVerificationState;
  confidence: number;
  shouldHedge: boolean;
  notes: string[];
  independentSourceCount: number;
  duplicateSourceCount: number;
  corroboratedClaimCount: number;
  conflictingClaimCount: number;
  semanticAgreement: number;
}

export interface SearchEvidenceBundle extends Record<string, unknown> {
  mode: SearchMode;
  originalQuery: string;
  executedAt: string;
  bestAnswer: string;
  answerStyle: "direct" | "hedged";
  variants: SearchVariantResult[];
  sources: SearchEvidenceSource[];
  verification: SearchVerificationSummary;
}

const MONTH_RE =
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "in",
  "is",
  "it",
  "its",
  "latest",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "today",
  "what",
  "when",
  "who",
  "with",
]);

const SCORE_RE = /\b\d{1,3}\s*(?:-|\u2013)\s*\d{1,3}\b/g;
const PRICE_RE =
  /\b(?:[$]\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:million|billion|m|bn))?|\d[\d,]*(?:\.\d+)?\s?(?:usd|aud|eur|gbp))\b/gi;
const PERCENT_RE = /\b\d+(?:\.\d+)?%\b/g;
const DATE_RE =
  /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?|(?:\d{1,2}\s+)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+\d{1,2})?(?:,\s+\d{4})?)\b/gi;
const TIME_RE =
  /\b\d{1,2}(?::\d{2})?\s?(?:am|pm|a\.m\.|p\.m\.|utc|gmt|aest|aedt)\b/gi;
const RANKING_RE =
  /\b(?:no\.?\s?\d+|number\s+\d+|rank(?:ed|ing)?\s+(?:no\.?\s?)?\d+|top\s+\d+)\b/gi;

function stripSourcesBlock(text: string): string {
  return text.replace(/\n+\s*Sources:\s*[\s\S]*$/i, "").trim();
}

function normaliseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function truncate(text: string, max = 220): string {
  const clean = normaliseWhitespace(text);
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 3).trim()}...`;
}

function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normaliseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

function buildSourceKey(source: GeminiGroundingSource): string {
  const titleKey = normaliseTitle(source.title ?? "");
  if (titleKey.length >= 24) return `title:${titleKey}`;
  const urlKey = normaliseUrl(source.url ?? "");
  if (urlKey) return `url:${urlKey}`;
  return `domain:${source.domain ?? "unknown"}:${titleKey}`;
}

function tokenizeForSimilarity(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
  return new Set(tokens);
}

function jaccardSimilarity(a: string, b: string): number {
  const aTokens = tokenizeForSimilarity(a);
  const bTokens = tokenizeForSimilarity(b);
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap++;
  }
  const union = new Set([...aTokens, ...bTokens]).size;
  return union === 0 ? 0 : overlap / union;
}

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function normaliseClaimValue(
  type: SearchClaim["type"],
  value: string,
): string {
  const base = normaliseWhitespace(value.toLowerCase());
  if (type === "score") {
    return base.replace(/\u2013/g, "-").replace(/\s*-\s*/g, "-");
  }
  if (type === "price" || type === "percentage") {
    const numeric = base.replace(/[^0-9.]/g, "");
    return numeric || base;
  }
  if (type === "date") {
    return base
      .replace(/,/g, "")
      .replace(/\b(st|nd|rd|th)\b/g, "")
      .replace(/\s+/g, " ");
  }
  if (type === "time") {
    return base.replace(/\s+/g, "");
  }
  if (type === "ranking") {
    return base
      .replace(/\bnumber\b/g, "no")
      .replace(/\s+/g, " ")
      .trim();
  }
  return base;
}

function pushClaim(
  claims: SearchClaim[],
  seen: Set<string>,
  type: SearchClaim["type"],
  value: string,
  sentence: string,
  variantLabel: string,
): void {
  const normalisedValue = normaliseClaimValue(type, value);
  const key = `${type}:${normalisedValue}:${variantLabel}`;
  if (seen.has(key)) return;
  seen.add(key);
  claims.push({
    type,
    value: value.trim(),
    normalisedValue,
    sentence: truncate(sentence, 180),
    variantLabel,
  });
}

function extractClaims(text: string, variantLabel: string): SearchClaim[] {
  const sentences = splitIntoSentences(text);
  const claims: SearchClaim[] = [];
  const seen = new Set<string>();

  for (const sentence of sentences) {
    for (const match of sentence.matchAll(SCORE_RE)) {
      pushClaim(claims, seen, "score", match[0], sentence, variantLabel);
    }
    for (const match of sentence.matchAll(PRICE_RE)) {
      pushClaim(claims, seen, "price", match[0], sentence, variantLabel);
    }
    for (const match of sentence.matchAll(PERCENT_RE)) {
      pushClaim(claims, seen, "percentage", match[0], sentence, variantLabel);
    }
    for (const match of sentence.matchAll(DATE_RE)) {
      if (!MONTH_RE.test(match[0]) && !/\d{4}-\d{2}-\d{2}/.test(match[0]) && !/[\/-]/.test(match[0])) {
        continue;
      }
      pushClaim(claims, seen, "date", match[0], sentence, variantLabel);
    }
    for (const match of sentence.matchAll(TIME_RE)) {
      pushClaim(claims, seen, "time", match[0], sentence, variantLabel);
    }
    for (const match of sentence.matchAll(RANKING_RE)) {
      pushClaim(claims, seen, "ranking", match[0], sentence, variantLabel);
    }
  }

  return claims;
}

function isExactFactQuery(query: string): boolean {
  return /\b(score|won|winner|price|cost|worth|market cap|ranking|rank|standings|leader|leading|date|when|what time|time|schedule|fixture|stat|stats|points?|latest|today|current|now|how much)\b/i
    .test(query);
}

function dedupeSources(variants: SearchVariantResult[]): SearchEvidenceSource[] {
  const deduped = new Map<string, SearchEvidenceSource>();

  for (const variant of variants) {
    for (const source of variant.sources) {
      const existing = deduped.get(source.key);
      if (existing) {
        existing.duplicateCount += 1;
        if (!existing.purposes.includes(source.purposes[0])) {
          existing.purposes.push(source.purposes[0]);
        }
        continue;
      }
      deduped.set(source.key, {
        ...source,
        purposes: [...source.purposes],
      });
    }
  }

  return [...deduped.values()];
}

function computeSemanticAgreement(variants: SearchVariantResult[]): number {
  const answers = variants
    .map((variant) => variant.answerText)
    .filter((answer) => answer.length > 20);
  if (answers.length < 2) return 0;

  const scores: number[] = [];
  for (let i = 0; i < answers.length; i++) {
    for (let j = i + 1; j < answers.length; j++) {
      scores.push(jaccardSimilarity(answers[i], answers[j]));
    }
  }
  if (scores.length === 0) return 0;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function verifyWebEvidence(
  originalQuery: string,
  variants: SearchVariantResult[],
  dedupedSources: SearchEvidenceSource[],
): SearchVerificationSummary {
  const filledVariants = variants.filter((variant) => variant.answerText.length > 0);
  const independentSourceCount = dedupedSources.length;
  const duplicateSourceCount = dedupedSources.reduce((sum, source) =>
    sum + Math.max(0, source.duplicateCount - 1), 0
  );
  const semanticAgreement = computeSemanticAgreement(filledVariants);

  if (filledVariants.length === 0 || independentSourceCount === 0) {
    return {
      status: "stale_or_unclear",
      confidence: 0.2,
      shouldHedge: true,
      notes: ["The search passes did not return enough grounded evidence to answer confidently."],
      independentSourceCount,
      duplicateSourceCount,
      corroboratedClaimCount: 0,
      conflictingClaimCount: 0,
      semanticAgreement,
    };
  }

  const claimGroups = new Map<string, SearchClaim[]>();
  const claimTypes = new Map<SearchClaim["type"], Set<string>>();

  for (const variant of filledVariants) {
    for (const claim of variant.claims) {
      const canonicalValue = normaliseClaimValue(claim.type, claim.value);
      const groupKey = `${claim.type}:${canonicalValue}`;
      const bucket = claimGroups.get(groupKey) ?? [];
      bucket.push({
        ...claim,
        normalisedValue: canonicalValue,
      });
      claimGroups.set(groupKey, bucket);
      const values = claimTypes.get(claim.type) ?? new Set<string>();
      values.add(canonicalValue);
      claimTypes.set(claim.type, values);
    }
  }

  let corroboratedClaimCount = 0;
  for (const claims of claimGroups.values()) {
    const variantLabels = new Set(claims.map((claim) => claim.variantLabel));
    if (variantLabels.size >= 2) corroboratedClaimCount++;
  }

  let conflictingClaimCount = 0;
  for (const values of claimTypes.values()) {
    if (values.size >= 2) conflictingClaimCount++;
  }

  const notes: string[] = [];
  notes.push(
    `Cross-checked across ${independentSourceCount} independent grounded source${independentSourceCount === 1 ? "" : "s"}.`,
  );
  if (duplicateSourceCount > 0) {
    notes.push(
      `Collapsed ${duplicateSourceCount} duplicate or syndicated source hit${duplicateSourceCount === 1 ? "" : "s"}.`,
    );
  }

  const exactQuery = isExactFactQuery(originalQuery);
  if (conflictingClaimCount > 0) {
    notes.push("Different search passes disagreed on at least one exact figure or timing.");
    return {
      status: "mixed_signals",
      confidence: 0.35,
      shouldHedge: true,
      notes,
      independentSourceCount,
      duplicateSourceCount,
      corroboratedClaimCount,
      conflictingClaimCount,
      semanticAgreement,
    };
  }

  if (independentSourceCount < 2) {
    notes.push("Only one solid source survived the cross-check, so exact details may still move.");
    return {
      status: "single_source",
      confidence: 0.45,
      shouldHedge: true,
      notes,
      independentSourceCount,
      duplicateSourceCount,
      corroboratedClaimCount,
      conflictingClaimCount,
      semanticAgreement,
    };
  }

  if (corroboratedClaimCount > 0) {
    notes.push(
      `Matched ${corroboratedClaimCount} exact fact${corroboratedClaimCount === 1 ? "" : "s"} across multiple search passes.`,
    );
    return {
      status: "high_confidence",
      confidence: 0.9,
      shouldHedge: false,
      notes,
      independentSourceCount,
      duplicateSourceCount,
      corroboratedClaimCount,
      conflictingClaimCount,
      semanticAgreement,
    };
  }

  if (!exactQuery && semanticAgreement >= 0.42) {
    notes.push("The summaries aligned closely enough across multiple search passes.");
    return {
      status: "high_confidence",
      confidence: 0.74,
      shouldHedge: false,
      notes,
      independentSourceCount,
      duplicateSourceCount,
      corroboratedClaimCount,
      conflictingClaimCount,
      semanticAgreement,
    };
  }

  notes.push("Multiple sources were found, but the exact answer was not strongly corroborated.");
  return {
    status: "single_source",
    confidence: 0.55,
    shouldHedge: true,
    notes,
    independentSourceCount,
    duplicateSourceCount,
    corroboratedClaimCount,
    conflictingClaimCount,
    semanticAgreement,
  };
}

function verifyNewsCoverage(
  variants: SearchVariantResult[],
  dedupedSources: SearchEvidenceSource[],
): SearchVerificationSummary {
  const filledVariants = variants.filter((variant) => variant.answerText.length > 0);
  const independentSourceCount = dedupedSources.length;
  const duplicateSourceCount = dedupedSources.reduce((sum, source) =>
    sum + Math.max(0, source.duplicateCount - 1), 0
  );
  const notes: string[] = [];

  if (filledVariants.length === 0 || independentSourceCount === 0) {
    return {
      status: "stale_or_unclear",
      confidence: 0.2,
      shouldHedge: true,
      notes: ["The news search did not return enough grounded coverage to build a reliable briefing."],
      independentSourceCount,
      duplicateSourceCount,
      corroboratedClaimCount: 0,
      conflictingClaimCount: 0,
      semanticAgreement: 0,
    };
  }

  notes.push(
    `Coverage pulled from ${independentSourceCount} grounded outlet${independentSourceCount === 1 ? "" : "s"} after deduping repeats.`,
  );
  if (duplicateSourceCount > 0) {
    notes.push(
      `Removed ${duplicateSourceCount} duplicate or syndicated headline${duplicateSourceCount === 1 ? "" : "s"} from the evidence pool.`,
    );
  }

  if (independentSourceCount < 2) {
    notes.push("The briefing leaned on a very small source pool.");
    return {
      status: "single_source",
      confidence: 0.45,
      shouldHedge: true,
      notes,
      independentSourceCount,
      duplicateSourceCount,
      corroboratedClaimCount: 0,
      conflictingClaimCount: 0,
      semanticAgreement: 0,
    };
  }

  if (duplicateSourceCount >= independentSourceCount) {
    notes.push("A lot of the coverage was duplicated, so breadth may be thinner than it looks.");
    return {
      status: "mixed_signals",
      confidence: 0.5,
      shouldHedge: true,
      notes,
      independentSourceCount,
      duplicateSourceCount,
      corroboratedClaimCount: 0,
      conflictingClaimCount: 0,
      semanticAgreement: 0,
    };
  }

  notes.push("The briefing has enough source diversity to answer directly.");
  return {
    status: "high_confidence",
    confidence: independentSourceCount >= 4 ? 0.84 : 0.76,
    shouldHedge: false,
    notes,
    independentSourceCount,
    duplicateSourceCount,
    corroboratedClaimCount: 0,
    conflictingClaimCount: 0,
    semanticAgreement: 0,
  };
}

function chooseBestAnswer(
  variants: SearchVariantResult[],
  verification: SearchVerificationSummary,
): string {
  const ordered = [...variants]
    .filter((variant) => variant.answerText.length > 0)
    .sort((a, b) => {
      if (a.sources.length !== b.sources.length) return b.sources.length - a.sources.length;
      return b.answerText.length - a.answerText.length;
    });

  const best = ordered[0];
  if (!best) return "";

  const answer = best.answerText;
  if (verification.status === "high_confidence") return answer;
  if (verification.status === "mixed_signals") {
    return `${answer}\n\nNote: exact details conflicted across search passes, so treat the specific figures or timings cautiously.`;
  }
  if (verification.status === "single_source") {
    return `${answer}\n\nNote: this only had limited corroboration, so exact live details may still shift.`;
  }
  return answer;
}

function formatSourcesForTool(sources: SearchEvidenceSource[], maxSources = 6): string[] {
  return sources.slice(0, maxSources).map((source) => {
    const label = source.title?.trim() || source.domain;
    const snippet = source.snippet ? ` - ${truncate(source.snippet, 120)}` : "";
    return `- ${label} (${source.domain})${snippet}`;
  });
}

export function buildSearchToolContent(bundle: SearchEvidenceBundle): string {
  const lines: string[] = [];
  const verification = bundle.verification;
  const pct = Math.round(verification.confidence * 100);

  if (bundle.mode === "web") {
    lines.push(`Search verification: ${verification.status} (${pct}% confidence)`);
    for (const note of verification.notes) {
      lines.push(`- ${note}`);
    }
    if (bundle.bestAnswer) {
      lines.push("");
      lines.push("Best grounded answer:");
      lines.push(bundle.bestAnswer);
    }
    const supporting = bundle.variants
      .filter((variant) => variant.answerText.length > 0)
      .map((variant) =>
        `- [${variant.label}] ${truncate(variant.answerText, 220)}`
      );
    if (supporting.length > 0) {
      lines.push("");
      lines.push("Cross-check summaries:");
      lines.push(...supporting);
    }
  } else {
    lines.push(`News coverage check: ${verification.status} (${pct}% confidence)`);
    for (const note of verification.notes) {
      lines.push(`- ${note}`);
    }
    for (const variant of bundle.variants) {
      if (!variant.answerText) continue;
      lines.push("");
      lines.push(`=== ${variant.label} ===`);
      lines.push(variant.answerText);
    }
  }

  const sourceLines = formatSourcesForTool(bundle.sources);
  if (sourceLines.length > 0) {
    lines.push("");
    lines.push("Grounded sources:");
    lines.push(...sourceLines);
  }

  return lines.join("\n").trim();
}

function buildVariantResult(
  variant: SearchQueryVariant,
  result: GeminiGroundedSearchResult,
): SearchVariantResult {
  const answerText = stripSourcesBlock(result.text);
  const sources = result.sources.map((source) => ({
    title: source.title || source.domain,
    url: source.url,
    domain: source.domain,
    snippet: source.snippet,
    key: buildSourceKey(source),
    firstSeenIn: variant.label,
    purposes: [variant.purpose],
    duplicateCount: 1,
  }));
  const claims = extractClaims(answerText, variant.label);
  const uniqueDomains = new Set(sources.map((source) => source.domain));

  return {
    label: variant.label,
    purpose: variant.purpose,
    query: variant.query,
    answerText,
    sources,
    claims,
    domainCount: uniqueDomains.size,
  };
}

export function buildSearchEvidenceBundle(opts: {
  mode: SearchMode;
  originalQuery: string;
  variants: SearchVariantResult[];
  executedAt?: string;
}): SearchEvidenceBundle {
  const dedupedSources = dedupeSources(opts.variants);
  const verification = opts.mode === "web"
    ? verifyWebEvidence(opts.originalQuery, opts.variants, dedupedSources)
    : verifyNewsCoverage(opts.variants, dedupedSources);

  return {
    mode: opts.mode,
    originalQuery: opts.originalQuery,
    executedAt: opts.executedAt ?? new Date().toISOString(),
    bestAnswer: chooseBestAnswer(opts.variants, verification),
    answerStyle: verification.shouldHedge ? "hedged" : "direct",
    variants: opts.variants,
    sources: dedupedSources,
    verification,
  };
}

export async function runSearchPipeline(opts: {
  mode: SearchMode;
  originalQuery: string;
  variants: SearchQueryVariant[];
  model: string;
  conversationContext?: string;
}): Promise<SearchEvidenceBundle> {
  const settled = await Promise.allSettled(
    opts.variants.map(async (variant) => {
      const result = await geminiGroundedSearch({
        model: opts.model,
        query: variant.query,
        conversationContext: opts.conversationContext,
      });
      return buildVariantResult(variant, result);
    }),
  );
  const variantResults = settled.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    const variant = opts.variants[index];
    return {
      label: variant.label,
      purpose: variant.purpose,
      query: variant.query,
      answerText: "",
      sources: [],
      claims: [],
      domainCount: 0,
    } satisfies SearchVariantResult;
  });
  return buildSearchEvidenceBundle({
    mode: opts.mode,
    originalQuery: opts.originalQuery,
    variants: variantResults,
  });
}

export function buildWebSearchVariants(opts: {
  originalQuery: string;
  timedQuery: string;
}): SearchQueryVariant[] {
  const variants: SearchQueryVariant[] = [
    {
      label: "Primary",
      purpose: "primary",
      query: opts.timedQuery,
    },
    {
      label: "Cross-check",
      purpose: "corroboration",
      query:
        `${opts.timedQuery} Independently verify the answer and focus on exact names, dates, rankings, prices, scores, or timings if they matter.`,
    },
  ];

  if (isExactFactQuery(opts.originalQuery)) {
    variants.push({
      label: "Disambiguation",
      purpose: "disambiguation",
      query:
        `${opts.timedQuery} Resolve any ambiguity in the exact answer. If figures or timings differ between reports, call that out plainly instead of smoothing it over.`,
    });
  }

  return variants;
}

export function buildSearchConfidenceGuard(
  text: string,
  payload: SearchEvidenceBundle | null,
  userMessage: string,
): { text: string; overridden: boolean } {
  if (!text || !payload) return { text, overridden: false };
  const verification = payload.verification;
  if (verification.status === "high_confidence") {
    return { text, overridden: false };
  }

  const exactFactRequest = isExactFactQuery(userMessage);
  const alreadyHedged =
    /\b(from what i can tell|looks like|appears|seems|mixed|conflicting|not fully clear|not totally clear|hard to pin down|i can'?t confirm|i wouldn'?t lock in|i don'?t want to overstate)\b/i
      .test(text);

  if (!exactFactRequest || alreadyHedged) {
    return { text, overridden: false };
  }

  if (verification.status === "mixed_signals") {
    return {
      text: payload.bestAnswer || "I'm seeing conflicting reports on the exact details, so I wouldn't lock in one definitive number or timing yet.",
      overridden: true,
    };
  }
  if (verification.status === "single_source") {
    return {
      text: payload.bestAnswer || "I found a likely answer, but it only had thin corroboration, so I'd treat the exact live details cautiously.",
      overridden: true,
    };
  }
  return {
    text: "I couldn't get a clean enough cross-check on that to state the live details confidently right now.",
    overridden: true,
  };
}
