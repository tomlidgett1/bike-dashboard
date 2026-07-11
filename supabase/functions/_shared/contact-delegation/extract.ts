import type { CompletionExtraction, ContactDelegationTask, DelegationCollectedFields } from './types.ts';
import { classifyTargetReplyIntent } from './safety.ts';
import { hasCompleteDinnerFields } from './prompts.ts';
import { getOpenAIClient, getResponseText, MODEL_MAP, REASONING_EFFORT } from '../ai/models.ts';

const TIME_RE = /\b(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:am|pm)?\b/i;
const LOCATION_RE = /\b(?:at|in|near)\s+([A-Z][\w'’.-]*(?:\s+[A-Z][\w'’.-]*){0,4}|[A-Z][\w'’.-]*(?:\s+(?:in|near)\s+[A-Z][\w'’.-]*)?)/;
const POSSESSIVE_LOCATION_RE = /\b((?:his|her|their|my|your)\s+(?:hotel|place|house|apartment|flat|office))\b/i;
const DATE_RE = /\b(today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/i;
const TZ_CONTEXT_RE = /\b(tokyo|japan|jst|australia|sydney|melbourne|aest|aedt|utc|gmt|local time)\b/i;
const OWNER_LOCATION_CHOICE_RE = /\b(anywhere|wherever|where ever|any place|up to (him|her|them|tom|the sender)|where (he|she|they|tom) wants?|where (he|she|they|tom) likes?)\b/i;

const FIELD_LABELS: Record<string, string> = {
  date: 'which day',
  time: 'what time',
  timezone_or_context: 'what city or timezone that time is in',
  location: 'where you want to meet',
};

function mergeFields(existing: DelegationCollectedFields, next: DelegationCollectedFields): DelegationCollectedFields {
  return {
    ...existing,
    ...Object.fromEntries(
      Object.entries(next).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    ),
  };
}

export function extractDinnerCoordinationProgress(
  task: Pick<ContactDelegationTask, 'collectedFields' | 'metadata' | 'objective' | 'targetDisplayName' | 'targetHandle' | 'targetFollowupCount'>,
  targetText: string,
): CompletionExtraction {
  const intent = classifyTargetReplyIntent(targetText);
  if (intent !== 'unknown') {
    const reason = intent;
    if (intent === 'identity_clarification') {
      return { intent, collectedFields: task.collectedFields, nextMessageToTarget: null, messageToOwner: null, reason };
    }
    if (intent === 'needs_owner_input') {
      return {
        intent,
        collectedFields: task.collectedFields,
        nextMessageToTarget: null,
        messageToOwner: `${task.targetDisplayName ?? task.targetHandle} asked for your input: "${targetText.trim()}"`,
        reason,
      };
    }
    return { intent, collectedFields: task.collectedFields, nextMessageToTarget: null, messageToOwner: null, reason };
  }

  const next: DelegationCollectedFields = {};
  const date = targetText.match(DATE_RE)?.[0];
  const time = targetText.match(TIME_RE)?.[0];
  const timezone = targetText.match(TZ_CONTEXT_RE)?.[0];
  const location = targetText.match(POSSESSIVE_LOCATION_RE)?.[1] ?? targetText.match(LOCATION_RE)?.[1];

  if (date) next.date = date;
  if (time) next.time = time;
  if (timezone) next.timezone_or_context = timezone;
  if (location) next.location = location.trim();

  const collectedFields = mergeFields(task.collectedFields, next);
  const confirmedOwnerLocation =
    task.metadata.owner_suggested_location &&
    /^(yes|yep|yeah|ok|okay|works|sounds good|perfect|great|that works|sure)$/i.test(targetText.trim());
  if (confirmedOwnerLocation) {
    const finalFields = {
      ...collectedFields,
      location: String(task.metadata.owner_suggested_location),
      confidence: 'high' as const,
    };
    if (hasCompleteDinnerFields(finalFields)) {
      return {
        intent: 'complete_answer',
        collectedFields: finalFields,
        nextMessageToTarget: null,
        messageToOwner: null,
        reason: 'target_confirmed_owner_location',
      };
    }
  }
  if (OWNER_LOCATION_CHOICE_RE.test(targetText) && !collectedFields.location) {
    return {
      intent: 'needs_owner_input',
      collectedFields,
      nextMessageToTarget: null,
      messageToOwner: `${task.targetDisplayName ?? task.targetHandle} can do ${collectedFields.time ?? 'the time they mentioned'} and said the place is up to you. Where should I suggest?`,
      reason: 'target_left_location_to_owner',
    };
  }
  const hasAnyNewField = Object.keys(next).length > 0;
  const completeCandidate = hasCompleteDinnerFields({ ...collectedFields, confidence: 'high' });
  const finalFields = completeCandidate ? { ...collectedFields, confidence: 'high' as const } : collectedFields;

  if (hasCompleteDinnerFields(finalFields)) {
    return {
      intent: 'complete_answer',
      collectedFields: finalFields,
      nextMessageToTarget: null,
      messageToOwner: null,
      reason: 'all_required_fields_collected',
    };
  }

  if (!hasAnyNewField) {
    return {
      intent: 'partial_answer',
      collectedFields,
      nextMessageToTarget: task.targetFollowupCount >= 2
        ? null
        : 'Got it. What day, time, and place should I tell them?',
      messageToOwner: null,
      reason: 'no_structured_fields',
    };
  }

  const missing = ['date', 'time', 'timezone_or_context', 'location'].filter((field) => !(collectedFields as Record<string, unknown>)[field]);
  const readableMissing = missing
    .slice(0, 2)
    .map((field) => FIELD_LABELS[field] ?? field)
    .join(' and ');
  return {
    intent: 'partial_answer',
    collectedFields,
    nextMessageToTarget: task.targetFollowupCount >= 2
      ? null
      : `Thanks. Just need ${readableMissing} to lock it in.`,
    messageToOwner: null,
    reason: `missing_${missing.join('_')}`,
  };
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  const match = /\{[\s\S]*\}/.exec(cleaned);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function cleanFields(value: unknown, fallback: DelegationCollectedFields): DelegationCollectedFields {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const row = value as Record<string, unknown>;
  return {
    ...fallback,
    ...(cleanString(row.date) ? { date: cleanString(row.date)! } : {}),
    ...(cleanString(row.time) ? { time: cleanString(row.time)! } : {}),
    ...(cleanString(row.timezone_or_context) ? { timezone_or_context: cleanString(row.timezone_or_context)! } : {}),
    ...(cleanString(row.location) ? { location: cleanString(row.location)! } : {}),
    ...(row.confidence === 'high' || row.confidence === 'medium' || row.confidence === 'low'
      ? { confidence: row.confidence }
      : {}),
  };
}

export async function extractCoordinationProgressWithReasoning(
  task: Pick<ContactDelegationTask, 'collectedFields' | 'metadata' | 'objective' | 'targetDisplayName' | 'targetHandle' | 'targetFollowupCount'>,
  targetText: string,
): Promise<CompletionExtraction> {
  const fallback = extractDinnerCoordinationProgress(task, targetText);

  try {
    const client = getOpenAIClient();
    const response = await client.responses.create({
      model: MODEL_MAP.agent,
      instructions: `You interpret recipient replies for Nest, an AI assistant coordinating a delegated message for a sender.

Return strict JSON:
{
  "intent": "identity_clarification" | "wrong_number" | "opt_out" | "refusal" | "partial_answer" | "complete_answer" | "needs_owner_input" | "unsafe" | "unknown",
  "collectedFields": {
    "date": string|null,
    "time": string|null,
    "timezone_or_context": string|null,
    "location": string|null,
    "confidence": "low"|"medium"|"high"|null
  },
  "nextMessageToTarget": string|null,
  "messageToOwner": string|null,
  "reason": string
}

Rules:
- Interpret meaning from context, not exact keywords.
- If the recipient leaves a choice to the sender ("anywhere he wants", "his hotel is fine", "up to Tom"), set intent="needs_owner_input" only if a required decision is still missing from collected fields. Otherwise use the value as the field.
- If all required details for the sender's objective are known, intent="complete_answer" with confidence high.
- For non-scheduling tasks, completion means the recipient answered the actual question/request, not date/time/location.
- Do not ask for internal field names. Use plain human language.
- If you need the sender to decide something, set messageToOwner to a concise question.
- Output JSON only.`,
      input: JSON.stringify({
        objective: task.objective,
        recipient: task.targetDisplayName ?? task.targetHandle,
        existingFields: task.collectedFields,
        taskMetadata: task.metadata,
        latestRecipientMessage: targetText,
      }),
      max_output_tokens: 500,
      store: false,
      prompt_cache_key: 'nest-contact-delegation-extract',
      reasoning: { effort: REASONING_EFFORT.agent },
    } as Parameters<typeof client.responses.create>[0]);

    const parsed = parseJsonObject(getResponseText(response));
    if (!parsed) return fallback;

    const intent = cleanString(parsed.intent) as CompletionExtraction['intent'] | null;
    if (!intent) return fallback;
    return {
      intent,
      collectedFields: cleanFields(parsed.collectedFields, fallback.collectedFields),
      nextMessageToTarget: cleanString(parsed.nextMessageToTarget),
      messageToOwner: cleanString(parsed.messageToOwner),
      reason: cleanString(parsed.reason) ?? 'model_interpreted',
    };
  } catch (error) {
    console.warn('[contact-delegation] reasoning reply extractor failed, using fallback:', (error as Error).message);
    return fallback;
  }
}
