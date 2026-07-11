import {
  type FunctionCallOutput,
  getOpenAIClient,
  isGeminiModel,
  MODEL_MAP,
  type ModelTier,
  type OpenAITool,
  REASONING_EFFORT,
  type ReasoningEffort,
} from "../ai/models.ts";
import {
  geminiGenerateContent,
  type GeminiTool,
  type GeminiToolChoice,
  type GeminiUnifiedResponse,
  modelPartsToGeminiContent,
  toGeminiContents,
  toGeminiFunctionResponses,
} from "../ai/gemini.ts";
import type {
  AgentConfig,
  AgentLoopResult,
  GeneratedImage,
  MessageEffect,
  Reaction,
  RememberedUser,
  RoundTrace,
  ToolCallBlockedTrace,
  ToolCallTrace,
  ToolNamespace,
  TurnContext,
  TurnInput,
} from "./types.ts";
import type {
  PendingToolCall,
  ToolContext,
  ToolContract,
  ToolExecutionResult,
} from "../tools/types.ts";
import { toGeminiTools, toOpenAITool } from "../tools/types.ts";
import { filterToolsByNamespace } from "../tools/namespace-filter.ts";
import { executePoliciedToolCalls } from "../tools/executor.ts";
import {
  composeCompactPrompt,
  composePrompt,
  composeResearchLitePrompt,
  composeStaticKnowledgePrompt,
} from "../agents/prompt-layers.ts";
import { composeBrandPrompt } from "../brand-prompt.ts";
import { detectToolContinuation } from "./tool-continuation-force.ts";
import { buildDirectAccountAnswer } from "./direct-account-answers.ts";
import { applyCommitClaimHallucinationGuard } from "./response-guards.ts";
import type { BrandApiDebugCollector } from "../brand-api-debug.ts";
import {
  buildSearchConfidenceGuard,
  type SearchEvidenceBundle,
} from "../tools/search-pipeline.ts";

type StandardReactionType =
  | "love"
  | "like"
  | "dislike"
  | "laugh"
  | "emphasize"
  | "question";

// ═══════════════════════════════════════════════════════════════
// Side-effect extraction from executor structuredData
// ═══════════════════════════════════════════════════════════════

interface SideEffects {
  reaction: Reaction | null;
  effect: MessageEffect | null;
  rememberedUser: RememberedUser | null;
  generatedImage: GeneratedImage | null;
}

const COMPACT_REACTION_TOOL_NAMES = new Set(["send_reaction"]);

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function buildPromptCacheKey(chatId: string): string {
  const prefix = "nest-chat-";
  const safeChatId = chatId.replace(/[^a-zA-Z0-9_-]/g, "-");
  const rawKey = `${prefix}${safeChatId}`;
  if (rawKey.length <= 64) return rawKey;

  const hash = stableHash(chatId);
  const suffixBudget = 64 - prefix.length - hash.length - 1;
  return `${prefix}${hash}-${safeChatId.slice(-suffixBudget)}`;
}

function formatEmailDraftPreview(draft: {
  from?: string | null;
  to?: unknown;
  subject?: string | null;
  bodyText?: string | null;
  cc?: unknown;
  bcc?: unknown;
}): string {
  const list = (value: unknown): string => {
    if (Array.isArray(value)) return value.filter(Boolean).join(", ");
    if (typeof value === "string") return value;
    return "";
  };

  const from = draft.from?.trim() || "(unresolved — choose a sender mailbox before sending)";
  const to = list(draft.to) || "unknown recipient";
  const cc = list(draft.cc);
  const bcc = list(draft.bcc);
  const subject = draft.subject?.trim() || "(no subject)";
  const body = draft.bodyText?.trim() || "(empty body)";

  return [
    "I've got that draft ready for you.",
    "",
    `**From:** ${from}`,
    `**To:** ${to}`,
    ...(cc ? [`**Cc:** ${cc}`] : []),
    ...(bcc ? [`**Bcc:** ${bcc}`] : []),
    `**Subject:** ${subject}`,
    "",
    "---",
    body,
    "---",
    "",
    "Say “send it” if you want me to send it.",
  ].join("\n");
}

const PERSONAL_HISTORY_QUESTION =
  /\b(i|me|my|mine|we|us|our)\b[\s\S]{0,160}\b(did|was|were|went|gone|go(?:\s+to)?|visit(?:ed)?|travel(?:led|ed)?|trip|holiday|internship|speak|spoke|talk(?:ed)?|chat(?:ted)?|meet|met|with who|who with|in\s+\d{4}|back in|ever|first|last|previous(?:ly)?|before|years? ago)\b|\b(did|was|were|went|gone|go(?:\s+to)?|visit(?:ed)?|travel(?:led|ed)?|trip|holiday|internship|speak|spoke|talk(?:ed)?|chat(?:ted)?|meet|met|with who|who with|in\s+\d{4}|back in|ever|first|last|previous(?:ly)?|before|years? ago)\b[\s\S]{0,160}\b(i|me|my|mine|we|us|our)\b/i;
const CONFIDENT_NEGATIVE_RECALL =
  /\b(i can'?t see|i can'?t find|nothing confirm(?:s|ing)|no record|no evidence|doesn'?t look like|didn'?t happen|hasn'?t happened|not finding|records only go back)\b/i;

function extractSideEffectsFromExecutor(
  execResults: ToolExecutionResult[],
): SideEffects {
  let reaction: Reaction | null = null;
  let effect: MessageEffect | null = null;
  let rememberedUser: RememberedUser | null = null;
  let generatedImage: GeneratedImage | null = null;

  for (const r of execResults) {
    if (!r.structuredData) continue;

    if (r.toolName === "send_reaction") {
      if (r.structuredData.type === "custom" && r.structuredData.custom_emoji) {
        reaction = {
          type: "custom",
          emoji: r.structuredData.custom_emoji as string,
        };
      } else {
        reaction = { type: r.structuredData.type as StandardReactionType };
      }
    } else if (r.toolName === "send_effect") {
      effect = {
        type: r.structuredData.effect_type as "screen" | "bubble",
        name: r.structuredData.effect as string,
      };
    } else if (r.toolName === "remember_user" && r.outcome === "success") {
      rememberedUser = {
        name: r.structuredData.name as string | undefined,
        fact: r.structuredData.fact as string | undefined,
        isForSender: r.structuredData.isForSender as boolean | undefined,
      };
    } else if (r.toolName === "generate_image") {
      generatedImage = { url: "", prompt: r.structuredData.prompt as string };
    } else if (r.toolName === "edit_image") {
      generatedImage = {
        url: "",
        prompt: r.structuredData.prompt as string,
        isEdit: true,
      };
    }
  }

  return { reaction, effect, rememberedUser, generatedImage };
}

export function resolveAvailableToolsForRoute(
  allowedNamespaces: ToolNamespace[],
  opts: {
    isCompactPromptLane: boolean;
    isV3CompactChatLane: boolean;
  },
): ToolContract[] {
  const tools = filterToolsByNamespace(allowedNamespaces);

  if (!opts.isCompactPromptLane) return tools;

  if (opts.isV3CompactChatLane) {
    return tools.filter((tool) => COMPACT_REACTION_TOOL_NAMES.has(tool.name));
  }

  return [];
}

function formatWeatherFallback(
  payload: Record<string, unknown>,
  userMessage: string,
): string | null {
  if (typeof payload.error === "string") return null;
  const location = String(payload.location ?? "there");
  const type = String(payload.type ?? "current_conditions");

  if (type === "current_conditions") {
    const now = payload.temperature_c ?? payload.condition;
    const condition = payload.condition ? `, ${payload.condition}` : "";
    const rain = payload.rain_probability_percent;
    const feelsLike = payload.feels_like_c;
    const lines = [`**Now:** ${now ?? "Weather looks okay"}${condition}`];
    if (feelsLike !== undefined) lines.push(`**Feels like:** ${feelsLike}°C`);
    if (rain !== undefined) lines.push(`**Rain:** ${rain}% chance`);
    lines.push(`**Location:** ${location}`);
    return lines.join("\n");
  }

  if (type === "hourly_forecast" && Array.isArray(payload.hours)) {
    const hours = payload.hours as Array<Record<string, unknown>>;
    const rainyHour = hours.find((hour) =>
      Number(hour.rain_probability_percent ?? 0) >= 40
    );
    const maxRain = hours.reduce(
      (max, hour) => Math.max(max, Number(hour.rain_probability_percent ?? 0)),
      0,
    );
    const firstTemp = hours[0]?.temperature_c;
    const intro = /\bafternoon\b/i.test(userMessage)
      ? maxRain >= 40
        ? "Looks like a decent chance this afternoon."
        : "Doesn't look too rainy this afternoon."
      : maxRain >= 40
      ? "Yep, looks like some rain around."
      : "Doesn't look too bad.";
    const lines = [intro];
    if (rainyHour?.time) lines.push(`**Likely from:** ${rainyHour.time}`);
    lines.push(`**Peak rain:** ${maxRain}%`);
    if (firstTemp !== undefined) lines.push(`**Temp:** ${firstTemp}°C`);
    lines.push(`**Location:** ${location}`);
    return lines.join("\n");
  }

  if (type === "daily_forecast" && Array.isArray(payload.days)) {
    const days = (payload.days as Array<Record<string, unknown>>).slice(0, 3);
    if (days.length === 0) return null;
    const lines = days.map((day, index) => {
      const label = index === 0
        ? "Today"
        : index === 1
        ? "Tomorrow"
        : String(day.date ?? `Day ${index + 1}`);
      const maxTemp = day.max_temp_c ?? "—";
      const minTemp = day.min_temp_c ?? "—";
      const rain = (day.daytime as Record<string, unknown> | undefined)
        ?.rain_probability_percent;
      const condition = (day.daytime as Record<string, unknown> | undefined)
        ?.condition;
      return `**${label}:** ${maxTemp}°C / ${minTemp}°C${
        condition ? ` — ${condition}` : ""
      }${rain !== undefined ? `, ${rain}% rain` : ""}`;
    });
    lines.push(`**Location:** ${location}`);
    return lines.join("\n");
  }

  return null;
}

function formatPlacesFallback(
  payload: Record<string, unknown>,
): string | null {
  if (typeof payload.error === "string") return null;

  if (Array.isArray(payload.results)) {
    const results = (payload.results as Array<Record<string, unknown>>).slice(
      0,
      3,
    );
    if (results.length === 0) return null;
    return results.map((place) => {
      const name = String(place.name ?? "Unknown place");
      const address = String(place.address ?? "");
      const rating = place.rating ? ` — ${place.rating}` : "";
      return `• **${name}**${rating}\n${address}`.trim();
    }).join("\n\n");
  }

  if (payload.name) {
    const lines = [`**${String(payload.name)}**`];
    if (payload.address) lines.push(String(payload.address));
    if (payload.rating) lines.push(String(payload.rating));
    if (payload.summary) lines.push(String(payload.summary));
    return lines.join("\n");
  }

  return null;
}

/**
 * When Composio returns a real OAuth URL, the model sometimes ignores it and
 * continues a prior-turn "link failed" narrative. Prefer the tool result.
 */
function applyComposioConnectionLinkDeterministicReply(
  execResults: ToolExecutionResult[],
  currentText: string | null,
): string | null {
  const exec = [...execResults].reverse().find(
    (r) =>
      r.toolName === "composio_get_connection_link" &&
      r.outcome === "success" &&
      r.structuredData &&
      typeof (r.structuredData as Record<string, unknown>).url === "string",
  );
  if (!exec?.structuredData) return currentText;
  const data = exec.structuredData as Record<string, unknown>;
  if (typeof data.error === "string" && data.error.trim()) return currentText;
  const url = String(data.url ?? "").trim();
  if (!url || !/^https?:\/\//i.test(url)) return currentText;
  if (currentText?.includes(url)) return currentText;
  const rawTk = String(data.toolkit ?? "app").trim() || "app";
  const label = rawTk.length > 0
    ? rawTk.charAt(0).toUpperCase() + rawTk.slice(1)
    : "App";
  return `Here's your ${label} connect link:\n\n${url}\n\nOpen it, sign in, and you're sorted — message me if it doesn't show as connected on my side.`;
}

function buildEmptyResponseFallback(
  execResults: ToolExecutionResult[],
  userMessage: string,
): string | null {
  for (let i = execResults.length - 1; i >= 0; i--) {
    const exec = execResults[i];
    if (exec.outcome !== "success" || !exec.structuredData) continue;
    if (exec.toolName === "weather_lookup") {
      const text = formatWeatherFallback(exec.structuredData, userMessage);
      if (text) return text;
    }
    if (exec.toolName === "places_search") {
      const text = formatPlacesFallback(exec.structuredData);
      if (text) return text;
    }
  }
  return null;
}

/**
 * Last resort when the model burned tool rounds without emitting text (e.g. forced
 * tool_choice + semantic_search loops). Never invent flight times or inbox contents.
 */
function buildPostToolSilenceFallback(
  execResults: ToolExecutionResult[],
  userMessage: string,
): string | null {
  if (execResults.length === 0) return null;
  const anySuccess = execResults.some((r) => r.outcome === "success");
  if (!anySuccess) return null;

  const successfulNames = execResults
    .filter((r) => r.outcome === "success")
    .map((r) => r.toolName);
  const hadSemanticOnlyPipeline = successfulNames.length > 0 &&
    successfulNames.every((n) => n === "semantic_search");

  const lower = userMessage.toLowerCase();
  const travelish =
    /\bflight|fly|flying|booking|itinerary|qantas|jetstar|virgin|pnr|e-?ticket|depart|departure|gate|airport|cairns|lounge\b/i
      .test(lower);

  if (hadSemanticOnlyPipeline && travelish) {
    return "Can't see the departure time in what I just searched — I don't want to guess. Want me to check your email for the itinerary or your calendar for that trip?";
  }
  if (hadSemanticOnlyPipeline) {
    return "Couldn't pull a solid answer from that search. If it's in your email or calendar, say the word and I'll look there — or give me one extra detail (date, place, or booking ref) and I'll try again.";
  }
  return "I ran the tools but didn't get a reply out to you — my bad. What should I try next: your inbox, calendar, or a different search?";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : null;
}

function latestSuccessfulStructuredTool(
  execResults: ToolExecutionResult[],
  toolName: string,
): Record<string, unknown> | null {
  for (let i = execResults.length - 1; i >= 0; i--) {
    const exec = execResults[i];
    if (
      exec.toolName !== toolName || exec.outcome !== "success" ||
      !exec.structuredData
    ) continue;
    return exec.structuredData;
  }
  return null;
}

function latestSuccessfulToolName(
  execResults: ToolExecutionResult[],
): string | null {
  for (let i = execResults.length - 1; i >= 0; i--) {
    const exec = execResults[i];
    if (exec.outcome === "success") return exec.toolName;
  }
  return null;
}

function asSearchEvidenceBundle(
  value: Record<string, unknown> | null,
): SearchEvidenceBundle | null {
  if (!value) return null;
  const mode = value.mode;
  const verification = asRecord(value.verification);
  if (
    (mode !== "web" && mode !== "news") ||
    !verification ||
    typeof verification.status !== "string" ||
    typeof verification.confidence !== "number" ||
    typeof value.bestAnswer !== "string"
  ) {
    return null;
  }
  const validStatuses = new Set([
    "high_confidence",
    "mixed_signals",
    "single_source",
    "stale_or_unclear",
  ]);
  if (!validStatuses.has(verification.status)) return null;
  return value as SearchEvidenceBundle;
}

function latestSuccessfulSearchBundle(
  execResults: ToolExecutionResult[],
): SearchEvidenceBundle | null {
  for (let i = execResults.length - 1; i >= 0; i--) {
    const exec = execResults[i];
    if (
      (exec.toolName !== "web_search" && exec.toolName !== "news_search") ||
      exec.outcome !== "success"
    ) {
      continue;
    }
    const payload = asSearchEvidenceBundle(exec.structuredData ?? null);
    if (payload) return payload;
  }
  return null;
}

function buildDeterministicSearchReply(
  execResults: ToolExecutionResult[],
): string | null {
  const latestTool = latestSuccessfulToolName(execResults);
  if (latestTool !== "web_search" && latestTool !== "news_search") return null;
  const payload = latestSuccessfulSearchBundle(execResults);
  if (!payload || payload.mode !== "web") return null;
  return payload.bestAnswer?.trim() || null;
}

function cleanTravelText(text: string | undefined): string {
  return (text ?? "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compactDuration(text: string | undefined): string {
  return cleanTravelText(text)
    .replace(/\bmins\b/gi, "min")
    .replace(/\bminutes\b/gi, "min");
}

function userWantsRouteDirections(message: string): boolean {
  return /\b(clear directions|directions|route|which way|where do i go|turn by turn|turn-by-turn|step by step|step-by-step|how do i actually get there)\b/i
    .test(message);
}

function shortPlaceLabel(text: string | undefined): string {
  return cleanTravelText(text)
    .replace(/\bmelbourne cricket ground\b/gi, "MCG")
    .replace(/\b(australia)\b/gi, "")
    .replace(/\b\d{4}\b/g, "")
    .replace(
      /,\s*(melbourne|east melbourne|south melbourne|vic|victoria)\b/gi,
      "",
    )
    .replace(/\bvic\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/^,\s*|\s*,\s*$/g, "")
    .trim();
}

function buildTransitRouteSentence(
  route: Record<string, unknown>,
): string | null {
  const rawSteps = Array.isArray(route.steps) ? route.steps : [];
  const steps = rawSteps
    .map(asRecord)
    .filter((step): step is Record<string, unknown> => !!step);
  const transitSteps = steps.filter((step) => step.mode !== "walk");
  const finalWalk = [...steps].reverse().find((step) => step.mode === "walk");

  if (transitSteps.length === 0) return null;

  const first = transitSteps[0];
  const firstMode = String(first.mode ?? "transit");
  const firstLine = cleanTravelText(String(first.line ?? ""));
  const firstFrom = cleanTravelText(String(first.from ?? ""));
  const firstTo = cleanTravelText(String(first.to ?? ""));
  const firstNoun = firstMode === "train"
    ? "train"
    : firstMode === "bus"
    ? "bus"
    : firstMode === "light_rail"
    ? "tram"
    : "service";
  const firstLeg = firstLine
    ? `Take the ${firstLine} ${firstNoun} from ${firstFrom} to ${firstTo}`
    : `Take the ${firstNoun} from ${firstFrom} to ${firstTo}`;

  if (transitSteps.length > 1) {
    const second = transitSteps[1];
    const secondMode = String(second.mode ?? "transit");
    const secondLine = cleanTravelText(String(second.line ?? ""));
    const secondTo = cleanTravelText(String(second.to ?? ""));
    const secondNoun = secondMode === "train"
      ? "train"
      : secondMode === "bus"
      ? "bus"
      : secondMode === "light_rail"
      ? "tram"
      : "service";
    const secondLeg = secondLine
      ? `then ${secondLine} ${secondNoun} to ${secondTo}`
      : `then the ${secondNoun} to ${secondTo}`;
    return `${firstLeg}, ${secondLeg}.`;
  }

  const walkMins = compactDuration(String(finalWalk?.duration_text ?? ""));
  if (walkMins) {
    return `${firstLeg}, then walk about ${walkMins}.`;
  }

  return `${firstLeg}.`;
}

function formatTransitTravelReply(
  payload: Record<string, unknown>,
): string | null {
  const brief = asRecord(payload.travel_brief);
  const route = asRecord(
    Array.isArray(brief?.routes) ? brief?.routes[0] : null,
  );
  if (!brief || !route) return null;

  const feasibility = asRecord(brief.feasibility);
  const duration = compactDuration(String(route.total_duration_text ?? ""));
  const routeSentence = buildTransitRouteSentence(route);
  const destination = shortPlaceLabel(String(payload.destination ?? ""));
  const departure = cleanTravelText(String(route.departure_time_local ?? ""));
  const arrival = cleanTravelText(String(route.arrival_time_local ?? ""));

  let opener: string;
  if (feasibility) {
    const canArrive = feasibility.can_arrive_on_time === true;
    const buffer = Number(feasibility.buffer_minutes ?? 0);
    const comfort = String(feasibility.comfort_label ?? "").toLowerCase();
    if (canArrive) {
      opener = comfort === "comfortable"
        ? `Yep, you'll make it with about ${buffer} min to spare.`
        : comfort === "tight"
        ? `Yep, you should make it, but it'll be tight with about ${buffer} min spare.`
        : `Yep, you'll make it, but only by about ${buffer} min.`;
    } else {
      opener = `No, that run gets you there about ${
        Math.abs(buffer)
      } min late.`;
    }
  } else {
    opener = duration
      ? destination
        ? `Fastest public transport to ${destination} is about ${duration}.`
        : `Fastest public transport is about ${duration}.`
      : "Fastest public transport option below.";
  }

  const primaryBubble = [opener, routeSentence].filter(Boolean).join(" ");
  if (departure && arrival) {
    return `${primaryBubble}\n---\nNext one is ${departure}. You'd get there about ${arrival}.`;
  }
  return primaryBubble;
}

function formatDrivingRouteSummary(
  payload: Record<string, unknown>,
): string | null {
  const steps = Array.isArray(payload.route_summary)
    ? payload.route_summary
      .map(asRecord)
      .filter((step): step is Record<string, unknown> => !!step)
    : [];
  if (steps.length === 0) return null;

  const parseKm = (distance: string): number => {
    const km = distance.match(/([\d.]+)\s*km/i);
    if (km) return Number(km[1]);
    const m = distance.match(/([\d.]+)\s*m/i);
    if (m) return Number(m[1]) / 1000;
    return 0;
  };

  const cleanRoads = (text: string): string =>
    cleanTravelText(text)
      .replace(/\s*\/\s*/g, " / ")
      .replace(/\bState Route\b/gi, "State Route")
      .replace(/\bNational Hwy\b/gi, "National Hwy")
      .replace(/\bNational Highway\b/gi, "National Hwy")
      .replace(/\bToll road\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();

  const simplifyDrivingStep = (instruction: string): string => {
    const text = cleanTravelText(instruction);
    let match = text.match(/^Start on (.+?)(?: toward .+)?$/i);
    if (match) return `Start on ${cleanRoads(match[1])}.`;

    match = text.match(
      /^Turn (?:left|right|slight left|slight right|sharp left|sharp right) onto (.+)$/i,
    );
    if (match) return `Get onto ${cleanRoads(match[1])}.`;

    match = text.match(/^Merge onto (.+?)(?: via the ramp)?(?: to (.+))?$/i);
    if (match) {
      const road = cleanRoads(match[1]);
      const toward = match[2]
        ? cleanRoads(match[2]).replace(/^toward\s+/i, "")
        : "";
      return toward
        ? `Merge onto ${road} toward ${toward}.`
        : `Merge onto ${road}.`;
    }

    match = text.match(/^Continue (?:straight )?onto (.+)$/i);
    if (match) return `Stay on ${cleanRoads(match[1])}.`;

    match = text.match(/^Take (?:the )?(.+? exit)(?: for)? (.+)$/i);
    if (match) {
      const toward = cleanRoads(match[2]).replace(/^toward\s+/i, "");
      return `Take the ${cleanRoads(match[1])} toward ${toward}.`;
    }

    match = text.match(/^Take exit (.+)$/i);
    if (match) return `Take exit ${cleanRoads(match[1])}.`;

    return `${cleanRoads(text)}.`;
  };

  const importantRoadStep = (instruction: string, distance: string): boolean =>
    /\b(fwy|freeway|highway|motorway|route\s*\d+|state route|m\d+\b|citylink|western hwy|princes hwy|merge onto|continue onto|take the ramp|take the exit|toward)\b/i
      .test(instruction) || parseKm(distance) >= 3;

  const selected: string[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const instruction = cleanTravelText(String(step.instruction ?? ""));
    const distance = cleanTravelText(String(step.distance ?? ""));
    if (!instruction) continue;

    const isFirst = selected.length === 0;
    const isLast = i === steps.length - 1;
    if (!isFirst && !isLast && !importantRoadStep(instruction, distance)) {
      continue;
    }

    const line = distance ? `${instruction} for ${distance}` : instruction;
    if (!selected.includes(line)) selected.push(line);
  }

  if (selected.length === 0) return null;

  const trimmed = selected.length <= 5 ? selected : [
    selected[0],
    selected[1],
    selected[2],
    selected[selected.length - 2],
    selected[selected.length - 1],
  ];
  const numbered = trimmed.map((line, index) =>
    `${index + 1}. ${simplifyDrivingStep(line)}`
  );

  const brief = asRecord(payload.travel_brief);
  const route = asRecord(
    Array.isArray(brief?.routes) ? brief?.routes[0] : null,
  );
  const totalTime = compactDuration(
    String(route?.total_duration_text ?? payload.duration ?? ""),
  );
  const departure = typeof payload.departure_time === "string" &&
      payload.departure_time !== "now"
    ? cleanTravelText(payload.departure_time)
    : "Now";
  const traffic = route?.traffic_dependent === true
    ? " (traffic depending)"
    : "";

  return [
    "**Departure:** " + departure,
    totalTime ? `**Total time:** ~${totalTime}${traffic}` : null,
    "**Directions:**",
    ...numbered,
  ].filter(Boolean).join("\n");
}

function formatNonTransitTravelReply(
  payload: Record<string, unknown>,
  userMessage: string,
): string | null {
  const brief = asRecord(payload.travel_brief);
  const route = asRecord(
    Array.isArray(brief?.routes) ? brief?.routes[0] : null,
  );
  if (!brief || !route) return null;

  const mode = String(payload.mode ?? route.label ?? "driving");
  const duration = compactDuration(String(route.total_duration_text ?? ""));
  const distance = cleanTravelText(String(route.distance_text ?? ""));
  const destination = shortPlaceLabel(String(payload.destination ?? ""));
  const summary = mode === "driving"
    ? `${duration} by car`
    : mode === "walking"
    ? `${duration} walk`
    : mode === "bicycling"
    ? `${duration} ride`
    : duration;
  if (!summary) return null;

  if (mode === "driving" && userWantsRouteDirections(userMessage)) {
    const routeSummary = formatDrivingRouteSummary(payload);
    if (routeSummary) return routeSummary;
  }

  let reply = destination
    ? distance
      ? `About ${summary} to ${destination} for ${distance}.`
      : `About ${summary} to ${destination}.`
    : distance
    ? `About ${summary} for ${distance}.`
    : `About ${summary}.`;
  if (route.traffic_dependent === true) {
    reply += " Traffic can move around a bit, so give it some buffer.";
  }
  return reply;
}

function buildDeterministicTravelReply(
  execResults: ToolExecutionResult[],
  userMessage: string,
): string | null {
  const payload = latestSuccessfulStructuredTool(execResults, "travel_time");
  if (!payload || typeof payload.error === "string") return null;

  const latestSuccessfulTool = [...execResults]
    .reverse()
    .find((exec) => exec.outcome === "success");
  if (latestSuccessfulTool?.toolName !== "travel_time") return null;

  const mode = String(payload.mode ?? "").toLowerCase();
  if (mode === "transit") return formatTransitTravelReply(payload);
  if (mode === "driving" || mode === "walking" || mode === "bicycling") {
    return formatNonTransitTravelReply(payload, userMessage);
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Model resolution — upgrade casual tier when judgement tools present
// ═══════════════════════════════════════════════════════════════

function resolveModelTier(agent: AgentConfig): ModelTier {
  return agent.modelTier;
}

function stripWebSearchArtifacts(text: string): string {
  // Convert markdown links to plain anchor text.
  let cleaned = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, "$1");
  // Remove any remaining raw URLs.
  cleaned = cleaned.replace(/\bhttps?:\/\/[^\s)]+/gi, "");
  // Remove orphaned angle-bracket URLs.
  cleaned = cleaned.replace(/<\s*https?:\/\/[^>]+>/gi, "");
  // Strip OpenAI web-search citation tokens (e.g. "citeturn1search0turn1search1").
  cleaned = cleaned.replace(/\s*cite(?:turn\d+search\d+)+/gi, "");
  // Strip bracketed citation markers (e.g. "【turn1search0†source】").
  cleaned = cleaned.replace(
    /[\u3010\u3011][^[\u3010\u3011]*[\u3010\u3011]?/g,
    "",
  );
  // Strip parenthetical domain citations: (formula1.com), (apnews.com), (cancer.org.au)
  cleaned = cleaned.replace(
    /\s*\((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/\S*)?\)/gi,
    "",
  );
  // Normalise extra spaces created by removals.
  cleaned = cleaned.replace(/[ \t]{2,}/g, " ");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

function detectForcedToolChoice(
  msg: string,
  availableToolNames: string[],
): string | undefined {
  const toolSet = new Set(availableToolNames);
  const lower = msg.toLowerCase();

  const wantsWebSearch =
    /\b(use (the )?(internet|web)|search (the )?(web|internet|online)|google|look.{0,10}up online|browse)\b/i
      .test(lower);
  if (wantsWebSearch && toolSet.has("web_search")) {
    return "required";
  }

  return undefined;
}

// ═══════════════════════════════════════════════════════════════
// Main agent loop — OpenAI Responses API with reasoning
// ═══════════════════════════════════════════════════════════════

export async function runAgentLoop(
  agent: AgentConfig,
  context: TurnContext,
  input: TurnInput,
  allowedNamespaces: ToolNamespace[],
  modelTierOverride?: ModelTier,
  routerForcedToolChoice?: string,
  primaryDomain?: import("./types.ts").DomainTag,
  secondaryDomains?: import("./types.ts").DomainTag[],
  reasoningEffortOverride?: ReasoningEffort,
  capabilities?: import("./types.ts").Capability[],
  modelOverride?: string,
  routeLayer?: string,
  brandApiDebug?: BrandApiDebugCollector,
): Promise<AgentLoopResult> {
  const client = getOpenAIClient();

  const promptStart = Date.now();

  // Prompt mode is driven explicitly by routeLayer:
  // - 0B-casual    → compact prompt, no tools, truncated history (4 msgs)
  // - 0B-research  → research-lite prompt, web tools kept, trimmed history (6 msgs)
  // - 0B-knowledge/pure_knowledge_question → static knowledge prompt, no tools or memory
  // - 0A / 0C / undefined → full prompt, tools as resolved
  //
  // v3 router (new_router=true only) — lean paths for chat-agent routes:
  // - v3-F4 (emoji/short)  → compact prompt, reaction tool only
  // - v3-R1 (casual)       → compact prompt, reaction tool only
  // - v3-R3 (knowledge)    → compact prompt, reaction tool only (Q&A doesn't need memory/tools)
  // - v3-R10 (unclear)     → compact prompt, reaction tool only
  // - v3-R4 (research)     → research-lite prompt, web tools kept
  // - v3-R2/R5/R6/R7/F1/F2 → full prompt (memory/tools required)
  const isStaticKnowledgeLane = routeLayer === "0B-knowledge" &&
    primaryDomain === "general" &&
    !allowedNamespaces.includes("memory.read");
  const isLane1 = routeLayer === "0B-casual" ||
    isStaticKnowledgeLane ||
    routeLayer === "v3-F4" ||
    routeLayer === "v3-R1" ||
    routeLayer === "v3-R3" ||
    routeLayer === "v3-R10";
  const isV3CompactChatLane = routeLayer === "v3-F4" ||
    routeLayer === "v3-R1" ||
    routeLayer === "v3-R3" ||
    routeLayer === "v3-R10";
  const isResearchLane = routeLayer === "0B-research" ||
    routeLayer === "v3-R4";

  let systemPrompt: string;
  if (input.isGroupChat) {
    const { buildGroupSystemPrompt, getGroupChat } = await import(
      "../group.ts"
    );
    const group = await getGroupChat(input.chatId);
    systemPrompt = buildGroupSystemPrompt({
      participantNames: input.participantNames,
      chatName: input.chatName,
      groupVibe: (group?.groupVibe as import("../group.ts").GroupVibe) ??
        "mixed",
      timezone: input.timezone,
      genzVoice: context.senderProfile?.genz === true,
    });
  } else if (isStaticKnowledgeLane) {
    systemPrompt = composeStaticKnowledgePrompt(input, context);
  } else if (isLane1) {
    systemPrompt = composeCompactPrompt(context, input);
  } else if (isResearchLane) {
    systemPrompt = composeResearchLitePrompt(context, input);
  } else if (input.brandContext) {
    systemPrompt = composeBrandPrompt(
      context,
      input,
      capabilities,
    );
  } else {
    systemPrompt = composePrompt(
      agent,
      context,
      input,
      primaryDomain,
      secondaryDomains,
      capabilities,
    );
  }

  if (
    input.comparePromptAppend?.trim() &&
    input.chatId.startsWith("DBG#")
  ) {
    systemPrompt +=
      "\n\n--- Compare testing (highest priority for tone, voice, and style) ---\n" +
      input.comparePromptAppend.trim();
  }

  if (input.voiceMode) {
    systemPrompt += "\n\n--- Voice mode active (HIGHEST PRIORITY) ---\n" +
      "Your response will be converted to speech and sent as a voice memo. The user will NOT ask follow-up questions in this mode - this is a standalone voice note. Treat every voice mode request as a self-contained, complete response.\n\n" +
      "LENGTH AND DEPTH:\n" +
      "- This is like recording a voice note for a friend who asked you something. Give them a REAL answer.\n" +
      "- For any topic with substance (history, explanation, advice, analysis, how-to, opinion): aim for 1.5 to 3 minutes of spoken content (roughly 250-450 words). Cover the topic properly. Give context, nuance, examples, and a clear conclusion.\n" +
      "- For simple factual questions (what time is it, what's the weather, yes/no): 20-30 seconds is fine.\n" +
      "- When in doubt, go longer. A thorough 2-minute explanation is always better than a thin 20-second skim.\n" +
      "- Think of it like explaining something to a smart friend over coffee. You wouldn't give them one sentence and stop.\n\n" +
      "SPOKEN DELIVERY:\n" +
      "- Write for the ear, not the eye. Contractions, conversational flow, natural fillers ('so', 'right', 'I mean', 'you know', 'basically').\n" +
      "- USE NATURAL PAUSES. Sprinkle real spoken hesitations through the response — 'um', 'ummm', 'hmm', 'hmmm', 'ahh' — alongside ellipses ('...') for thinking pauses. Mix them, don't repeat the same one. Aim for roughly one hesitation or pause every three to five sentences, more at moments of genuine thinking or transition. They should feel incidental, never performed.\n" +
      "- Spell hesitations the way they sound: 'um', 'ummm', 'hmm', 'hmmm', 'ahh'. Never bracket them, quote them, or describe them ('[pause]' is BANNED).\n" +
      "- No markdown, no bullet points, no numbered lists, no URLs, no special formatting whatsoever.\n" +
      "- Spell out numbers, times, and abbreviations ('five thirty pm', 'about two hundred million people').\n" +
      "- Flowing paragraphs with natural pauses ('...'), varied sentence length, occasional rhetorical questions to keep it engaging.\n" +
      "- Sound like you're actually talking, not reading an essay.\n" +
      "- CRITICAL: Start talking immediately. Do NOT begin with any meta-commentary like 'The user asked about...', 'Nest will respond with...', 'Here is my response...', or any bracketed text like '[voice memo]'. Just start answering directly, as if you hit record and started talking.";
  }

  const promptComposeMs = Date.now() - promptStart;

  const filterStart = Date.now();
  const availableTools = resolveAvailableToolsForRoute(allowedNamespaces, {
    isCompactPromptLane: isLane1,
    isV3CompactChatLane,
  }); // 0B-research keeps tools
  const openaiTools: OpenAITool[] = availableTools.map(toOpenAITool);
  const geminiTools: GeminiTool[] = availableTools.length > 0
    ? toGeminiTools(availableTools)
    : [];
  const toolFilterMs = Date.now() - filterStart;

  const effectiveTier = modelTierOverride ?? resolveModelTier(agent);
  const effectiveModel = modelOverride ?? MODEL_MAP[effectiveTier];

  const directAccountAnswer = buildDirectAccountAnswer(context, input);
  if (directAccountAnswer) {
    return {
      text: directAccountAnswer,
      reaction: null,
      effect: null,
      rememberedUser: null,
      generatedImage: null,
      toolCallTraces: [],
      toolCallsBlocked: [],
      rounds: 0,
      toolsUsed: [],
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      systemPromptLength: systemPrompt.length,
      systemPrompt,
      initialMessages: [
        ...context.formattedHistory,
        { role: "user", content: context.messageContent },
      ],
      availableToolNames: availableTools.map((t) => t.name),
      effectiveModel: "deterministic:direct-account-answer",
      roundTraces: [],
      promptComposeMs,
      toolFilterMs,
    };
  }
  const reasoningEffort = reasoningEffortOverride ??
    REASONING_EFFORT[effectiveTier];

  if (modelOverride) {
    console.log(
      `[agent-loop] model overridden to '${modelOverride}' (default would be '${
        MODEL_MAP[effectiveTier]
      }')`,
    );
  }
  if (reasoningEffortOverride) {
    console.log(
      `[agent-loop] reasoning effort overridden to '${reasoningEffortOverride}' (default would be '${
        REASONING_EFFORT[effectiveTier]
      }')`,
    );
  }

  const recentHistory = isLane1
    ? context.formattedHistory.slice(-4)
    : isResearchLane
    ? context.formattedHistory.slice(-6)
    : context.formattedHistory;
  const apiInput: Record<string, unknown>[] = [
    ...recentHistory,
    { role: "user", content: context.messageContent },
  ];

  const useGemini = isGeminiModel(effectiveModel);

  // Gemini maintains its own contents array (different format from OpenAI)
  let geminiContents = useGemini
    ? toGeminiContents(
      apiInput as Array<{ role: string; content?: string | unknown[] }>,
    )
    : [];
  // Map call_id → function name for Gemini tool result routing
  const geminiCallIdToName = new Map<string, string>();

  const toolCtx: ToolContext = {
    chatId: input.chatId,
    senderHandle: input.senderHandle,
    authUserId: input.authUserId,
    timezone: input.timezone ?? null,
    pendingEmailSend: context.pendingEmailSend,
    pendingEmailSends: context.pendingEmailSends,
    brandContext: input.brandContext ?? null,
    brandApiDebug,
  };

  let finalText = "";
  /** Preserves assistant text from rounds that also issued tool calls (finalText only updates on tool-free rounds). */
  let lastNonEmptyRoundText = "";
  const allToolTraces: ToolCallTrace[] = [];
  const allBlocked: ToolCallBlockedTrace[] = [];
  const allExecResults: ToolExecutionResult[] = [];
  const toolsUsed: Array<{ tool: string; detail?: string }> = [];
  const roundTraces: RoundTrace[] = [];
  let roundCount = 0;
  let currentMaxOutputTokens = isResearchLane
    ? Math.min(agent.maxOutputTokens, 2048)
    : agent.maxOutputTokens;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCachedTokens = 0;

  const maxRounds = isResearchLane
    ? Math.min(agent.toolPolicy.maxToolRounds, 3)
    : agent.toolPolicy.maxToolRounds;

  const userForcedToolChoice = detectForcedToolChoice(
    input.userMessage,
    availableTools.map((t) => t.name),
  );
  const continuationForcedToolChoice = detectToolContinuation(
    input.userMessage,
    context.history,
    availableTools.map((t) => t.name),
  );
  const rawForcedToolChoice: GeminiToolChoice | undefined =
    routerForcedToolChoice ??
      userForcedToolChoice ??
      continuationForcedToolChoice;
  const forcedToolChoice: GeminiToolChoice | undefined =
    typeof rawForcedToolChoice === "string" &&
      rawForcedToolChoice !== "required" &&
      availableTools.some((tool) => tool.name === rawForcedToolChoice)
      ? { type: "function", name: rawForcedToolChoice }
      : rawForcedToolChoice;

  if (forcedToolChoice) {
    const choiceStr = typeof forcedToolChoice === "string"
      ? forcedToolChoice
      : `${forcedToolChoice.type}:${forcedToolChoice.name}`;
    const source = routerForcedToolChoice
      ? "router"
      : userForcedToolChoice
      ? "explicit user request"
      : "tool continuation";
    console.log(
      `[agent-loop] forcing tool_choice: ${choiceStr} (${source})`,
    );
  }
  console.log(
    `[agent-loop] starting: agent=${agent.name}, model=${effectiveModel}, provider=${
      useGemini ? "gemini" : "openai"
    }, effort=${reasoningEffort}, tools=${availableTools.length}, maxRounds=${maxRounds}, promptLen=${systemPrompt.length}, promptComposeMs=${promptComposeMs}, toolFilterMs=${toolFilterMs}`,
  );

  for (let round = 0; round <= maxRounds; round++) {
    roundCount++;
    const roundStart = Date.now();

    const useToolChoice: GeminiToolChoice | undefined =
      round === 0 && forcedToolChoice ? forcedToolChoice : undefined;

    const useReasoning = !useGemini && reasoningEffort !== "none";
    const keepHighEffort = reasoningEffortOverride && round <= 4;
    const roundEffort = !useReasoning
      ? "none" as ReasoningEffort
      : keepHighEffort
      ? reasoningEffort
      : round > 0 && reasoningEffort !== "low"
      ? "low" as ReasoningEffort
      : reasoningEffort;
    if (useReasoning && roundEffort !== reasoningEffort) {
      console.log(
        `[agent-loop] round ${
          round + 1
        }: reasoning effort downgraded ${reasoningEffort} → ${roundEffort} (post-tool formatting)`,
      );
    }

    const apiCallStart = Date.now();

    // Unified response variables
    let roundText = "";
    const pendingCalls: PendingToolCall[] = [];
    let roundWebSearch = false;
    let roundInputTokens = 0;
    let roundOutputTokens = 0;
    let roundCachedTokens = 0;
    let responseStatus: string = "completed";
    let responseOutputLength = 0;
    // For Gemini: raw model parts for feeding back into the next round
    let geminiRawParts: import("../ai/gemini.ts").GeminiPart[] = [];
    // For OpenAI: raw response for feeding back
    // deno-lint-ignore no-explicit-any
    let openaiResponse: any = null;

    if (useGemini) {
      // ═══════════════════════ GEMINI PATH ═══════════════════════
      const geminiResult = await geminiGenerateContent({
        model: effectiveModel,
        systemPrompt,
        contents: geminiContents,
        tools: geminiTools.length > 0 ? geminiTools : undefined,
        toolChoice: useToolChoice,
        maxOutputTokens: currentMaxOutputTokens,
      });

      roundText = geminiResult.outputText;
      roundInputTokens = geminiResult.usage.inputTokens;
      roundOutputTokens = geminiResult.usage.outputTokens;
      roundCachedTokens = geminiResult.usage.cachedTokens;
      responseStatus = geminiResult.status;
      responseOutputLength = geminiResult.rawModelParts.length;
      geminiRawParts = geminiResult.rawModelParts;

      for (const fc of geminiResult.functionCalls) {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(fc.arguments);
        } catch { /* empty */ }
        pendingCalls.push({
          id: fc.callId,
          name: fc.name,
          input: parsedArgs,
        });
        geminiCallIdToName.set(fc.callId, fc.name);
        if (fc.name === "web_search" || fc.name === "news_search") {
          roundWebSearch = true;
        }
        const detail = summariseToolDetail(fc.name, parsedArgs);
        toolsUsed.push({ tool: fc.name, ...(detail ? { detail } : {}) });
        console.log(
          `[agent-loop] function_call: ${fc.name} ${
            fc.arguments.substring(0, 200)
          }`,
        );
      }
    } else {
      // ═══════════════════════ OPENAI PATH ═══════════════════════
      const reasoningParams = useReasoning
        ? {
          reasoning: { effort: roundEffort },
          include: ["reasoning.encrypted_content"],
        }
        : {};
      const response = await client.responses.create(
        {
          model: effectiveModel,
          instructions: systemPrompt,
          input: apiInput as Parameters<
            typeof client.responses.create
          >[0]["input"],
          tools: openaiTools as Parameters<
            typeof client.responses.create
          >[0]["tools"],
          max_output_tokens: currentMaxOutputTokens,
          store: false,
          // Cache routing: group by chatId so same-conversation requests hit the
          // same inference server and get prompt prefix cache hits.
          prompt_cache_key: buildPromptCacheKey(input.chatId),
          ...reasoningParams,
          ...(useToolChoice ? { tool_choice: useToolChoice } : {}),
        } as Parameters<typeof client.responses.create>[0],
      );
      openaiResponse = response;

      // deno-lint-ignore no-explicit-any
      const usage = (response as any).usage as
        | Record<string, unknown>
        | undefined;
      roundInputTokens = (usage?.input_tokens as number) ?? 0;
      roundOutputTokens = (usage?.output_tokens as number) ?? 0;
      // OpenAI returns cached_tokens inside input_tokens_details
      // deno-lint-ignore no-explicit-any
      const inputDetails = (usage as any)?.input_tokens_details as
        | Record<string, number>
        | undefined;
      roundCachedTokens = inputDetails?.cached_tokens ?? 0;
      if (roundCachedTokens > 0) {
        console.log(
          `[agent-loop] OpenAI cache hit: ${roundCachedTokens} cached tokens out of ${roundInputTokens} input tokens`,
        );
      }
      roundText = response.output_text ?? "";
      responseStatus = response.status;
      responseOutputLength = response.output.length;

      for (const item of response.output) {
        if (item.type === "function_call") {
          const fc = item as unknown as {
            call_id: string;
            name: string;
            arguments: string;
          };
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(fc.arguments);
          } catch { /* empty */ }
          pendingCalls.push({
            id: fc.call_id,
            name: fc.name,
            input: parsedArgs,
          });
          if (fc.name === "web_search" || fc.name === "news_search") {
            roundWebSearch = true;
          }
          const detail = summariseToolDetail(fc.name, parsedArgs);
          toolsUsed.push({ tool: fc.name, ...(detail ? { detail } : {}) });
          console.log(
            `[agent-loop] function_call: ${fc.name} ${
              fc.arguments.substring(0, 200)
            }`,
          );
        } else if (item.type === "web_search_call") {
          roundWebSearch = true;
          toolsUsed.push({ tool: "web_search" });
          allToolTraces.push({
            name: "web_search",
            namespace: "web.search",
            sideEffect: "read",
            latencyMs: 0,
            outcome: "success",
          });
          console.log(`[agent-loop] web_search_call`);
        }
      }
    }

    const apiCallMs = Date.now() - apiCallStart;
    totalInputTokens += roundInputTokens;
    totalOutputTokens += roundOutputTokens;
    totalCachedTokens += roundCachedTokens;

    console.log(
      `[agent-loop] round ${roundCount}/${
        maxRounds + 1
      }: status=${responseStatus}, items=${responseOutputLength}, textLen=${roundText.length}, apiMs=${apiCallMs}, tokens=${roundInputTokens}in/${roundOutputTokens}out${
        roundCachedTokens > 0 ? `/${roundCachedTokens}cached` : ""
      }`,
    );

    if (roundText.trim().length > 0) {
      lastNonEmptyRoundText = roundText;
    }

    // Handle incomplete response (reasoning exhausted token budget)
    if (responseStatus === "incomplete") {
      if (pendingCalls.length > 0 || roundText.length === 0) {
        const prevMax = currentMaxOutputTokens;
        currentMaxOutputTokens = Math.min(currentMaxOutputTokens * 2, 32768);
        console.log(
          `[agent-loop] token budget exhausted (text=${roundText.length}), retrying with ${currentMaxOutputTokens}`,
        );
        roundTraces.push({
          round: roundCount,
          apiLatencyMs: apiCallMs,
          toolExecLatencyMs: 0,
          totalRoundMs: Date.now() - roundStart,
          inputTokens: roundInputTokens,
          outputTokens: roundOutputTokens,
          cachedTokens: roundCachedTokens,
          status: responseStatus,
          functionCallCount: pendingCalls.length,
          webSearchCalled: roundWebSearch,
          textLength: roundText.length,
          wasRetry: true,
          retryReason:
            `max_output_tokens (${prevMax} → ${currentMaxOutputTokens})`,
          maxOutputTokens: prevMax,
          reasoningEffort: roundEffort,
        });
        continue;
      }
      finalText = roundText;
      roundTraces.push({
        round: roundCount,
        apiLatencyMs: apiCallMs,
        toolExecLatencyMs: 0,
        totalRoundMs: Date.now() - roundStart,
        inputTokens: roundInputTokens,
        outputTokens: roundOutputTokens,
        cachedTokens: roundCachedTokens,
        status: "incomplete_accepted",
        functionCallCount: 0,
        webSearchCalled: roundWebSearch,
        textLength: roundText.length,
        wasRetry: false,
        maxOutputTokens: currentMaxOutputTokens,
        reasoningEffort: roundEffort,
      });
      break;
    }

    // Model spent entire budget on reasoning/search with no text output
    if (
      pendingCalls.length === 0 && roundText.length === 0 &&
      responseOutputLength > 0
    ) {
      if (currentMaxOutputTokens < 32768) {
        const prevMax = currentMaxOutputTokens;
        currentMaxOutputTokens = Math.min(currentMaxOutputTokens * 2, 32768);
        console.warn(
          `[agent-loop] no text produced despite ${responseOutputLength} output items, retrying with ${currentMaxOutputTokens} tokens`,
        );
        roundTraces.push({
          round: roundCount,
          apiLatencyMs: apiCallMs,
          toolExecLatencyMs: 0,
          totalRoundMs: Date.now() - roundStart,
          inputTokens: roundInputTokens,
          outputTokens: roundOutputTokens,
          cachedTokens: roundCachedTokens,
          status: "empty_retry",
          functionCallCount: 0,
          webSearchCalled: roundWebSearch,
          textLength: 0,
          wasRetry: true,
          retryReason:
            `no text output (${prevMax} → ${currentMaxOutputTokens})`,
          maxOutputTokens: prevMax,
          reasoningEffort: roundEffort,
        });
        continue;
      }
    }

    // No function calls — we're done
    if (pendingCalls.length === 0) {
      finalText = roundText;
      roundTraces.push({
        round: roundCount,
        apiLatencyMs: apiCallMs,
        toolExecLatencyMs: 0,
        totalRoundMs: Date.now() - roundStart,
        inputTokens: roundInputTokens,
        outputTokens: roundOutputTokens,
        cachedTokens: roundCachedTokens,
        status: responseStatus,
        functionCallCount: 0,
        webSearchCalled: roundWebSearch,
        textLength: roundText.length,
        wasRetry: false,
        maxOutputTokens: currentMaxOutputTokens,
        reasoningEffort: roundEffort,
      });
      break;
    }

    const conversationHistory = context.recentTurns.map((t) => ({
      role: t.role,
      content: t.content,
    }));
    conversationHistory.push({ role: "user", content: input.userMessage });

    for (const call of pendingCalls) {
      if (call.name === "deep_recall_search" && !call.input.query) {
        call.input.query = input.userMessage;
      }
    }

    const priorTurnToolNames = allExecResults.map((r) => r.toolName);

    const toolExecStart = Date.now();
    const { toolResults, execResults } = await executePoliciedToolCalls(
      pendingCalls,
      toolCtx,
      allowedNamespaces,
      allToolTraces,
      allBlocked,
      conversationHistory,
      priorTurnToolNames,
    );
    const toolExecMs = Date.now() - toolExecStart;
    allExecResults.push(...execResults);

    roundTraces.push({
      round: roundCount,
      apiLatencyMs: apiCallMs,
      toolExecLatencyMs: toolExecMs,
      totalRoundMs: Date.now() - roundStart,
      inputTokens: roundInputTokens,
      outputTokens: roundOutputTokens,
      cachedTokens: roundCachedTokens,
      status: responseStatus,
      functionCallCount: pendingCalls.length,
      webSearchCalled: roundWebSearch,
      textLength: roundText.length,
      wasRetry: false,
      maxOutputTokens: currentMaxOutputTokens,
      reasoningEffort: roundEffort,
    });

    const deterministicWeatherReply = buildEmptyResponseFallback(
      execResults.filter((result) => result.toolName === "weather_lookup"),
      input.userMessage,
    );
    if (deterministicWeatherReply) {
      finalText = deterministicWeatherReply;
      console.warn(
        `[agent-loop] deterministic weather reply after successful weather_lookup`,
      );
      break;
    }

    // Feed back model output + tool results for next round
    if (useGemini) {
      geminiContents.push(modelPartsToGeminiContent(geminiRawParts));
      geminiContents.push(
        toGeminiFunctionResponses(
          toolResults as Array<
            { type: string; call_id: string; output: string }
          >,
          geminiCallIdToName,
        ),
      );
    } else {
      apiInput.push(
        ...openaiResponse.output as unknown as Record<string, unknown>[],
      );
      apiInput.push(...toolResults);
    }

    if (round === maxRounds) {
      const finaliseStart = Date.now();
      const finalisePrompt =
        `${systemPrompt}\n\nFINAL TOOL-ROUND LIMIT REACHED.\nYou must now answer the user from the evidence already gathered. Do not call any more tools. If the evidence is partial, say exactly what is confirmed and what is only likely. Never claim a confident negative unless the checked sources support it.`;

      if (useGemini) {
        const finalGemini = await geminiGenerateContent({
          model: effectiveModel,
          systemPrompt: finalisePrompt,
          contents: geminiContents,
          tools: undefined,
          toolChoice: undefined,
          maxOutputTokens: Math.max(currentMaxOutputTokens, 1200),
        });
        finalText = finalGemini.outputText;
        totalInputTokens += finalGemini.usage.inputTokens;
        totalOutputTokens += finalGemini.usage.outputTokens;
        totalCachedTokens += finalGemini.usage.cachedTokens;
      } else {
        const finalResponse = await client.responses.create({
          model: effectiveModel,
          instructions: finalisePrompt,
          input: apiInput as Parameters<typeof client.responses.create>[0]["input"],
          max_output_tokens: Math.max(currentMaxOutputTokens, 1200),
          store: false,
          prompt_cache_key: buildPromptCacheKey(input.chatId),
        } as Parameters<typeof client.responses.create>[0]);
        finalText = finalResponse.output_text ?? "";
        // deno-lint-ignore no-explicit-any
        const finalUsage = (finalResponse as any).usage as Record<string, unknown> | undefined;
        totalInputTokens += (finalUsage?.input_tokens as number) ?? 0;
        totalOutputTokens += (finalUsage?.output_tokens as number) ?? 0;
        // deno-lint-ignore no-explicit-any
        totalCachedTokens += ((finalUsage as any)?.input_tokens_details?.cached_tokens as number) ?? 0;
      }

      console.warn(
        `[agent-loop] finalised after max tool rounds in ${Date.now() - finaliseStart}ms (textLen=${finalText.length})`,
      );
      break;
    }
  }

  const sideEffects = extractSideEffectsFromExecutor(allExecResults);
  let text = finalText.length > 0 ? finalText : null;

  if (!text && lastNonEmptyRoundText.trim().length > 0) {
    text = lastNonEmptyRoundText.trim();
  }

  if (!text) {
    text = buildEmptyResponseFallback(allExecResults, input.userMessage);
  }
  if (!text) {
    text = buildDeterministicSearchReply(allExecResults);
  }
  if (!text) {
    text = buildPostToolSilenceFallback(allExecResults, input.userMessage);
  }
  const deterministicTravelReply = buildDeterministicTravelReply(
    allExecResults,
    input.userMessage,
  );
  if (deterministicTravelReply) {
    text = deterministicTravelReply;
  }

  const emailDraftExec = [...allExecResults].reverse().find((r) =>
    r.toolName === "email_draft" && r.outcome === "success"
  );
  if (emailDraftExec?.structuredData?.action === "draft") {
    text = formatEmailDraftPreview({
      from: emailDraftExec.structuredData.from as string | null,
      to: emailDraftExec.structuredData.to,
      subject: emailDraftExec.structuredData.subject as string | null,
      bodyText: emailDraftExec.structuredData.bodyText as string | null,
    });
  } else if (
    context.pendingEmailSend &&
    allExecResults.length === 0 &&
    /\bdraft\b/i.test(text ?? "")
  ) {
    text = formatEmailDraftPreview({
      from: context.pendingEmailSend.account,
      to: context.pendingEmailSend.to,
      cc: context.pendingEmailSend.cc,
      bcc: context.pendingEmailSend.bcc,
      subject: context.pendingEmailSend.subject,
      bodyText: context.pendingEmailSend.bodyText,
    });
  }

  text = applyComposioConnectionLinkDeterministicReply(allExecResults, text);

  // Strip tool tags from response text — models mimic [tool_name] patterns
  // from conversation history (added by formatToolNotes) and output them as
  // plain text. Remove unconditionally regardless of whether the tool was
  // actually called; these are internal metadata, never user-facing.
  if (text) {
    const KNOWN_TOOL_TAGS = new Set([
      "email_read",
      "email_draft",
      "email_send",
      "email_update_draft",
      "email_cancel_draft",
      "calendar_read",
      "calendar_write",
      "contacts_read",
      "travel_time",
      "places_search",
      "semantic_search",
      "granola_read",
      "web_search",
      "news_search",
      "plan_steps",
      "weather_lookup",
      "manage_reminder",
      "manage_notification_watch",
      "generate_image",
      "send_reaction",
      "send_effect",
      "remember_user",
      "composio_list_connected_accounts",
      "composio_get_connection_link",
      "composio_search_tools",
      "composio_get_tool_schema",
      "composio_execute_tool",
      "composio_execute_action_tool",
      "composio_list_trigger_types",
      "composio_get_trigger_type",
      "composio_create_trigger",
      "composio_list_active_triggers",
    ]);
    text = text.replace(/\[([a-z_]+)(?:\s[^\]]*)?\]/g, (match, toolName) => {
      if (KNOWN_TOOL_TAGS.has(toolName)) {
        return "";
      }
      return match;
    });
    text = text.replace(/ {2,}/g, " ").trim();
    if (text.length === 0) text = null;
  }

  const usedWebSearch = allToolTraces.some((trace) =>
    trace.name === "web_search" || trace.name === "news_search"
  );
  if (text && usedWebSearch) {
    text = stripWebSearchArtifacts(text);
  }

  const commitToolNames = new Set(["email_send", "calendar_write"]);
  for (const exec of allExecResults) {
    if (commitToolNames.has(exec.toolName) && exec.outcome !== "success") {
      const reason = exec.structuredData?.error ?? exec.outcome;
      console.warn(
        `[agent-loop] commit tool ${exec.toolName} did not succeed (${exec.outcome}), overriding response`,
      );
      text = `That didn't go through — ${reason}. Want me to try again?`;
      break;
    }
  }

  // Hallucination guard: if the model claims a calendar/email action was
  // completed but the corresponding tool was never called (or not even
  // available), override the response to prevent false confirmations.
  if (text) {
    const emailSendExec = allExecResults.find((r) =>
      r.toolName === "email_send"
    );
    const emailSendVerified = emailSendExec?.structuredData?.verified === true
      ? true
      : emailSendExec?.structuredData?.verified === false
      ? false
      : undefined;
    const guarded = applyCommitClaimHallucinationGuard({
      text,
      availableToolNames: availableTools.map((t) => t.name),
      executedToolNames: allExecResults.map((r) => r.toolName),
      emailSendOutcome: emailSendExec?.outcome,
      emailSendVerified,
    });
    if (guarded.overrideReason === "calendar") {
      console.warn(
        `[agent-loop] hallucination guard: model claimed calendar action without calendar_write tool`,
      );
      text = guarded.text;
    } else if (guarded.overrideReason === "email") {
      console.warn(
        `[agent-loop] hallucination guard: model claimed email sent without a successful email_send (outcome=${
          emailSendExec?.outcome ?? "not-called"
        })`,
      );
      text = guarded.text;
    } else if (guarded.overrideReason === "email_unverified") {
      console.warn(
        `[agent-loop] hallucination guard: model claimed email sent but verification failed (verified=${emailSendVerified})`,
      );
      text = guarded.text;
    }
  }

  if (text) {
    const searchPayload = latestSuccessfulSearchBundle(allExecResults);
    const latestTool = latestSuccessfulToolName(allExecResults);
    if (
      searchPayload &&
      (latestTool === "web_search" || latestTool === "news_search")
    ) {
      const guarded = buildSearchConfidenceGuard(
        text,
        searchPayload,
        input.userMessage,
      );
      if (guarded.overridden) {
        console.warn(
          `[agent-loop] search confidence guard: overriding ${searchPayload.mode} reply (${searchPayload.verification.status})`,
        );
        text = guarded.text;
      }
    }
  }

  // Hallucination guard: fabricated account data
  // If the model presents calendar events, email content, or contact details
  // but never called the corresponding read tool, it's fabricating data.
  //
  // Skip this entire block during onboarding: verification-gated tools are
  // intentionally withheld (see applyOnboardingConstraints), so "no access"
  // is always true and broad regexes would replace almost every agentic reply
  // with a generic "verify your account" message.
  if (text && !input.isOnboarding) {
    const executedNames = new Set(allExecResults.map((r) => r.toolName));
    const availableNames = new Set(availableTools.map((t) => t.name));
    const hasComposioToolSurface =
      input.assistantMode === "composio" ||
      [...executedNames].some((n) => n.startsWith("composio_")) ||
      [...availableNames].some((n) => n.startsWith("composio_"));
    const noCalendarAccess = !executedNames.has("calendar_read") &&
      !availableNames.has("calendar_read");
    // Native Nest inbox uses email_read; Composio mode uses composio_* only — do not
    // treat "no email_read" as no access when Composio tools are in play or the
    // user is setting up triggers/automation (different workflow than inbox read).
    const noEmailAccess = !executedNames.has("email_read") &&
      !availableNames.has("email_read") &&
      !hasComposioToolSurface;
    const noContactsAccess = !executedNames.has("contacts_read") &&
      !availableNames.has("contacts_read");
    const hasEmailDraftOrSend =
      executedNames.has("email_draft") ||
      executedNames.has("email_update_draft") ||
      executedNames.has("email_send");
    const hasContactsRead = executedNames.has("contacts_read");

    const onlyThinRecallSearch =
      executedNames.has("semantic_search") &&
      !executedNames.has("email_read") &&
      !executedNames.has("calendar_read") &&
      !executedNames.has("granola_read");
    if (
      onlyThinRecallSearch &&
      PERSONAL_HISTORY_QUESTION.test(input.userMessage ?? "") &&
      CONFIDENT_NEGATIVE_RECALL.test(text)
    ) {
      console.warn(
        `[agent-loop] recall guard: confident negative after semantic_search only`,
      );
      text = "I only checked memory search just then, so I can't answer that confidently. Ask again and I'll run the deeper recall search across email, calendar, and meeting notes.";
    }

    // Only apply each topic-specific hallucination guard when the user's
    // message itself shows some signal of asking about that topic. Without
    // this gate, broad regex patterns (e.g. "your day looks…") hijack replies
    // to unrelated questions like "what can you do" with a topic-specific
    // fallback that makes no sense in context.
    const userMsgLower = (input.userMessage ?? "").toLowerCase();
    const userWantsEmailTriggerOrAutomation =
      /\b(whenever|when i get|let me know when|notify me when|alert me when|tell me when|ping me when|watch (?:for|my)|subscribe (?:to|if)|ongoing automation|event subscription)\b/
        .test(userMsgLower) ||
      /\b(create|register|add|enable|set up)\s+(?:a\s+)?(?:an?\s+)?(?:email\s+)?(?:composio\s+)?trigger\b/
        .test(userMsgLower) ||
      /\bemail\s+trigger\b/.test(userMsgLower);
    const userAskedCalendar =
      /\b(calendar|schedule|meeting|meetings|event|events|appointment|booking|bookings|agenda|diary|free|busy|today|tomorrow|tonight|this (morning|afternoon|evening|week|weekend)|next (week|meeting)|what('?s| is) on|what do i have)\b/
        .test(userMsgLower);
    const userAskedEmail =
      /\b(email|emails|inbox|unread|mail|gmail|outlook|sent|reply|replies|thread|threads|from [a-z0-9._%+-]+@)\b/
        .test(userMsgLower);
    const userAskedEmailInboxRead =
      userAskedEmail && !userWantsEmailTriggerOrAutomation;
    const userAskedContacts =
      /\b(contact|contacts|number|phone|address|reach|email (address|for)|find .{0,20} (email|number|phone))\b/
        .test(userMsgLower);

    // Calendar data fabrication — broad patterns covering many phrasings
    const CALENDAR_DATA_PATTERN =
      /\b(you('ve| have) (got|a|an) .{0,30}(meeting|event|appointment|call|sync|standup|catch.?up|huddle|session|interview)|your (calendar|schedule|day|morning|afternoon|evening|week|tomorrow|today) (shows?|has|looks?|is|seems?)|you('re| are) (free|busy|booked|packed|clear|available)|here'?s (what'?s|your|what).{0,20}(calendar|schedule|day|week)|meeting (at|with|from)|event (at|with|from)|appointment (at|with|from)|nothing (on your calendar|scheduled|planned|booked for)|clear (day|afternoon|morning|evening|schedule|calendar)|looks like (you('ve| have|'re| are)|your .{0,15}(day|calendar|schedule|week))|your (?:next|first|last) (?:meeting|event|call|appointment)|(?:today|tomorrow|this week|this morning|this afternoon|tonight) you (?:have|'ve got|'re)|let me (?:check|pull up|look at) your (?:calendar|schedule)|checking your (?:calendar|schedule)|i can see (?:you have|your .{0,15}(?:calendar|schedule))|(?:^|\n)\s*\d{1,2}[:.]\d{2}\s*(am|pm)|(?:^|\n)\s*[-•]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-—:]\s*\w)\b/im;
    if (
      noCalendarAccess && userAskedCalendar && CALENDAR_DATA_PATTERN.test(text)
    ) {
      console.warn(
        `[agent-loop] hallucination guard: model presented calendar data without calendar_read tool`,
      );
      const hasCalendarConnection = context.connectedAccounts.some((a) =>
        a.scopes.some((s) => s.includes("calendar")) ||
        a.provider === "microsoft"
      );
      text = hasCalendarConnection
        ? "I didn't actually check your calendar just then. Ask again and I'll look properly."
        : context.connectedAccounts.length > 0
        ? "I don't have a calendar connected yet — you can add one at https://nest.expert/dashboard."
        : "I don't have access to your calendar yet. Once you verify your account, I can check that for you.";
    }

    // Email data fabrication — broad patterns
    const EMAIL_DATA_PATTERN =
      /\b(you('ve| have) (got|received|a new)|your (inbox|emails?|latest|unread)|from .{1,30}@|subject:?\s*["""]|email from|message from .{1,30} (about|regarding|says?|asking)|unread (emails?|messages?)|new (emails?|messages?) from|(?:inbox|email) (?:shows?|has|looks?)|let me (?:check|pull up|look at) your (?:inbox|email)|checking your (?:inbox|email)|i can see .{0,20} (?:emails?|messages?|inbox))\b/i;
    if (!hasEmailDraftOrSend && !hasContactsRead && noEmailAccess && userAskedEmailInboxRead && EMAIL_DATA_PATTERN.test(text)) {
      console.warn(
        `[agent-loop] hallucination guard: model presented email data without email_read tool`,
      );
      text = context.connectedAccounts.length > 0
        ? "I didn't actually check your inbox just then. Ask again and I'll look in the connected email account I can see."
        : "I don't have a connected email account on file yet.";
    }

    // Contact data fabrication
    const CONTACT_DATA_PATTERN =
      /\b(their (number|email|phone|address) is|contact (info|details|number)|phone:?\s*[\d(+]|reached at|i can see .{0,20} contacts?)\b/i;
    if (
      noContactsAccess && userAskedContacts && CONTACT_DATA_PATTERN.test(text)
    ) {
      console.warn(
        `[agent-loop] hallucination guard: model presented contact data without contacts_read tool`,
      );
      const hasContactsConnection = context.connectedAccounts.some((a) =>
        a.scopes.some((s) => s.includes("contacts")) ||
        a.provider === "microsoft"
      );
      text = hasContactsConnection
        ? "I didn't actually check your contacts just then. Ask again and I'll look properly."
        : context.connectedAccounts.length > 0
        ? "I don't have contacts access yet — you can set that up at https://nest.expert/dashboard."
        : "I don't have access to your contacts yet. Once you verify your account, I can look that up for you.";
    }
  }

  return {
    text,
    reaction: sideEffects.reaction,
    effect: sideEffects.effect,
    rememberedUser: sideEffects.rememberedUser,
    generatedImage: sideEffects.generatedImage,
    toolCallTraces: allToolTraces,
    toolCallsBlocked: allBlocked,
    rounds: roundCount,
    toolsUsed,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    cachedTokens: totalCachedTokens,
    systemPromptLength: systemPrompt.length,
    systemPrompt,
    initialMessages: [
      ...context.formattedHistory,
      { role: "user", content: context.messageContent },
    ],
    availableToolNames: availableTools.map((t) => t.name),
    effectiveModel,
    roundTraces,
    promptComposeMs,
    toolFilterMs,
  };
}

// ═══════════════════════════════════════════════════════════════
// Tool detail summariser for toolsUsed metadata
// ═══════════════════════════════════════════════════════════════

function summariseToolDetail(
  name: string,
  input: Record<string, unknown>,
): string | undefined {
  switch (name) {
    case "send_reaction":
      return input.type === "custom" && input.custom_emoji
        ? `custom:${input.custom_emoji}`
        : input.type as string;
    case "send_effect":
      return input.effect as string;
    case "remember_user": {
      const parts = [
        input.name ? `name: ${input.name}` : "",
        input.fact ? String(input.fact).substring(0, 50) : "",
      ].filter(Boolean);
      return parts.join(", ") || undefined;
    }
    case "generate_image":
      return (input.prompt as string)?.substring(0, 60);
    case "semantic_search":
      return (input.query as string)?.substring(0, 60);
    case "email_read":
      return (input.query as string)?.substring(0, 60) ??
        (input.message_id as string)?.substring(0, 30);
    case "email_draft": {
      const to = Array.isArray(input.to)
        ? (input.to as string[]).join(", ")
        : String(input.to ?? "");
      return `draft to: ${to.substring(0, 40)}`;
    }
    case "email_update_draft": {
      const parts = [
        input.subject
          ? `subject: ${(input.subject as string).substring(0, 40)}`
          : "",
        input.to ? `to: ${String(input.to).substring(0, 40)}` : "",
      ].filter(Boolean);
      return parts.join(", ") || (input.draft_id as string)?.substring(0, 30);
    }
    case "email_send":
      return (input.draft_id as string)?.substring(0, 30);
    case "email_cancel_draft":
      return (input.draft_id as string)?.substring(0, 30);
    case "travel_time":
      return `${input.origin ?? "?"} → ${input.destination ?? "?"} (${
        input.mode ?? "driving"
      })`;
    case "places_search":
      return (input.query as string)?.substring(0, 60) ??
        `detail: ${(input.place_id as string)?.substring(0, 30)}`;
    case "web_search":
      return (input.query as string)?.substring(0, 60);
    case "news_search": {
      const loc = input.location as string | undefined;
      const topics = input.topics as string | undefined;
      const parts = [
        loc ? `loc: ${loc}` : null,
        topics ? `topics: ${topics.substring(0, 40)}` : "general",
      ].filter(Boolean);
      return parts.join(", ");
    }
    case "brand_customer_lookup":
      return (input.reason as string | undefined)?.substring(0, 60);
    case "brand_inventory_lookup":
    case "brand_workorder_lookup":
    case "brand_sales_lookup":
      return (input.query as string | undefined)?.substring(0, 60);
    case "brand_booking_update": {
      const parts = [
        input.customer_name
          ? `name: ${String(input.customer_name).substring(0, 30)}`
          : "",
        input.bike ? `bike: ${String(input.bike).substring(0, 30)}` : "",
        input.drop_off_date ? `date: ${String(input.drop_off_date)}` : "",
      ].filter(Boolean);
      return parts.join(", ") || "update draft";
    }
    case "brand_booking_create":
      return "create booking";
    case "brand_booking_read":
      return "read booking draft";
    case "brand_deputy_read":
      return (input.query as string | undefined)?.substring(0, 60);
    case "brand_deputy_mutation":
      return (input.request as string | undefined)?.substring(0, 60);
    default:
      return undefined;
  }
}
