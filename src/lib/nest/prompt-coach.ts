import { randomUUID } from "crypto";
import { pickServerEnv } from "@/lib/nest-portal/lib/server-env";
import { proxyNestBrandPortalRequest } from "@/lib/nest/brand-portal-client";
import {
  restoreNestBusinessFact,
  writeNestBusinessFact,
} from "@/lib/nest/nest-business-write";
import {
  COACH_CONFIG_FIELDS,
  FIELD_LABELS,
  coachFieldLabel,
  isConfigField,
  type PromptCoachApplyResult,
  type PromptCoachChatMessage,
  type PromptCoachChatResult,
  type PromptCoachProposal,
  type PromptCoachUndoSnapshot,
} from "@/lib/nest/prompt-coach-types";

export {
  COACH_CONFIG_FIELDS,
  coachFieldLabel,
  type CoachConfigField,
  type PromptCoachApplyResult,
  type PromptCoachChatMessage,
  type PromptCoachChatResult,
  type PromptCoachProposal,
  type PromptCoachUndoSnapshot,
} from "@/lib/nest/prompt-coach-types";

type KnowledgeContextItem = {
  id: string;
  title: string;
  content_text: string;
  summary?: string;
  legacy_field_key?: string | null;
};

type CoachContext = {
  config: Record<string, string>;
  knowledge: KnowledgeContextItem[];
};

const SYSTEM_PROMPT = `You are Nest Prompt Coach — a calm, precise assistant that helps Australian bike-store owners fix what their Nest chatbot gets wrong.

You speak short Australian English. Be warm, direct, and never jargon-heavy.

## What you manage

### Config fields (structured Nest settings)
${COACH_CONFIG_FIELDS.map((f) => `- ${f}: ${FIELD_LABELS[f]}`).join("\n")}

### Knowledge base
Longer FAQs, policies, product notes, and anything that does not fit a single config field. Prefer knowledge for multi-paragraph facts; prefer config for hours, prices, contact, opening line, voice, and short policies.

## Your job

The owner describes what the bot did poorly or what they want changed. You must:

1. Understand the intent (add a rule, correct a fact, remove / stop saying something, change tone).
2. Decide destination: config field and/or knowledge item (emit separate proposals if both).
3. Check for real duplicates and contradictions against CURRENT CONFIG and KNOWLEDGE below.
4. NEVER apply changes yourself. Only propose. The UI asks before anything is saved.
5. Ask at most one clarifying question when needed (followUp). Prefer a proposal when the intent is clear.

## When is it a contradiction?

Set status "contradiction" (or use operation "replace") when an EXISTING sentence would become FALSE, MISLEADING, or would fight the owner's new rule.

Examples that ARE contradictions / must REPLACE:
- Existing: "We close at 5." Owner: "We close at 6."
- Existing: "Same-day service available." Owner: "Never imply same-day service."
- Existing: "No booking required" / "drop off whenever" / "you can drop it in today" Owner: "Never imply same-day; team confirms timing."
  → REPLACE those permissive timing lines. Do NOT only append a never-same-day line underneath them.

Examples that are NOT contradictions (use append / ready):
- Existing: "We take service bookings." Owner: "Always mention the team confirms timing." and there is no same-day / whenever / no-booking claim → APPEND is fine.
- Existing has no conflicting claim. Owner adds a new FAQ → APPEND.

If old text would make the bot still promise what the owner just banned, you MUST replace/remove that old text in mergedValue. Appending a conflicting rule under the old rule is a failure.

## Response format

Respond with valid JSON only:

{
  "reply": "<1-3 short sentences for the owner>",
  "followUp": "<optional clarifying question, or null>",
  "proposals": [
    {
      "target": "config" | "knowledge",
      "operation": "add" | "append" | "replace" | "delete",
      "field": "<config field name or null>",
      "knowledgeItemId": "<uuid of existing KB item or null>",
      "title": "<KB title when creating/updating knowledge, or null>",
      "currentSnippet": "<ONLY the exact existing sentence being removed/changed, or null>",
      "proposedSnippet": "<ONLY the new sentence being added/used as replacement, or null for delete>",
      "mergedValue": "<FULL field/item value after the change — owners do not see this>",
      "status": "ready" | "contradiction" | "duplicate",
      "summary": "<one plain line: what Nest will do>",
      "conflictingLine": "<ONLY if status is contradiction: the exact bad existing sentence, else null>"
    }
  ]
}

## Operation rules

- "add": field/item empty or brand-new KB entry. mergedValue = proposedSnippet for config.
- "append": add a new rule/fact WITHOUT leaving contradictory old lines in place. If old lines fight the new rule, use "replace" instead.
- "replace": rewrite the field so conflicting sentences are removed or rewritten. currentSnippet = old bad sentence; proposedSnippet = new sentence; mergedValue = FULL cleaned field.
- "delete": remove a KB item or strip a fact from a config field.

## Display snippet rules (critical — owners only see these)

- proposedSnippet = the NEW wording only. Never copy an unchanged existing sentence into proposedSnippet.
- conflictingLine / currentSnippet = the OLD wording only, and ONLY when something is actually being removed or contradicted.
- proposedSnippet MUST NOT equal conflictingLine or currentSnippet. If they would be the same, you made a mistake — fix it.
- Each display field: one short sentence, max ~140 characters. Never dump a full field into display snippets.
- mergedValue must still be the complete updated field/item text for applying, with contradictions resolved (not merely appended under the old claim).

## Other rules

- proposals may be empty when you only need clarification.
- For real contradictions, status "contradiction" or ready+replace, include conflictingLine + a different proposedSnippet, and mergedValue with the conflict resolved.
- For duplicates, status "duplicate"; do not invent a write unless they insist on replace.
- reply must not claim the change is already saved.
- Never invent knowledgeItemId values; only use IDs from the catalogue.
- If the owner confirms a prior contradiction ("yes replace it"), emit status "ready" with operation "replace".
- Prefer updating the matching legacy knowledge item (same topic) when one exists, OR update the config field — and make sure mergedValue is consistent either way.`;

function truncate(text: string, max: number): string {
  const t = String(text ?? "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function normaliseCompareKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Keep UI snippets to one short sentence — never dump a full field. */
function displaySnippet(text: string | null | undefined, max = 160): string | null {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  // Prefer the last sentence for long blobs (often the newly appended rule).
  const sentences = trimmed.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const sentence =
    sentences.length <= 1
      ? trimmed
      : trimmed.length > max
        ? sentences[sentences.length - 1]!
        : sentences[0]!;
  return truncate(sentence, max);
}

function snippetsAreSame(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return normaliseCompareKey(a) === normaliseCompareKey(b);
}

function extractOpenAiText(openaiData: Record<string, unknown>): string {
  if (typeof openaiData.output_text === "string") return openaiData.output_text;
  if (Array.isArray(openaiData.output)) {
    for (const item of openaiData.output) {
      if (
        item &&
        typeof item === "object" &&
        (item as { type?: string }).type === "message" &&
        Array.isArray((item as { content?: unknown }).content)
      ) {
        for (const block of (item as { content: Array<{ type?: string; text?: string }> }).content) {
          if (block.type === "output_text" && typeof block.text === "string") {
            return block.text;
          }
        }
      }
    }
  }
  return "";
}

function normaliseProposal(raw: Record<string, unknown>): PromptCoachProposal | null {
  const target = raw.target === "knowledge" ? "knowledge" : raw.target === "config" ? "config" : null;
  if (!target) return null;

  const operation: PromptCoachProposal["operation"] | null =
    raw.operation === "add" ||
    raw.operation === "append" ||
    raw.operation === "replace" ||
    raw.operation === "delete"
      ? raw.operation
      : null;
  if (!operation) return null;

  const status: PromptCoachProposal["status"] =
    raw.status === "contradiction" || raw.status === "duplicate" || raw.status === "ready"
      ? raw.status
      : "ready";

  const field = isConfigField(raw.field) ? raw.field : null;
  if (target === "config" && !field) return null;

  const summary =
    typeof raw.summary === "string" && raw.summary.trim()
      ? raw.summary.trim()
      : "Proposed Nest update";

  let currentSnippet = displaySnippet(
    typeof raw.currentSnippet === "string" ? raw.currentSnippet : null,
  );
  let proposedSnippet = displaySnippet(
    typeof raw.proposedSnippet === "string" ? raw.proposedSnippet : null,
  );
  let conflictingLine = displaySnippet(
    typeof raw.conflictingLine === "string" ? raw.conflictingLine : null,
    180,
  );

  // Never show identical "conflicts with" / "change to" — that is always a model mistake.
  if (snippetsAreSame(proposedSnippet, conflictingLine) || snippetsAreSame(proposedSnippet, currentSnippet)) {
    if (operation === "append" || operation === "add") {
      conflictingLine = null;
      currentSnippet = null;
    } else if (operation === "replace") {
      // Keep the old line; drop the useless identical proposed text so UI can fall back.
      proposedSnippet = null;
    }
  }

  // Append/add should not claim a conflict unless the lines actually differ.
  let nextStatus: PromptCoachProposal["status"] = status;
  let nextOperation: PromptCoachProposal["operation"] = operation;
  if ((operation === "append" || operation === "add") && status === "contradiction" && !conflictingLine) {
    nextStatus = "ready";
  }
  if (
    operation === "replace" &&
    !conflictingLine &&
    !currentSnippet &&
    proposedSnippet &&
    nextStatus !== "duplicate"
  ) {
    // Soften bogus replaces into appends when there is nothing to replace.
    nextOperation = "append";
    nextStatus = "ready";
  }

  if (nextStatus === "contradiction" && !conflictingLine) {
    nextStatus = "ready";
  }

  return {
    id: randomUUID(),
    target,
    operation: nextOperation,
    field,
    knowledgeItemId: typeof raw.knowledgeItemId === "string" ? raw.knowledgeItemId : null,
    title: typeof raw.title === "string" ? raw.title : null,
    currentSnippet,
    proposedSnippet,
    mergedValue: typeof raw.mergedValue === "string" ? raw.mergedValue : null,
    status: nextStatus,
    summary: truncate(summary, 120),
    conflictingLine: nextStatus === "contradiction" ? conflictingLine : null,
  };
}

export async function loadPromptCoachContext(brandKey: string): Promise<CoachContext> {
  const [configRes, knowledgeRes] = await Promise.all([
    proxyNestBrandPortalRequest(brandKey, { method: "GET" }),
    proxyNestBrandPortalRequest(brandKey, {
      method: "GET",
      endpoint: "brand-portal-knowledge",
    }),
  ]);

  const configRow =
    (configRes.config as Record<string, unknown> | undefined) ??
    (configRes as Record<string, unknown>);

  const config: Record<string, string> = {};
  for (const field of COACH_CONFIG_FIELDS) {
    const value = configRow[field];
    config[field] = typeof value === "string" ? value.trim() : "";
  }

  const rawItems = Array.isArray(knowledgeRes.items) ? knowledgeRes.items : [];
  const knowledge: KnowledgeContextItem[] = [];
  for (const item of rawItems) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;
    knowledge.push({
      id,
      title: typeof row.title === "string" ? row.title : "Untitled",
      content_text: typeof row.content_text === "string" ? row.content_text : "",
      summary: typeof row.summary === "string" ? row.summary : undefined,
      legacy_field_key:
        typeof row.legacy_field_key === "string" ? row.legacy_field_key : null,
    });
  }

  return { config, knowledge };
}

function buildContextBlock(ctx: CoachContext): string {
  const configLines = COACH_CONFIG_FIELDS.map(
    (field) => `${field}: ${ctx.config[field]?.trim() ? truncate(ctx.config[field], 800) : "(empty)"}`,
  ).join("\n");

  const knowledgeLines =
    ctx.knowledge.length === 0
      ? "(no knowledge items yet)"
      : ctx.knowledge
          .slice(0, 40)
          .map(
            (item) =>
              `- id=${item.id} | title=${item.title}\n  ${truncate(item.summary || item.content_text, 400)}`,
          )
          .join("\n");

  return `CURRENT CONFIG:\n${configLines}\n\nKNOWLEDGE BASE:\n${knowledgeLines}`;
}

export async function runPromptCoachChat(args: {
  brandKey: string;
  message: string;
  chatHistory?: PromptCoachChatMessage[];
}): Promise<PromptCoachChatResult> {
  const openaiKey = pickServerEnv(["OPENAI_API_KEY", "NEST_OPENAI_API_KEY"]);
  if (!openaiKey) {
    throw new Error("AI is not configured for Nest Prompt Coach.");
  }

  const message = args.message.trim();
  if (!message) {
    throw new Error("message is required");
  }

  const ctx = await loadPromptCoachContext(args.brandKey);
  const history = (args.chatHistory ?? []).slice(-10);

  const input: { role: string; content: string }[] = [
    { role: "developer", content: buildContextBlock(ctx) },
  ];

  for (const turn of history) {
    if (turn.role === "user" || turn.role === "assistant") {
      input.push({ role: turn.role, content: turn.text });
    }
  }
  input.push({ role: "user", content: message });

  const openaiRes = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.5",
      reasoning: { effort: "medium", summary: "auto" },
      instructions: SYSTEM_PROMPT,
      input,
      text: {
        format: {
          type: "json_schema",
          name: "nest_prompt_coach_response",
          strict: true,
          schema: {
            type: "object",
            properties: {
              reply: { type: "string" },
              followUp: { type: ["string", "null"] },
              proposals: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    target: { type: "string", enum: ["config", "knowledge"] },
                    operation: {
                      type: "string",
                      enum: ["add", "append", "replace", "delete"],
                    },
                    field: { type: ["string", "null"] },
                    knowledgeItemId: { type: ["string", "null"] },
                    title: { type: ["string", "null"] },
                    currentSnippet: { type: ["string", "null"] },
                    proposedSnippet: { type: ["string", "null"] },
                    mergedValue: { type: ["string", "null"] },
                    status: {
                      type: "string",
                      enum: ["ready", "contradiction", "duplicate"],
                    },
                    summary: { type: "string" },
                    conflictingLine: { type: ["string", "null"] },
                  },
                  required: [
                    "target",
                    "operation",
                    "field",
                    "knowledgeItemId",
                    "title",
                    "currentSnippet",
                    "proposedSnippet",
                    "mergedValue",
                    "status",
                    "summary",
                    "conflictingLine",
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ["reply", "followUp", "proposals"],
            additionalProperties: false,
          },
        },
      },
      store: false,
    }),
  });

  if (!openaiRes.ok) {
    const errText = await openaiRes.text();
    console.error("[nest-prompt-coach] OpenAI error:", openaiRes.status, errText);
    throw new Error(`AI service error (${openaiRes.status}). Try again.`);
  }

  const openaiData = (await openaiRes.json()) as Record<string, unknown>;
  const rawContent = extractOpenAiText(openaiData);
  if (!rawContent) {
    return {
      reply: "I could not read that response. Try again in a moment.",
      followUp: null,
      proposals: [],
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawContent) as Record<string, unknown>;
  } catch {
    console.error("[nest-prompt-coach] Failed to parse AI response:", rawContent.slice(0, 500));
    return {
      reply: "I had trouble understanding that. Could you try rephrasing?",
      followUp: null,
      proposals: [],
    };
  }

  const proposals = Array.isArray(parsed.proposals)
    ? parsed.proposals
        .map((item) =>
          item && typeof item === "object"
            ? normaliseProposal(item as Record<string, unknown>)
            : null,
        )
        .filter((item): item is PromptCoachProposal => Boolean(item))
    : [];

  return {
    reply:
      typeof parsed.reply === "string" && parsed.reply.trim()
        ? parsed.reply.trim()
        : "Here’s what I suggest.",
    followUp: typeof parsed.followUp === "string" ? parsed.followUp : null,
    proposals,
  };
}


export async function applyPromptCoachProposals(args: {
  brandKey: string;
  proposals: PromptCoachProposal[];
  /** When true, allow applying proposals that were flagged duplicate/contradiction after owner confirm. */
  force?: boolean;
}): Promise<PromptCoachApplyResult> {
  const applied: PromptCoachApplyResult["applied"] = [];
  const force = args.force === true;
  const ctx = await loadPromptCoachContext(args.brandKey);

  for (const proposal of args.proposals) {
    try {
      if (!force && proposal.status === "duplicate") {
        applied.push({
          id: proposal.id,
          ok: false,
          summary: proposal.summary,
          error: "This looks like a duplicate. Confirm replace if you still want to change it.",
        });
        continue;
      }

      if (!force && proposal.status === "contradiction") {
        applied.push({
          id: proposal.id,
          ok: false,
          summary: proposal.summary,
          error: "This conflicts with existing Nest info. Confirm replace to overwrite it.",
        });
        continue;
      }

      if (proposal.target === "config") {
        const field = proposal.field;
        if (!field) {
          throw new Error("Missing config field.");
        }

        const previousValue = ctx.config[field] ?? "";
        const nextValue =
          proposal.operation === "delete"
            ? (proposal.mergedValue ?? "")
            : (proposal.mergedValue ?? proposal.proposedSnippet ?? "");

        const write = await writeNestBusinessFact({
          brandKey: args.brandKey,
          field,
          value: nextValue,
          currentFieldValue: previousValue,
          currentExtraKnowledge: ctx.config.extra_knowledge,
        });

        ctx.config[field] = nextValue;
        if (write.extraKnowledgeUpdated && write.extraKnowledgeValue !== null) {
          ctx.config.extra_knowledge = write.extraKnowledgeValue;
        }

        applied.push({
          id: proposal.id,
          ok: true,
          summary: `Updated ${coachFieldLabel(field)}`,
          undo: {
            proposalId: proposal.id,
            target: "config",
            field,
            knowledgeItemId: write.knowledgeItemId,
            previousValue: write.previousFieldValue,
            previousExtraKnowledge: write.previousExtraKnowledge,
            operationApplied: proposal.operation,
          },
        });
        continue;
      }

      // knowledge
      if (proposal.operation === "delete") {
        const itemId = proposal.knowledgeItemId?.trim();
        if (!itemId) throw new Error("Missing knowledge item to remove.");
        const existing = ctx.knowledge.find((item) => item.id === itemId);
        await proxyNestBrandPortalRequest(args.brandKey, {
          method: "DELETE",
          endpoint: "brand-portal-knowledge",
          query: new URLSearchParams({ id: itemId }),
        });
        applied.push({
          id: proposal.id,
          ok: true,
          summary: `Removed “${proposal.title?.trim() || existing?.title || "knowledge item"}”`,
          undo: {
            proposalId: proposal.id,
            target: "knowledge",
            knowledgeItemId: itemId,
            title: proposal.title ?? existing?.title ?? null,
            previousValue: null,
            deletedContent: existing?.content_text ?? proposal.currentSnippet ?? "",
            operationApplied: "delete",
          },
        });
        continue;
      }

      if (proposal.operation === "replace" || (proposal.knowledgeItemId && proposal.operation === "append")) {
        const itemId = proposal.knowledgeItemId?.trim();
        if (!itemId) throw new Error("Missing knowledge item to update.");
        const existing = ctx.knowledge.find((item) => item.id === itemId);
        const content = proposal.mergedValue ?? proposal.proposedSnippet ?? "";
        if (!content.trim()) {
          throw new Error("Proposed knowledge content is empty.");
        }

        // Legacy-backed KB items must go through the unified write so config +
        // raw prompt stay aligned with retrieval.
        const legacyField = existing?.legacy_field_key;
        if (legacyField && isConfigField(legacyField)) {
          const write = await writeNestBusinessFact({
            brandKey: args.brandKey,
            field: legacyField,
            value: content,
            currentFieldValue: ctx.config[legacyField] ?? existing.content_text,
            currentExtraKnowledge: ctx.config.extra_knowledge,
          });
          ctx.config[legacyField] = content;
          if (write.extraKnowledgeUpdated && write.extraKnowledgeValue !== null) {
            ctx.config.extra_knowledge = write.extraKnowledgeValue;
          }
          applied.push({
            id: proposal.id,
            ok: true,
            summary: `Updated “${proposal.title?.trim() || existing?.title || "knowledge item"}”`,
            undo: {
              proposalId: proposal.id,
              target: "config",
              field: legacyField,
              knowledgeItemId: write.knowledgeItemId ?? itemId,
              previousValue: write.previousFieldValue,
              previousExtraKnowledge: write.previousExtraKnowledge,
              operationApplied: proposal.operation,
            },
          });
          continue;
        }

        await proxyNestBrandPortalRequest(args.brandKey, {
          method: "PATCH",
          endpoint: "brand-portal-knowledge",
          body: {
            id: itemId,
            ...(proposal.title ? { title: proposal.title } : {}),
            content_text: content,
          },
        });
        applied.push({
          id: proposal.id,
          ok: true,
          summary: `Updated “${proposal.title?.trim() || existing?.title || "knowledge item"}”`,
          undo: {
            proposalId: proposal.id,
            target: "knowledge",
            knowledgeItemId: itemId,
            title: proposal.title ?? existing?.title ?? null,
            previousValue: existing?.content_text ?? "",
            operationApplied: proposal.operation,
          },
        });
        continue;
      }

      // create
      const content = proposal.proposedSnippet ?? proposal.mergedValue ?? "";
      if (!content.trim()) throw new Error("Proposed knowledge content is empty.");
      const createRes = await proxyNestBrandPortalRequest(args.brandKey, {
        method: "POST",
        endpoint: "brand-portal-knowledge",
        body: {
          title: proposal.title?.trim() || "Store knowledge",
          content_text: content,
        },
      });
      const createdItem = createRes.item as Record<string, unknown> | undefined;
      const createdId =
        createdItem && typeof createdItem.id === "string" ? createdItem.id : null;

      applied.push({
        id: proposal.id,
        ok: true,
        summary: `Added “${proposal.title?.trim() || "knowledge item"}”`,
        undo: {
          proposalId: proposal.id,
          target: "knowledge",
          knowledgeItemId: createdId,
          title: proposal.title?.trim() || "Store knowledge",
          previousValue: null,
          operationApplied: "add",
        },
      });
    } catch (error) {
      applied.push({
        id: proposal.id,
        ok: false,
        summary: proposal.summary,
        error: error instanceof Error ? error.message : "Could not apply this change.",
      });
    }
  }

  return { applied };
}

export async function undoPromptCoachChange(args: {
  brandKey: string;
  undo: PromptCoachUndoSnapshot;
}): Promise<{ ok: boolean; summary: string; error?: string }> {
  const { undo } = args;

  try {
    if (undo.target === "config") {
      const field = undo.field;
      if (!field) throw new Error("Missing config field to undo.");

      await restoreNestBusinessFact({
        brandKey: args.brandKey,
        field,
        previousFieldValue: undo.previousValue ?? "",
        knowledgeItemId: undo.knowledgeItemId,
        previousExtraKnowledge: undo.previousExtraKnowledge ?? null,
      });

      return { ok: true, summary: `Undid change to ${coachFieldLabel(field)}` };
    }

    // knowledge
    if (undo.operationApplied === "add") {
      const itemId = undo.knowledgeItemId?.trim();
      if (!itemId) throw new Error("Missing knowledge item to undo.");
      await proxyNestBrandPortalRequest(args.brandKey, {
        method: "DELETE",
        endpoint: "brand-portal-knowledge",
        query: new URLSearchParams({ id: itemId }),
      });
      return {
        ok: true,
        summary: `Undid add of “${undo.title?.trim() || "knowledge item"}”`,
      };
    }

    if (undo.operationApplied === "delete") {
      const content = undo.deletedContent ?? "";
      if (!content.trim()) throw new Error("Nothing to restore.");
      await proxyNestBrandPortalRequest(args.brandKey, {
        method: "POST",
        endpoint: "brand-portal-knowledge",
        body: {
          title: undo.title?.trim() || "Store knowledge",
          content_text: content,
        },
      });
      return {
        ok: true,
        summary: `Restored “${undo.title?.trim() || "knowledge item"}”`,
      };
    }

    // replace / append — restore previous content
    const itemId = undo.knowledgeItemId?.trim();
    if (!itemId) throw new Error("Missing knowledge item to undo.");
    await proxyNestBrandPortalRequest(args.brandKey, {
      method: "PATCH",
      endpoint: "brand-portal-knowledge",
      body: {
        id: itemId,
        content_text: undo.previousValue ?? "",
      },
    });
    return {
      ok: true,
      summary: `Undid change to “${undo.title?.trim() || "knowledge item"}”`,
    };
  } catch (error) {
    return {
      ok: false,
      summary: "Could not undo",
      error: error instanceof Error ? error.message : "Could not undo this change.",
    };
  }
}
