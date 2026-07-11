import { getOpenAIClient, MODEL_MAP, REASONING_EFFORT, isGeminiModel } from "../ai/models.ts";
import { geminiSimpleText, getOrCreateGeminiCache } from "../ai/gemini.ts";
import type {
  Capability,
  ClassifierResult,
  DomainTag,
  MemoryDepth,
  TurnInput,
  UserStyle,
} from "./types.ts";
import type { RouterContext } from "./build-context.ts";
import {
  isComposioEmailWatchIntent,
  parseComposioConnectIntent,
} from "./composio-connect-intent.ts";

const CLASSIFIER_INSTRUCTIONS =
  `You are a routing classifier for Nest, a personal assistant people text over iMessage.

Given the user's message, recent conversation context, and pending action state, output a JSON object that determines how the message should be handled.

## Output schema (strict JSON, no markdown):
{
  "mode": "chat" | "smart",
  "primaryDomain": "email" | "calendar" | "meeting_prep" | "research" | "recall" | "contacts" | "general",
  "secondaryDomains": [],
  "confidence": 0.0-1.0,
  "requiredCapabilities": [],
  "preferredCapabilities": [],
  "memoryDepth": "none" | "light" | "full",
  "requiresToolUse": true | false,
  "isConfirmation": true | false,
  "pendingActionId": null,
  "style": "brief" | "normal" | "deep"
}

## Mode rules
- "chat": casual conversation, banter, emotional support, greetings, jokes, life advice, creative writing, general knowledge questions that don't need tools. Uses gemini-3.1-flash-lite-preview (fast, no reasoning).
- "smart": anything requiring tools, account data, personal context retrieval, multi-step tasks, or domain expertise. This includes ALL location/travel/places queries (restaurants, directions, travel times, transit, "where is", "how long to get to", "best X near Y", etc.) because these need live data from travel.search tools. Use gpt-5.4 (reasoning model).

When in doubt between chat and smart, prefer smart. It's better to over-qualify than to under-serve.

## Domain rules
- "email": reading, searching, drafting, sending, or managing emails
- "calendar": viewing, creating, updating, or deleting calendar events; schedule queries. KEY: if the user asks about a flight, booking, reservation, or trip that might not be on the calendar, include email.read and knowledge.search as capabilities so the agent can fall back to searching email confirmations and the knowledge base.
- "meeting_prep": preparing for meetings, briefing, meeting notes recall. KEY: any question about "what did [person] and I discuss", "what was said in our call/meeting/1:1/standup", "brief me for", "prep me for" → meeting_prep. Always include granola.read capability for meeting_prep.
- "research": factual questions needing current/live data, current events, news, web lookups, comparisons. KEY: if the question is about current events, recent news, live data, or anything that changes over time → research with web.search capability. "Who is the president of X?" needs web.search for current accuracy.
- "recall": what Nest knows/remembers about the user, personal memory retrieval, "what did I tell you", user preferences, personal facts
- "contacts": looking up people in the user's contacts, finding email addresses or phone numbers. "Who is [name]?" when it's likely a personal contact → contacts with contacts.read
- "general": casual chat topics, life advice, creative writing, or tasks that don't fit neatly into one domain

## secondaryDomains
For compound requests, list additional domains needed beyond the primary. Examples:
- "Find Dan's email and book a meeting" -> primary: calendar, secondary: [contacts]
- "Summarise my emails and send to Tom" -> primary: email, secondary: [contacts]
- "What did Ryan say? Draft a reply" -> primary: meeting_prep, secondary: [email]
Usually empty. At most 1-2 entries.

## Capabilities
Fine-grained tool requirements. Only include what's actually needed:
- "email.read": searching or reading emails
- "email.write": drafting, sending, updating, or cancelling emails
- "calendar.read": viewing calendar events or schedule
- "calendar.write": creating, updating, or deleting calendar events
- "contacts.read": looking up contacts by name
- "granola.read": reading meeting notes from Granola
- "web.search": searching the web for current information
- "knowledge.search": searching the user's personal knowledge base
- "memory.read": reading stored memories about the user
- "memory.write": saving new information about the user
- "travel.search": finding places (restaurants, cafes, bars, businesses, attractions), getting travel times, directions, transit schedules, walking/cycling/driving times. Use for ANY question about locations, places to eat/drink, "how long to get to X", "best coffee near X", "phone number for X", "is X open", directions, commute times, etc.
- "weather.search": getting weather information — current conditions, daily forecasts, hourly forecasts, rain probability, temperature, wind, UV index. Use for ANY weather question: "what's the weather", "will it rain", "forecast for the week", "temperature in X", "should I bring an umbrella", "is it going to be hot tomorrow", "when will it stop raining". ALWAYS prefer weather.search over web.search for weather queries.
- "reminders.manage": creating, listing, editing, or deleting reminders. Use when the user says "remind me", "set a reminder", "nudge me", "what reminders do I have", "cancel that reminder", or anything about scheduling personal reminders/nudges.
- "notifications.watch": creating, listing, or deleting email/calendar notification watches. Use when the user asks to be notified about specific emails or calendar events, e.g. "let me know when Tom emails me", "notify me about overdue invoices", "alert me if a meeting gets cancelled", "tell me when I get a refund email", "watch for emails from Daniel after 6pm", "what notification watches do I have?", "remove the Tom email alert".
- "youtube.search": searching YouTube for videos. Use when the user explicitly asks for a YouTube video, tutorial, or "show me a video about X", "find me a video on Y", "any good YouTube videos about Z". Also use when the user has been asking multiple questions about the same topic and a high-quality video would genuinely help.
- "composio.read": linking or reconnecting **third-party apps via Composio** that are NOT Nest's native Google/Microsoft flows on the dashboard. Examples: "connect Strava", "link my Slack", "hook up GitHub", "integrate Notion", "add Spotify". The agent mints an OAuth link with composio_get_connection_link — do not send the user to nest.expert/dashboard for these. If unsure, still prefer smart + composio.read for "connect/link [app name]" when the app is not Google/Microsoft email or calendar.
- "composio.write": creating or managing **Composio triggers / ongoing automation** (whenever X happens notify me, watch for, etc.) in addition to composio.read. Include both composio.read and composio.write when the user wants monitoring or triggers across Composio-connected apps. For phrases like "let me know whenever I get an email from X" or "notify me when I get mail from…", always include composio.read + composio.write + notifications.watch (Gmail inbound watches use Composio triggers, not the dashboard).
- "deep_profile": ONLY for comprehensive self-knowledge requests like "what do you know about me?", "tell me about myself", "tell me something interesting about me", "give me a summary of everything you know about me", "surprise me with what you know". This triggers an exhaustive multi-source search. Do NOT use for simple recall like "what's my name?" or "where do I work?" — those are just memory.read.

## memoryDepth
- "none": factual/web queries, simple acknowledgements, banter with no need for personal context
- "light": context-aware replies where a memory summary helps but full RAG isn't needed. This includes re-entry or daypart greetings like "good morning" when a small amount of personal context would make the reply feel more human.
- "full": recall tasks, meeting prep, anything needing deep personal context or RAG

## requiresToolUse
Set to true ONLY when the task is execution-blocked without external retrieval:
- "What's on my calendar?" -> true (cannot answer without calendar_read)
- "Check my latest emails" -> true (cannot answer without email_read)
- "Who is Daniel Barth?" -> true if likely a personal contact
- "What did we discuss last week?" -> true (needs granola_read or semantic_search)
- "Best coffee near Melbourne CBD?" -> true (needs travel.search for live place data)
- "How long to drive to the airport?" -> true (needs travel.search for live travel time)
- "Any restaurants open near me?" -> true (needs travel.search for live place data)
- "Next train from Flinders St to Caulfield?" -> true (needs travel.search for live transit)
- "What's the weather like?" -> true (needs weather.search for live weather data)
- "Will it rain tomorrow?" -> true (needs weather.search for forecast)
- "Temperature in Sydney?" -> true (needs weather.search for current conditions)
- "Remind me to call Sarah tomorrow at 3pm" -> true (needs manage_reminder)
- "What reminders do I have?" -> true (needs manage_reminder)
- "Let me know when Tom emails me" / "let me know whenever I get an email from X" -> true (needs notifications.watch + composio.read + composio.write for Composio Gmail triggers)
- "Alert me if a meeting gets cancelled" -> true (needs notifications.watch)
- "What notification watches do I have?" -> true (needs notifications.watch)
- "Send me a YouTube video about X" -> true (needs youtube.search)
- "Find me a tutorial on Y" -> true (needs youtube.search)
- "Any good videos about Z?" -> true (needs youtube.search)
- "Connect my Strava" / "link Slack" -> true (needs composio.read to mint OAuth link; not the Nest dashboard)
- "How should I think about calendar hygiene?" -> false (can answer from knowledge)
- "Tell me about the history of Japan" -> false (general knowledge, web search is optional enrichment)

## isConfirmation
Set to true only if there is an active pending action in the context AND the message appears to be confirming or responding to that action. Do not guess — only set true when pending action state is explicitly provided.

## style
- "brief": short messages, reactions, acknowledgements
- "normal": standard conversational messages
- "deep": requests for detailed analysis, breakdowns, or comprehensive information`;

function buildClassifierInput(
  input: TurnInput,
  context: RouterContext,
): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];
  const contextParts: string[] = [];

  if (context.recentTurns.length > 0) {
    const turnSummary = context.recentTurns
      .slice(-4)
      .map((t) => `${t.role}: ${t.content.substring(0, 150)}`)
      .join("\n");
    contextParts.push(`Recent conversation:\n${turnSummary}`);
  }

  const wm = context.workingMemory;
  if (wm.activeTopics.length > 0) {
    contextParts.push(`Active topics: ${wm.activeTopics.join(", ")}`);
  }
  if (wm.pendingActions.length > 0) {
    contextParts.push(
      `Pending actions: ${
        wm.pendingActions.map((a) => `[${a.type}] ${a.description}`).join("; ")
      }`,
    );
  }

  if (context.pendingEmailSends.length > 0) {
    const draft = context.pendingEmailSends[0];
    contextParts.push(
      `Pending email draft: id=${draft.id}, to=${
        draft.to.join(", ")
      }, subject="${draft.subject ?? "none"}", status=awaiting_confirmation`,
    );
  }

  const TOOL_TAG_RE =
    /\[(email_read|email_draft|email_send|calendar_read|calendar_write|contacts_read|travel_time|places_search|semantic_search|granola_read|web_search|weather_lookup)\]/;
  const toolsInRecentTurns = context.recentTurns
    .filter((t) => t.role === "assistant")
    .slice(-3)
    .some((t) => TOOL_TAG_RE.test(t.content));

  if (toolsInRecentTurns) {
    contextParts.push(
      `IMPORTANT: The assistant used tools in recent turns. The user is likely continuing an active workflow. Strongly prefer "smart" mode unless the message is purely social/emotional with zero task intent.`,
    );
  }

  if (contextParts.length > 0) {
    messages.push({
      role: "user",
      content: `Context:\n${contextParts.join("\n\n")}`,
    });
    messages.push({
      role: "assistant",
      content: "Understood. I will use this context for classification.",
    });
  }

  messages.push({
    role: "user",
    content: `Classify this message: "${input.userMessage.substring(0, 400)}"`,
  });

  return messages;
}

const DEFAULT_RESULT: ClassifierResult = {
  mode: "chat",
  primaryDomain: "general",
  confidence: 0.3,
  requiredCapabilities: [],
  memoryDepth: "none",
  requiresToolUse: false,
  isConfirmation: false,
  style: "normal",
};

const DEEP_PROFILE_PATTERN =
  /\b(what do you know about me|tell me (about|everything about) (myself|me)|what have you (learned|figured out) about me|tell me something (interesting|surprising|cool) about me|surprise me with what you know|give me a (summary|rundown|profile) of (everything you know|what you know)|how well do you (know|understand) me|what('s| is) my profile|paint a picture of me|describe me based on what you know)\b/i;

const URGENT_TRAVEL_LOGISTICS_PATTERN =
  /\b(will i make it|can i make it|if i leave now|leave now|airport run|public transport|train|tram|bus|drive|driving|uber to|taxi to|skybus)\b/i;
const FLIGHT_TRAVEL_CONTEXT_PATTERN =
  /\b(flight|airport|terminal|boarding|departure)\b/i;

function applyDeepProfileHeuristic(
  message: string,
  result: ClassifierResult,
): void {
  if (result.requiredCapabilities.includes("deep_profile" as Capability)) {
    return;
  }
  if (!DEEP_PROFILE_PATTERN.test(message)) return;

  result.requiredCapabilities.push("deep_profile" as Capability);
  result.mode = "smart";
  result.primaryDomain = "recall";
  result.memoryDepth = "full";
  result.requiresToolUse = true;
  console.log(
    `[classify-turn] deep_profile heuristic triggered for: "${
      message.substring(0, 60)
    }"`,
  );
}

// Explicit: user directly asks for a YouTube video or tutorial
const YOUTUBE_EXPLICIT_PATTERN =
  /\b(youtube|send.*video|find.*video|show me.*video|video.*about|video.*on|video.*for|tutorial|watch.*video|any.*videos?)\b/i;

// Softer signal: user asks "how to" with a learning intent (can pair with sustained interest)
const YOUTUBE_HOW_TO_PATTERN =
  /\bhow (do i|to|can i)\b.{5,60}\b(work|learn|understand|get started|use|build|make|create|set up)\b/i;

function applyComposioIntegrationHeuristic(message: string, result: ClassifierResult): void {
  const intent = parseComposioConnectIntent(message);
  if (!intent) return;

  if (!result.requiredCapabilities.includes("composio.read" as Capability)) {
    result.requiredCapabilities.push("composio.read" as Capability);
  }
  if (
    intent.needsWrite &&
    !result.requiredCapabilities.includes("composio.write" as Capability)
  ) {
    result.requiredCapabilities.push("composio.write" as Capability);
  }
  result.mode = "smart";
  result.primaryDomain = "general";
  result.requiresToolUse = true;
  console.log(
    `[classify-turn] composio heuristic: third-party connect — target="${intent.target}"`,
  );
}

/** Gmail/email monitoring phrasing without "connect slack" — still needs Composio trigger tools. */
function applyComposioEmailWatchHeuristic(
  message: string,
  result: ClassifierResult,
): void {
  if (!isComposioEmailWatchIntent(message)) return;

  for (const cap of ["composio.read", "composio.write", "notifications.watch"] as const) {
    if (!result.requiredCapabilities.includes(cap)) {
      result.requiredCapabilities.push(cap);
    }
  }
  result.mode = "smart";
  result.primaryDomain = "email";
  result.requiresToolUse = true;
  console.log(
    `[classify-turn] composio email-watch heuristic — "${
      message.substring(0, 80)
    }"`,
  );
}

function applyYouTubeHeuristic(
  message: string,
  result: ClassifierResult,
  context: RouterContext,
): void {
  if (result.requiredCapabilities.includes('youtube.search' as Capability)) return;

  // Explicit YouTube/video request → force it
  if (YOUTUBE_EXPLICIT_PATTERN.test(message)) {
    result.requiredCapabilities.push('youtube.search' as Capability);
    result.mode = 'smart';
    result.requiresToolUse = true;
    console.log(`[classify-turn] youtube heuristic: explicit request — "${message.substring(0, 60)}"`);
    return;
  }

  // Sustained interest: active topics + 4+ conversation turns + how-to phrasing
  // → add as preferred so the agent has the tool available and can decide
  const hasSustainedInterest =
    context.workingMemory.activeTopics.length > 0 &&
    context.recentTurns.length >= 4;

  if (hasSustainedInterest && YOUTUBE_HOW_TO_PATTERN.test(message)) {
    if (!result.preferredCapabilities) result.preferredCapabilities = [];
    if (!result.preferredCapabilities.includes('youtube.search' as Capability)) {
      result.preferredCapabilities.push('youtube.search' as Capability);
      console.log(
        `[classify-turn] youtube heuristic: sustained interest (topics=[${context.workingMemory.activeTopics.join(',')}], turns=${context.recentTurns.length}) — adding preferred`,
      );
    }
  }
}

function applyUrgentTravelHeuristic(
  message: string,
  result: ClassifierResult,
): void {
  if (!FLIGHT_TRAVEL_CONTEXT_PATTERN.test(message)) return;
  if (!URGENT_TRAVEL_LOGISTICS_PATTERN.test(message)) return;

  result.mode = "smart";
  result.primaryDomain = "research";
  result.secondaryDomains = undefined;
  result.requiredCapabilities = ["travel.search"];
  result.memoryDepth = "none";
  result.requiresToolUse = true;
}

export async function classifyTurn(
  input: TurnInput,
  context: RouterContext,
): Promise<ClassifierResult> {
  const model = MODEL_MAP.orchestration;
  const start = Date.now();

  try {
    let text: string;

    if (isGeminiModel(model)) {
      // Gemini path: flatten multi-turn input into a single user message
      // Cache the static classifier instructions to avoid re-tokenizing on every call
      const cacheName = await getOrCreateGeminiCache({
        cacheKey: `classifier-${model}`,
        model,
        systemPrompt: CLASSIFIER_INSTRUCTIONS,
        ttlSeconds: 600, // 10 minutes — classifiers are called frequently
      });

      const inputMessages = buildClassifierInput(input, context);
      const flatInput = inputMessages.map((m) => `[${m.role}]: ${m.content}`).join("\n\n");
      const geminiResult = await geminiSimpleText({
        model,
        systemPrompt: CLASSIFIER_INSTRUCTIONS,
        userMessage: flatInput,
        maxOutputTokens: 1024,
        cachedContent: cacheName ?? undefined,
      });
      text = geminiResult.text;
    } else {
      // OpenAI path — prompt_cache_key groups classifier calls for prefix caching
      const client = getOpenAIClient();
      const response = await client.responses.create(
        {
          model,
          instructions: CLASSIFIER_INSTRUCTIONS,
          input: buildClassifierInput(input, context),
          max_output_tokens: 1024,
          store: false,
          prompt_cache_key: 'nest-classifier',
          reasoning: { effort: REASONING_EFFORT.orchestration },
        } as Parameters<typeof client.responses.create>[0],
      );
      text = response.output_text ?? "";
    }

    const ms = Date.now() - start;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(
        `[classify-turn] no JSON found in response (${ms}ms): "${
          text.substring(0, 200)
        }"`,
      );
      return DEFAULT_RESULT;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const result: ClassifierResult = {
      mode: parsed.mode === "smart" ? "smart" : "chat",
      primaryDomain: validateDomain(parsed.primaryDomain),
      secondaryDomains: Array.isArray(parsed.secondaryDomains)
        ? parsed.secondaryDomains.map(validateDomain).filter((d: DomainTag) =>
          d !== "general"
        )
        : undefined,
      confidence: typeof parsed.confidence === "number"
        ? Math.min(1, Math.max(0, parsed.confidence))
        : 0.7,
      requiredCapabilities: Array.isArray(parsed.requiredCapabilities)
        ? parsed.requiredCapabilities.filter(isValidCapability)
        : [],
      preferredCapabilities: Array.isArray(parsed.preferredCapabilities)
        ? parsed.preferredCapabilities.filter(isValidCapability)
        : undefined,
      memoryDepth: validateMemoryDepth(parsed.memoryDepth),
      requiresToolUse: parsed.requiresToolUse === true,
      isConfirmation: parsed.isConfirmation === true,
      pendingActionId: parsed.pendingActionId ?? null,
      style: validateStyle(parsed.style),
    };

    applyDeepProfileHeuristic(input.userMessage, result);
    applyUrgentTravelHeuristic(input.userMessage, result);
    applyComposioIntegrationHeuristic(input.userMessage, result);
    applyComposioEmailWatchHeuristic(input.userMessage, result);
    applyYouTubeHeuristic(input.userMessage, result, context);

    console.log(
      `[classify-turn] "${
        input.userMessage.substring(0, 60)
      }" → mode=${result.mode}, domain=${result.primaryDomain}${
        result.secondaryDomains?.length
          ? `+${result.secondaryDomains.join(",")}`
          : ""
      }, caps=[${
        result.requiredCapabilities.join(",")
      }], memory=${result.memoryDepth}, toolUse=${result.requiresToolUse}, conf=${result.confidence} (${ms}ms)`,
    );

    return result;
  } catch (err) {
    const ms = Date.now() - start;
    console.warn(`[classify-turn] failed (${ms}ms):`, (err as Error).message);
    // Even on LLM failure, apply deterministic heuristics so composio connect
    // intents always get their tools — never silently fall back to bare chat.
    const fallback = { ...DEFAULT_RESULT };
    applyComposioIntegrationHeuristic(input.userMessage, fallback);
    applyComposioEmailWatchHeuristic(input.userMessage, fallback);
    applyUrgentTravelHeuristic(input.userMessage, fallback);
    return fallback;
  }
}

const VALID_DOMAINS: Set<string> = new Set([
  "email",
  "calendar",
  "meeting_prep",
  "research",
  "recall",
  "contacts",
  "general",
]);
const VALID_CAPABILITIES: Set<string> = new Set([
  "composio.read",
  "composio.write",
  "email.read",
  "email.write",
  "calendar.read",
  "calendar.write",
  "contacts.read",
  "granola.read",
  "web.search",
  "knowledge.search",
  "memory.read",
  "memory.write",
  "travel.search",
  "weather.search",
  "reminders.manage",
  "notifications.watch",
  "youtube.search",
  "deep_profile",
]);

function validateDomain(d: unknown): DomainTag {
  return VALID_DOMAINS.has(d as string) ? (d as DomainTag) : "general";
}

function isValidCapability(c: unknown): c is Capability {
  return VALID_CAPABILITIES.has(c as string);
}

function validateMemoryDepth(d: unknown): MemoryDepth {
  if (d === "none" || d === "light" || d === "full") return d;
  return "none";
}

function validateStyle(s: unknown): UserStyle {
  if (s === "brief" || s === "normal" || s === "deep") return s;
  return "normal";
}
