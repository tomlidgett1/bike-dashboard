import { MODEL_MAP } from "../ai/models.ts";
import { geminiSimpleText, getOrCreateGeminiCache, isGeminiModel } from "../ai/gemini.ts";
import { getOpenAIClient } from "../ai/models.ts";
import {
  resolveToolChoice,
  resolveTools,
} from "./capability-tools.ts";
import type {
  Capability,
  ClassifierResult,
  DomainTag,
  MemoryDepth,
  RouteDecision,
  ToolNamespace,
  TurnInput,
  UserStyle,
} from "./types.ts";
import type { RouterContext } from "./build-context.ts";
import {
  isComposioEmailWatchIntent,
  parseComposioConnectIntent,
} from "./composio-connect-intent.ts";
import { routeComposioTurn } from "./composio-chat-mode.ts";

// ═══════════════════════════════════════════════════════════════
// Nest Router V3 — MECE rubric
//
// Fast-paths (F1–F4): deterministic regex, no LLM.
// LLM routes (R1–R10): single structured-output call against a
// MECE rubric. Replaces v2's classifier + 4 safety-net overrides.
//
// Only fires when user_profiles.new_router = true. v2 remains the
// default; this is the test path for latency/accuracy comparison.
// ═══════════════════════════════════════════════════════════════

// ─── F1–F4: Fast-paths (regex) ────────────────────────────────

const OBVIOUS_AFFIRMATIVE =
  /^(yes|yep|yeah|yea|sure|ok|okay|send|send it|go ahead|do it|confirm|lgtm|looks good|perfect|great|book it|go for it|ship it|fire away|let's go|sure thing|absolutely|definitely|of course|please do)$/i;
const OBVIOUS_NEGATIVE =
  /^(no|nah|nope|cancel|never ?mind|don't|stop|hold on|wait|not yet|scratch that|let me think)$/i;
const SLASH_COMMAND = /^\s*\//;
const EMOJI_ONLY = /^[\s\p{Extended_Pictographic}\p{Emoji_Component}]+$/u;
const CALENDAR_DELETE_FOLLOWUP =
  /\b(?:na|nah|no|nope)?\b[\s,.]*(?:please\s+)?(?:remove|delete|cancel|take\s+(?:it|that)\s+off|take\s+off)\b[\s\S]{0,100}\b(?:calendar|cal|event|booking|reservation|dinner|it|that)\b/i;
const TIMED_EVENT_REFERENCE =
  /\b(dinner|tonight|calendar|event|booking|reservation)\b[\s\S]{0,80}\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b|\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b[\s\S]{0,80}\b(dinner|tonight|calendar|event|booking|reservation)\b/i;
const DIRECT_CALENDAR_LOOKUP =
  /\b(?:what'?s|what is|what have i got|what do i have|what am i doing|what are my plans|show me|check|help me understand)\b[\s\S]{0,80}\b(?:my|me|i|for me|calendar|schedule|plans?|meetings?|events?)\b[\s\S]{0,80}\b(?:today|tomorrow|tonight|this week|next week|weekend|(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b|\b(?:today|tomorrow|tonight|this week|next week|weekend|(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b[\s\S]{0,80}\b(?:my|me|for me|calendar|schedule|meetings?|events?|plans?)\b/i;

const SAFE_CASUAL =
  /^(hey|hi|hello|yo|hiya|sup|thanks|thank you|cheers|thx|nice|cool|awesome|perfect|great|amazing|wow|lol|haha|hahaha|lmao|bye|cya|see ya|later|good morning|morning|good afternoon|good evening|good night|night|gm|gn|no worries|fair enough|interesting|right|true|same|all good|sounds good|got it|love it|ok cool|okay cool)[!.?]*$/i;
const DEEP_PROFILE_QUERY =
  /\b(profile me|what do you know about me|what do you remember about me|tell me (about|everything about|everything you know about) (myself|me)|what have you (learned|figured out) about me|give me a (summary|rundown|profile) of (everything you know|what you know)|how well do you (know|understand) me|paint a picture of me|describe me based on what you know)\b/i;
const PERSONAL_RECALL_QUERY =
  /\b(do you (remember|recall)|what did (i|we) (say|tell|mention|talk about)|when did (i|we)|when did .{1,80}\b(and|with)\s+(i|me|we)\b|where did (i|we)|who did (i|we)|what'?s my (?!calendar|schedule|inbox|email)|who'?s .{1,40} again|last time (we|i)|what have i told you)\b/i;
const PERSONAL_HISTORY_SELF =
  /\b(i|me|my|mine|we|us|our)\b/i;
const PERSONAL_HISTORY_SIGNAL =
  /\b(did|was|were|been|went|gone|go(?:\s+to)?|visit(?:ed)?|travel(?:led|ed)?|trip|holiday|internship|speak|spoke|talk(?:ed)?|chat(?:ted)?|meet|met|with who|who with|in\s+\d{4}|back in|ever|first|last|previous(?:ly)?|before|years? ago)\b/i;
const NAMED_PERSON_IDENTITY =
  /\bwho\s+(?:is|was|are|were)\s+(?!the\b)([a-z][a-z'’-]+(?:\s+[a-z][a-z'’-]+){1,3})\b/i;
const PUBLIC_IDENTITY_HINT =
  /\b(president|prime minister|king|queen|capital|ceo of|founder of|author of|wrote|actor|singer|footballer|cricketer|celebrity)\b/i;
const PERSONAL_ATTRIBUTE_QUERY =
  /\b(my|mine|our)\s+(birthday|birthdate|date of birth|dob|age|middle name|full name|address|home address|passport|visa|anniversary)\b|\b(when|what|where|who)\b.{0,80}\b(my|mine|our)\b.{0,40}\b(birthday|birthdate|date of birth|dob|age|middle name|full name|address|home address|passport|visa|anniversary)\b/i;
const PERSONAL_INFERENCE_QUERY =
  /\b(?:you|nest)\s+(?:think|know|remember|recall|guess)\b.{0,100}\b(my|mine|our)\b/i;
const ADVICE_OR_GENERAL_SELF_QUERY =
  /\b(how do i|how can i|how should i|should i|can i)\b.{0,120}\b(build|make|cook|learn|write|fix|explain|understand|improve|start|use|install|deploy|code|study)\b/i;
const NON_NAME_WORDS = new Set([
  'playing', 'leading', 'going', 'doing', 'winning', 'running', 'coming', 'the',
  'a', 'an', 'in', 'on', 'at', 'for', 'to', 'of', 'with', 'from',
]);

function isNamedPersonIdentity(message: string): boolean {
  const match = message.match(NAMED_PERSON_IDENTITY);
  if (!match || PUBLIC_IDENTITY_HINT.test(message)) return false;
  const words = match[1].toLowerCase().split(/\s+/);
  return words.length >= 2 && words.every((word) => !NON_NAME_WORDS.has(word));
}

function isPersonalRecallQuery(message: string): boolean {
  return PERSONAL_RECALL_QUERY.test(message) ||
    PERSONAL_ATTRIBUTE_QUERY.test(message) ||
    isNamedPersonIdentity(message) ||
    (PERSONAL_INFERENCE_QUERY.test(message) && !ADVICE_OR_GENERAL_SELF_QUERY.test(message)) ||
    (PERSONAL_HISTORY_SELF.test(message) && PERSONAL_HISTORY_SIGNAL.test(message));
}

function isCalendarDeleteFollowup(message: string, context: RouterContext): boolean {
  if (!CALENDAR_DELETE_FOLLOWUP.test(message)) return false;
  const lastAssistant = [...context.recentTurns].reverse().find((turn) => turn.role === "assistant")?.content ?? "";
  return TIMED_EVENT_REFERENCE.test(lastAssistant) || /\bcalendar|cal|event|booking|reservation|dinner\b/i.test(message);
}

const EMAIL_READ_QUERY =
  /\b(inbox|emails?|gmail|outlook|unread|mail|message from|email from|did .{1,40} (reply|respond)|anything from|thread|attachment)\b/i;
const CALENDAR_READ_QUERY =
  /\b(calendar|schedule|meetings?|appointments?|what'?s on my|what am i doing|what are my plans|do i have (anything|any meetings?|plans)|free (today|tomorrow|this|next|at)|busy (today|tomorrow|this|next|at))\b/i;
const CONTACTS_READ_QUERY =
  /\b(my contacts?|contact (card|details)|phone number for|mobile for|email address for|what'?s .{1,40}'s (number|mobile|email))\b/i;
const GRANOLA_READ_QUERY =
  /\b(granola|meeting notes?|notes from .{1,40} meeting|what was discussed|what did we discuss)\b/i;

const WRITE_ACTION_QUERY =
  /\b(send|draft|reply|respond|forward|compose|book|booked|booking|schedule|cancel|delete|remove|create|update|move|reschedule|invite|add|set up|remind|reminder|notify|alert|watch for)\b/i;
const EMAIL_WRITE_QUERY =
  /\b(send|draft|reply|respond|forward|compose)\b[\s\S]{0,120}\b(email|mail|message|note|reply|thread|to)\b|\b(email|mail|message)\b[\s\S]{0,80}\b(send|draft|reply|forward|compose)\b/i;
const REMINDER_WRITE_QUERY =
  /\b(remind me|set a reminder|reminder to|notify me|alert me|watch for)\b/i;
const CALENDAR_WRITE_QUERY =
  /\b(book|booked|booking|schedule|cancel|delete|remove|create|update|move|reschedule|invite|add)\b[\s\S]{0,120}\b(calendar|meeting|event|appointment|call|slot|time|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(:\d{2})?\s?(am|pm))\b/i;

const LIVE_RESEARCH_QUERY =
  /\b(weather|forecast|rain|temperature|uv|air quality|latest|news|current|right now|today|tonight|this week|this weekend|open now|opening hours?|close[sd]?|closing time|stock|share price|crypto|bitcoin|btc|eth|score|standings|ladder|fixture|results?|who won|who'?s playing|president of|prime minister of|ceo of|leader of|governor of|mayor of|directions?|how long to (drive|walk|get)|how far|from .{1,50} to .{1,50}|near me|nearby|nearest|best .{1,40} in |good .{1,40} in |restaurants?|cafes?|bars?|pubs?|events?|what'?s on|look up|google|search (the web|online|for)|find (me )?(a|an|the|some)|phone number for|address of|reviews? of|rating for)\b/i;
const PERSONAL_RESEARCH_CONTEXT =
  /\b(near me|nearby|around here|my area|my location|from home|from work|from my|to my)\b/i;
const STATIC_KNOWLEDGE_OPENER =
  /^(what|how|why|when|where|who|which|explain|describe|define|tell me about|compare|summari[sz]e|write|brainstorm|help me brainstorm|give me)\b/i;
const PERSONAL_OR_ACCOUNT_SIGNAL =
  /\b(my|mine|our|inbox|calendar|schedule|emails?|gmail|outlook|contacts?|granola|meeting notes?|remind me|what did i|do i have|am i|are we|have i|did i|did we)\b/i;
const CURRENTNESS_SIGNAL =
  /\b(latest|current|right now|today|tonight|this week|this weekend|now|open now|news|weather|forecast|score|standings|price)\b/i;
const READ_QUESTION_OPENER =
  /^(did|has|have|do i|do we|what|when|where|who|which|show|check|any|is there|are there)\b/i;

// ─── MECE rubric (consumed by the LLM as system prompt) ────────

const V3_ROUTER_RUBRIC = `You are the routing brain for Nest, a personal assistant people text over iMessage.

Classify the user's message into EXACTLY ONE of the routes below. Output strict JSON, no markdown.

## Output schema
{
  "route_id": "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7" | "R10",
  "confidence": 0.0-1.0,
  "memory_depth": "none" | "light" | "full",
  "required_capabilities": [],   // see capability list below
  "style": "brief" | "normal" | "deep",
  "predicted_tool_domain": "email" | "calendar" | "contacts" | "reminders" | "meeting_prep" | "research" | "recall" | "general" | null,
  "reason": "one short phrase explaining the choice"
}

## Capabilities (include only what's needed)
email.read, email.write, calendar.read, calendar.write, contacts.read, granola.read, web.search, knowledge.search, memory.read, memory.write, travel.search, weather.search, reminders.manage, notifications.watch, deep_profile, composio.read, composio.write

composio.read: user wants to connect/link a third-party app via Composio OAuth (Strava, Slack, GitHub, Notion, Spotify, etc.) — not Google/Microsoft inbox or calendar. composio.write: same conversation also needs Composio triggers or ongoing automation.

## Routes (MECE — pick exactly one)

### R1 casual_chat
Small talk, greetings, acknowledgements, reactions, banter, jokes, emotional support. No personal data retrieval, no tools. memory_depth: "none".
Examples: "hey", "thanks!", "lol how's it going", "you there", "good one", "tough day"
NOT: anything with "my" referring to stored facts → R2. Anything with "today/now/latest" → R4.

### R2 personal_recall
User is asking about something only Nest's stored memory of them can answer. Possessive pronouns referring to stored facts ("my dentist", "what did I say"), or reference to past conversation. memory_depth: "full".
Examples: "what's my dentist's name", "when did I last see Sarah", "what did we talk about last week", "who's Priya again"
NOT: "what's on my calendar" → R6 (from accounts, not memory). "what's the capital of France" → R3.

### R3 general_knowledge
Factual Q&A answerable without user data or live web. memory_depth: "none".
Examples: "what's the boiling point of water", "explain recursion", "who wrote Hamlet", "how do I bake bread"
NOT: anything needing current/live data → R4. "what's my mother's maiden name" → R2.

### R4 research
Needs live web data, current events, prices, weather, or multi-source synthesis. Predicts a tool call. memory_depth: "light". Capabilities: web.search (and weather.search or travel.search if relevant). If the user also asks to email/calendar the research output, stay on R7 and include web.search in required_capabilities — every task route now ships with web.search, so a single route can do both.
Examples: "what happened in the Fed meeting today", "weather in Lisbon", "compare iPhone 17 vs Pixel 10", "news about Tesla"

### R5 deep_profile
User asks Nest to summarise what it knows about them as a whole. memory_depth: "full". Capabilities: deep_profile, memory.read.
Examples: "catch me up on what you know about me", "what have I told you", "summarise my situation", "paint a picture of me"
NOT: "what's my dentist's name" → R2 (single fact).

### R6 personal_data_read
Reading from a connected account (email, calendar, contacts, granola/meeting notes). Predicts a tool call. memory_depth: "light". Capabilities: the read namespaces matching the domain.
Examples: "what's on my calendar today", "did I get an email from Priya", "show me flights from my inbox", "find Tom in my contacts", "what's on my Thursday"
NOT: "send Priya an email" → R7 (write). "what did Priya tell me last week" → R2 (from memory, not inbox).

### R7 action_write
User asks Nest to perform a mutation — send email, create/update/delete calendar event, set reminder. Predicts a tool call and triggers the draft-then-confirm flow. memory_depth: "light". Capabilities: the write namespaces matching the domain + read to look up recipients.
Examples: "send Priya a quick yes", "book an hour tomorrow for deep work", "remind me to call mum Friday", "cancel my 3pm", "reschedule dinner to 7"

### R10 unclear
Genuinely ambiguous — confidence across all other routes is below 0.6. Reply with one short clarifying question, no tools, no memory.
Examples: "sarah" (no context), "can you", "hmm"

## Disambiguation order (apply top-down)
1. If possessive pronoun + stored-fact reference → R2 over R3
2. If mentions today/now/latest/live → R4 over R3
3. If imperative write verb (send/book/create/delete/cancel/schedule/remind) → R7 over R6
4. If plural/summary phrasing ("everything you know", "catch me up") → R5 over R2
5. If all top-3 confidences within 0.1 of each other → R10

## memory_depth guidance
- none: R1, R3 (no retrieval)
- light: R4, R6, R7 (summary-level personal context)
- full: R2, R5 (deep recall)

## Confidence
- 0.9+ when the route is unambiguous and matches an example closely
- 0.7–0.9 when confident but message has some ambiguity
- <0.6 → use R10`;

// ─── Helpers ───────────────────────────────────────────────────

const VALID_ROUTES: Set<string> = new Set(["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R10"]);
const VALID_CAPABILITIES: Set<string> = new Set([
  "composio.read", "composio.write",
  "email.read", "email.write", "calendar.read", "calendar.write", "contacts.read",
  "granola.read", "web.search", "knowledge.search", "memory.read", "memory.write",
  "travel.search", "weather.search", "reminders.manage", "notifications.watch", "deep_profile",
]);
const VALID_DOMAINS: Set<string> = new Set([
  "email", "calendar", "meeting_prep", "research", "recall", "contacts", "reminders", "general",
]);

function validateRoute(r: unknown): string {
  return VALID_ROUTES.has(r as string) ? (r as string) : "R10";
}
function isValidCapability(c: unknown): c is Capability {
  return VALID_CAPABILITIES.has(c as string);
}
function validateDomain(d: unknown): DomainTag {
  return VALID_DOMAINS.has(d as string) ? (d as DomainTag) : "general";
}
function validateMemoryDepth(d: unknown): MemoryDepth {
  if (d === "none" || d === "light" || d === "full") return d;
  return "none";
}
function validateStyle(s: unknown): UserStyle {
  if (s === "brief" || s === "normal" || s === "deep") return s;
  return "normal";
}

interface V3Classification {
  route_id: "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7" | "R10";
  confidence: number;
  memory_depth: MemoryDepth;
  required_capabilities: Capability[];
  style: UserStyle;
  predicted_tool_domain: DomainTag | null;
  reason: string;
}

// ─── Fast-path entry ───────────────────────────────────────────

function tryFastPath(
  input: TurnInput,
  context: RouterContext,
  routerLatencyMs: number,
): RouteDecision | null {
  const msg = input.userMessage.trim();

  const composioIntent = parseComposioConnectIntent(msg);
  if (composioIntent) {
    const requiredCaps: Capability[] = ["composio.read"];
    if (composioIntent.needsWrite) requiredCaps.push("composio.write");
    const synthetic: ClassifierResult = {
      mode: "smart",
      primaryDomain: "general",
      confidence: 0.98,
      requiredCapabilities: requiredCaps,
      memoryDepth: "light",
      requiresToolUse: true,
      isConfirmation: false,
      style: "normal",
    };
    const namespaces = resolveTools(synthetic);
    return {
      mode: "single_agent",
      agent: "smart",
      allowedNamespaces: namespaces,
      needsMemoryRead: true,
      needsMemoryWriteCandidate: composioIntent.needsWrite,
      needsWebFreshness: false,
      userStyle: "normal",
      confidence: 0.98,
      fastPathUsed: true,
      routerLatencyMs,
      primaryDomain: "general",
      memoryDepth: "light",
      routeLayer: "v3-Fcomposio",
      routeReason: "third_party_composio_connect",
    };
  }

  if (isComposioEmailWatchIntent(msg)) {
    const synthetic: ClassifierResult = {
      mode: "smart",
      primaryDomain: "email",
      confidence: 0.97,
      requiredCapabilities: [
        "composio.read",
        "composio.write",
        "notifications.watch",
      ],
      memoryDepth: "light",
      requiresToolUse: true,
      isConfirmation: false,
      style: "normal",
    };
    const namespaces = resolveTools(synthetic);
    return {
      mode: "single_agent",
      agent: "smart",
      allowedNamespaces: namespaces,
      needsMemoryRead: true,
      needsMemoryWriteCandidate: true,
      needsWebFreshness: false,
      userStyle: "normal",
      confidence: 0.97,
      fastPathUsed: true,
      routerLatencyMs,
      primaryDomain: "email",
      memoryDepth: "light",
      routeLayer: "v3-Fcomposio-email-watch",
      routeReason: "composio_email_watch_intent",
    };
  }

  // F2: slash commands — handled upstream in handleSlashCommand, but catch any leakage
  if (SLASH_COMMAND.test(msg)) {
    return {
      mode: "direct",
      agent: "casual",
      allowedNamespaces: [],
      needsMemoryRead: false,
      needsMemoryWriteCandidate: false,
      needsWebFreshness: false,
      userStyle: "brief",
      confidence: 1.0,
      fastPathUsed: true,
      routerLatencyMs,
      memoryDepth: "none",
      routeLayer: "v3-F2",
      routeReason: "slash_command",
    };
  }

  // F1: pending-action confirmation
  const hasPendingEmailSend = context.pendingEmailSends.length > 0;
  const wm = context.workingMemory;
  const hasPendingAction = hasPendingEmailSend ||
    wm.pendingActions.some((a) =>
      ["calendar_update", "calendar_delete", "calendar_create"].includes(a.type)
    );

  if (hasPendingAction && msg.length < 120) {
    const lower = msg.toLowerCase();
    if (OBVIOUS_AFFIRMATIVE.test(lower)) {
      const domain: DomainTag = hasPendingEmailSend ? "email" : "calendar";
      const namespaces: ToolNamespace[] = hasPendingEmailSend
        ? ["email.read", "email.write", "contacts.read", "memory.read", "messaging.react"]
        : ["calendar.read", "calendar.write", "contacts.read", "memory.read", "messaging.react"];
      return {
        mode: "single_agent",
        agent: "smart",
        allowedNamespaces: namespaces,
        needsMemoryRead: false,
        needsMemoryWriteCandidate: false,
        needsWebFreshness: false,
        userStyle: "normal",
        confidence: 0.95,
        fastPathUsed: true,
        routerLatencyMs,
        confirmationState: "confirmed",
        primaryDomain: domain,
        memoryDepth: "none",
        forcedToolChoice: "required",
        routeLayer: "v3-F1",
        routeReason: "obvious_affirmative",
        hadPendingState: true,
      };
    }
    if (OBVIOUS_NEGATIVE.test(lower)) {
      const domain: DomainTag = hasPendingEmailSend ? "email" : "calendar";
      const namespaces: ToolNamespace[] = hasPendingEmailSend
        ? ["email.read", "email.write", "messaging.react"]
        : ["calendar.read", "calendar.write", "messaging.react"];
      return {
        mode: "single_agent",
        agent: "smart",
        allowedNamespaces: namespaces,
        needsMemoryRead: false,
        needsMemoryWriteCandidate: false,
        needsWebFreshness: false,
        userStyle: "normal",
        confidence: 0.90,
        fastPathUsed: true,
        routerLatencyMs,
        confirmationState: "not_confirmation",
        primaryDomain: domain,
        memoryDepth: "none",
        routeLayer: "v3-F1",
        routeReason: "obvious_negative",
        hadPendingState: true,
      };
    }
  }

  // F4: emoji-only or very short reactions → chat, no memory.
  // Keep this after F1 so "ok", "yes", and "no" can resolve pending actions.
  if (msg.length <= 4 || EMOJI_ONLY.test(msg)) {
    return {
      mode: "single_agent",
      agent: "chat",
      allowedNamespaces: ["messaging.react", "messaging.effect"],
      needsMemoryRead: false,
      needsMemoryWriteCandidate: false,
      needsWebFreshness: false,
      userStyle: "brief",
      confidence: 0.95,
      fastPathUsed: true,
      routerLatencyMs,
      memoryDepth: "none",
      modelTierOverride: "fast",
      routeLayer: "v3-F4",
      routeReason: "emoji_or_short_reaction",
    };
  }

  if (isCalendarDeleteFollowup(msg, context)) {
    return {
      mode: "single_agent",
      agent: "smart",
      allowedNamespaces: ["calendar.read", "calendar.write", "messaging.react"],
      needsMemoryRead: false,
      needsMemoryWriteCandidate: false,
      needsWebFreshness: false,
      userStyle: "normal",
      confidence: 0.95,
      fastPathUsed: true,
      routerLatencyMs,
      memoryDepth: "none",
      primaryDomain: "calendar",
      forcedToolChoice: "required",
      routeLayer: "v3-F3",
      routeReason: "calendar_delete_followup",
    };
  }

  if (DIRECT_CALENDAR_LOOKUP.test(msg)) {
    return {
      mode: "single_agent",
      agent: "smart",
      allowedNamespaces: ["calendar.read", "messaging.react"],
      needsMemoryRead: false,
      needsMemoryWriteCandidate: false,
      needsWebFreshness: false,
      userStyle: "normal",
      confidence: 0.97,
      fastPathUsed: true,
      routerLatencyMs,
      memoryDepth: "none",
      primaryDomain: "calendar",
      forcedToolChoice: "required",
      routeLayer: "v3-F3",
      routeReason: "calendar_lookup_fast_lane",
    };
  }

  // F3: group-chat noise handled by input.isGroupChat upstream; no-op here
  return null;
}

function hasPendingRouterState(context: RouterContext): boolean {
  const wm = context.workingMemory;
  return context.pendingEmailSends.length > 0 ||
    (wm.pendingActions?.length ?? 0) > 0 ||
    (wm.unresolvedReferences?.length ?? 0) > 0 ||
    wm.awaitingConfirmation === true ||
    wm.awaitingChoice === true ||
    wm.awaitingMissingParameter === true;
}

function routeFromClassification(
  classification: V3Classification,
  latencyMs: number,
  fastPathUsed: boolean,
): RouteDecision {
  const route = classificationToRoute(classification, latencyMs);
  return {
    ...route,
    fastPathUsed,
    routerLatencyMs: latencyMs,
  };
}

function makeClassification(
  params: {
    routeId: V3Classification["route_id"];
    confidence: number;
    memoryDepth: MemoryDepth;
    capabilities?: Capability[];
    style?: UserStyle;
    domain?: DomainTag | null;
    reason: string;
  },
): V3Classification {
  return {
    route_id: params.routeId,
    confidence: params.confidence,
    memory_depth: params.memoryDepth,
    required_capabilities: params.capabilities ?? [],
    style: params.style ?? "normal",
    predicted_tool_domain: params.domain ?? null,
    reason: params.reason,
  };
}

function predictedWriteDomain(msg: string): DomainTag {
  if (REMINDER_WRITE_QUERY.test(msg)) return "reminders";
  if (EMAIL_WRITE_QUERY.test(msg)) return "email";
  if (CALENDAR_WRITE_QUERY.test(msg)) return "calendar";
  if (/\b(email|mail|reply|thread)\b/i.test(msg)) return "email";
  if (/\b(calendar|meeting|event|appointment|call)\b/i.test(msg)) return "calendar";
  return "general";
}

function capabilitiesForWriteDomain(domain: DomainTag, msg: string): Capability[] {
  const caps: Capability[] = [];
  if (domain === "email") caps.push("email.read", "email.write", "contacts.read");
  if (domain === "calendar") caps.push("calendar.read", "calendar.write", "contacts.read");
  if (domain === "reminders") caps.push("reminders.manage");
  if (LIVE_RESEARCH_QUERY.test(msg)) caps.push("web.search");
  return caps;
}

function predictedReadDomain(msg: string): DomainTag | null {
  if (GRANOLA_READ_QUERY.test(msg)) return "meeting_prep";
  if (EMAIL_READ_QUERY.test(msg)) return "email";
  if (CALENDAR_READ_QUERY.test(msg)) return "calendar";
  if (CONTACTS_READ_QUERY.test(msg)) return "contacts";
  return null;
}

function capabilitiesForReadDomain(domain: DomainTag): Capability[] {
  if (domain === "email") return ["email.read"];
  if (domain === "calendar") return ["calendar.read"];
  if (domain === "contacts") return ["contacts.read"];
  if (domain === "meeting_prep") return ["granola.read", "calendar.read"];
  return [];
}

function researchCapabilities(msg: string): Capability[] {
  const caps: Capability[] = ["web.search"];
  if (/\b(weather|forecast|rain|temperature|uv|air quality)\b/i.test(msg)) {
    caps.push("weather.search");
  }
  if (/\b(directions?|how long to (drive|walk|get)|how far|from .{1,50} to .{1,50}|near me|nearby|nearest)\b/i.test(msg)) {
    caps.push("travel.search");
  }
  return caps;
}

function tryDeterministicRoute(
  input: TurnInput,
  context: RouterContext,
  routerLatencyMs: number,
): RouteDecision | null {
  const msg = input.userMessage.trim().replace(/\s+/g, " ");
  if (!msg) return null;

  // If there is unresolved state beyond the obvious F1 confirmations, keep
  // ambiguous short continuations on the LLM rubric.
  if (hasPendingRouterState(context) && msg.length <= 120) {
    return null;
  }

  if (SAFE_CASUAL.test(msg)) {
    return routeFromClassification(
      makeClassification({
        routeId: "R1",
        confidence: 0.98,
        memoryDepth: "none",
        style: "brief",
        domain: "general",
        reason: "deterministic_safe_casual",
      }),
      routerLatencyMs,
      true,
    );
  }

  if (DEEP_PROFILE_QUERY.test(msg)) {
    return routeFromClassification(
      makeClassification({
        routeId: "R5",
        confidence: 0.95,
        memoryDepth: "full",
        capabilities: ["deep_profile", "memory.read"],
        domain: "recall",
        reason: "deterministic_deep_profile",
      }),
      routerLatencyMs,
      true,
    );
  }

  if (isPersonalRecallQuery(msg)) {
    return routeFromClassification(
      makeClassification({
        routeId: "R2",
        confidence: 0.92,
        memoryDepth: "full",
        capabilities: ["memory.read"],
        domain: "recall",
        reason: "deterministic_personal_recall",
      }),
      routerLatencyMs,
      true,
    );
  }

  if (WRITE_ACTION_QUERY.test(msg)) {
    const readDomain = READ_QUESTION_OPENER.test(msg) ? predictedReadDomain(msg) : null;
    if (readDomain) {
      return routeFromClassification(
        makeClassification({
          routeId: "R6",
          confidence: 0.93,
          memoryDepth: "light",
          capabilities: capabilitiesForReadDomain(readDomain),
          domain: readDomain,
          reason: `deterministic_personal_data_read:${readDomain}`,
        }),
        routerLatencyMs,
        true,
      );
    }

    const domain = predictedWriteDomain(msg);
    return routeFromClassification(
      makeClassification({
        routeId: "R7",
        confidence: 0.92,
        memoryDepth: "light",
        capabilities: capabilitiesForWriteDomain(domain, msg),
        domain,
        reason: `deterministic_action_write:${domain}`,
      }),
      routerLatencyMs,
      true,
    );
  }

  const readDomain = predictedReadDomain(msg);
  if (readDomain) {
    return routeFromClassification(
      makeClassification({
        routeId: "R6",
        confidence: 0.93,
        memoryDepth: "light",
        capabilities: capabilitiesForReadDomain(readDomain),
        domain: readDomain,
        reason: `deterministic_personal_data_read:${readDomain}`,
      }),
      routerLatencyMs,
      true,
    );
  }

  if (LIVE_RESEARCH_QUERY.test(msg)) {
    const needsPersonalContext = PERSONAL_RESEARCH_CONTEXT.test(msg);
    const route = routeFromClassification(
      makeClassification({
        routeId: "R4",
        confidence: 0.90,
        memoryDepth: needsPersonalContext ? "light" : "none",
        capabilities: researchCapabilities(msg),
        domain: "research",
        reason: "deterministic_live_research",
      }),
      routerLatencyMs,
      true,
    );
    if (!needsPersonalContext) {
      route.memoryDepth = "none";
      if (route.classifierResult) {
        route.classifierResult = { ...route.classifierResult, memoryDepth: "none" };
      }
    }
    return route;
  }

  if (
    STATIC_KNOWLEDGE_OPENER.test(msg) &&
    !PERSONAL_OR_ACCOUNT_SIGNAL.test(msg) &&
    !CURRENTNESS_SIGNAL.test(msg)
  ) {
    return routeFromClassification(
      makeClassification({
        routeId: "R3",
        confidence: 0.90,
        memoryDepth: "none",
        capabilities: [],
        domain: "general",
        reason: "deterministic_general_knowledge",
      }),
      routerLatencyMs,
      true,
    );
  }

  return null;
}

// ─── LLM classification ────────────────────────────────────────

async function classifyWithRubric(
  input: TurnInput,
  context: RouterContext,
): Promise<{ result: V3Classification; latencyMs: number }> {
  const model = MODEL_MAP.fast; // gemini flash — the router itself should be fast
  const start = Date.now();

  const contextParts: string[] = [];
  if (context.recentTurns.length > 0) {
    const turnSummary = context.recentTurns
      .slice(-4)
      .map((t) => `${t.role}: ${t.content.substring(0, 160)}`)
      .join("\n");
    contextParts.push(`Recent conversation:\n${turnSummary}`);
  }
  const wm = context.workingMemory;
  if (wm.pendingActions.length > 0) {
    contextParts.push(
      `Pending actions: ${wm.pendingActions.map((a) => `[${a.type}] ${a.description}`).join("; ")}`,
    );
  }
  if (context.pendingEmailSends.length > 0) {
    const draft = context.pendingEmailSends[0];
    contextParts.push(`Pending email draft: id=${draft.id}, awaiting confirmation`);
  }

  const contextBlock = contextParts.length > 0
    ? `Context:\n${contextParts.join("\n\n")}\n\n`
    : "";
  const userBlock = `${contextBlock}Classify this message: "${input.userMessage.substring(0, 500)}"`;

  let text: string;
  try {
    if (isGeminiModel(model)) {
      const cacheName = await getOrCreateGeminiCache({
        cacheKey: `router-v3-${model}`,
        model,
        systemPrompt: V3_ROUTER_RUBRIC,
        ttlSeconds: 900,
      });
      const geminiResult = await geminiSimpleText({
        model,
        systemPrompt: V3_ROUTER_RUBRIC,
        userMessage: userBlock,
        maxOutputTokens: 512,
        cachedContent: cacheName ?? undefined,
      });
      text = geminiResult.text;
    } else {
      const client = getOpenAIClient();
      const response = await client.responses.create(
        {
          model,
          instructions: V3_ROUTER_RUBRIC,
          input: [{ role: "user", content: userBlock }],
          max_output_tokens: 512,
          store: false,
          prompt_cache_key: "nest-router-v3",
        } as Parameters<typeof client.responses.create>[0],
      );
      text = response.output_text ?? "";
    }
  } catch (err) {
    console.warn(`[route-v3] LLM call failed:`, (err as Error).message);
    return {
      result: {
        route_id: "R10",
        confidence: 0.5,
        memory_depth: "none",
        required_capabilities: [],
        style: "normal",
        predicted_tool_domain: null,
        reason: "llm_failed",
      },
      latencyMs: Date.now() - start,
    };
  }

  const latencyMs = Date.now() - start;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.warn(`[route-v3] no JSON in response (${latencyMs}ms): "${text.substring(0, 200)}"`);
    return {
      result: {
        route_id: "R10",
        confidence: 0.5,
        memory_depth: "none",
        required_capabilities: [],
        style: "normal",
        predicted_tool_domain: null,
        reason: "parse_failed",
      },
      latencyMs,
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const routeId = validateRoute(parsed.route_id) as V3Classification["route_id"];
    const classification: V3Classification = {
      route_id: routeId,
      confidence: typeof parsed.confidence === "number"
        ? Math.min(1, Math.max(0, parsed.confidence))
        : 0.7,
      memory_depth: validateMemoryDepth(parsed.memory_depth),
      required_capabilities: Array.isArray(parsed.required_capabilities)
        ? parsed.required_capabilities.filter(isValidCapability)
        : [],
      style: validateStyle(parsed.style),
      predicted_tool_domain: parsed.predicted_tool_domain
        ? validateDomain(parsed.predicted_tool_domain)
        : null,
      reason: typeof parsed.reason === "string" ? parsed.reason.substring(0, 120) : "",
    };
    return { result: classification, latencyMs };
  } catch (err) {
    console.warn(`[route-v3] JSON parse error:`, (err as Error).message);
    return {
      result: {
        route_id: "R10",
        confidence: 0.5,
        memory_depth: "none",
        required_capabilities: [],
        style: "normal",
        predicted_tool_domain: null,
        reason: "parse_exception",
      },
      latencyMs,
    };
  }
}

// ─── Map classification → RouteDecision ────────────────────────

const CHAT_NAMESPACES: ToolNamespace[] = [
  "memory.read",
  "memory.write",
  "messaging.react",
  "messaging.effect",
  "media.generate",
];

// Universally-safe read tools that any task agent might compound on top of
// its primary domain. Including these means a "research X then email/calendar Y"
// request never loses access to web.search just because the router classified
// it as an action_write route. All listed tools are read-only with no
// side effects, and the executor still gates real commits.
const COMPOUND_READ_NAMESPACES: ToolNamespace[] = [
  "web.search",
  "knowledge.search",
  "weather.search",
  "travel.search",
  "granola.read",
];

const RESEARCH_NAMESPACES: ToolNamespace[] = [
  "web.search",
  "knowledge.search",
  "travel.search",
  "weather.search",
  "memory.read",
  "messaging.react",
  // Compound: research is often the prelude to an action ("find X and email
  // Tom"). Include the personal-data read tools and email/calendar write so
  // the model can act on what it found without bouncing through another
  // routing turn. email_send still requires explicit user confirmation in
  // the executor, so this stays safe.
  "contacts.read",
  "email.read",
  "email.write",
  "calendar.read",
];

const RECALL_NAMESPACES: ToolNamespace[] = [
  "memory.read",
  "memory.write",
  "knowledge.search",
  "email.read",
  "calendar.read",
  "granola.read",
  "messaging.react",
];

function namespacesForDomain(domain: DomainTag | null, write: boolean): ToolNamespace[] {
  // Every task agent gets the compound-safe read tools so it can browse the
  // web, check weather, look up travel, query the knowledge base, or pull
  // meeting notes when the user's request mixes research with action.
  const base: ToolNamespace[] = [
    "memory.read",
    "contacts.read",
    "messaging.react",
    ...COMPOUND_READ_NAMESPACES,
  ];
  if (domain === "email") {
    return write
      ? [...base, "email.read", "email.write"]
      : [...base, "email.read"];
  }
  if (domain === "calendar") {
    return write
      ? [...base, "calendar.read", "calendar.write", "email.read"]
      : [...base, "calendar.read", "email.read"];
  }
  if (domain === "contacts") return [...base, "email.read", "calendar.read"];
  if (domain === "meeting_prep") return [...base, "calendar.read", "email.read"];
  if (domain === "reminders") return [...base, "reminders.manage"];
  return base;
}

function classificationToRoute(
  c: V3Classification,
  latencyMs: number,
): RouteDecision {
  const isToolRoute = c.route_id === "R4" || c.route_id === "R6" || c.route_id === "R7";
  const classifierCompat: ClassifierResult = {
    mode: isToolRoute || c.route_id === "R2" || c.route_id === "R5" ? "smart" : "chat",
    primaryDomain: c.predicted_tool_domain ?? "general",
    confidence: c.confidence,
    requiredCapabilities: c.required_capabilities,
    memoryDepth: c.memory_depth,
    requiresToolUse: isToolRoute,
    isConfirmation: false,
    pendingActionId: null,
    style: c.style,
  };

  switch (c.route_id) {
    case "R1": // casual_chat
      return {
        mode: "single_agent",
        agent: "chat",
        allowedNamespaces: CHAT_NAMESPACES,
        needsMemoryRead: false,
        needsMemoryWriteCandidate: false,
        needsWebFreshness: false,
        userStyle: c.style,
        confidence: c.confidence,
        fastPathUsed: false,
        routerLatencyMs: latencyMs,
        memoryDepth: "none",
        modelTierOverride: "fast",
        classifierResult: classifierCompat,
        routeLayer: "v3-R1",
        routeReason: c.reason,
      };

    case "R2": // personal_recall
      return {
        mode: "single_agent",
        agent: "recall",
        allowedNamespaces: RECALL_NAMESPACES,
        needsMemoryRead: true,
        needsMemoryWriteCandidate: false,
        needsWebFreshness: false,
        userStyle: c.style,
        confidence: c.confidence,
        fastPathUsed: false,
        routerLatencyMs: latencyMs,
        memoryDepth: "full",
        primaryDomain: "recall",
        classifierResult: classifierCompat,
        routeLayer: "v3-R2",
        routeReason: c.reason,
        forcedToolChoice: "deep_recall_search",
      };

    case "R3": // general_knowledge
      return {
        mode: "single_agent",
        agent: "chat",
        allowedNamespaces: CHAT_NAMESPACES,
        needsMemoryRead: false,
        needsMemoryWriteCandidate: false,
        needsWebFreshness: false,
        userStyle: c.style,
        confidence: c.confidence,
        fastPathUsed: false,
        routerLatencyMs: latencyMs,
        memoryDepth: "none",
        modelTierOverride: "fast",
        classifierResult: classifierCompat,
        routeLayer: "v3-R3",
        routeReason: c.reason,
      };

    case "R4": // research
      return {
        mode: "single_agent",
        agent: "research",
        allowedNamespaces: RESEARCH_NAMESPACES,
        needsMemoryRead: false,
        needsMemoryWriteCandidate: false,
        needsWebFreshness: true,
        userStyle: c.style,
        confidence: c.confidence,
        fastPathUsed: false,
        routerLatencyMs: latencyMs,
        memoryDepth: "light",
        primaryDomain: "research",
        classifierResult: classifierCompat,
        routeLayer: "v3-R4",
        routeReason: c.reason,
      };

    case "R5": { // deep_profile
      const deepCapabilities: Capability[] = c.required_capabilities.includes("deep_profile")
        ? c.required_capabilities
        : [...c.required_capabilities, "deep_profile", "memory.read"];
      const deepClassifier: ClassifierResult = {
        ...classifierCompat,
        requiredCapabilities: deepCapabilities,
        memoryDepth: "full",
      };
      const namespaces = resolveTools(deepClassifier);
      const toolChoice = resolveToolChoice(deepClassifier);
      return {
        mode: "single_agent",
        agent: "smart",
        allowedNamespaces: namespaces,
        needsMemoryRead: true,
        needsMemoryWriteCandidate: false,
        needsWebFreshness: false,
        userStyle: c.style,
        confidence: c.confidence,
        fastPathUsed: false,
        routerLatencyMs: latencyMs,
        memoryDepth: "full",
        primaryDomain: "recall",
        forcedToolChoice: toolChoice ?? "required",
        reasoningEffortOverride: "medium",
        classifierResult: deepClassifier,
        routeLayer: "v3-R5",
        routeReason: c.reason,
      };
    }

    case "R6": // personal_data_read
      return {
        mode: "single_agent",
        agent: "operator",
        allowedNamespaces: namespacesForDomain(c.predicted_tool_domain, false),
        needsMemoryRead: false,
        needsMemoryWriteCandidate: false,
        needsWebFreshness: false,
        userStyle: c.style,
        confidence: c.confidence,
        fastPathUsed: false,
        routerLatencyMs: latencyMs,
        memoryDepth: "light",
        primaryDomain: c.predicted_tool_domain ?? "general",
        forcedToolChoice: c.predicted_tool_domain && c.predicted_tool_domain !== "general"
          ? "required"
          : undefined,
        classifierResult: classifierCompat,
        routeLayer: "v3-R6",
        routeReason: c.reason,
      };

    case "R7": // action_write
      return {
        mode: "single_agent",
        agent: "operator",
        allowedNamespaces: namespacesForDomain(c.predicted_tool_domain, true),
        needsMemoryRead: false,
        needsMemoryWriteCandidate: true,
        needsWebFreshness: false,
        userStyle: c.style,
        confidence: c.confidence,
        fastPathUsed: false,
        routerLatencyMs: latencyMs,
        memoryDepth: "light",
        primaryDomain: c.predicted_tool_domain ?? "general",
        forcedToolChoice: "required",
        classifierResult: classifierCompat,
        routeLayer: "v3-R7",
        routeReason: c.reason,
      };

    case "R10": // unclear
    default:
      return {
        mode: "single_agent",
        agent: "chat",
        allowedNamespaces: CHAT_NAMESPACES,
        needsMemoryRead: false,
        needsMemoryWriteCandidate: false,
        needsWebFreshness: false,
        userStyle: "brief",
        confidence: c.confidence,
        fastPathUsed: false,
        routerLatencyMs: latencyMs,
        memoryDepth: "light",
        modelTierOverride: "fast",
        classifierResult: classifierCompat,
        routeLayer: "v3-R10",
        routeReason: c.reason || "unclear",
      };
  }
}

// ─── Pre-ack prediction ────────────────────────────────────────

export function shouldFirePreAck(route: RouteDecision): boolean {
  if (route.primaryDomain === "reminders") return false;
  return route.routeLayer === "v3-R4" ||
    route.routeLayer === "v3-R6" ||
    route.routeLayer === "v3-R7";
}

const PRE_ACK_SYSTEM_PROMPT = `You are Nest, a personal assistant texting on iMessage. A tool call is about to run.

Write ONE short acknowledgement that fits the actual conversation. This is not a loading label. It is a small in-thread reply before you go and do the work.

Before writing, silently read:
1. What just happened in the recent conversation.
2. The user's vibe: direct, annoyed, joking, excited, stressed, low-effort, curious.
3. Whether this is a follow-up, correction, comparison, or fresh ask.

Then write the acknowledgement in that same register.

Style:
- Usually 4-14 words. Short, but not robotic.
- Sound like the same person who has been in the thread.
- React to the moment when there is a moment to react to.
- If they are annoyed or correcting you, acknowledge that: "Yeah, fair", "Got you", "Yep, better angle".
- If they are continuing a search, name the shift: "less touristy", "other events", "closer to Akasaka".
- If there is no vibe signal, keep it simple and specific.
- Use normal Australian English, but don't perform Australian-ness.

Hard bans:
- Do NOT use canned praise: "Nice one", "Good call", "Ooh good one".
- Do NOT use theatrical tool verbs: scanning, hunting, hunt down, diving, peeking, popping.
- Do NOT start with a tool verb like "Checking", "Looking", "Searching", "Finding", "Fetching", "Sussing", or "Pulling".
- Do NOT say "around you" unless the user explicitly said "near me" or "around me".
- Do NOT include emojis, quotes, prefixes, questions, timing promises, or the actual answer.
- Output ONLY the acknowledgement text.

Examples:
recent: nest gave touristy bars
user: "nah less touristy"
Yeah, fair, I'll try less touristy spots

recent: nest found a few events
user: "what else is on tonight"
Yep, I'll look at other Tokyo events tonight

recent: user complains the results were bad
user: "these are shit"
Yeah, fair, I'll take a better pass

recent: no context
user: "best bars in Akasaka"
Sure, I'll check Akasaka bars

recent: no context
user: "any live events in Tokyo tonight?"
Yep, I'll look at what's actually on tonight

recent: user has been joking
user: "find me somewhere not tragic"
Haha, yep, I'll filter out tragic

recent: serious calendar thread
user: "cancel my 3pm"
On it, I'll check the 3pm

recent: email drafting thread
user: "send Sarah the Friday follow-up"
On it, Sarah's Friday follow-up`;

const BAD_PRE_ACK_PATTERN =
  /\b(nice one|good call|ooh good|right then|right you are|scanning|hunting|hunt down|diving|peeking|popping|around you)\b/i;
const VERB_FIRST_PRE_ACK_PATTERN =
  /^\s*(checking|looking|searching|finding|fetching|sussing|pulling|grabbing|scanning|hunting|drafting|opening|getting|reading)\b/i;

export async function generatePreAck(
  userMessage: string,
  predictedDomain: DomainTag | null,
  recentTurns: Array<{ role: string; content: string }> = [],
): Promise<string | null> {
  const model = MODEL_MAP.fast;
  const start = Date.now();
  const domainHint = predictedDomain ? ` domain=${predictedDomain}` : "";

  // Last 10 turns of conversation, oldest first, lightly truncated.
  // Excludes the current user message (caller passes prior history only).
  const historyBlock = recentTurns.length > 0
    ? recentTurns
        .slice(-10)
        .map((t) => {
          const role = t.role === "assistant" ? "nest" : t.role === "user" ? "user" : t.role;
          const content = (t.content ?? "").replace(/\s+/g, " ").trim().slice(0, 220);
          return `${role}: ${content}`;
        })
        .filter((line) => line.length > 5)
        .join("\n")
    : "";

  const userBlock = historyBlock
    ? `Recent conversation (oldest → newest):\n${historyBlock}\n\nNew message from user: "${userMessage.substring(0, 300)}"${domainHint}\n→`
    : `user: "${userMessage.substring(0, 300)}"${domainHint}\n→`;

  const PRE_ACK_TEMPERATURE = 0.85;

  try {
    if (isGeminiModel(model)) {
      const cacheName = await getOrCreateGeminiCache({
        cacheKey: `pre-ack-${model}-v4`,
        model,
        systemPrompt: PRE_ACK_SYSTEM_PROMPT,
        ttlSeconds: 900,
      });
      const result = await geminiSimpleText({
        model,
        systemPrompt: PRE_ACK_SYSTEM_PROMPT,
        userMessage: userBlock,
        maxOutputTokens: 48,
        temperature: PRE_ACK_TEMPERATURE,
        cachedContent: cacheName ?? undefined,
      });
      const text = cleanPreAck(result.text ?? "");
      if (!text) {
        console.warn(`[pre-ack] dropped bad ack for "${userMessage.substring(0, 40)}" (${Date.now() - start}ms)`);
        return null;
      }
      console.log(`[pre-ack] "${userMessage.substring(0, 40)}" → "${text}" (${Date.now() - start}ms)`);
      return text || null;
    }
    const client = getOpenAIClient();
    const response = await client.responses.create(
      {
        model,
        instructions: PRE_ACK_SYSTEM_PROMPT,
        input: [{ role: "user", content: userBlock }],
        max_output_tokens: 32,
        store: false,
        prompt_cache_key: "nest-pre-ack-v4",
        temperature: PRE_ACK_TEMPERATURE,
      } as Parameters<typeof client.responses.create>[0],
    );
    const text = cleanPreAck(response.output_text ?? "");
    if (!text) {
      console.warn(`[pre-ack] dropped bad ack for "${userMessage.substring(0, 40)}" (${Date.now() - start}ms)`);
      return null;
    }
    console.log(`[pre-ack] "${userMessage.substring(0, 40)}" → "${text}" (${Date.now() - start}ms)`);
    return text || null;
  } catch (err) {
    console.warn(`[pre-ack] failed (${Date.now() - start}ms):`, (err as Error).message);
    return null;
  }
}

function cleanPreAck(raw: string): string | null {
  const text = capitalizeFirst(raw.trim().replace(/^["']|["']$/g, ""));
  if (!text) return null;
  if (VERB_FIRST_PRE_ACK_PATTERN.test(text)) return null;
  if (BAD_PRE_ACK_PATTERN.test(text)) return null;
  return text;
}

function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ═══════════════════════════════════════════════════════════════
// Main entry point
// ═══════════════════════════════════════════════════════════════

export async function routeTurnV3(
  input: TurnInput,
  context: RouterContext,
): Promise<RouteDecision> {
  const start = Date.now();

  if (input.assistantMode === "composio") {
    return await routeComposioTurn(input, context);
  }

  // Fast-path first
  const fastPath = tryFastPath(input, context, 0);
  if (fastPath) {
    console.log(
      `[route-v3] fast-path ${fastPath.routeLayer} "${input.userMessage.substring(0, 60)}" → ${fastPath.agent} (${fastPath.routeReason})`,
    );
    return fastPath;
  }

  const deterministicRoute = tryDeterministicRoute(input, context, Date.now() - start);
  if (deterministicRoute) {
    console.log(
      `[route-v3] deterministic ${deterministicRoute.routeLayer} "${input.userMessage.substring(0, 60)}" → ${deterministicRoute.agent} (${deterministicRoute.routeReason})`,
    );
    return deterministicRoute;
  }

  // LLM classification against MECE rubric
  const { result, latencyMs } = await classifyWithRubric(input, context);
  const totalMs = Date.now() - start;
  const decision = classificationToRoute(result, totalMs);

  console.log(
    `[route-v3] "${input.userMessage.substring(0, 60)}" → ${result.route_id} (${decision.agent}), conf=${result.confidence}, memory=${result.memory_depth}, domain=${result.predicted_tool_domain ?? "—"}, llm=${latencyMs}ms, total=${totalMs}ms — ${result.reason}`,
  );

  return decision;
}
