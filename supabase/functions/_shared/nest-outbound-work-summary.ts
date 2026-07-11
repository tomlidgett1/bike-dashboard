import { getOpenAIClient, getResponseText, MODEL_MAP, REASONING_EFFORT } from './ai/models.ts';

export type WorkCompletedSummary = {
  /** One short phrase for the opening line, e.g. "a full service and a new chain". */
  short: string;
  /** Slightly fuller wording for the agent goal, still spoken not a bullet list. */
  detail: string;
};

const WORK_SUMMARY_INSTRUCTIONS = `You summarise bicycle workshop jobs for an outbound phone call to the customer.

Given workshop line items and optional notes, decide what work was actually done and describe it in plain spoken Australian English.

Rules:
- Merge related lines into natural phrases (do not read labels verbatim).
- Never list items with semicolons or "includes:".
- Never mention work order numbers, prices, or internal SKUs.
- short: one brief phrase the caller can say after "We did …" (max 22 words, no leading "We").
- detail: one or two sentences for the agent script (max 45 words).
- If notes clarify the job, prefer them over vague line labels.
- Use "your bike" when the item is unclear.`;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseString(value: unknown): string | null {
  if (typeof value === 'string') {
    const t = value.trim();
    return t.length > 0 ? t : null;
  }
  return null;
}

/** Collect human-readable labels from mirrored line items and Lightspeed payload. */
export function collectWorkorderLineLabels(
  lineItems: unknown,
  payload: Record<string, unknown>,
  notes: string | null,
): string[] {
  const labels: string[] = [];
  const sources = Array.isArray(lineItems) ? lineItems : [];
  for (const raw of sources) {
    const row = asRecord(raw);
    if (!row) continue;
    const label = parseString(row.display_label) ?? parseString(row.description) ?? parseString(row.note);
    if (label) labels.push(label.split('\n')[0].trim());
  }
  if (labels.length === 0) {
    const lines = payload.WorkorderLines ?? payload.workorderLines;
    if (Array.isArray(lines)) {
      for (const raw of lines) {
        const row = asRecord(raw);
        const note = parseString(row?.note ?? row?.Note);
        if (note) labels.push(note.split('\n')[0].trim());
      }
    }
  }
  if (labels.length === 0 && notes) {
    const first = notes.split('\n').map((line) => line.trim()).find((line) => line.length > 0);
    if (first) labels.push(first);
  }
  return labels;
}

function joinSpokenPhrases(parts: string[]): string {
  const cleaned = parts.filter((p) => p.length > 0);
  if (cleaned.length === 0) return 'the booked service';
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(', ')}, and ${cleaned[cleaned.length - 1]}`;
}

/** Rule-based merge when the LLM is unavailable. */
export function summarizeWorkCompletedHeuristic(
  labels: string[],
  notes: string | null,
): WorkCompletedSummary {
  const blob = `${labels.join(' ')} ${notes ?? ''}`.toLowerCase();
  const phrases: string[] = [];

  if (/full\s*service/.test(blob)) phrases.push('a full service');
  if (/tubeless|sealant/.test(blob)) phrases.push('tubeless setup on your tyres');
  if (/\bchain\b/.test(blob)) phrases.push('a new chain');
  if (/brake/.test(blob)) phrases.push('a brake service');
  if (/gear|drivetrain|derailleur|cassette/.test(blob)) phrases.push('drivetrain work');
  if (/(^|\s)(tyre|tire|wheel)(\s|$)/.test(blob) && !phrases.some((p) => p.includes('tyre'))) {
    phrases.push('tyre work');
  }
  if (/bearing/.test(blob)) phrases.push('bearing service');
  if (/suspension|fork|shock/.test(blob)) phrases.push('suspension service');
  if (/fit|install|replacement/.test(blob) && phrases.length === 0) {
    phrases.push('the fitted parts and labour');
  }

  if (phrases.length === 0) {
    for (const raw of labels) {
      const simplified = raw
        .replace(/^Service\s*-\s*/i, '')
        .replace(/^Workshop\s+/i, '')
        .trim();
      if (simplified && !/^item\s*#/i.test(simplified)) {
        const lower = simplified.toLowerCase();
        if (!phrases.some((p) => p.includes(lower.slice(0, 12)))) {
          phrases.push(simplified.charAt(0).toLowerCase() + simplified.slice(1));
        }
      }
      if (phrases.length >= 3) break;
    }
  }

  const short = joinSpokenPhrases(phrases.slice(0, 3));
  const detail = phrases.length > 0
    ? `The workshop completed ${joinSpokenPhrases(phrases)}.`
    : notes?.trim()
    ? `The workshop completed: ${notes.trim().split('\n')[0].slice(0, 160)}.`
    : 'The workshop work on your bike is complete.';

  return { short, detail };
}

function parseLlmSummaryJson(text: string): WorkCompletedSummary | null {
  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) raw = fence[1].trim();
  try {
    const parsed = JSON.parse(raw) as { short?: unknown; detail?: unknown };
    const short = parseString(parsed.short);
    const detail = parseString(parsed.detail);
    if (!short) return null;
    return {
      short: short.replace(/^we\s+did\s+/i, '').replace(/\.$/, ''),
      detail: detail ?? `The workshop completed ${short}.`,
    };
  } catch {
    return null;
  }
}

async function summarizeWorkCompletedWithLlm(
  labels: string[],
  notes: string | null,
  itemSummary: string | null,
): Promise<WorkCompletedSummary | null> {
  if (!Deno.env.get('OPENAI_API_KEY')) return null;

  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: MODEL_MAP.orchestration,
    instructions: WORK_SUMMARY_INSTRUCTIONS,
    input: JSON.stringify({
      line_items: labels.slice(0, 24),
      workshop_notes: notes,
      item_summary: itemSummary,
    }),
    max_output_tokens: 320,
    store: false,
    prompt_cache_key: 'nest-outbound-work-summary',
    reasoning: { effort: REASONING_EFFORT.orchestration },
    text: {
      format: {
        type: 'json_schema',
        name: 'work_completed_summary',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            short: { type: 'string' },
            detail: { type: 'string' },
          },
          required: ['short', 'detail'],
          additionalProperties: false,
        },
      },
    },
  } as Parameters<typeof client.responses.create>[0]);

  const text = getResponseText(response);
  if (!text) return null;
  return parseLlmSummaryJson(text);
}

export async function summarizeWorkCompletedForOutbound(input: {
  lineItems: unknown;
  payload: Record<string, unknown>;
  notes: string | null;
  itemSummary?: string | null;
}): Promise<WorkCompletedSummary> {
  const labels = collectWorkorderLineLabels(input.lineItems, input.payload, input.notes);

  try {
    const llm = await summarizeWorkCompletedWithLlm(
      labels,
      input.notes,
      input.itemSummary ?? null,
    );
    if (llm?.short) return llm;
  } catch (err) {
    console.warn('[nest-outbound-work-summary] LLM summarise failed:', (err as Error).message);
  }

  return summarizeWorkCompletedHeuristic(labels, input.notes);
}
