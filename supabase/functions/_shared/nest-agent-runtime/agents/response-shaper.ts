import { getOpenAIClient, getResponseText, MODEL_MAP } from "../../ai/models.ts";
import { NEST_IMESSAGE_FORMATTING_RULES } from "./imessage-formatting.ts";

function cleanIMessageText(text: string): string {
  return text
    .replace(/#{1,6}\s*/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$2")
    .replace(/\n\nIf you want,[\s\S]*$/i, "")
    .replace(/\n\nIf you'd like,[\s\S]*$/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function containsEmoji(text: string): boolean {
  return /\p{Extended_Pictographic}/u.test(text);
}

function stripEmoji(text: string): string {
  return text.replace(/\p{Extended_Pictographic}/gu, "").replace(/\s{2,}/g, " ").trim();
}

export async function writeCasualIMessageReply(args: {
  userMessage: string;
  timezone: string | null;
  recentTurns?: Array<{ role: "user" | "assistant"; content: string }>;
  userProfile?: {
    name: string | null;
    facts: string[];
    contextProfile?: Record<string, unknown> | null;
    genz?: boolean;
  } | null;
}): Promise<string> {
  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: MODEL_MAP.brand_chat,
    instructions: [
      "You are Nest in iMessage.",
      "Reply naturally to casual chat, greetings, banter, or lightweight conversation.",
      NEST_IMESSAGE_FORMATTING_RULES,
      "Keep it short, warm, and human. Usually 1 sentence.",
      "Do not say generic assistant filler like 'Got it. How can I help?' unless the user explicitly asked for help.",
      "Do not mention tools, routing, JSON, or internal state.",
    ].join("\n"),
    input: [
      {
        role: "user",
        content: [
          `User message: ${args.userMessage}`,
          `Timezone: ${args.timezone ?? "Australia/Melbourne"}`,
          args.userProfile
            ? `User profile:\nName: ${args.userProfile.name ?? "unknown"}\nFacts: ${args.userProfile.facts.slice(0, 12).join("; ") || "none"}\nContext profile: ${
              args.userProfile.contextProfile ? JSON.stringify(args.userProfile.contextProfile).slice(0, 1200) : "none"
            }\nGen Z voice: ${args.userProfile.genz === true ? "yes" : "no"}`
            : "User profile: none",
          args.recentTurns?.length
            ? `Recent conversation:\n${args.recentTurns.slice(-20).map((turn) => `${turn.role}: ${turn.content.replace(/\s+/g, " ").slice(0, 500)}`).join("\n")}`
            : "Recent conversation: none",
        ].join("\n"),
      },
    ],
    max_output_tokens: 120,
    store: false,
    prompt_cache_key: "NESTV3-casual-imessage",
    reasoning: { effort: "low" as const },
  } as Parameters<typeof client.responses.create>[0]);

  const cleaned = cleanIMessageText(getResponseText(response));
  return (containsEmoji(args.userMessage) ? cleaned : stripEmoji(cleaned)) || "Hey — I’m here.";
}

export async function shapeEvidenceForIMessage(args: {
  userMessage: string;
  evidence: Record<string, unknown> | string;
  timezone: string | null;
}): Promise<string> {
  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: MODEL_MAP.agent,
    instructions: [
      "You write final iMessage replies for Nest.",
      NEST_IMESSAGE_FORMATTING_RULES,
      "Do not expose debug evidence, source lists, confidence percentages, JSON, or tool internals.",
      "Answer the user's question directly in the first sentence.",
      "Be concise: usually 1 short paragraph. Add one extra sentence only if needed for ambiguity.",
      "For web/current-event answers, cite source names only if the user asked for sources.",
      "If evidence conflicts, say the uncertainty naturally, not as a debug report.",
    ].join("\n"),
    input: [
      {
        role: "user",
        content: [
          `User message: ${args.userMessage}`,
          `Runtime timezone: ${args.timezone ?? "Australia/Melbourne"}`,
          `Evidence:\n${typeof args.evidence === "string" ? args.evidence : JSON.stringify(args.evidence).slice(0, 12000)}`,
        ].join("\n\n"),
      },
    ],
    max_output_tokens: 700,
    store: false,
    prompt_cache_key: "NESTV3-imessage-response-shaper",
    reasoning: { effort: "low" as const },
  } as Parameters<typeof client.responses.create>[0]);

  return cleanIMessageText(getResponseText(response));
}

export async function inferLocalToolInput(args: {
  userMessage: string;
  toolName: "places_search" | "travel_time";
  timezone: string | null;
}): Promise<Record<string, unknown>> {
  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: MODEL_MAP.brand_chat,
    instructions: [
      "You convert an iMessage request into arguments for one local Google Maps tool.",
      "Return strict JSON only.",
      "For places_search return {\"query\":\"...\",\"location\":\"... optional\",\"max_results\":3}. Use the full useful search phrase if uncertain.",
      "For travel_time return {\"origin\":\"...\",\"destination\":\"...\",\"mode\":\"driving|transit|walking|bicycling\",\"departure_time\":\"now\"}.",
      "Use transit for train, bus, tram, public transport, SkyBus, or 'how do I get there' unless the user asks to drive, walk, or cycle.",
      "If origin or destination is missing for travel_time, infer only when the wording clearly supplies it; otherwise return the best JSON with any missing field omitted.",
      "Bare local datetimes should stay as local ISO-like strings and rely on the tool timezone handling.",
    ].join("\n"),
    input: [{
      role: "user",
      content: [
        `Tool: ${args.toolName}`,
        `User message: ${args.userMessage}`,
        `Timezone: ${args.timezone ?? "Australia/Melbourne"}`,
      ].join("\n"),
    }],
    max_output_tokens: 400,
    store: false,
    prompt_cache_key: "NESTV3-local-tool-input",
    reasoning: { effort: "low" as const },
  } as Parameters<typeof client.responses.create>[0]);

  const text = getResponseText(response).trim();
  const jsonText = text.match(/\{[\s\S]*\}/)?.[0] ?? text;
  const parsed = JSON.parse(jsonText) as Record<string, unknown>;
  if (args.toolName === "places_search" && typeof parsed.query !== "string") {
    parsed.query = args.userMessage;
  }
  if (args.toolName === "places_search" && parsed.max_results === undefined) {
    parsed.max_results = 3;
  }
  return parsed;
}

export async function shapeLocalToolForIMessage(args: {
  userMessage: string;
  toolName: "places_search" | "travel_time";
  evidence: Record<string, unknown> | string;
  timezone: string | null;
}): Promise<string> {
  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: MODEL_MAP.agent,
    instructions: [
      "You write final iMessage replies for Nest using Google Maps tool results.",
      NEST_IMESSAGE_FORMATTING_RULES,
      "The tool result is the source of truth. Do not invent ratings, addresses, travel times, opening hours, routes, or phone numbers.",
      "For places, give the best 1-3 options with the practical details that matter: name, area/address, rating/open status/phone only when present.",
      "For directions or travel time, lead with the answer: time, mode, whether they'll make it, and the key route details when present.",
      "Mention Google Maps naturally only when useful, e.g. 'Google Maps is showing...'.",
      "If the Maps tool says it is not configured and gives a fallback query, say you couldn't check Maps directly and answer only if the evidence contains a real fallback result.",
    ].join("\n"),
    input: [{
      role: "user",
      content: [
        `User message: ${args.userMessage}`,
        `Tool: ${args.toolName}`,
        `Runtime timezone: ${args.timezone ?? "Australia/Melbourne"}`,
        `Google Maps result:\n${typeof args.evidence === "string" ? args.evidence : JSON.stringify(args.evidence).slice(0, 12000)}`,
      ].join("\n\n"),
    }],
    max_output_tokens: 700,
    store: false,
    prompt_cache_key: "NESTV3-local-maps-shaper",
    reasoning: { effort: "low" as const },
  } as Parameters<typeof client.responses.create>[0]);

  return cleanIMessageText(getResponseText(response));
}

export async function inferOneShotFollowUpSchedule(args: {
  userMessage: string;
  evidence: Record<string, unknown> | string;
  timezone: string | null;
}): Promise<{ nextRunAt: string; explanation: string }> {
  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: MODEL_MAP.agent,
    instructions: [
      "You infer a safe one-shot follow-up time for a scheduled assistant task.",
      "Return strict JSON only: {\"nextRunAt\":\"ISO timestamp\",\"explanation\":\"short human label\"}.",
      "Use the runtime timezone and current evidence. Schedule after the event is expected to finish, with a practical buffer.",
      "If the exact finish time is unknown, estimate conservatively from fixture start time and sport format.",
      "Do not schedule in the past. If the event already finished, set nextRunAt to now plus 2 minutes.",
    ].join("\n"),
    input: [
      {
        role: "user",
        content: [
          `User message: ${args.userMessage}`,
          `Runtime timezone: ${args.timezone ?? "Australia/Melbourne"}`,
          `Evidence:\n${typeof args.evidence === "string" ? args.evidence : JSON.stringify(args.evidence).slice(0, 12000)}`,
          `Now: ${new Date().toISOString()}`,
        ].join("\n\n"),
      },
    ],
    max_output_tokens: 500,
    store: false,
    prompt_cache_key: "NESTV3-one-shot-scheduler",
    reasoning: { effort: "low" as const },
  } as Parameters<typeof client.responses.create>[0]);

  const text = getResponseText(response).trim();
  const jsonText = text.match(/\{[\s\S]*\}/)?.[0] ?? text;
  const parsed = JSON.parse(jsonText) as { nextRunAt?: string; explanation?: string };
  const nextRunAt = parsed.nextRunAt && !Number.isNaN(new Date(parsed.nextRunAt).getTime())
    ? new Date(parsed.nextRunAt).toISOString()
    : new Date(Date.now() + 2 * 60 * 1000).toISOString();
  return {
    nextRunAt,
    explanation: parsed.explanation ?? "after the event is expected to finish",
  };
}
