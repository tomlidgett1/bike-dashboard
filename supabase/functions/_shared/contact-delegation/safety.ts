import type { TargetReplyIntent } from './types.ts';

const OWNER_UNSAFE_RE =
  /\b(harass|threaten|blackmail|stalk|pressure|manipulate|scare|intimidate|secret|confidential|medical advice|legal advice|financial advice)\b/i;

const TARGET_OPT_OUT_RE =
  /\b(stop texting|stop messaging|don't text|do not text|don't contact|do not contact|remove me|leave me alone|unsubscribe|never message me)\b/i;

const WRONG_NUMBER_RE =
  /\b(wrong number|wrong person|wrong alex|don't know (tom|them|him|her)|do not know (tom|them|him|her)|i think you have the wrong)\b/i;

const IDENTITY_RE =
  /\b(who is this|who's this|who is this for|what is this|what's this|nest\?|wait what)\b/i;

const REFUSAL_RE =
  /\b(can't|cannot|can't do|busy|not free|no thanks|not interested|won't work|doesn't work)\b/i;

const NEEDS_OWNER_RE =
  /\b(can (tom|they|he|she)|does (tom|they|he|she)|would (tom|they|he|she)|which|instead|or)\b/i;

export function isUnsafeOwnerDelegationRequest(text: string): boolean {
  return OWNER_UNSAFE_RE.test(text);
}

export function classifyTargetReplyIntent(text: string): TargetReplyIntent {
  const trimmed = text.trim();
  if (!trimmed) return 'unknown';
  if (TARGET_OPT_OUT_RE.test(trimmed)) return 'opt_out';
  if (WRONG_NUMBER_RE.test(trimmed)) return 'wrong_number';
  if (IDENTITY_RE.test(trimmed)) return 'identity_clarification';
  if (OWNER_UNSAFE_RE.test(trimmed)) return 'unsafe';
  if (NEEDS_OWNER_RE.test(trimmed)) return 'needs_owner_input';
  if (REFUSAL_RE.test(trimmed)) return 'refusal';
  return 'unknown';
}

export function buildIdentityRedisclosure(ownerName: string, objective: string): string {
  return `I'm Nest, coordinating for ${ownerName} about ${objective}. No worries if not.`;
}

export function isOwnerApproval(text: string): boolean {
  return /^(yes|yep|yeah|yea|ok|okay|sure|send|send it|go ahead|do it|approved|approve|confirm)$/i.test(text.trim());
}

export function isRecipientOptIn(text: string): boolean {
  return /^(yes|yep|yeah|yea|ok|okay|sure|go ahead|that'?s fine|fine|all good|no worries|sounds good|y)\s*[!.]?$/i.test(text.trim());
}

export function isOwnerRejectionOrCancel(text: string): boolean {
  return /^(no|nah|nope|cancel(?:\s+that)?|stop|never mind|nevermind|don't send|do not send|scratch that)\s*[!.]?$/i.test(text.trim());
}

export function isNoAdditionalRecipientInfo(text: string): boolean {
  return /^(no|nah|nope|nothing|nothing else|all good|that'?s all|that's it|no thanks|no thank you|nup|ok|okay|cool|perfect)\s*[!.]?$/i.test(text.trim());
}
