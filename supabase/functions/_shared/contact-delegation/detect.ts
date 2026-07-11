import { normaliseToE164 } from '../phone-normalise.ts';
import type { DelegationDetection } from './types.ts';
import { isUnsafeOwnerDelegationRequest } from './safety.ts';
import { getOpenAIClient, getResponseText, MODEL_MAP, REASONING_EFFORT } from '../ai/models.ts';

const MESSAGE_VERB_RE =
  /\b(send\s+(?:a\s+)?message|send\s+(?:them|him|her)\s+(?:a\s+)?message|message|text|please\s+text|ask|coordinate|arrange|organise|organize|reach\s+out|contact)\b/i;
const CONTACT_BOUNDARY_RE =
  /\b(?:and\s+)?(?:saying|say|asking|ask|to|that|about|for|if|whether|arrange|coordinate|organise|organize|set up|sort out|try to|try and)\b/i;
const PHONE_RE = /(?:\+\d[\d\s().-]{7,}\d|\b0\d[\d\s().-]{7,}\d\b)/;
const TONE_RE = /\b(funny|professional|formal|casual|warm|friendly|polite|playful|short|brief|charming|cheeky|serious)\b/i;
const EMAIL_OR_REPLY_INTENT_RE =
  /\b(email|e-mail|mail|gmail|outlook|inbox|thread|subject)\b/i;
const REPLY_WITHOUT_TEXT_CHANNEL_RE =
  /\b(reply|respond)\s+to\b/i;
const EXPLICIT_TEXT_CHANNEL_RE =
  /\b(text|sms|imessage)\b/i;

function cleanReasonForMessage(value: string): string {
  return value
    .replace(/\b(make sure|ensure)\s+you\s+say[^.?!]*(?:[.?!]|$)/gi, ' ')
    .replace(/\b(be|make it)\s+(funny|professional|formal|casual|warm|friendly|polite|playful|short|brief|charming|cheeky|serious)\b/gi, ' ')
    .replace(/\b(please\s+)?(send\s+(a\s+)?message|message|text|ask|contact|reach out)\b/gi, ' ')
    .replace(/\b(and\s+)?try\s+(and|to)\b/gi, ' ')
    .replace(/\b(can you|could you|would you|please|saying|say|asking|ask|that|about|for|if|whether)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[,.:;!? -]+|[,.:;!? -]+$/g, '')
    .trim();
}

function cleanContactQuery(value: string): string {
  return value
    .replace(/\b(please|can you|could you|message|text|ask|coordinate|arrange|organise|organize|with|for|about|and|try to|try and)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeEmailReplyIntent(text: string): boolean {
  if (EMAIL_OR_REPLY_INTENT_RE.test(text)) return true;
  return REPLY_WITHOUT_TEXT_CHANNEL_RE.test(text) && !EXPLICIT_TEXT_CHANNEL_RE.test(text);
}

export function shouldFallThroughAfterContactMiss(
  text: string,
  detection: Pick<DelegationDetection, 'directPhone'>,
): boolean {
  if (detection.directPhone) return false;
  return !EXPLICIT_TEXT_CHANNEL_RE.test(text);
}

export function detectContactDelegationRequest(text: string): DelegationDetection {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      matched: false,
      contactQuery: null,
      directPhone: null,
      recipientName: null,
      objective: null,
      reasonForMessage: null,
      requestedTone: null,
      reason: 'empty',
    };
  }

  if (isUnsafeOwnerDelegationRequest(trimmed)) {
    return {
      matched: true,
      contactQuery: null,
      directPhone: null,
      recipientName: null,
      objective: null,
      reasonForMessage: null,
      requestedTone: null,
      reason: 'unsafe_request',
    };
  }

  if (looksLikeEmailReplyIntent(trimmed)) {
    return {
      matched: false,
      contactQuery: null,
      directPhone: null,
      recipientName: null,
      objective: null,
      reasonForMessage: null,
      requestedTone: null,
      reason: 'email_reply_intent',
    };
  }

  if (!MESSAGE_VERB_RE.test(trimmed)) {
    return {
      matched: false,
      contactQuery: null,
      directPhone: null,
      recipientName: null,
      objective: null,
      reasonForMessage: null,
      requestedTone: null,
      reason: 'missing_delegation_signals',
    };
  }

  const phoneMatch = trimmed.match(PHONE_RE)?.[0] ?? null;
  const directPhone = phoneMatch ? normaliseToE164(phoneMatch) : null;
  const withoutPhone = phoneMatch ? trimmed.replace(phoneMatch, ' ') : trimmed;

  const verbMatch = MESSAGE_VERB_RE.exec(withoutPhone);
  const afterVerb = verbMatch ? withoutPhone.slice((verbMatch.index ?? 0) + verbMatch[0].length).trim() : withoutPhone;
  const afterVerbForParse = afterVerb.replace(/^(to|for)\s+/i, '').trim();
  const boundary = CONTACT_BOUNDARY_RE.exec(afterVerbForParse);
  const beforeObjective = boundary ? afterVerbForParse.slice(0, boundary.index).trim() : '';
  const contactQuery = directPhone ? '' : cleanContactQuery(beforeObjective);
  const rawReasonForMessage = directPhone
    ? withoutPhone.replace(/\s+/g, ' ').trim()
    : boundary
    ? afterVerbForParse.slice(boundary.index).replace(CONTACT_BOUNDARY_RE, '').trim()
    : trimmed;
  const reasonForMessage = cleanReasonForMessage(rawReasonForMessage) || rawReasonForMessage;
  const requestedTone = trimmed.match(TONE_RE)?.[1]?.toLowerCase() ?? null;

  if (!directPhone && contactQuery.length < 2) {
    return {
      matched: true,
      contactQuery: null,
      directPhone: null,
      recipientName: null,
      objective: trimmed,
      reasonForMessage: reasonForMessage || trimmed,
      requestedTone,
      reason: 'missing_contact',
    };
  }

  return {
    matched: true,
    contactQuery: contactQuery || null,
    directPhone,
    recipientName: null,
    objective: trimmed,
    reasonForMessage: reasonForMessage || trimmed,
    requestedTone,
    reason: directPhone ? 'direct_phone' : 'contact_query',
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

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function detectContactDelegationRequestWithReasoning(text: string): Promise<DelegationDetection> {
  const fallback = detectContactDelegationRequest(text);
  if (!text.trim()) return fallback;
  if (isUnsafeOwnerDelegationRequest(text)) return fallback;
  if (looksLikeEmailReplyIntent(text)) return fallback;

  try {
    const client = getOpenAIClient();
    const response = await client.responses.create({
      model: MODEL_MAP.agent,
      instructions: `You classify and extract delegated messaging requests for Nest.

The user may ask in many natural ways: "send a message", "please text", "can you message", "reach out to", "ask", "contact", "check on", "arrange", etc.

Return strict JSON:
{
  "matched": boolean,
  "contactQuery": string|null,
  "directPhone": string|null,
  "recipientName": string|null,
  "objective": string|null,
  "reasonForMessage": string|null,
  "requestedTone": string|null,
  "reason": string
}

Rules:
- matched=true only if the user wants Nest to message/contact a third party.
- matched=false for email-style tasks. If the user says "email", "mail", "inbox", "thread", "subject", "reply to", or "respond to" without explicitly saying text/SMS/iMessage, this is an email/orchestrator task, not contact delegation.
- directPhone should be the phone number if present, otherwise null.
- recipientName is the recipient's human name if stated, even if a phone number is also present.
- contactQuery is a name/search query when no direct phone is present.
- reasonForMessage is the actual intent to communicate, not command words. Remove meta instructions like "please message", "say it's from me", "be funny".
- requestedTone is a concise tone label if stated, otherwise null.
- objective is the original user request.
- reason explains the classification in 2-5 words.
- Output JSON only.`,
      input: text,
      max_output_tokens: 300,
      store: false,
      prompt_cache_key: 'nest-contact-delegation-detect',
      reasoning: { effort: REASONING_EFFORT.agent },
    } as Parameters<typeof client.responses.create>[0]);

    const parsed = parseJsonObject(getResponseText(response));
    if (!parsed) return fallback;

    const directPhoneRaw = stringOrNull(parsed.directPhone);
    const directPhone = directPhoneRaw ? normaliseToE164(directPhoneRaw) ?? directPhoneRaw : null;
    const matched = parsed.matched === true;
    return {
      matched,
      contactQuery: stringOrNull(parsed.contactQuery),
      directPhone,
      recipientName: stringOrNull(parsed.recipientName),
      objective: stringOrNull(parsed.objective) ?? (matched ? text.trim() : null),
      reasonForMessage: stringOrNull(parsed.reasonForMessage),
      requestedTone: stringOrNull(parsed.requestedTone),
      reason: stringOrNull(parsed.reason) ?? (matched ? 'model_match' : 'model_no_match'),
    };
  } catch (error) {
    console.warn('[contact-delegation] reasoning request detector failed, using fallback:', (error as Error).message);
    return fallback;
  }
}

export async function classifyContactCardObjectiveWithReasoning(params: {
  contactName: string;
  contactPhone: string;
  userMessage: string;
}): Promise<{
  isObjective: boolean;
  reasonForMessage: string | null;
  requestedTone: string | null;
  reason: string;
}> {
  const text = params.userMessage.trim();
  if (!text) {
    return { isObjective: false, reasonForMessage: null, requestedTone: null, reason: 'empty' };
  }

  try {
    const client = getOpenAIClient();
    const response = await client.responses.create({
      model: MODEL_MAP.agent,
      instructions: `You decide whether a user's message is an instruction to message a contact card recipient, or an unrelated message to Nest.

Context: The user just shared a contact card. Nest asked: "Do you want me to message them? If so, what should I say?"

Return strict JSON:
{
  "isObjective": boolean,
  "reasonForMessage": string|null,
  "requestedTone": string|null,
  "reason": string
}

Rules:
- isObjective=true only if the user is telling Nest what to message/ask/tell this contact.
- If the user asks Nest a separate question, like "Earthquake? When?", "what do you mean?", "who is that?", "ignore", "not now", then isObjective=false.
- Short imperative fragments can be true: "ask him how dad is", "tell her I'm running late", "see if he wants dinner".
- reasonForMessage should be the message intent, not command words.
- Output JSON only.`,
      input: JSON.stringify({
        contactName: params.contactName,
        contactPhone: params.contactPhone,
        userMessage: params.userMessage,
      }),
      max_output_tokens: 180,
      store: false,
      prompt_cache_key: 'nest-contact-card-objective',
      reasoning: { effort: REASONING_EFFORT.orchestration },
    } as Parameters<typeof client.responses.create>[0]);
    const parsed = parseJsonObject(getResponseText(response));
    if (!parsed) throw new Error('no json');
    return {
      isObjective: parsed.isObjective === true,
      reasonForMessage: stringOrNull(parsed.reasonForMessage),
      requestedTone: stringOrNull(parsed.requestedTone),
      reason: stringOrNull(parsed.reason) ?? 'model_classified',
    };
  } catch (error) {
    console.warn('[contact-delegation] contact-card objective classifier failed, using fallback:', (error as Error).message);
    const obviousInstruction = /\b(ask|tell|message|text|send|see if|check if|let (him|her|them)|say)\b/i.test(text);
    const obviousQuestion = /\?$/.test(text) && !obviousInstruction;
    return {
      isObjective: obviousInstruction && !obviousQuestion,
      reasonForMessage: obviousInstruction ? text : null,
      requestedTone: text.match(/\b(funny|professional|formal|casual|warm|friendly|polite|playful|short|brief|charming|cheeky|serious)\b/i)?.[1]?.toLowerCase() ?? null,
      reason: obviousInstruction ? 'fallback_instruction' : 'fallback_unrelated',
    };
  }
}
