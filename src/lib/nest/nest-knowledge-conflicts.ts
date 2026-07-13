import { pickServerEnv } from "@/lib/nest-portal/lib/server-env";
import type {
  NestConflictAnalysis,
  NestConflictMatch,
  NestConflictRelationship,
} from "@/lib/nest/nest-workspace-types";

export type NestConflictEntry = {
  sourceId: string;
  sourceType: "config" | "knowledge";
  title: string;
  content: string;
};

type Candidate = NestConflictEntry & { score: number };

const WORD_PATTERN = /[a-z0-9$%]+/g;

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[“”‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): Set<string> {
  return new Set(
    (normalise(value).match(WORD_PATTERN) ?? []).filter(
      (word) => word.length > 2 || /\d/.test(word),
    ),
  );
}

function candidateScore(draft: string, entry: string): number {
  const a = tokens(draft);
  const b = tokens(entry);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared += /\d/.test(token) ? 2 : 1;
  }
  const denominator = Math.max(1, Math.min(a.size, b.size));
  return shared / denominator;
}

/**
 * Candidate selection checks every entry before limiting the model catalogue.
 * Relevant entries therefore cannot disappear merely because they are item 41+.
 */
export function selectNestConflictCandidates(
  draft: string,
  entries: NestConflictEntry[],
  excludeSourceId?: string | null,
  limit = 60,
): Candidate[] {
  const draftKey = normalise(draft);
  return entries
    .filter(
      (entry) =>
        entry.sourceId !== excludeSourceId && normalise(entry.content).length > 0,
    )
    .map((entry) => {
      const entryKey = normalise(entry.content);
      const exact =
        entryKey === draftKey ||
        (draftKey.length >= 20 &&
          (entryKey.includes(draftKey) || draftKey.includes(entryKey)));
      return {
        ...entry,
        score: exact ? 10 : candidateScore(draft, entry.content),
      };
    })
    .filter((entry) => entry.score >= 0.12)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function deterministicResult(
  draft: string,
  candidates: Candidate[],
): NestConflictAnalysis {
  const draftKey = normalise(draft);
  const duplicate = candidates.find((entry) => {
    const key = normalise(entry.content);
    return (
      key === draftKey ||
      (draftKey.length >= 20 &&
        (key.includes(draftKey) || draftKey.includes(key)))
    );
  });
  if (duplicate) {
    return {
      status: "duplicate",
      summary: `${duplicate.title} already covers this information.`,
      matches: [
        {
          sourceId: duplicate.sourceId,
          sourceType: duplicate.sourceType,
          title: duplicate.title,
          relationship: "duplicate",
          existingText: duplicate.content,
          reason: "The same information is already stored in Nest.",
        },
      ],
    };
  }
  return {
    status: "clear",
    summary: "No conflicting information was found.",
    matches: [],
  };
}

function extractOpenAiText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string") return payload.output_text;
  if (!Array.isArray(payload.output)) return "";
  for (const output of payload.output) {
    if (!output || typeof output !== "object") continue;
    const content = (output as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (
        block &&
        typeof block === "object" &&
        (block as { type?: string }).type === "output_text" &&
        typeof (block as { text?: string }).text === "string"
      ) {
        return (block as { text: string }).text;
      }
    }
  }
  return "";
}

export async function analyseNestContentDraft(args: {
  title: string;
  content: string;
  entries: NestConflictEntry[];
  excludeSourceId?: string | null;
}): Promise<NestConflictAnalysis> {
  const content = args.content.trim();
  if (!content) {
    return {
      status: "clear",
      summary: "Add some details before checking for conflicts.",
      matches: [],
    };
  }

  const candidates = selectNestConflictCandidates(
    `${args.title}\n${content}`,
    args.entries,
    args.excludeSourceId,
  );
  const deterministic = deterministicResult(content, candidates);
  if (deterministic.status === "duplicate" || candidates.length === 0) {
    return deterministic;
  }

  const openaiKey = pickServerEnv(["OPENAI_API_KEY", "NEST_OPENAI_API_KEY"]);
  if (!openaiKey) return deterministic;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      store: false,
      instructions: `Compare a proposed bike-store fact or instruction with existing Nest content.
Return only material duplicate, contradiction or overlap matches. A contradiction means both statements cannot safely be true at once. Use plain Australian English. Never invent IDs and never expose hidden reasoning.`,
      input: [
        {
          role: "user",
          content: JSON.stringify({
            draft: { title: args.title.trim() || "New detail", content },
            existing: candidates.map((entry) => ({
              sourceId: entry.sourceId,
              sourceType: entry.sourceType,
              title: entry.title,
              content: entry.content.slice(0, 1800),
            })),
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "nest_content_conflicts",
          strict: true,
          schema: {
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: ["clear", "duplicate", "contradiction", "overlap"],
              },
              summary: { type: "string" },
              matches: {
                type: "array",
                maxItems: 8,
                items: {
                  type: "object",
                  properties: {
                    sourceId: { type: "string" },
                    relationship: {
                      type: "string",
                      enum: ["duplicate", "contradiction", "overlap"],
                    },
                    reason: { type: "string" },
                  },
                  required: ["sourceId", "relationship", "reason"],
                  additionalProperties: false,
                },
              },
            },
            required: ["status", "summary", "matches"],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!response.ok) return deterministic;
  const payload = (await response.json()) as Record<string, unknown>;
  const raw = extractOpenAiText(payload);
  if (!raw) return deterministic;

  try {
    const parsed = JSON.parse(raw) as {
      status?: string;
      summary?: string;
      matches?: Array<{
        sourceId?: string;
        relationship?: string;
        reason?: string;
      }>;
    };
    const byId = new Map(candidates.map((entry) => [entry.sourceId, entry]));
    const matches: NestConflictMatch[] = [];
    for (const match of parsed.matches ?? []) {
      const entry =
        typeof match.sourceId === "string" ? byId.get(match.sourceId) : null;
      const relationship = match.relationship as NestConflictRelationship;
      if (
        !entry ||
        !["duplicate", "contradiction", "overlap"].includes(relationship)
      ) {
        continue;
      }
      matches.push({
        sourceId: entry.sourceId,
        sourceType: entry.sourceType,
        title: entry.title,
        relationship,
        existingText: entry.content,
        reason:
          typeof match.reason === "string" && match.reason.trim()
            ? match.reason.trim()
            : "This content needs review.",
      });
    }

    const status =
      matches.some((match) => match.relationship === "contradiction")
        ? "contradiction"
        : matches.some((match) => match.relationship === "duplicate")
          ? "duplicate"
          : matches.some((match) => match.relationship === "overlap")
            ? "overlap"
            : "clear";

    return {
      status,
      summary:
        typeof parsed.summary === "string" && parsed.summary.trim()
          ? parsed.summary.trim()
          : status === "clear"
            ? "No conflicting information was found."
            : "Nest found related information that needs review.",
      matches,
    };
  } catch {
    return deterministic;
  }
}
