import { getOptionalEnv } from "./env.ts";
import { createChat, sendMessage } from "./linq.ts";
import {
  addMessage,
  getConversation,
  type ConversationSummary,
  getConversationSummaries,
  type StoredMessage,
} from "./state.ts";
import { getAdminClient } from "./supabase.ts";
import { NEST_CONVERSATION_FILTER } from "./conversation-engagement.ts";
import { resolveBotNumber, resolveChatId } from "./email-webhook-helpers.ts";
import { youtubeSearchTool } from "./tools/youtube-search.ts";
import type {
  CustomerAutomationActionResult,
  CustomerAutomationProfile,
  CustomerAutomationRuleKey,
  CustomerAutomationRuleState,
  CustomerAutomationTickResult,
} from "./customer-automation-types.ts";
import {
  CUSTOMER_AUTOMATION_PILOT_HANDLES,
  CUSTOMER_DEEP_INTEREST_YOUTUBE_AUTOMATION_TYPE,
  CUSTOMER_DEEP_INTEREST_YOUTUBE_RULE_KEY,
  CUSTOMER_TENTH_MESSAGE_MEDIA_AUTOMATION_TYPE,
  CUSTOMER_TENTH_MESSAGE_MEDIA_RULE_KEY,
} from "./customer-automation-types.ts";

const FALLBACK_PUBLIC_SITE_ORIGIN = "https://nest.expert";
const DEEP_INTEREST_LOOKBACK_HOURS = 72;
const DEEP_INTEREST_MIN_SUMMARY_COUNT = 2;
const DEEP_INTEREST_MIN_MESSAGE_COUNT = 6;
const DEEP_INTEREST_HINT_PATTERN =
  /\b(how do i|how can i|how to|learn|understand|explain|explained|tutorial|guide|walkthrough|getting started|build|make|create|set up)\b/i;
const GENERIC_INTEREST_TOPICS = new Set([
  "assistant",
  "chat",
  "conversation",
  "general",
  "life",
  "nest",
  "stuff",
  "things",
  "updates",
  "work",
]);

interface CustomerAutomationProfileRow {
  handle: string;
  name: string | null;
  bot_number: string | null;
  onboard_count: number | null;
  onboard_state: string | null;
  entry_state: string | null;
  first_value_wedge: string | null;
  activation_score: number | null;
  capability_categories_used: string[] | null;
  auth_user_id: string | null;
  status: string;
  timezone: string | null;
  first_seen: number | null;
  last_seen: number | null;
  deep_profile_snapshot: Record<string, unknown> | null;
  last_proactive_sent_at: string | null;
  last_proactive_ignored: boolean | null;
  proactive_ignore_count: number | null;
}

interface CustomerAutomationRuleStateRow {
  id: number;
  handle: string;
  rule_key: string;
  last_evaluated_at: string | null;
  last_outcome: string | null;
  last_reason: string | null;
  last_metric_value: number | null;
  last_profile_snapshot: Record<string, unknown> | null;
  last_metadata: Record<string, unknown> | null;
  first_eligible_at: string | null;
  send_in_progress_at: string | null;
  last_sent_at: string | null;
  sent_count: number | null;
  last_triggered_by: string | null;
  last_automation_run_id: number | null;
  created_at: string;
  updated_at: string;
}

interface RecordEvaluationInput {
  handle: string;
  ruleKey: CustomerAutomationRuleKey;
  outcome: string;
  reason: string;
  metricValue: number;
  profileSnapshot: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  triggeredBy?: string;
}

interface SendClaimInput {
  handle: string;
  ruleKey: CustomerAutomationRuleKey;
  reason: string;
  metricValue: number;
  profileSnapshot: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  triggeredBy?: string;
}

interface CompleteSendInput {
  handle: string;
  ruleKey: CustomerAutomationRuleKey;
  success: boolean;
  reason: string;
  metadata?: Record<string, unknown>;
  automationRunId?: number | null;
}

export interface RunCustomerAutomationTickOptions {
  handles?: string[];
  limit?: number;
  manual?: boolean;
  triggeredBy?: string;
  forceRuleKey?: CustomerAutomationRuleKey;
}

export function shouldBypassTenthMessageMediaClaim(
  options: { manual: boolean; force: boolean },
): boolean {
  return options.manual && options.force;
}

function normaliseInterestTopic(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9+/#&.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildDeepInterestYoutubeQuery(
  topic: string,
  topicContext: string,
): string {
  const lowerContext = topicContext.toLowerCase();

  if (
    /\b(beginner|beginners|basics|getting started|new to)\b/.test(lowerContext)
  ) {
    return `${topic} beginner guide`;
  }

  if (/\b(build|make|create|set up)\b/.test(lowerContext)) {
    return `${topic} tutorial`;
  }

  if (
    /\b(explain|explained|understand|what is|how does)\b/.test(lowerContext)
  ) {
    return `${topic} explained`;
  }

  return `${topic} tutorial`;
}

function parseFirstYoutubeResult(content: string): ParsedYoutubeResult | null {
  const lines = content.split("\n").map((line) => line.trim()).filter(Boolean);
  let title: string | null = null;
  let channel: string | null = null;
  let url: string | null = null;

  for (const line of lines) {
    if (!title && line.startsWith("Title: ")) {
      title = line.slice("Title: ".length).trim();
      continue;
    }

    if (title && !channel && line.startsWith("Channel: ")) {
      channel = line.slice("Channel: ".length).trim();
      continue;
    }

    if (title && channel && line.startsWith("Link: ")) {
      url = line.slice("Link: ".length).trim();
      break;
    }
  }

  if (!title || !channel || !url) return null;
  return { title, channel, url };
}

function getAutomationFirstName(
  profile: Pick<CustomerAutomationProfile, "name">,
): string | null {
  const trimmed = profile.name?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

function composeDeepInterestYoutubeMessage(
  profile: Pick<CustomerAutomationProfile, "name">,
  topic: string,
  video: ParsedYoutubeResult,
): string {
  const firstName = getAutomationFirstName(profile);
  const greeting = firstName ? `Hey ${firstName}` : "Hey";

  return `${greeting}, you seem properly into ${topic} at the moment, so I found a strong YouTube video for you.\n${video.title} - ${video.channel}\n${video.url}\n\nIf you ever want more like this, just ask me for a video and I'll send one through.`;
}

// ═══════════════════════════════════════════════════════════════
// Inline YouTube — fires on first interesting topic during onboarding
// ═══════════════════════════════════════════════════════════════

const YOUTUBE_INLINE_MIN_ONBOARD = 3;
const YOUTUBE_INLINE_MAX_ONBOARD = 99;

interface InlineTopicExtraction {
  topic: string | null;
  query: string | null;
  reason: string;
}

async function extractInterestingTopicFromMessages(
  messages: StoredMessage[],
): Promise<InlineTopicExtraction> {
  const lines = messages
    .map((m) => `${m.role}: ${(m.content ?? "").slice(0, 500)}`)
    .join("\n")
    .slice(0, 8000);

  if (!lines.trim()) {
    return { topic: null, query: null, reason: "no_messages" };
  }

  try {
    const { geminiSimpleText } = await import("./ai/gemini.ts");
    const { MODEL_MAP } = await import("./ai/models.ts");

    const result = await geminiSimpleText({
      model: MODEL_MAP.fast,
      systemPrompt: `You analyse conversations to detect whether the user has shown genuine interest in a **specific, searchable topic** that would benefit from a YouTube video.

Rules:
- The topic must be something concrete, not vague small-talk.
- REJECT generic topics like: chat, life, stuff, things, Nest, assistant, updates, greetings, weather, how are you.
- REJECT if the user is just testing the assistant with single letters or random words.
- ACCEPT topics like: cold outreach, sourdough baking, Python decorators, AFL draft picks, home renovation tips, etc.
- If multiple topics exist, pick the one the user spent the most messages on.

If a strong topic exists, respond with EXACTLY two lines:
TOPIC: <topic name>
QUERY: <YouTube search query that would find a great explainer or tutorial>

If no clear topic, respond with exactly:
NONE

No other output.`,
      userMessage: `Recent conversation:\n${lines}`,
      maxOutputTokens: 120,
    });

    const output = result.text.trim();
    if (output === "NONE" || !output.includes("TOPIC:")) {
      return { topic: null, query: null, reason: "no_clear_topic" };
    }

    const topicMatch = output.match(/^TOPIC:\s*(.+)$/m);
    const queryMatch = output.match(/^QUERY:\s*(.+)$/m);
    const rawTopic = topicMatch?.[1]?.trim() ?? "";
    const rawQuery = queryMatch?.[1]?.trim() ?? "";

    if (!rawTopic) {
      return { topic: null, query: null, reason: "empty_topic_extraction" };
    }

    const normalised = normaliseInterestTopic(rawTopic);
    if (GENERIC_INTEREST_TOPICS.has(normalised)) {
      return { topic: null, query: null, reason: "generic_topic" };
    }

    const query = rawQuery || `${rawTopic} tutorial`;
    return { topic: rawTopic, query, reason: "topic_detected" };
  } catch (err) {
    console.error(
      "[customer-automations] extractInterestingTopicFromMessages failed:",
      err,
    );
    return { topic: null, query: null, reason: "extraction_error" };
  }
}

async function composeInlineYoutubeMessage(
  profile: Pick<CustomerAutomationProfile, "name">,
  topic: string,
  video: ParsedYoutubeResult,
  priorMessages: StoredMessage[],
): Promise<string> {
  const lines = priorMessages
    .map((m) => `${m.role}: ${(m.content ?? "").slice(0, 500)}`)
    .join("\n")
    .slice(0, 6000);

  try {
    const { geminiSimpleText } = await import("./ai/gemini.ts");
    const { MODEL_MAP } = await import("./ai/models.ts");
    const { cleanResponse } = await import("./imessage-text-format.ts");
    const firstName = profile.name?.trim().split(/\s+/)[0] ?? "";
    const nameHint = firstName ? `The user's first name may be ${firstName}.` : "";

    const result = await geminiSimpleText({
      model: MODEL_MAP.fast,
      systemPrompt: `You are Nest, a casual personal assistant on iMessage. Write ONE short message (max 60 words) to share a YouTube video with the user.

${nameHint}

Requirements:
- Reference something specific from the recent conversation so it feels natural, not random.
- Naturally introduce the video — e.g. "Btw, found this video on [topic] that I reckon you'd like" or "Speaking of [topic], this is worth a watch".
- Include the video details on new lines after your message, like:
[video title] — [channel name]
[video url]
- End with something brief like "Let me know if you want more like this" or similar.
- Warm, casual, Australian English. No emojis unless the user uses lots.

Output only the message text, no quotes or labels.`,
      userMessage: `Recent conversation:\n${lines}\n\nVideo to share:\nTitle: ${video.title}\nChannel: ${video.channel}\nURL: ${video.url}\nTopic: ${topic}`,
      maxOutputTokens: 250,
    });

    const t = cleanResponse(result.text).trim();
    if (t.length > 0) return t;
  } catch (err) {
    console.error(
      "[customer-automations] composeInlineYoutubeMessage failed:",
      err,
    );
  }

  const firstName = getAutomationFirstName(profile);
  const greeting = firstName ? `Hey ${firstName}` : "Hey";
  return `${greeting}, since you were asking about ${topic}, I found this video that's worth a watch.\n${video.title} — ${video.channel}\n${video.url}\n\nLet me know if you want more like this.`;
}

export function isEligibleForInlineYoutube(onboardCount: number): boolean {
  return onboardCount >= YOUTUBE_INLINE_MIN_ONBOARD &&
    onboardCount <= YOUTUBE_INLINE_MAX_ONBOARD &&
    onboardCount !== 10;
}

export async function tryInlineYoutubeSend(
  handle: string,
): Promise<CustomerAutomationActionResult | null> {
  if (!isPilotCustomerHandle(handle)) return null;

  const profiles = await getCustomerAutomationProfiles([handle]);
  const profile = profiles[0];
  if (!profile) return null;

  if (!isEligibleForInlineYoutube(profile.onboardCount)) return null;

  const ruleKey = CUSTOMER_DEEP_INTEREST_YOUTUBE_RULE_KEY;
  const profileSnapshot = buildCustomerAutomationProfileSnapshot(profile);
  const triggeredBy = "inline_youtube_listener";

  const botNumber = await resolveCustomerAutomationBotNumber(profile);
  if (!botNumber) return null;

  const priorMessages = await loadRecentMessagesForPinTip(
    profile.handle,
    botNumber,
  );
  if (priorMessages.length < 4) return null;

  const extraction = await extractInterestingTopicFromMessages(priorMessages);
  if (!extraction.topic || !extraction.query) {
    console.log(
      "[customer-automations] inline YouTube: no topic",
      { handle, reason: extraction.reason, onboardCount: profile.onboardCount },
    );
    return null;
  }

  const claimed = await claimCustomerAutomationSend({
    handle: profile.handle,
    ruleKey,
    reason: extraction.reason,
    metricValue: profile.onboardCount,
    profileSnapshot,
    metadata: {
      source: "inline_youtube_listener",
      topic: extraction.topic,
      youtube_query: extraction.query,
    },
    triggeredBy,
  });

  if (!claimed) {
    console.log(
      "[customer-automations] inline YouTube: already sent/claimed",
      { handle },
    );
    return {
      handle: profile.handle,
      ruleKey,
      status: "skipped",
      reason: "already_sent_or_claimed",
      manual: false,
      metricValue: profile.onboardCount,
    };
  }

  let chatId = await resolveChatId(profile.handle);
  let createdChat = false;

  try {
    const toolResult = await youtubeSearchTool.handler(
      {
        query: extraction.query,
        topic_context: extraction.topic,
      },
      {
        chatId: chatId ?? `DM#${botNumber}#${profile.handle}`,
        senderHandle: profile.handle,
        authUserId: profile.authUserId,
        timezone: profile.timezone,
        pendingEmailSend: null,
        pendingEmailSends: [],
      },
    );

    const video = parseFirstYoutubeResult(toolResult.content);
    if (!video) {
      await completeCustomerAutomationSend({
        handle: profile.handle,
        ruleKey,
        success: false,
        reason: "no_youtube_result",
      });
      return {
        handle: profile.handle,
        ruleKey,
        status: "error",
        reason: "no_youtube_result",
        manual: false,
        metricValue: profile.onboardCount,
      };
    }

    const message = await composeInlineYoutubeMessage(
      profile,
      extraction.topic,
      video,
      priorMessages,
    );

    if (chatId) {
      await sendMessage(chatId, message);
    } else {
      const chatResult = await createChat(
        botNumber,
        [profile.handle],
        message,
      );
      chatId = chatResult.chat.id;
      createdChat = true;
    }

    if (chatId) {
      await addMessage(chatId, "assistant", message, undefined, {
        metadata: {
          source: "inline_youtube_listener",
          topic: extraction.topic,
          youtube_title: video.title,
          youtube_channel: video.channel,
          youtube_url: video.url,
          created_chat: createdChat,
        },
      });
    }

    await completeCustomerAutomationSend({
      handle: profile.handle,
      ruleKey,
      success: true,
      reason: extraction.reason,
      metadata: {
        chat_id: chatId,
        created_chat: createdChat,
        topic: extraction.topic,
        youtube_title: video.title,
        youtube_channel: video.channel,
        youtube_url: video.url,
      },
    });

    const recordChatId = chatId ?? `DM#${botNumber}#${profile.handle}`;
    const automationRunId = await recordCustomerAutomationRun({
      handle: profile.handle,
      chatId: recordChatId,
      automationType: CUSTOMER_DEEP_INTEREST_YOUTUBE_AUTOMATION_TYPE,
      content: message,
      metadata: {
        source: "inline_youtube_listener",
        topic: extraction.topic,
        youtube_title: video.title,
        youtube_channel: video.channel,
        youtube_url: video.url,
      },
      manualTrigger: false,
      triggeredBy,
    });

    if (automationRunId != null) {
      await completeCustomerAutomationSend({
        handle: profile.handle,
        ruleKey,
        success: true,
        reason: extraction.reason,
        metadata: {
          chat_id: chatId,
          topic: extraction.topic,
          youtube_url: video.url,
          automation_run_recorded: true,
        },
        automationRunId,
      });
    }

    console.log(
      "[customer-automations] inline YouTube: sent",
      { handle, topic: extraction.topic, video: video.url },
    );

    return {
      handle: profile.handle,
      ruleKey,
      status: "sent",
      reason: extraction.reason,
      manual: false,
      metricValue: profile.onboardCount,
      chatId,
      automationRunId,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    await completeCustomerAutomationSend({
      handle: profile.handle,
      ruleKey,
      success: false,
      reason: errMsg,
      metadata: {
        chat_id: chatId,
        topic: extraction.topic,
        youtube_query: extraction.query,
      },
    });

    console.error(
      "[customer-automations] inline YouTube: send failed",
      { handle, error: errMsg },
    );

    return {
      handle: profile.handle,
      ruleKey,
      status: "error",
      reason: errMsg,
      manual: false,
      metricValue: profile.onboardCount,
      chatId,
    };
  }
}

interface TenthMessageMediaEvaluation {
  eligible: boolean;
  reason: string;
  metricValue: number;
}

interface DeepInterestYoutubeEvaluation {
  eligible: boolean;
  reason: string;
  metricValue: number;
  topic: string | null;
  matchedSummaryCount: number;
  totalMessageCount: number;
  query: string | null;
  topicContext: string | null;
}

interface ParsedYoutubeResult {
  title: string;
  channel: string;
  url: string;
}

function rowToProfile(
  row: CustomerAutomationProfileRow,
): CustomerAutomationProfile {
  return {
    handle: row.handle,
    name: row.name,
    botNumber: row.bot_number ?? null,
    onboardCount: row.onboard_count ?? 0,
    onboardState: row.onboard_state ?? null,
    entryState: row.entry_state ?? null,
    firstValueWedge: row.first_value_wedge ?? null,
    activationScore: row.activation_score ?? 0,
    capabilityCategoriesUsed: row.capability_categories_used ?? [],
    authUserId: row.auth_user_id ?? null,
    status: row.status,
    timezone: row.timezone ?? null,
    firstSeen: row.first_seen ?? 0,
    lastSeen: row.last_seen ?? 0,
    deepProfileSnapshot: row.deep_profile_snapshot ?? null,
    lastProactiveSentAt: row.last_proactive_sent_at ?? null,
    lastProactiveIgnored: row.last_proactive_ignored ?? false,
    proactiveIgnoreCount: row.proactive_ignore_count ?? 0,
  };
}

function rowToRuleState(
  row: CustomerAutomationRuleStateRow,
): CustomerAutomationRuleState {
  return {
    id: row.id,
    handle: row.handle,
    ruleKey: row.rule_key,
    lastEvaluatedAt: row.last_evaluated_at,
    lastOutcome: row.last_outcome,
    lastReason: row.last_reason,
    lastMetricValue: row.last_metric_value,
    lastProfileSnapshot: row.last_profile_snapshot ?? {},
    lastMetadata: row.last_metadata ?? {},
    firstEligibleAt: row.first_eligible_at,
    sendInProgressAt: row.send_in_progress_at,
    lastSentAt: row.last_sent_at,
    sentCount: row.sent_count ?? 0,
    lastTriggeredBy: row.last_triggered_by,
    lastAutomationRunId: row.last_automation_run_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalisePublicOrigin(value: string | undefined): string {
  if (!value) return FALLBACK_PUBLIC_SITE_ORIGIN;

  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    return `${url.protocol}//${url.host}`;
  } catch {
    return FALLBACK_PUBLIC_SITE_ORIGIN;
  }
}

export function getCustomerAutomationPublicSiteOrigin(): string {
  const explicit = getOptionalEnv("CUSTOMER_AUTOMATION_PUBLIC_SITE_URL") ??
    getOptionalEnv("NEST_PUBLIC_SITE_URL") ??
    getOptionalEnv("PUBLIC_SITE_URL") ??
    getOptionalEnv("SITE_URL") ??
    getOptionalEnv("VITE_PUBLIC_SITE_URL");

  const vercelUrl = getOptionalEnv("VERCEL_URL");
  return normalisePublicOrigin(
    explicit ?? (vercelUrl ? `https://${vercelUrl}` : undefined),
  );
}

/** MP4 on the public site, or override with CUSTOMER_TENTH_MESSAGE_MEDIA_URL. */
export function buildTenthMessageMediaUrl(): string {
  const override = getOptionalEnv("CUSTOMER_TENTH_MESSAGE_MEDIA_URL")?.trim();
  if (override) return override;
  return `${
    getCustomerAutomationPublicSiteOrigin().replace(/\/$/, "")
  }/internal/customer-automations/112_1080x45_shots_so.mp4`;
}

const DEFAULT_PIN_FAVOURITE_COPY =
  "Btw — check out the video below. It shows how to pin Nest as a favourite so this chat is easier to find next time.";

async function loadRecentMessagesForPinTip(
  handle: string,
  botNumber: string | null,
): Promise<StoredMessage[]> {
  const uuidChat = await resolveChatId(handle);
  const chatId = uuidChat ??
    (botNumber ? `DM#${botNumber}#${handle}` : null);
  if (!chatId) return [];
  return await getConversation(chatId, 16, NEST_CONVERSATION_FILTER);
}

async function composeTenthMessagePinFavouriteCopy(
  profile: Pick<CustomerAutomationProfile, "handle" | "name">,
  priorMessages: StoredMessage[],
): Promise<string> {
  const lines = priorMessages
    .map((m) => `${m.role}: ${(m.content ?? "").slice(0, 500)}`)
    .join("\n");
  const truncated = lines.slice(0, 8000);
  if (!truncated.trim()) {
    return DEFAULT_PIN_FAVOURITE_COPY;
  }
  try {
    const { geminiSimpleText } = await import("./ai/gemini.ts");
    const { MODEL_MAP } = await import("./ai/models.ts");
    const { cleanResponse } = await import("./imessage-text-format.ts");
    const firstName = profile.name?.trim().split(/\s+/)[0] ?? "";
    const nameHint = firstName
      ? `The user's first name may be ${firstName}.`
      : "";
    const result = await geminiSimpleText({
      model: MODEL_MAP.fast,
      systemPrompt: `You are Nest, a casual personal assistant on iMessage. Write ONE short message (max 65 words) to the user.

${nameHint}

Requirements:
- Start with a brief, specific nod to something from the recent conversation (a topic, question, or tone) — not generic filler like "thanks for chatting".
- Then transition with "Btw," or "Quick tip —" and tell them the video below shows how to pin Nest as a favourite (Australian spelling: favourite) so this chat is easier to find next time.
- Warm and natural. No hashtags. No emojis unless the user already used lots of emojis.
- Australian English.

Output only the message text, no quotes or labels.`,
      userMessage: `Recent conversation (oldest first):\n${truncated}`,
      maxOutputTokens: 220,
    });
    const t = cleanResponse(result.text).trim();
    if (t.length > 0) return t;
  } catch (e) {
    console.error(
      "[customer-automations] composeTenthMessagePinFavouriteCopy failed:",
      e,
    );
  }
  return DEFAULT_PIN_FAVOURITE_COPY;
}

export function isPilotCustomerHandle(handle: string): boolean {
  return CUSTOMER_AUTOMATION_PILOT_HANDLES.includes(
    handle as typeof CUSTOMER_AUTOMATION_PILOT_HANDLES[number],
  );
}

export function getScopedCustomerAutomationHandles(
  handles?: string[],
): string[] {
  if (!handles || handles.length === 0) {
    return [...CUSTOMER_AUTOMATION_PILOT_HANDLES];
  }

  return [
    ...new Set(
      handles
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .filter(isPilotCustomerHandle),
    ),
  ];
}

export function buildCustomerAutomationProfileSnapshot(
  profile: CustomerAutomationProfile,
): Record<string, unknown> {
  return {
    handle: profile.handle,
    name: profile.name,
    status: profile.status,
    onboard_count: profile.onboardCount,
    onboard_state: profile.onboardState,
    entry_state: profile.entryState,
    first_value_wedge: profile.firstValueWedge,
    activation_score: profile.activationScore,
    capability_categories_used: profile.capabilityCategoriesUsed,
    timezone: profile.timezone,
    first_seen: profile.firstSeen,
    last_seen: profile.lastSeen,
    has_connected_account: !!profile.authUserId,
    last_proactive_sent_at: profile.lastProactiveSentAt,
    last_proactive_ignored: profile.lastProactiveIgnored,
    proactive_ignore_count: profile.proactiveIgnoreCount,
  };
}

export function evaluateTenthMessageMediaRule(
  profile: Pick<CustomerAutomationProfile, "onboardCount">,
  options: { force?: boolean } = {},
): TenthMessageMediaEvaluation {
  const metricValue = profile.onboardCount;

  if (options.force) {
    return {
      eligible: true,
      reason: "manual_force",
      metricValue,
    };
  }

  if (metricValue < 10) {
    return {
      eligible: false,
      reason: "onboard_count_below_10",
      metricValue,
    };
  }

  if (metricValue !== 10) {
    return {
      eligible: false,
      reason: "onboard_count_not_tenth",
      metricValue,
    };
  }

  return {
    eligible: true,
    reason: "tenth_message_reached",
    metricValue,
  };
}

export function evaluateDeepInterestYoutubeRule(
  summaries: Array<
    Pick<
      ConversationSummary,
      "topics" | "summary" | "messageCount" | "lastMessageAt"
    >
  >,
  options: { force?: boolean; now?: Date } = {},
): DeepInterestYoutubeEvaluation {
  const now = options.now ?? new Date();
  const recentSummaries = summaries.filter((summary) => {
    const lastMessageAt = new Date(summary.lastMessageAt).getTime();
    return Number.isFinite(lastMessageAt) &&
      (now.getTime() - lastMessageAt) <=
        DEEP_INTEREST_LOOKBACK_HOURS * 60 * 60 * 1000;
  });

  if (recentSummaries.length === 0) {
    return {
      eligible: false,
      reason: "no_recent_topic_interest",
      metricValue: 0,
      topic: null,
      matchedSummaryCount: 0,
      totalMessageCount: 0,
      query: null,
      topicContext: null,
    };
  }

  const topicSignals = new Map<string, {
    displayTopic: string;
    matchedSummaryCount: number;
    totalMessageCount: number;
    hasLearningIntent: boolean;
    contexts: string[];
  }>();

  for (const summary of recentSummaries) {
    const topics = [
      ...new Set(
        (summary.topics ?? []).map((topic) => topic.trim()).filter(Boolean),
      ),
    ];
    for (const rawTopic of topics) {
      const normalised = normaliseInterestTopic(rawTopic);
      if (normalised.length < 4 || GENERIC_INTEREST_TOPICS.has(normalised)) {
        continue;
      }

      const existing = topicSignals.get(normalised) ?? {
        displayTopic: rawTopic,
        matchedSummaryCount: 0,
        totalMessageCount: 0,
        hasLearningIntent: false,
        contexts: [],
      };

      existing.matchedSummaryCount += 1;
      existing.totalMessageCount += Math.max(1, summary.messageCount ?? 0);
      existing.hasLearningIntent = existing.hasLearningIntent ||
        DEEP_INTEREST_HINT_PATTERN.test(summary.summary);
      if (summary.summary.trim()) {
        existing.contexts.push(summary.summary.trim());
      }
      if (rawTopic.length > existing.displayTopic.length) {
        existing.displayTopic = rawTopic;
      }
      topicSignals.set(normalised, existing);
    }
  }

  const bestCandidate = [...topicSignals.entries()]
    .sort((a, b) => {
      const [, left] = a;
      const [, right] = b;
      if (right.matchedSummaryCount !== left.matchedSummaryCount) {
        return right.matchedSummaryCount - left.matchedSummaryCount;
      }
      return right.totalMessageCount - left.totalMessageCount;
    })[0];

  if (!bestCandidate) {
    return {
      eligible: false,
      reason: "no_specific_topic_detected",
      metricValue: 0,
      topic: null,
      matchedSummaryCount: 0,
      totalMessageCount: 0,
      query: null,
      topicContext: null,
    };
  }

  const [, candidate] = bestCandidate;
  const topicContext = candidate.contexts.slice(0, 3).join(" | ");
  const query = buildDeepInterestYoutubeQuery(
    candidate.displayTopic,
    topicContext,
  );

  if (options.force) {
    return {
      eligible: true,
      reason: "manual_force",
      metricValue: candidate.totalMessageCount,
      topic: candidate.displayTopic,
      matchedSummaryCount: candidate.matchedSummaryCount,
      totalMessageCount: candidate.totalMessageCount,
      query,
      topicContext,
    };
  }

  if (candidate.matchedSummaryCount < DEEP_INTEREST_MIN_SUMMARY_COUNT) {
    return {
      eligible: false,
      reason: "topic_not_repeated_enough",
      metricValue: candidate.totalMessageCount,
      topic: candidate.displayTopic,
      matchedSummaryCount: candidate.matchedSummaryCount,
      totalMessageCount: candidate.totalMessageCount,
      query,
      topicContext,
    };
  }

  if (candidate.totalMessageCount < DEEP_INTEREST_MIN_MESSAGE_COUNT) {
    return {
      eligible: false,
      reason: "interest_not_deep_enough",
      metricValue: candidate.totalMessageCount,
      topic: candidate.displayTopic,
      matchedSummaryCount: candidate.matchedSummaryCount,
      totalMessageCount: candidate.totalMessageCount,
      query,
      topicContext,
    };
  }

  const strongInterest = candidate.hasLearningIntent ||
    candidate.matchedSummaryCount >= 3 ||
    candidate.totalMessageCount >= 10;

  if (!strongInterest) {
    return {
      eligible: false,
      reason: "interest_not_clear_enough",
      metricValue: candidate.totalMessageCount,
      topic: candidate.displayTopic,
      matchedSummaryCount: candidate.matchedSummaryCount,
      totalMessageCount: candidate.totalMessageCount,
      query,
      topicContext,
    };
  }

  return {
    eligible: true,
    reason: "deep_interest_detected",
    metricValue: candidate.totalMessageCount,
    topic: candidate.displayTopic,
    matchedSummaryCount: candidate.matchedSummaryCount,
    totalMessageCount: candidate.totalMessageCount,
    query,
    topicContext,
  };
}

async function recordCustomerAutomationEvaluation(
  input: RecordEvaluationInput,
): Promise<void> {
  const supabase = getAdminClient();
  const { error } = await supabase.rpc(
    "record_customer_automation_evaluation",
    {
      p_handle: input.handle,
      p_rule_key: input.ruleKey,
      p_outcome: input.outcome,
      p_reason: input.reason,
      p_metric_value: input.metricValue,
      p_profile_snapshot: input.profileSnapshot,
      p_metadata: input.metadata ?? {},
      p_triggered_by: input.triggeredBy ?? "system",
    },
  );

  if (error) {
    console.error(
      "[customer-automations] Failed to record evaluation:",
      error.message,
    );
  }
}

async function recordCustomerAutomationRun(params: {
  handle: string;
  chatId: string;
  automationType: string;
  content: string;
  metadata: Record<string, unknown>;
  manualTrigger: boolean;
  triggeredBy: string;
}): Promise<number | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc("record_automation_run", {
    p_handle: params.handle,
    p_chat_id: params.chatId,
    p_automation_type: params.automationType,
    p_content: params.content,
    p_metadata: params.metadata,
    p_manual_trigger: params.manualTrigger,
    p_triggered_by: params.triggeredBy,
  });

  if (error) {
    console.error(
      "[customer-automations] Failed to record automation run:",
      error.message,
    );
    return null;
  }

  if (typeof data === "number") return data;
  if (typeof data === "string") {
    const parsed = Number(data);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function claimCustomerAutomationSend(
  input: SendClaimInput,
): Promise<boolean> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc("claim_customer_automation_send", {
    p_handle: input.handle,
    p_rule_key: input.ruleKey,
    p_metric_value: input.metricValue,
    p_reason: input.reason,
    p_profile_snapshot: input.profileSnapshot,
    p_metadata: input.metadata ?? {},
    p_triggered_by: input.triggeredBy ?? "system",
  });

  if (error) {
    console.error(
      "[customer-automations] Failed to claim send:",
      error.message,
    );
    return false;
  }

  return Boolean(data);
}

async function completeCustomerAutomationSend(
  input: CompleteSendInput,
): Promise<void> {
  const supabase = getAdminClient();
  const { error } = await supabase.rpc("complete_customer_automation_send", {
    p_handle: input.handle,
    p_rule_key: input.ruleKey,
    p_success: input.success,
    p_reason: input.reason,
    p_metadata: input.metadata ?? {},
    p_automation_run_id: input.automationRunId ?? null,
  });

  if (error) {
    console.error(
      "[customer-automations] Failed to complete send:",
      error.message,
    );
  }
}

export async function getCustomerAutomationProfiles(
  handles?: string[],
): Promise<CustomerAutomationProfile[]> {
  const scopedHandles = getScopedCustomerAutomationHandles(handles);
  if (scopedHandles.length === 0) return [];

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("user_profiles")
    .select(
      "handle, name, bot_number, onboard_count, onboard_state, entry_state, first_value_wedge, activation_score, capability_categories_used, auth_user_id, status, timezone, first_seen, last_seen, deep_profile_snapshot, last_proactive_sent_at, last_proactive_ignored, proactive_ignore_count",
    )
    .in("handle", scopedHandles)
    .order("handle", { ascending: true });

  if (error) {
    console.error(
      "[customer-automations] Failed to load profiles:",
      error.message,
    );
    return [];
  }

  return ((data ?? []) as CustomerAutomationProfileRow[]).map(rowToProfile);
}

export async function getCustomerAutomationRuleStates(
  handles?: string[],
): Promise<CustomerAutomationRuleState[]> {
  const scopedHandles = getScopedCustomerAutomationHandles(handles);
  if (scopedHandles.length === 0) return [];

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("customer_automation_rule_state")
    .select("*")
    .in("handle", scopedHandles)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error(
      "[customer-automations] Failed to load rule state:",
      error.message,
    );
    return [];
  }

  return ((data ?? []) as CustomerAutomationRuleStateRow[]).map(rowToRuleState);
}

export async function getCustomerAutomationHistory(
  handle: string,
  limit = 20,
): Promise<Record<string, unknown>[]> {
  if (!isPilotCustomerHandle(handle)) return [];

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("automation_runs")
    .select(
      "id, handle, chat_id, automation_type, content, metadata, manual_trigger, triggered_by, sent_at",
    )
    .eq("handle", handle)
    .in("automation_type", [
      CUSTOMER_TENTH_MESSAGE_MEDIA_AUTOMATION_TYPE,
      CUSTOMER_DEEP_INTEREST_YOUTUBE_AUTOMATION_TYPE,
      "bill_reminders",
    ])
    .order("sent_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 100)));

  if (error) {
    console.error(
      "[customer-automations] Failed to load history:",
      error.message,
    );
    return [];
  }

  return (data ?? []) as Record<string, unknown>[];
}

async function sendTenthMessageMedia(
  profile: CustomerAutomationProfile,
  options: {
    manual: boolean;
    force: boolean;
    triggeredBy: string;
    metricValue: number;
    reason: string;
  },
): Promise<CustomerAutomationActionResult> {
  const ruleKey = CUSTOMER_TENTH_MESSAGE_MEDIA_RULE_KEY;
  const profileSnapshot = buildCustomerAutomationProfileSnapshot(profile);
  const mediaUrl = buildTenthMessageMediaUrl();
  const botForHistory = profile.botNumber ??
    await resolveBotNumber(profile.handle);
  const priorMessages = await loadRecentMessagesForPinTip(
    profile.handle,
    botForHistory,
  );
  const bodyText = await composeTenthMessagePinFavouriteCopy(
    profile,
    priorMessages,
  );
  const bypassClaim = shouldBypassTenthMessageMediaClaim({
    manual: options.manual,
    force: options.force,
  });
  const metadata = {
    rule_key: ruleKey,
    media_url: mediaUrl,
    threshold: 10,
    onboard_count: options.metricValue,
    source: "customer_automation_engine",
    manual: options.manual,
    force_override: bypassClaim,
    profile_snapshot: profileSnapshot,
    pin_tip_message: bodyText,
    prior_message_count: priorMessages.length,
  } satisfies Record<string, unknown>;

  if (bypassClaim) {
    await recordCustomerAutomationEvaluation({
      handle: profile.handle,
      ruleKey,
      outcome: "eligible",
      reason: options.reason,
      metricValue: options.metricValue,
      profileSnapshot,
      metadata,
      triggeredBy: options.triggeredBy,
    });
  } else {
    const claimed = await claimCustomerAutomationSend({
      handle: profile.handle,
      ruleKey,
      reason: options.reason,
      metricValue: options.metricValue,
      profileSnapshot,
      metadata,
      triggeredBy: options.triggeredBy,
    });

    if (!claimed) {
      await recordCustomerAutomationEvaluation({
        handle: profile.handle,
        ruleKey,
        outcome: "skip",
        reason: "already_sent_or_claimed",
        metricValue: options.metricValue,
        profileSnapshot,
        metadata,
        triggeredBy: options.triggeredBy,
      });

      return {
        handle: profile.handle,
        ruleKey,
        status: "skipped",
        reason: "already_sent_or_claimed",
        manual: options.manual,
        metricValue: options.metricValue,
      };
    }
  }

  let chatId = await resolveChatId(profile.handle);
  let createdChat = false;

  try {
    if (chatId) {
      await sendMessage(chatId, bodyText, undefined, [{ url: mediaUrl }]);
    } else {
      const botNumber = profile.botNumber ??
        await resolveBotNumber(profile.handle);
      if (!botNumber) {
        throw new Error("No bot number available for media send");
      }

      const chatResult = await createChat(
        botNumber,
        [profile.handle],
        bodyText,
        [{ url: mediaUrl }],
      );
      chatId = chatResult.chat.id;
      createdChat = true;
    }

    if (chatId) {
      await addMessage(chatId, "assistant", bodyText, undefined, {
        metadata: {
          ...metadata,
          created_chat: createdChat,
        },
      });
    }

    await completeCustomerAutomationSend({
      handle: profile.handle,
      ruleKey,
      success: true,
      reason: options.reason,
      metadata: {
        media_url: mediaUrl,
        chat_id: chatId,
        created_chat: createdChat,
      },
    });

    const recordChatId = chatId ??
      `DM#${profile.botNumber ?? "unknown"}#${profile.handle}`;
    const automationRunId = await recordCustomerAutomationRun({
      handle: profile.handle,
      chatId: recordChatId,
      automationType: CUSTOMER_TENTH_MESSAGE_MEDIA_AUTOMATION_TYPE,
      content: bodyText,
      metadata,
      manualTrigger: options.manual,
      triggeredBy: options.triggeredBy,
    });

    if (automationRunId != null) {
      await completeCustomerAutomationSend({
        handle: profile.handle,
        ruleKey,
        success: true,
        reason: options.reason,
        metadata: {
          media_url: mediaUrl,
          chat_id: chatId,
          created_chat: createdChat,
          automation_run_recorded: true,
        },
        automationRunId,
      });
    }

    return {
      handle: profile.handle,
      ruleKey,
      status: "sent",
      reason: options.reason,
      manual: options.manual,
      metricValue: options.metricValue,
      chatId,
      automationRunId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await completeCustomerAutomationSend({
      handle: profile.handle,
      ruleKey,
      success: false,
      reason: message,
      metadata: {
        media_url: mediaUrl,
        chat_id: chatId,
        created_chat: createdChat,
      },
    });

    return {
      handle: profile.handle,
      ruleKey,
      status: "error",
      reason: message,
      manual: options.manual,
      metricValue: options.metricValue,
      chatId,
    };
  }
}

async function resolveCustomerAutomationBotNumber(
  profile: Pick<CustomerAutomationProfile, "handle" | "botNumber">,
): Promise<string | null> {
  if (profile.botNumber) return profile.botNumber;
  return await resolveBotNumber(profile.handle);
}

async function sendDeepInterestYoutube(
  profile: CustomerAutomationProfile,
  evaluation: DeepInterestYoutubeEvaluation,
  options: {
    manual: boolean;
    force: boolean;
    triggeredBy: string;
  },
): Promise<CustomerAutomationActionResult> {
  const ruleKey = CUSTOMER_DEEP_INTEREST_YOUTUBE_RULE_KEY;
  const profileSnapshot = buildCustomerAutomationProfileSnapshot(profile);
  const bypassClaim = shouldBypassTenthMessageMediaClaim({
    manual: options.manual,
    force: options.force,
  });
  const topic = evaluation.topic?.trim() ?? "";
  const query = evaluation.query?.trim() ?? "";

  if (!topic || !query) {
    return {
      handle: profile.handle,
      ruleKey,
      status: "skipped",
      reason: "missing_topic_or_query",
      manual: options.manual,
      metricValue: evaluation.metricValue,
    };
  }

  const metadata = {
    rule_key: ruleKey,
    topic,
    youtube_query: query,
    interest_summary_count: evaluation.matchedSummaryCount,
    interest_message_count: evaluation.totalMessageCount,
    source: "customer_automation_engine",
    manual: options.manual,
    force_override: bypassClaim,
    profile_snapshot: profileSnapshot,
  } satisfies Record<string, unknown>;

  if (bypassClaim) {
    await recordCustomerAutomationEvaluation({
      handle: profile.handle,
      ruleKey,
      outcome: "eligible",
      reason: evaluation.reason,
      metricValue: evaluation.metricValue,
      profileSnapshot,
      metadata,
      triggeredBy: options.triggeredBy,
    });
  } else {
    const claimed = await claimCustomerAutomationSend({
      handle: profile.handle,
      ruleKey,
      reason: evaluation.reason,
      metricValue: evaluation.metricValue,
      profileSnapshot,
      metadata,
      triggeredBy: options.triggeredBy,
    });

    if (!claimed) {
      await recordCustomerAutomationEvaluation({
        handle: profile.handle,
        ruleKey,
        outcome: "skip",
        reason: "already_sent_or_claimed",
        metricValue: evaluation.metricValue,
        profileSnapshot,
        metadata,
        triggeredBy: options.triggeredBy,
      });

      return {
        handle: profile.handle,
        ruleKey,
        status: "skipped",
        reason: "already_sent_or_claimed",
        manual: options.manual,
        metricValue: evaluation.metricValue,
      };
    }
  }

  let chatId = await resolveChatId(profile.handle);
  let createdChat = false;

  try {
    const botNumber = await resolveCustomerAutomationBotNumber(profile);
    if (!botNumber) {
      throw new Error("No bot number available for YouTube follow-up");
    }

    const toolResult = await youtubeSearchTool.handler(
      {
        query,
        topic_context: evaluation.topicContext ?? topic,
      },
      {
        chatId: chatId ?? `DM#${botNumber}#${profile.handle}`,
        senderHandle: profile.handle,
        authUserId: profile.authUserId,
        timezone: profile.timezone,
        pendingEmailSend: null,
        pendingEmailSends: [],
      },
    );

    const video = parseFirstYoutubeResult(toolResult.content);
    if (!video) {
      throw new Error(
        "Could not parse a YouTube result for the selected topic",
      );
    }

    const message = composeDeepInterestYoutubeMessage(profile, topic, video);

    if (chatId) {
      await sendMessage(chatId, message);
    } else {
      const chatResult = await createChat(
        botNumber,
        [profile.handle],
        message,
      );
      chatId = chatResult.chat.id;
      createdChat = true;
    }

    if (chatId) {
      await addMessage(chatId, "assistant", message, undefined, {
        metadata: {
          ...metadata,
          created_chat: createdChat,
          youtube_title: video.title,
          youtube_channel: video.channel,
          youtube_url: video.url,
        },
      });
    }

    await completeCustomerAutomationSend({
      handle: profile.handle,
      ruleKey,
      success: true,
      reason: evaluation.reason,
      metadata: {
        chat_id: chatId,
        created_chat: createdChat,
        topic,
        youtube_title: video.title,
        youtube_channel: video.channel,
        youtube_url: video.url,
      },
    });

    const recordChatId = chatId ?? `DM#${botNumber}#${profile.handle}`;
    const automationRunId = await recordCustomerAutomationRun({
      handle: profile.handle,
      chatId: recordChatId,
      automationType: CUSTOMER_DEEP_INTEREST_YOUTUBE_AUTOMATION_TYPE,
      content: message,
      metadata: {
        ...metadata,
        youtube_title: video.title,
        youtube_channel: video.channel,
        youtube_url: video.url,
      },
      manualTrigger: options.manual,
      triggeredBy: options.triggeredBy,
    });

    if (automationRunId != null) {
      await completeCustomerAutomationSend({
        handle: profile.handle,
        ruleKey,
        success: true,
        reason: evaluation.reason,
        metadata: {
          chat_id: chatId,
          created_chat: createdChat,
          topic,
          youtube_url: video.url,
          automation_run_recorded: true,
        },
        automationRunId,
      });
    }

    return {
      handle: profile.handle,
      ruleKey,
      status: "sent",
      reason: evaluation.reason,
      manual: options.manual,
      metricValue: evaluation.metricValue,
      chatId,
      automationRunId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await completeCustomerAutomationSend({
      handle: profile.handle,
      ruleKey,
      success: false,
      reason: message,
      metadata: {
        chat_id: chatId,
        created_chat: createdChat,
        topic,
        youtube_query: query,
      },
    });

    return {
      handle: profile.handle,
      ruleKey,
      status: "error",
      reason: message,
      manual: options.manual,
      metricValue: evaluation.metricValue,
      chatId,
    };
  }
}

async function runTenthMessageMediaRule(
  profile: CustomerAutomationProfile,
  options: { manual: boolean; triggeredBy: string; force: boolean },
): Promise<CustomerAutomationActionResult> {
  const evaluation = evaluateTenthMessageMediaRule(profile, {
    force: options.force,
  });
  const ruleKey = CUSTOMER_TENTH_MESSAGE_MEDIA_RULE_KEY;
  const profileSnapshot = buildCustomerAutomationProfileSnapshot(profile);
  const metadata = {
    source: "customer_automation_engine",
    manual: options.manual,
    threshold: 10,
    forced: options.force,
  } satisfies Record<string, unknown>;

  if (!evaluation.eligible) {
    await recordCustomerAutomationEvaluation({
      handle: profile.handle,
      ruleKey,
      outcome: "skip",
      reason: evaluation.reason,
      metricValue: evaluation.metricValue,
      profileSnapshot,
      metadata,
      triggeredBy: options.triggeredBy,
    });

    return {
      handle: profile.handle,
      ruleKey,
      status: "skipped",
      reason: evaluation.reason,
      manual: options.manual,
      metricValue: evaluation.metricValue,
    };
  }

  return await sendTenthMessageMedia(profile, {
    manual: options.manual,
    force: options.force,
    triggeredBy: options.triggeredBy,
    metricValue: evaluation.metricValue,
    reason: evaluation.reason,
  });
}

async function runDeepInterestYoutubeRule(
  profile: CustomerAutomationProfile,
  options: { manual: boolean; triggeredBy: string; force: boolean },
): Promise<CustomerAutomationActionResult> {
  const ruleKey = CUSTOMER_DEEP_INTEREST_YOUTUBE_RULE_KEY;
  const profileSnapshot = buildCustomerAutomationProfileSnapshot(profile);
  const metadata = {
    source: "customer_automation_engine",
    manual: options.manual,
    forced: options.force,
  } satisfies Record<string, unknown>;

  const botNumber = await resolveCustomerAutomationBotNumber(profile);
  if (!botNumber) {
    await recordCustomerAutomationEvaluation({
      handle: profile.handle,
      ruleKey,
      outcome: "skip",
      reason: "no_bot_number",
      metricValue: 0,
      profileSnapshot,
      metadata,
      triggeredBy: options.triggeredBy,
    });

    return {
      handle: profile.handle,
      ruleKey,
      status: "skipped",
      reason: "no_bot_number",
      manual: options.manual,
      metricValue: 0,
    };
  }

  const chatId = `DM#${botNumber}#${profile.handle}`;
  const summaries = await getConversationSummaries(
    chatId,
    8,
    NEST_CONVERSATION_FILTER,
  );
  const evaluation = evaluateDeepInterestYoutubeRule(summaries, {
    force: options.force,
  });

  if (!evaluation.eligible) {
    await recordCustomerAutomationEvaluation({
      handle: profile.handle,
      ruleKey,
      outcome: "skip",
      reason: evaluation.reason,
      metricValue: evaluation.metricValue,
      profileSnapshot,
      metadata: {
        ...metadata,
        topic: evaluation.topic,
        youtube_query: evaluation.query,
        interest_summary_count: evaluation.matchedSummaryCount,
        interest_message_count: evaluation.totalMessageCount,
      },
      triggeredBy: options.triggeredBy,
    });

    return {
      handle: profile.handle,
      ruleKey,
      status: "skipped",
      reason: evaluation.reason,
      manual: options.manual,
      metricValue: evaluation.metricValue,
    };
  }

  return await sendDeepInterestYoutube(profile, evaluation, options);
}

export async function runCustomerAutomationTick(
  options: RunCustomerAutomationTickOptions = {},
): Promise<CustomerAutomationTickResult> {
  const manual = options.manual ?? false;
  const triggeredBy = options.triggeredBy ?? (manual ? "dashboard" : "system");
  const profiles = await getCustomerAutomationProfiles(options.handles);
  const requestedRule = options.forceRuleKey ?? null;
  const actions: CustomerAutomationActionResult[] = [];
  const profilesToProcess = profiles.slice(
    0,
    Math.max(1, Math.min(options.limit ?? 50, 100)),
  );

  for (const profile of profilesToProcess) {
    if (requestedRule === CUSTOMER_TENTH_MESSAGE_MEDIA_RULE_KEY) {
      actions.push(
        await runTenthMessageMediaRule(profile, {
          manual,
          triggeredBy,
          force: true,
        }),
      );
      continue;
    }

    if (requestedRule === CUSTOMER_DEEP_INTEREST_YOUTUBE_RULE_KEY) {
      actions.push(
        await runDeepInterestYoutubeRule(profile, {
          manual,
          triggeredBy,
          force: true,
        }),
      );
      continue;
    }

    const orderedRules = [
      () =>
        runTenthMessageMediaRule(profile, {
          manual,
          triggeredBy,
          force: false,
        }),
      () =>
        runDeepInterestYoutubeRule(profile, {
          manual,
          triggeredBy,
          force: false,
        }),
    ];

    for (const runRule of orderedRules) {
      const result = await runRule();
      actions.push(result);
      if (result.status === "sent") break;
    }
  }

  const sent = actions.filter((action) => action.status === "sent").length;
  const skipped =
    actions.filter((action) => action.status === "skipped").length;
  const errors = actions.filter((action) => action.status === "error").length;

  return {
    message:
      `Processed ${profilesToProcess.length} customer automation profile(s)`,
    processed: profilesToProcess.length,
    sent,
    skipped,
    errors,
    handles: profilesToProcess.map((profile) => profile.handle),
    actions,
  };
}
