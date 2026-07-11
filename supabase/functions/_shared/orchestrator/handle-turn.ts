import type { AgentLoopResult, TurnInput, TurnResult, TurnTrace } from "./types.ts";
import {
  buildContext,
  buildGroupContext,
  buildLightContext,
  buildMemoryLightContext,
  buildMinimalContext,
  buildRouterContext,
} from "./build-context.ts";
import { routeTurn } from "./route-turn.ts";
import { routeTurnV2 } from "./route-turn-v2.ts";
import { routeTurnLlm } from "./route-turn-llm.ts";
import { selectAgent } from "./select-agent.ts";
import { runAgentLoop } from "./run-agent-loop.ts";
import { persistTurn } from "./persist-turn.ts";
import {
  extractWorkingMemory,
  persistWorkingMemory,
} from "./working-memory.ts";
import {
  queueBackgroundJob,
  shouldQueueBackgroundWork,
} from "./background-jobs.ts";
import { OPTION_A_ROUTING } from "../env.ts";
import { applyCompareRouteOverride } from "./compare-route-override.ts";
import type { UserProfile } from "../state.ts";
import { logAgentTurnCost } from "../cost-tracker.ts";

type RouterContext = import("./build-context.ts").RouterContext;
type RouteDecision = import("./types.ts").RouteDecision;

function isConfirmedPendingEmailSend(route: RouteDecision, routerCtx?: RouterContext): boolean {
  const pending = routerCtx?.pendingEmailSend ?? null;
  return route.confirmationState === "confirmed" &&
    route.primaryDomain === "email" &&
    (route.routeLayer === "0A" || route.routeLayer === "v3-F1") &&
    route.allowedNamespaces.includes("email.write") &&
    pending?.status === "awaiting_confirmation";
}

function shouldResolveUserSituation(input: TurnInput, route: RouteDecision, contextPath: string): boolean {
  if (input.isGroupChat || contextPath !== "full") return false;

  const message = input.userMessage;
  const localSensitive =
    /\b(here|near me|nearby|around here|where am i|my location|current location|local)\b/i.test(message);
  const weatherOrTravel =
    /\b(weather|forecast|rain|temperature|umbrella|jacket|directions?|route|travel time|how long to get|how far|drive|walk|train|tram|bus|airport|flight|hotel)\b/i.test(message);
  const localTimeSensitive =
    /\b(today|tonight|tomorrow|this morning|this afternoon|this evening|right now|currently)\b/i.test(message) &&
    (route.primaryDomain === "calendar" || route.primaryDomain === "research");

  return route.primaryDomain === "research" &&
      (route.needsWebFreshness || route.allowedNamespaces.includes("weather.search") || route.allowedNamespaces.includes("travel.search")) &&
      (localSensitive || weatherOrTravel || localTimeSensitive) ||
    route.primaryDomain === "calendar" && (localSensitive || localTimeSensitive);
}

const CALENDAR_REMOVE_FOLLOWUP =
  /\b(?:na|nah|no|nope)?\b[\s,.]*(?:please\s+)?(?:remove|delete|cancel|take\s+(?:it|that)\s+off|take\s+off)\b[\s\S]{0,100}\b(?:calendar|cal|event|booking|reservation|dinner|it|that)\b/i;
const DIRECT_CALENDAR_LOOKUP =
  /\b(?:what'?s|what is|what have i got|what do i have|what am i doing|what are my plans|show me|check|help me understand)\b[\s\S]{0,80}\b(?:my|me|i|for me|calendar|schedule|plans?|meetings?|events?)\b[\s\S]{0,80}\b(?:today|tomorrow|tonight|this week|next week|weekend|(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b|\b(?:today|tomorrow|tonight|this week|next week|weekend|(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b[\s\S]{0,80}\b(?:my|me|for me|calendar|schedule|meetings?|events?|plans?)\b/i;

interface ReferencedTime {
  hour: number;
  minute: number;
  label: string;
}

interface DirectCalendarEvent {
  event_id: string;
  title: string;
  start_iso: string;
  account?: string;
  provider?: "google" | "microsoft";
  calendar_id?: string | null;
  status?: string;
}

function resolveDirectCalendarRange(message: string): string {
  const weekday = message.match(/\b(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (weekday) return `${weekday[1] ?? ""}${weekday[2]}`.trim().toLowerCase();
  if (/\bnext week\b/i.test(message)) return "next week";
  if (/\bthis week\b/i.test(message)) return "this week";
  if (/\bweekend\b/i.test(message)) return "this weekend";
  if (/\btomorrow\b/i.test(message)) return "tomorrow";
  if (/\btonight\b/i.test(message)) return "today";
  return "today";
}

function formatDirectCalendarEvent(event: DirectCalendarEvent): string {
  if ((event as { all_day?: boolean }).all_day) {
    return `All day ${event.title}`;
  }

  const start = String((event as { start?: string }).start ?? "").replace(/,\s*\d{4}/, "");
  const end = String((event as { end?: string }).end ?? "");
  const startTime = start.match(/\b\d{1,2}:\d{2}\s*(?:am|pm)\b/i)?.[0] ??
    start.match(/\b\d{1,2}\s*(?:am|pm)\b/i)?.[0] ??
    start;
  const endTime = end.match(/\b\d{1,2}:\d{2}\s*(?:am|pm)\b/i)?.[0] ??
    end.match(/\b\d{1,2}\s*(?:am|pm)\b/i)?.[0] ??
    "";

  return endTime ? `${startTime} to ${endTime} ${event.title}` : `${startTime} ${event.title}`;
}

function formatDirectCalendarLookup(events: DirectCalendarEvent[], range: string): string {
  if (events.length === 0) {
    return `Nothing on ${range}. Suspiciously peaceful.`;
  }

  const grouped = new Map<string, DirectCalendarEvent[]>();
  for (const event of events) {
    const day = String((event as { day?: string | null }).day ?? range);
    const bucket = grouped.get(day) ?? [];
    bucket.push(event);
    grouped.set(day, bucket);
  }

  const bubbles: string[] = [];
  for (const [day, dayEvents] of grouped) {
    const lines = [`**${day}**`];
    for (const event of dayEvents) {
      lines.push(formatDirectCalendarEvent(event));
    }
    bubbles.push(lines.join("\n"));
  }

  return bubbles.join("\n---\n");
}

function extractLastReferencedTime(text: string): ReferencedTime | null {
  const matches = [...text.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/gi)];
  if (matches.length === 0) return null;

  const match = matches[matches.length - 1];
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3]?.toLowerCase();

  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 1 || hour > 23 || minute > 59) {
    return null;
  }

  const preferPm = /\b(dinner|tonight|evening|night)\b/i.test(text);
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (!meridiem && preferPm && hour >= 1 && hour <= 11) hour += 12;

  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const displayMinute = String(minute).padStart(2, "0");
  const displayMeridiem = hour >= 12 ? "pm" : "am";
  return { hour, minute, label: `${displayHour}:${displayMinute} ${displayMeridiem}` };
}

function extractCalendarDeleteReference(input: TurnInput, routerCtx?: RouterContext): ReferencedTime | null {
  const userTime = extractLastReferencedTime(input.userMessage);
  if (userTime) return userTime;

  const lastAssistant = [...(routerCtx?.recentTurns ?? [])]
    .reverse()
    .find((turn) => turn.role === "assistant")?.content ?? "";
  return extractLastReferencedTime(lastAssistant);
}

function eventLocalHourMinute(event: DirectCalendarEvent, timezone: string | null): { hour: number; minute: number } | null {
  if (!event.start_iso) return null;
  const date = new Date(event.start_iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone || "Australia/Melbourne",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  return Number.isFinite(hour) && Number.isFinite(minute) ? { hour, minute } : null;
}

function directCalendarTrace(
  args: {
    input: TurnInput;
    route: RouteDecision;
    routerCtx?: RouterContext;
    timings: { turnId: string; turnStart: number; routerContextMs: number };
    text: string;
    readLatencyMs: number;
    writeLatencyMs?: number;
    event?: DirectCalendarEvent;
    error?: string;
  },
): { loopResult: AgentLoopResult; trace: TurnTrace } {
  const toolCalls: TurnTrace["toolCalls"] = [{
    name: "calendar_read" as const,
    namespace: "calendar.read" as const,
    sideEffect: "read" as const,
    latencyMs: args.readLatencyMs,
    outcome: "success" as const,
    inputSummary: "today",
  }];

  if (typeof args.writeLatencyMs === "number") {
    toolCalls.push({
      name: "calendar_write" as const,
      namespace: "calendar.write" as const,
      sideEffect: "commit" as const,
      latencyMs: args.writeLatencyMs,
      outcome: args.error ? "error" as const : "success" as const,
      inputSummary: args.event?.event_id?.substring(0, 64) ?? "delete",
      approvalGranted: true,
      approvalMethod: "implicit" as const,
    });
  }

  const loopResult: AgentLoopResult = {
    text: args.text,
    reaction: null,
    effect: null,
    rememberedUser: null,
    generatedImage: null,
    toolCallTraces: toolCalls,
    toolCallsBlocked: [],
    rounds: 0,
    toolsUsed: args.error
      ? [{ tool: "calendar_read", detail: "direct delete lookup" }]
      : [
        { tool: "calendar_read", detail: "direct delete lookup" },
        ...(typeof args.writeLatencyMs === "number"
          ? [{ tool: "calendar_write", detail: `deleted ${args.event?.title ?? "event"}` }]
          : []),
      ],
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    systemPromptLength: 0,
    systemPrompt: "",
    initialMessages: [],
    availableToolNames: ["calendar_read", "calendar_write"],
    effectiveModel: "none",
    roundTraces: [],
    promptComposeMs: 0,
    toolFilterMs: 0,
  };

  const trace: TurnTrace = {
    turnId: args.timings.turnId,
    chatId: args.input.chatId,
    senderHandle: args.input.senderHandle,
    timestamp: new Date().toISOString(),
    userMessage: args.input.userMessage.substring(0, 2000),
    timezoneResolved: args.input.timezone ?? null,
    routeDecision: { ...args.route, routeReason: "calendar_delete_followup_direct" },
    classifierResult: args.route.classifierResult,
    routeLayer: args.route.routeLayer,
    routeReason: "calendar_delete_followup_direct",
    matchedDisqualifierBucket: args.route.matchedDisqualifierBucket,
    hadPendingState: args.route.hadPendingState,
    classifierLatencyMs: args.route.routeLayer === "0C" ? args.route.routerLatencyMs : undefined,
    systemPromptLength: 0,
    systemPromptHash: "direct-calendar-delete",
    memoryItemsLoaded: 0,
    ragEvidenceBlocks: 0,
    summariesLoaded: 0,
    connectedAccountsCount: args.routerCtx?.preloadedAccounts?.length ?? 0,
    historyMessagesCount: args.routerCtx?.preloadedHistory?.length ?? args.routerCtx?.recentTurns.length ?? 0,
    contextBuildLatencyMs: 0,
    contextSubTimings: null,
    resolvedUserContext: null,
    agentName: "smart",
    modelUsed: "none",
    agentLoopRounds: 0,
    agentLoopLatencyMs: 0,
    roundTraces: [],
    promptComposeMs: 0,
    toolFilterMs: 0,
    toolCalls,
    toolCallsBlocked: [],
    toolCallCount: toolCalls.length,
    toolTotalLatencyMs: toolCalls.reduce((sum, call) => sum + call.latencyMs, 0),
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    responseText: args.text.substring(0, 5000),
    responseLength: args.text.length,
    totalLatencyMs: Date.now() - args.timings.turnStart,
    routerContextMs: args.timings.routerContextMs,
    contextPath: "light",
    pendingActionDebug: {
      pendingEmailSendCount: args.routerCtx?.pendingEmailSends.length ?? 0,
      pendingEmailSendId: args.routerCtx?.pendingEmailSend?.id ?? null,
      pendingEmailSendStatus: args.routerCtx?.pendingEmailSend?.status ?? null,
      draftIdPresent: !!args.routerCtx?.pendingEmailSend?.draftId,
      accountPresent: !!args.routerCtx?.pendingEmailSend?.account,
      confirmationResult: args.route.confirmationState ?? "not_checked",
      directCalendarDeleteBypass: true,
      directCalendarDeleteEventId: args.event?.event_id ?? null,
      voiceModeDetected: args.input.voiceMode === true,
    },
    systemPrompt: null,
    initialMessages: [],
    availableToolNames: ["calendar_read", "calendar_write"],
    ...(args.error ? { errorStage: "direct_calendar_delete", errorMessage: args.error } : {}),
  };

  return { loopResult, trace };
}

async function tryDirectCalendarDeleteFollowup(
  input: TurnInput,
  route: RouteDecision,
  routerCtx: RouterContext | undefined,
  timings: {
    turnId: string;
    turnStart: number;
    routeMs: number;
    routerContextMs: number;
  },
): Promise<TurnResult | null> {
  if (!input.authUserId || input.isGroupChat) return null;
  if (!CALENDAR_REMOVE_FOLLOWUP.test(input.userMessage)) return null;

  const referencedTime = extractCalendarDeleteReference(input, routerCtx);
  if (!referencedTime) return null;

  const { calendarReadTool } = await import("../tools/calendar-read.ts");
  const { calendarWriteTool } = await import("../tools/calendar-write.ts");
  const toolContext = {
    chatId: input.chatId,
    senderHandle: input.senderHandle,
    authUserId: input.authUserId,
    timezone: input.timezone ?? null,
    pendingEmailSend: routerCtx?.pendingEmailSend ?? null,
    pendingEmailSends: routerCtx?.pendingEmailSends ?? [],
  };

  const readStart = Date.now();
  const readOutput = await calendarReadTool.handler(
    { action: "lookup", range: "today", max_results: 50 },
    toolContext,
  );
  const readLatencyMs = Date.now() - readStart;

  let events: DirectCalendarEvent[] = [];
  try {
    const parsed = JSON.parse(readOutput.content) as { events?: DirectCalendarEvent[] };
    events = Array.isArray(parsed.events) ? parsed.events : [];
  } catch {
    const text = `I couldn't read the calendar cleanly enough to remove the ${referencedTime.label} event.`;
    const { loopResult, trace } = directCalendarTrace({
      input,
      route,
      routerCtx,
      timings,
      text,
      readLatencyMs,
      error: "calendar_read_result_parse_failed",
    });
    persistTurn(input, loopResult, trace).catch((err) =>
      console.warn("[handle-turn] persistTurn failed:", (err as Error).message)
    );
    return { text, reaction: null, effect: null, rememberedUser: null, generatedImage: null, trace };
  }

  const matches = events.filter((event) => {
    if (event.status === "ALREADY_HAPPENED") return false;
    const local = eventLocalHourMinute(event, input.timezone ?? null);
    return local?.hour === referencedTime.hour && local.minute === referencedTime.minute;
  });

  if (matches.length !== 1) {
    const text = matches.length === 0
      ? `I couldn't find a ${referencedTime.label} calendar event to remove.`
      : `I found ${matches.length} ${referencedTime.label} calendar events, so I need the exact one before deleting anything.`;
    const { loopResult, trace } = directCalendarTrace({
      input,
      route,
      routerCtx,
      timings,
      text,
      readLatencyMs,
      error: matches.length === 0 ? "no_matching_event" : "ambiguous_matching_events",
    });
    persistTurn(input, loopResult, trace).catch((err) =>
      console.warn("[handle-turn] persistTurn failed:", (err as Error).message)
    );
    return { text, reaction: null, effect: null, rememberedUser: null, generatedImage: null, trace };
  }

  const event = matches[0];
  const writeInput: Record<string, unknown> = {
    action: "delete",
    event_id: event.event_id,
    account: event.account,
    notify_attendees: false,
  };
  if (event.provider === "google" && event.calendar_id) {
    writeInput.calendar_id = event.calendar_id;
  }

  const writeStart = Date.now();
  const writeOutput = await calendarWriteTool.handler(writeInput, toolContext);
  const writeLatencyMs = Date.now() - writeStart;
  const deleted = writeOutput.structuredData?.status === "deleted" &&
    writeOutput.structuredData?.verified === true;
  const text = deleted
    ? `Done ✓ - removed ${event.title}`
    : `I found ${event.title}, but couldn't remove it: ${writeOutput.structuredData?.error ?? writeOutput.content}`;
  const { loopResult, trace } = directCalendarTrace({
    input,
    route,
    routerCtx,
    timings,
    text,
    readLatencyMs,
    writeLatencyMs,
    event,
    ...(deleted ? {} : { error: String(writeOutput.structuredData?.error ?? writeOutput.content) }),
  });

  console.log(
    `[handle-turn] ${timings.turnId}: direct calendar_delete bypass, route=${timings.routeMs}ms, read=${readLatencyMs}ms, write=${writeLatencyMs}ms, deleted=${deleted}, total=${trace.totalLatencyMs}ms`,
  );

  persistTurn(input, loopResult, trace).catch((err) =>
    console.warn("[handle-turn] persistTurn failed:", (err as Error).message)
  );
  return { text, reaction: null, effect: null, rememberedUser: null, generatedImage: null, trace };
}

async function tryDirectCalendarLookup(
  input: TurnInput,
  route: RouteDecision,
  routerCtx: RouterContext | undefined,
  timings: {
    turnId: string;
    turnStart: number;
    routeMs: number;
    routerContextMs: number;
  },
): Promise<TurnResult | null> {
  if (!input.authUserId || input.isGroupChat) return null;
  if (!DIRECT_CALENDAR_LOOKUP.test(input.userMessage)) return null;
  if (!route.allowedNamespaces.includes("calendar.read")) return null;

  const range = resolveDirectCalendarRange(input.userMessage);
  const { calendarReadTool } = await import("../tools/calendar-read.ts");
  const readStart = Date.now();
  const output = await calendarReadTool.handler(
    { action: "lookup", range, max_results: 25 },
    {
      chatId: input.chatId,
      senderHandle: input.senderHandle,
      authUserId: input.authUserId,
      timezone: input.timezone ?? null,
      pendingEmailSend: routerCtx?.pendingEmailSend ?? null,
      pendingEmailSends: routerCtx?.pendingEmailSends ?? [],
    },
  );
  const readLatencyMs = Date.now() - readStart;

  let events: DirectCalendarEvent[] = [];
  let parseError: string | null = null;
  try {
    const parsed = JSON.parse(output.content) as { events?: DirectCalendarEvent[] };
    events = Array.isArray(parsed.events) ? parsed.events : [];
  } catch (err) {
    parseError = (err as Error).message;
  }

  const text = parseError
    ? `Calendar lookup worked, but I couldn't format the result cleanly: ${parseError}`
    : formatDirectCalendarLookup(events, range);

  const loopResult: AgentLoopResult = {
    text,
    reaction: null,
    effect: null,
    rememberedUser: null,
    generatedImage: null,
    toolCallTraces: [{
      name: "calendar_read",
      namespace: "calendar.read",
      sideEffect: "read",
      latencyMs: readLatencyMs,
      outcome: parseError ? "error" : "success",
      inputSummary: `action: lookup, range: ${range}, max_results: 25`,
    }],
    toolCallsBlocked: [],
    rounds: 0,
    toolsUsed: [{ tool: "calendar_read", detail: `lookup ${range}` }],
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    systemPromptLength: 0,
    systemPrompt: "",
    initialMessages: [],
    availableToolNames: ["calendar_read"],
    effectiveModel: "none",
    roundTraces: [],
    promptComposeMs: 0,
    toolFilterMs: 0,
  };

  const trace: TurnTrace = {
    turnId: timings.turnId,
    chatId: input.chatId,
    senderHandle: input.senderHandle,
    timestamp: new Date().toISOString(),
    userMessage: input.userMessage.substring(0, 2000),
    timezoneResolved: input.timezone ?? null,
    routeDecision: { ...route, routeReason: "calendar_lookup_direct" },
    classifierResult: route.classifierResult,
    routeLayer: route.routeLayer,
    routeReason: "calendar_lookup_direct",
    matchedDisqualifierBucket: route.matchedDisqualifierBucket,
    hadPendingState: route.hadPendingState,
    classifierLatencyMs: route.routeLayer === "0C" ? route.routerLatencyMs : undefined,
    systemPromptLength: 0,
    systemPromptHash: "direct-calendar-lookup",
    memoryItemsLoaded: 0,
    ragEvidenceBlocks: 0,
    summariesLoaded: 0,
    connectedAccountsCount: routerCtx?.preloadedAccounts?.length ?? 0,
    historyMessagesCount: routerCtx?.preloadedHistory?.length ?? routerCtx?.recentTurns.length ?? 0,
    contextBuildLatencyMs: 0,
    contextSubTimings: null,
    resolvedUserContext: null,
    agentName: "smart",
    modelUsed: "none",
    agentLoopRounds: 0,
    agentLoopLatencyMs: 0,
    roundTraces: [],
    promptComposeMs: 0,
    toolFilterMs: 0,
    toolCalls: loopResult.toolCallTraces,
    toolCallsBlocked: [],
    toolCallCount: 1,
    toolTotalLatencyMs: readLatencyMs,
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    responseText: text.substring(0, 5000),
    responseLength: text.length,
    totalLatencyMs: Date.now() - timings.turnStart,
    routerContextMs: timings.routerContextMs,
    contextPath: "minimal",
    pendingActionDebug: {
      pendingEmailSendCount: routerCtx?.pendingEmailSends.length ?? 0,
      pendingEmailSendId: routerCtx?.pendingEmailSend?.id ?? null,
      pendingEmailSendStatus: routerCtx?.pendingEmailSend?.status ?? null,
      draftIdPresent: !!routerCtx?.pendingEmailSend?.draftId,
      accountPresent: !!routerCtx?.pendingEmailSend?.account,
      confirmationResult: route.confirmationState ?? "not_checked",
      directCalendarLookupBypass: true,
      directCalendarLookupRange: range,
      directCalendarLookupEvents: events.length,
      directCalendarLookupToolLatencyMs: readLatencyMs,
      voiceModeDetected: input.voiceMode === true,
    },
    systemPrompt: null,
    initialMessages: [],
    availableToolNames: ["calendar_read"],
    ...(parseError ? { errorStage: "direct_calendar_lookup", errorMessage: parseError } : {}),
  };

  console.log(
    `[handle-turn] ${timings.turnId}: direct calendar_lookup bypass, route=${timings.routeMs}ms, read=${readLatencyMs}ms, events=${events.length}, total=${trace.totalLatencyMs}ms`,
  );

  persistTurn(input, loopResult, trace).catch((err) =>
    console.warn("[handle-turn] persistTurn failed:", (err as Error).message)
  );
  return { text, reaction: null, effect: null, rememberedUser: null, generatedImage: null, trace };
}

function formatDirectEmailSendResponse(
  structuredData: Record<string, unknown> | undefined,
  fallback: string,
): string {
  if (structuredData?.sent === true && structuredData?.verified === true) {
    return "Done ✓";
  }

  if (structuredData?.verified === false && structuredData?.sent === false) {
    const status = typeof structuredData.status === "string" ? structuredData.status : null;
    if (status === "unverified") {
      return "I tried to send the email but I haven't been able to confirm it landed in your sent folder yet — please check Gmail/Outlook directly and let me know if it didn't go through.";
    }

    const error = typeof structuredData.error === "string"
      ? structuredData.error
      : typeof structuredData.reason === "string"
      ? structuredData.reason
      : null;
    return error
      ? `I couldn't send the email: ${error}. Want me to try again?`
      : "I couldn't send the email. Want me to try again?";
  }

  return fallback;
}

async function tryDirectPendingEmailSend(
  input: TurnInput,
  route: RouteDecision,
  routerCtx: RouterContext | undefined,
  timings: {
    turnId: string;
    turnStart: number;
    routeMs: number;
    routerContextMs: number;
  },
): Promise<TurnResult | null> {
  if (!isConfirmedPendingEmailSend(route, routerCtx)) return null;

  const pending = routerCtx!.pendingEmailSend!;
  const { emailSendTool } = await import("../tools/email-write.ts");

  const toolStart = Date.now();
  const output = await emailSendTool.handler(
    { draft_id: String(pending.id) },
    {
      chatId: input.chatId,
      senderHandle: input.senderHandle,
      authUserId: input.authUserId,
      timezone: input.timezone ?? null,
      pendingEmailSend: pending,
      pendingEmailSends: routerCtx!.pendingEmailSends,
    },
  );
  const toolLatencyMs = Date.now() - toolStart;
  const structuredData = output.structuredData;
  const verified = structuredData?.verified === true;
  const text = formatDirectEmailSendResponse(structuredData, output.content);
  const toolOutcome = verified ? "success" : "error";

  const loopResult: AgentLoopResult = {
    text,
    reaction: null,
    effect: null,
    rememberedUser: null,
    generatedImage: null,
    toolCallTraces: [{
      name: "email_send",
      namespace: "email.write",
      sideEffect: "commit",
      latencyMs: toolLatencyMs,
      outcome: toolOutcome,
      inputSummary: String(pending.id),
      approvalGranted: true,
      approvalMethod: "explicit",
      pendingActionId: pending.id,
    }],
    toolCallsBlocked: [],
    rounds: 0,
    toolsUsed: verified
      ? [{
        tool: "email_send",
        detail: structuredData?.messageId
          ? `verified sent (${String(structuredData.messageId).substring(0, 64)})`
          : "verified sent",
      }]
      : [],
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    systemPromptLength: 0,
    systemPrompt: "",
    initialMessages: [],
    availableToolNames: ["email_send"],
    effectiveModel: "none",
    roundTraces: [],
    promptComposeMs: 0,
    toolFilterMs: 0,
  };

  const trace: TurnTrace = {
    turnId: timings.turnId,
    chatId: input.chatId,
    senderHandle: input.senderHandle,
    timestamp: new Date().toISOString(),
    userMessage: input.userMessage.substring(0, 2000),
    timezoneResolved: input.timezone ?? null,
    routeDecision: {
      ...route,
      routeReason: route.routeReason ?? "pending_email_send_direct",
    },
    classifierResult: route.classifierResult,
    routeLayer: route.routeLayer,
    routeReason: route.routeReason ?? "pending_email_send_direct",
    matchedDisqualifierBucket: route.matchedDisqualifierBucket,
    hadPendingState: true,
    classifierLatencyMs: route.routeLayer === "0C" ? route.routerLatencyMs : undefined,
    systemPromptLength: 0,
    systemPromptHash: "direct-email-send",
    memoryItemsLoaded: 0,
    ragEvidenceBlocks: 0,
    summariesLoaded: 0,
    connectedAccountsCount: routerCtx?.preloadedAccounts?.length ?? 0,
    historyMessagesCount: routerCtx?.preloadedHistory?.length ?? routerCtx?.recentTurns.length ?? 0,
    contextBuildLatencyMs: 0,
    contextSubTimings: null,
    resolvedUserContext: null,
    agentName: "smart",
    modelUsed: "none",
    agentLoopRounds: 0,
    agentLoopLatencyMs: 0,
    roundTraces: [],
    promptComposeMs: 0,
    toolFilterMs: 0,
    toolCalls: loopResult.toolCallTraces,
    toolCallsBlocked: [],
    toolCallCount: 1,
    toolTotalLatencyMs: toolLatencyMs,
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    responseText: text.substring(0, 5000),
    responseLength: text.length,
    totalLatencyMs: Date.now() - timings.turnStart,
    routerContextMs: timings.routerContextMs,
    contextPath: "light",
    pendingActionDebug: {
      pendingEmailSendCount: routerCtx?.pendingEmailSends.length ?? 0,
      pendingEmailSendId: pending.id,
      pendingEmailSendStatus: pending.status,
      draftIdPresent: !!pending.draftId,
      accountPresent: !!pending.account,
      confirmationResult: "confirmed",
      directEmailSendBypass: true,
      directEmailSendVerified: verified,
      directEmailSendToolLatencyMs: toolLatencyMs,
      voiceModeDetected: input.voiceMode === true,
    },
    systemPrompt: null,
    initialMessages: [],
    availableToolNames: ["email_send"],
  };

  if (!verified) {
    trace.errorStage = "direct_email_send";
    trace.errorMessage = typeof structuredData?.error === "string"
      ? structuredData.error
      : typeof structuredData?.reason === "string"
      ? structuredData.reason
      : "email send was not verified";
  }

  console.log(
    `[handle-turn] ${timings.turnId}: direct email_send bypass, route=${timings.routeMs}ms, routerCtx=${timings.routerContextMs}ms, tool=${toolLatencyMs}ms, verified=${verified}, total=${trace.totalLatencyMs}ms`,
  );

  persistTurn(input, loopResult, trace)
    .catch((err) =>
      console.warn("[handle-turn] persistTurn failed:", (err as Error).message)
    );

  return {
    text,
    reaction: null,
    effect: null,
    rememberedUser: null,
    generatedImage: null,
    trace,
  };
}

// ═══════════════════════════════════════════════════════════════
// Slash command handling (deterministic, no LLM needed)
// ═══════════════════════════════════════════════════════════════

async function handleSlashCommand(
  input: TurnInput,
): Promise<TurnResult | null> {
  const cmd = input.userMessage.toLowerCase().trim();
  const emptyTrace: TurnTrace = {
    turnId: crypto.randomUUID(),
    chatId: input.chatId,
    senderHandle: input.senderHandle,
    timestamp: new Date().toISOString(),
    userMessage: input.userMessage.substring(0, 2000),
    timezoneResolved: input.timezone ?? null,
    routeDecision: {
      mode: "direct",
      agent: "casual",
      allowedNamespaces: [],
      needsMemoryRead: false,
      needsMemoryWriteCandidate: false,
      needsWebFreshness: false,
      userStyle: "normal",
      confidence: 1.0,
      fastPathUsed: true,
      routerLatencyMs: 0,
    },
    systemPromptLength: 0,
    systemPromptHash: "",
    memoryItemsLoaded: 0,
    ragEvidenceBlocks: 0,
    summariesLoaded: 0,
    connectedAccountsCount: 0,
    historyMessagesCount: 0,
    contextBuildLatencyMs: 0,
    contextSubTimings: null,
    resolvedUserContext: null,
    agentName: "casual",
    modelUsed: "none",
    agentLoopRounds: 0,
    agentLoopLatencyMs: 0,
    roundTraces: [],
    promptComposeMs: 0,
    toolFilterMs: 0,
    toolCalls: [],
    toolCallsBlocked: [],
    toolCallCount: 0,
    toolTotalLatencyMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    responseText: null,
    responseLength: 0,
    totalLatencyMs: 0,
    routerContextMs: 0,
    contextPath: "light",
    pendingActionDebug: {
      pendingEmailSendCount: 0,
      pendingEmailSendId: null,
      pendingEmailSendStatus: null,
      draftIdPresent: false,
      accountPresent: false,
      confirmationResult: "not_checked",
    },
    systemPrompt: null,
    initialMessages: null,
    availableToolNames: [],
  };

  const empty = {
    reaction: null,
    effect: null,
    rememberedUser: null,
    generatedImage: null,
  };

  if (cmd === "/help") {
    const text =
      "commands:\n/clear - reset our conversation\n/forget me - erase what i know about you\n/memory - see what i remember about you\n/memory delete <id> - remove a specific memory\n/memory clear - wipe all your memories\n/help - this message";
    return {
      text,
      ...empty,
      trace: { ...emptyTrace, responseLength: text.length },
    };
  }

  if (cmd === "/clear") {
    const { clearConversation } = await import("../state.ts");
    await clearConversation(input.chatId);
    const text = "conversation cleared, fresh start 🧹";
    return {
      text,
      ...empty,
      trace: { ...emptyTrace, responseLength: text.length },
    };
  }

  if (cmd === "/forget me" || cmd === "/forgetme") {
    if (input.senderHandle) {
      const { clearUserProfile, rejectAllMemoryItems } = await import(
        "../state.ts"
      );
      await clearUserProfile(input.senderHandle);
      await rejectAllMemoryItems(input.senderHandle);
      const text =
        "done, i've forgotten everything about you. we're strangers now 👋";
      return {
        text,
        ...empty,
        trace: { ...emptyTrace, responseLength: text.length },
      };
    }
    const text = "hmm couldn't figure out who you are to forget you";
    return {
      text,
      ...empty,
      trace: { ...emptyTrace, responseLength: text.length },
    };
  }

  if (cmd === "/memory") {
    if (!input.senderHandle) {
      const text = "couldn't identify you to look up memories";
      return {
        text,
        ...empty,
        trace: { ...emptyTrace, responseLength: text.length },
      };
    }
    const { getActiveMemoryItems } = await import("../state.ts");
    const memories = await getActiveMemoryItems(input.senderHandle, 50);
    if (memories.length === 0) {
      const text = "i don't have any memories saved for you yet";
      return {
        text,
        ...empty,
        trace: { ...emptyTrace, responseLength: text.length },
      };
    }

    const grouped = new Map<string, typeof memories>();
    for (const m of memories) {
      const group = grouped.get(m.category) ?? [];
      group.push(m);
      grouped.set(m.category, group);
    }

    const sections: string[] = [];
    for (const [category, items] of grouped) {
      const lines = items.map((m) => {
        const conf = m.confidence < 0.6 ? " ⚠️" : "";
        return `  #${m.id} — ${m.valueText}${conf}`;
      });
      sections.push(`**${category}**\n${lines.join("\n")}`);
    }

    const header =
      `here's everything i remember about you (${memories.length} items):\n\n`;
    const footer =
      '\n\nuse "/memory delete <id>" to remove one, or "/memory clear" to wipe everything';
    const text = header + sections.join("\n\n") + footer;
    return {
      text,
      ...empty,
      trace: { ...emptyTrace, responseLength: text.length },
    };
  }

  if (cmd.startsWith("/memory delete ")) {
    if (!input.senderHandle) {
      const text = "couldn't identify you";
      return {
        text,
        ...empty,
        trace: { ...emptyTrace, responseLength: text.length },
      };
    }
    const idStr = cmd.replace("/memory delete ", "").trim();
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      const text =
        `"${idStr}" isn't a valid memory id — use /memory to see your memories with their ids`;
      return {
        text,
        ...empty,
        trace: { ...emptyTrace, responseLength: text.length },
      };
    }
    const { rejectMemoryItem } = await import("../state.ts");
    const deleted = await rejectMemoryItem(id, input.senderHandle);
    const text = deleted
      ? `done, memory #${id} has been deleted`
      : `couldn't find memory #${id} — it might not exist or belong to you`;
    return {
      text,
      ...empty,
      trace: { ...emptyTrace, responseLength: text.length },
    };
  }

  if (cmd === "/memory clear") {
    if (!input.senderHandle) {
      const text = "couldn't identify you";
      return {
        text,
        ...empty,
        trace: { ...emptyTrace, responseLength: text.length },
      };
    }
    const { rejectAllMemoryItems } = await import("../state.ts");
    const count = await rejectAllMemoryItems(input.senderHandle);
    const text = count > 0
      ? `done, cleared ${count} memories. fresh start`
      : "you didn't have any active memories to clear";
    return {
      text,
      ...empty,
      trace: { ...emptyTrace, responseLength: text.length },
    };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// Main orchestrator entry point
// ═══════════════════════════════════════════════════════════════

export async function handleTurn(input: TurnInput): Promise<TurnResult> {
  const turnStart = Date.now();
  const turnId = crypto.randomUUID();

  // 1. Slash commands — deterministic, no LLM
  const slashResult = await handleSlashCommand(input);
  if (slashResult) return slashResult;

  if (input.assistantMode === "composio") {
    const { runHeyCompTurn } = await import("../heycomp/turn.ts");
    return runHeyCompTurn(input, { turnId, turnStart });
  }

  // 2. Route the message
  let routerCtx: import("./build-context.ts").RouterContext | undefined;
  let routerContextMs = 0;
  let route: import("./types.ts").RouteDecision;
  let routeMs = 0;

  if (OPTION_A_ROUTING) {
    // Option A: v2 routing (classifier-based, 2-agent model)
    const routerCtxStart = Date.now();
    routerCtx = await buildRouterContext(input);

    if (input.senderHandle) {
      const { extractUserContextPatch, mergeUserContextProfile } = await import(
        "../user-context.ts"
      );
      const patch = extractUserContextPatch(input.userMessage);
      if (patch) {
        const mergedContextProfile = mergeUserContextProfile(
          routerCtx.preloadedProfile?.contextProfile ?? null,
          patch,
        );

        const baseProfile = routerCtx.preloadedProfile ?? {
          handle: input.senderHandle,
          name: null,
          facts: [],
          useLinq: false,
          firstSeen: 0,
          lastSeen: 0,
          deepProfileSnapshot: null,
          deepProfileBuiltAt: null,
          newDeepdiveSummary: null,
          contextProfile: null,
          testRouteLlm: false,
          newRouter: false,
          genz: false,
        } satisfies UserProfile;

        routerCtx.preloadedProfile = {
          ...baseProfile,
          contextProfile: mergedContextProfile,
        };

        import("../state.ts")
          .then(({ updateUserContextProfile }) =>
            updateUserContextProfile(input.senderHandle, mergedContextProfile)
          )
          .catch((err) =>
            console.warn(
              "[handle-turn] updateUserContextProfile failed:",
              (err as Error).message,
            )
          );
      }
    }

    routerContextMs = Date.now() - routerCtxStart;

    const useNewRouter = routerCtx.preloadedProfile?.newRouter === true;
    const useTestRouter = routerCtx.preloadedProfile?.testRouteLlm === true;
    const routeStart = Date.now();
    if (useNewRouter) {
      console.log(`[handle-turn] new_router=true for ${input.senderHandle} — using router v3 (MECE)`);
      const { routeTurnV3 } = await import("./route-turn-v3.ts");
      route = await routeTurnV3(input, routerCtx);
    } else if (useTestRouter) {
      console.log(`[handle-turn] test_route_llm=true for ${input.senderHandle} — using 100% LLM router`);
      route = await routeTurnLlm(input, routerCtx);
    } else {
      route = await routeTurnV2(input, routerCtx);
    }
    routeMs = Date.now() - routeStart;
  } else {
    // Legacy: try instant fast-path BEFORE fetching any context
    const { tryInstantCasual } = await import("./route-turn.ts");
    const instantRoute = tryInstantCasual(input);

    if (instantRoute) {
      route = instantRoute;
      routeMs = 0;
    } else {
      const routerCtxStart = Date.now();
      routerCtx = await buildRouterContext(input);
      routerContextMs = Date.now() - routerCtxStart;

      const routeStart = Date.now();
      route = await routeTurn(input, routerCtx);
      routeMs = Date.now() - routeStart;
    }
  }

  route = applyCompareRouteOverride(input, route);

  const directEmailSendResult = await tryDirectPendingEmailSend(
    input,
    route,
    routerCtx,
    { turnId, turnStart, routeMs, routerContextMs },
  );
  if (directEmailSendResult) return directEmailSendResult;

  const directCalendarLookupResult = await tryDirectCalendarLookup(
    input,
    route,
    routerCtx,
    { turnId, turnStart, routeMs, routerContextMs },
  );
  if (directCalendarLookupResult) return directCalendarLookupResult;

  const directCalendarDeleteResult = await tryDirectCalendarDeleteFollowup(
    input,
    route,
    routerCtx,
    { turnId, turnStart, routeMs, routerContextMs },
  );
  if (directCalendarDeleteResult) return directCalendarDeleteResult;

  // 3a. Pre-ack: fire a contextual "let me check X" message in parallel with
  // context build when new_router is on and the route predicts a tool call.
  // Best-effort; failures are swallowed.
  if (
    routerCtx?.preloadedProfile?.newRouter === true &&
    typeof input.onPreAck === "function"
  ) {
    const { shouldFirePreAck, generatePreAck } = await import("./route-turn-v3.ts");
    if (shouldFirePreAck(route)) {
      const domain = route.primaryDomain ?? null;
      const onPreAck = input.onPreAck;
      // Last 10 prior turns for follow-up resolution. preloadedHistory is the
      // full thread; we slice the most recent 10 (which excludes the current
      // user message — it's persisted later in the pipeline).
      const priorHistory = (routerCtx.preloadedHistory ?? []).slice(-10).map((m) => ({
        role: m.role,
        content: m.content ?? "",
      }));
      generatePreAck(input.userMessage, domain, priorHistory)
        .then(async (ack) => {
          if (!ack) return;
          try {
            await onPreAck(ack);
          } catch (err) {
            console.warn("[handle-turn] onPreAck callback failed:", (err as Error).message);
          }
        })
        .catch((err) =>
          console.warn("[handle-turn] generatePreAck failed:", (err as Error).message),
        );
    }
  }

  // 3. Build context — select path based on group/memoryDepth/heuristics
  // Voice mode override: force smart agent with proper reasoning so the
  // voice instructions are actually followed. Lite/fast models with zero
  // reasoning buried at the end of a 30K prompt ignore voice formatting.
  if (input.voiceMode && route.agent === "chat") {
    console.log(`[handle-turn] voice mode: upgrading chat→smart, reasoning→medium`);
    route = {
      ...route,
      agent: "smart",
      reasoningEffortOverride: route.reasoningEffortOverride ?? "medium",
      memoryDepth: route.memoryDepth === "none" ? "light" : route.memoryDepth,
    };
  }

  const contextStart = Date.now();
  let useLightContext: boolean;
  let contextPath: "full" | "light" | "memory-light" | "minimal" | "group";

  const isMinimalRoute = routerCtx !== undefined &&
    ((route.routeLayer === "0B-casual" &&
      route.routeReason === "safe_casual") ||
      (route.routeLayer === "0B-knowledge" &&
      route.routeReason === "pure_knowledge_question") ||
      route.routeLayer === "v3-R1" ||
      route.routeLayer === "v3-R3" ||
      route.routeLayer === "v3-R10" ||
      route.routeLayer === "v3-F4") &&
    route.agent === "chat" &&
    route.memoryDepth === "none";

  if (input.isGroupChat) {
    useLightContext = true;
    contextPath = "group";
  } else if (isMinimalRoute) {
    useLightContext = true;
    contextPath = "minimal";
  } else if (OPTION_A_ROUTING && route.memoryDepth !== undefined) {
    if (route.memoryDepth === "none") {
      useLightContext = true;
      contextPath = "light";
    } else if (route.memoryDepth === "light") {
      useLightContext = true;
      contextPath = "memory-light";
    } else {
      useLightContext = false;
      contextPath = "full";
    }
  } else {
    const isCasualFastPath = route.fastPathUsed &&
      (route.agent === "casual" || route.agent === "chat") &&
      !route.needsMemoryRead;
    const isWebOnlyFastPath = route.fastPathUsed && route.needsWebFreshness &&
      !route.needsMemoryRead;
    const isReadOnlyProductivity = route.fastPathUsed &&
      route.agent === "productivity" && route.modelTierOverride === "fast" &&
      !route.needsMemoryRead;
    useLightContext = isCasualFastPath || isWebOnlyFastPath ||
      isReadOnlyProductivity;
    contextPath = useLightContext ? "light" : "full";
  }

  const recallHistoryLimit = route.primaryDomain === "recall" ? 50 : undefined;
  const context = contextPath === "group"
    ? await buildGroupContext(input)
    : contextPath === "minimal"
    ? await buildMinimalContext(input, routerCtx!)
    : contextPath === "light"
    ? await buildLightContext(input, routerCtx)
    : contextPath === "memory-light"
    ? await buildMemoryLightContext(input, routerCtx)
    : await buildContext(input, routerCtx, recallHistoryLimit ? { historyLimit: recallHistoryLimit } : undefined);
  const contextBuildLatencyMs = Date.now() - contextStart;
  let userSituationLatencyMs = 0;

  // Resolve the user's CURRENT real-time situation (live calendar tz,
  // current location, travel state). One fetch per turn, attached to the
  // TurnContext so prompt-layers and any downstream agent can read it.
  // Only full prompts currently inject this block. Running it for compact,
  // minimal, or research-lite turns is pure hidden latency.
  const shouldResolveSituation = shouldResolveUserSituation(input, route, contextPath);
  if (shouldResolveSituation) {
    try {
      const userSituationStart = Date.now();
      const { buildUserSituationContext } = await import('../user-situation.ts');
      context.userSituation = await buildUserSituationContext({
        profile: {
          handle: input.senderHandle,
          contextProfile: context.senderProfile?.contextProfile ?? null,
        },
      });
      userSituationLatencyMs = Date.now() - userSituationStart;
    } catch (err) {
      console.warn('[handle-turn] buildUserSituationContext failed:', (err as Error).message);
    }
  }

  const hasGranolaAccount = context.connectedAccounts.some(
    (a) => a.provider === "granola",
  );
  if (input.authUserId && !hasGranolaAccount) {
    try {
      const { createOAuthLinkState } = await import("../provider-oauth.ts");
      const linkStateId = await createOAuthLinkState({
        authUserId: input.authUserId,
        provider: "granola",
      });
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      context.granolaConnectionUrl =
        `${supabaseUrl}/functions/v1/granola-auth?link_state=${
          encodeURIComponent(linkStateId)
        }`;
    } catch (err) {
      console.warn(
        "[handle-turn] granola connection link mint failed:",
        (err as Error).message,
      );
    }
  }

  if (useLightContext) {
    console.log(
      `[handle-turn] light context (${contextPath}): route=${routeMs}ms, ctx=${contextBuildLatencyMs}ms, routerCtx=${routerContextMs}ms`,
    );
  }

  // 5. Select agent
  const agent = selectAgent(route.agent);

  // 6. Run agent loop — input.modelOverride (from admin compare page) takes priority
  const effectiveModelOverride = input.modelOverride ?? route.modelOverride;
  const loopStart = Date.now();
  const loopResult = await runAgentLoop(
    agent,
    context,
    input,
    route.allowedNamespaces,
    route.modelTierOverride,
    route.forcedToolChoice,
    route.primaryDomain,
    route.secondaryDomains,
    route.reasoningEffortOverride,
    route.classifierResult?.requiredCapabilities,
    effectiveModelOverride,
    route.routeLayer,
  );
  const agentLoopLatencyMs = Date.now() - loopStart;

  // 7. Assemble TurnTrace
  const toolTotalLatencyMs = loopResult.toolCallTraces.reduce(
    (sum, t) => sum + t.latencyMs,
    0,
  );
  const promptHash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(String(loopResult.systemPromptLength)),
      ),
    ),
  ).slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");

  const trace: TurnTrace = {
    turnId,
    chatId: input.chatId,
    senderHandle: input.senderHandle,
    timestamp: new Date().toISOString(),

    userMessage: input.userMessage.substring(0, 2000),
    timezoneResolved: input.timezone ?? null,

    routeDecision: route,
    classifierResult: route.classifierResult,
    routeLayer: route.routeLayer,
    routeReason: route.routeReason,
    matchedDisqualifierBucket: route.matchedDisqualifierBucket,
    hadPendingState: route.hadPendingState,
    classifierLatencyMs: route.routeLayer === "0C"
      ? route.routerLatencyMs
      : undefined,

    systemPromptLength: loopResult.systemPromptLength,
    systemPromptHash: promptHash,
    memoryItemsLoaded: context.memoryItems.length,
    ragEvidenceBlocks: context.ragEvidenceBlockCount,
    summariesLoaded: context.summaries.length,
    connectedAccountsCount: context.connectedAccounts.length,
    historyMessagesCount: context.history.length,
    contextBuildLatencyMs,
    contextSubTimings: context.subTimings ?? null,
    resolvedUserContext: context.resolvedUserContext,

    agentName: agent.name,
    modelUsed: loopResult.effectiveModel,
    agentLoopRounds: loopResult.rounds,
    agentLoopLatencyMs,

    roundTraces: loopResult.roundTraces,
    promptComposeMs: loopResult.promptComposeMs,
    toolFilterMs: loopResult.toolFilterMs,

    toolCalls: loopResult.toolCallTraces,
    toolCallsBlocked: loopResult.toolCallsBlocked,
    toolCallCount: loopResult.toolCallTraces.length,
    toolTotalLatencyMs,

    inputTokens: loopResult.inputTokens,
    outputTokens: loopResult.outputTokens,
    cachedTokens: loopResult.cachedTokens,

    responseText: loopResult.text?.substring(0, 5000) ?? null,
    responseLength: loopResult.text?.length ?? 0,

    totalLatencyMs: Date.now() - turnStart,
    routerContextMs,
    contextPath,
    pendingActionDebug: {
      pendingEmailSendCount: context.pendingEmailSends.length,
      pendingEmailSendId: context.pendingEmailSend?.id ?? null,
      pendingEmailSendStatus: context.pendingEmailSend?.status ?? null,
      draftIdPresent: !!context.pendingEmailSend?.draftId,
      accountPresent: !!context.pendingEmailSend?.account,
      confirmationResult: route.confirmationState ?? "not_checked",
      userSituationResolved: shouldResolveSituation,
      userSituationLatencyMs,
      voiceModeDetected: input.voiceMode === true,
    },

    systemPrompt: loopResult.systemPrompt,
    initialMessages: loopResult.initialMessages,
    availableToolNames: loopResult.availableToolNames,
  };

  console.log(
    `[handle-turn] ${turnId}: agent=${agent.name}, model=${loopResult.effectiveModel}, route=${route.agent}(${route.mode}), routerCtx=${routerContextMs}ms, context=${contextBuildLatencyMs}ms, loop=${agentLoopLatencyMs}ms, tools=${loopResult.toolCallTraces.length}(${toolTotalLatencyMs}ms), tokens=${loopResult.inputTokens}in/${loopResult.outputTokens}out${loopResult.cachedTokens > 0 ? `/${loopResult.cachedTokens}cached` : ''}, rounds=${loopResult.rounds}(${
      loopResult.roundTraces.filter((r) => r.wasRetry).length
    } retries), total=${trace.totalLatencyMs}ms`,
  );

  // 8. Persist — messages, tool traces, turn trace (fire-and-forget)
  persistTurn(input, loopResult, trace)
    .catch((err) =>
      console.warn("[handle-turn] persistTurn failed:", (err as Error).message)
    );

  // 8b. Log API cost (fire-and-forget)
  const messageType = input.voiceMode
    ? (input.isGroupChat ? "group_voice" : "voice")
    : input.isProactiveReply
    ? "proactive"
    : input.isGroupChat
    ? "group_text"
    : "text";

  import("../supabase.ts").then(({ getAdminClient }) => {
    logAgentTurnCost(getAdminClient(), {
      userId: input.authUserId,
      chatId: input.chatId,
      senderHandle: input.senderHandle,
      agentName: agent.name,
      model: loopResult.effectiveModel,
      messageType,
      totalInputTokens: loopResult.inputTokens,
      totalOutputTokens: loopResult.outputTokens,
      totalInputTokensCached: loopResult.cachedTokens,
      totalLatencyMs: agentLoopLatencyMs,
      rounds: loopResult.rounds,
      toolsUsed: loopResult.toolsUsed.map((t) => t.tool),
    }).catch((err) =>
      console.warn("[handle-turn] cost logging failed:", (err as Error).message)
    );
  });

  // 9-10. Skip background jobs and working memory for group chats (privacy)
  if (!input.isGroupChat) {
    const bgJobType = shouldQueueBackgroundWork(
      input.userMessage,
      loopResult.toolsUsed,
    );
    if (bgJobType) {
      queueBackgroundJob({
        jobType: bgJobType,
        chatId: input.chatId,
        senderHandle: input.senderHandle,
        payload: { turnId, userMessage: input.userMessage.substring(0, 500) },
        priority: "low",
      }).catch((err) =>
        console.warn("[handle-turn] background job queue failed:", err)
      );
    }

    import("../state.ts")
      .then(({ getPendingEmailSends }) => getPendingEmailSends(input.chatId))
      .then((pendingEmailSends) =>
        extractWorkingMemory(
          input.userMessage,
          loopResult.text,
          loopResult.toolsUsed,
          context.workingMemory,
          pendingEmailSends,
        )
      )
      .then((wm) => persistWorkingMemory(input.chatId, wm))
      .catch((err) =>
        console.warn("[handle-turn] working memory update failed:", err)
      );
  }

  return {
    text: loopResult.text,
    reaction: loopResult.reaction,
    effect: loopResult.effect,
    rememberedUser: loopResult.rememberedUser,
    generatedImage: loopResult.generatedImage,
    trace,
  };
}
