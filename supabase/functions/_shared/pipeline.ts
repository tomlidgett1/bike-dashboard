import { generateImage, getTextForEffect } from "./claude.ts";
import { editImage, generateImageNanoBanana } from "./nano-banana.ts";
import { handleTurn } from "./orchestrator/handle-turn.ts";
import type {
  OnboardingContext,
  ResolvedUserContext,
  TurnInput,
} from "./orchestrator/types.ts";
import {
  addMessage,
  addMessageStrict,
  addUserFact,
  assignExperiment,
  bufferPendingInboundImages,
  consumePendingInboundImages,
  emitOnboardingEvent,
  ensureNestUser,
  getConversation,
  getUserExperiments,
  getUserTimezone,
  logOutboundMessage,
  markProactiveReplied,
  markWebhookEventStatus,
  reportBug,
  setUserName,
  transitionOnboardState,
  updateOnboardState,
  updateUserTimezone,
} from "./state.ts";
import type { WebhookEventRow } from "./state.ts";
import * as linqApi from "./linq.ts";
import type {
  MediaAttachment,
  MessageEffect,
  NormalisedIncomingMessage,
  Reaction,
} from "./linq.ts";
import { MEMORY_V2_ENABLED } from "./env.ts";
import { internalJsonHeaders } from "./internal-auth.ts";
import type { ValueWedge } from "./state.ts";
// Composio mode is no longer triggered by "hey comp" / "hey nest" keywords or
// per-chat session rows. It is controlled exclusively by the env-driven
// `composio` flag (see nestV3RuntimeEnabledForHandle). When that flag is false,
// normal Nest mode is the default.
import { handleBrandTurn } from "./orchestrator/handle-brand-turn.ts";
import {
  mergeBufferedImages,
  shouldBufferInboundImages,
  shouldConsumeBufferedImages,
} from "./inbound-image-buffer.ts";
import {
  fetchCalendarTimezone,
  fetchOutlookTimezone,
} from "./calendar-helpers.ts";
import { resolveToken } from "./gmail-helpers.ts";
import {
  detectGroupVibe,
  recordGroupActivity,
  syncGroupFromLinq,
  updateGroupVibe,
} from "./group.ts";
import type { GroupContext } from "./group.ts";
import { VOICE_MODE_TTS_INSTRUCTIONS } from "./morning-brief-audio.ts";
import {
  cleanResponse,
  extractTextDecorations,
} from "./imessage-text-format.ts";
import type { ConversationEngagement } from "./conversation-engagement.ts";
import {
  NEST_CONVERSATION_ENGAGEMENT,
  NEST_CONVERSATION_FILTER,
} from "./conversation-engagement.ts";
import {
  handleContactDelegationContactCardTurn,
  handleContactDelegationTargetReply,
  handleContactDelegationTurn,
} from "./contact-delegation/engine.ts";
import { runNestAgent } from "./nest-agent-runtime/run-nest-agent.ts";
import { nestV3RuntimeEnabledForHandle } from "./nest-runtime-flag.ts";
import { invokeQuidSms, resolveProductRoute } from "./product-routing.ts";
import {
  findActiveLinqHumanMode,
  releaseLinqHumanMode,
  touchLinqHumanModeInbound,
} from "./linq-human-mode.ts";
import { handleBuzzMessage } from "./buzz.ts";
import { handleYellowJerseyUploadTurn } from "./yellow-jersey-upload-handler.ts";
import {
  historyContentForInbound,
  mediaMetadataFromParts,
} from "./inbound-media-metadata.ts";

const SEPARATOR_RE =
  /\n---\n|\n---$|^---\n|\s+---\s+|\s+---$|^---\s+|\.---\s*|\.---$|---\n/;

const MAX_BUBBLE_LENGTH = 2000;

function splitByParagraphs(text: string): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of text.split("\n\n")) {
    if (current && current.length + paragraph.length + 2 > MAX_BUBBLE_LENGTH) {
      chunks.push(current.trim());
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current.trim()) {
    const remaining = current.trim();
    if (remaining.length <= MAX_BUBBLE_LENGTH) {
      chunks.push(remaining);
    } else {
      for (let i = 0; i < remaining.length; i += MAX_BUBBLE_LENGTH) {
        chunks.push(remaining.slice(i, i + MAX_BUBBLE_LENGTH));
      }
    }
  }
  return chunks.length > 0 ? chunks : [text.slice(0, MAX_BUBBLE_LENGTH)];
}

function splitBubbles(text: string): string[] {
  const hasSeparator = text.includes("---");
  const parts = hasSeparator
    ? text.split(SEPARATOR_RE)
    : text.includes("\n\n")
    ? text.split(/\n\n+/)
    : [text];

  const chunks: string[] = [];
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    if (part.length <= MAX_BUBBLE_LENGTH) {
      chunks.push(part);
    } else {
      chunks.push(...splitByParagraphs(part));
    }
  }
  return chunks.length > 0 ? chunks : [text.trim().slice(0, MAX_BUBBLE_LENGTH)];
}

function shouldTreatAsProactiveReply(messageText: string): boolean {
  const text = messageText.trim().toLowerCase();
  if (!text) return false;

  if (text.length <= 80) {
    if (
      /^(yes|yep|yeah|nah|no|ok|okay|sure|sounds good|go on|keep going|tell me more|please|lol|haha|cheers|thanks|thank you|sure thing)[!.?]*$/
        .test(text)
    ) {
      return true;
    }
    if (
      /\b(keep going|tell me more|go on|continue|what do you mean by that|why is that|how so)\b/
        .test(text)
    ) {
      return true;
    }
  }

  const freshTaskSignals =
    /\b(how do i|get to|directions|route|public transport|train|tram|bus|drive|walk|calendar|email|news|weather|who is|what is|where is|when is|find|search|look up|google|remind me|book|draft|write)\b/;
  if (freshTaskSignals.test(text)) return false;

  return text.length <= 40;
}

/**
 * Internal brand chat: do **not** split on blank lines — those are for readability inside one bubble.
 * Only split on an explicit `---` line between major surface areas (Roster vs Sales vs Workshop).
 * Over-length parts still chunk for carrier limits.
 */
function splitBubblesInternalBrand(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const parts = trimmed.includes("---")
    ? trimmed.split(SEPARATOR_RE).map((p) => p.trim()).filter(Boolean)
    : [trimmed];

  const chunks: string[] = [];
  for (const part of parts) {
    if (part.length <= MAX_BUBBLE_LENGTH) {
      chunks.push(part);
    } else {
      chunks.push(...splitByParagraphs(part));
    }
  }
  return chunks.length > 0 ? chunks : [trimmed.slice(0, MAX_BUBBLE_LENGTH)];
}

/**
 * Attach verification URL only when the user clearly asks for it (or hard-gate path elsewhere).
 * Uses last assistant text so short follow-ups like "how do I do that" count after a verify pitch.
 */
function userWantsVerificationLink(
  userMessage: string,
  lastAssistantPlainText: string,
): boolean {
  const raw = userMessage.trim();
  if (!raw) return false;
  const u = raw.toLowerCase().replace(/\s+/g, " ");
  const prev = (lastAssistantPlainText || "").toLowerCase();

  // Direct exact matches
  if (
    /^(link|the link|verification link|verify|verification|sign\s*up|set\s*up|connect|connect me)\s*[?!.]?$/i
      .test(raw)
  ) {
    return true;
  }

  // "verify/verification/sign up" + any action/question word
  if (/\b(verify|verification|sign\s*up|signup|set\s*up|setup)\b/.test(u)) {
    if (
      /\b(how|where|what|send|give|share|url|tap|get|gimme|need|want|can i|do i|let me|let's|ready|i'm ready|go ahead)\b/
        .test(u)
    ) {
      return true;
    }
    // Bare intent: "let me verify", "i'll verify", "i want to verify", "ready to verify"
    if (
      /\b(let me|i'?ll|i want to|i'd like to|ready to|time to|going to|gonna|i wanna)\b/
        .test(u)
    ) {
      return true;
    }
  }

  // "link" + question/request words
  if (
    /\blink\b/.test(u) &&
    /\b(how|where|send|give|share|get|verification|verify|please|again|me|need)\b/
      .test(u)
  ) {
    return true;
  }

  // Explicit "send me the link/url" patterns
  if (
    /\b(send|give|share)\b.*\b(link|url|it)\b/.test(u) && prev &&
    /\b(verif|link|tap|sign.?up|set.?up)\b/.test(prev)
  ) {
    return true;
  }

  const priorMentionedVerifyOrGate = /\bverif(y|ication|ied)?\b/.test(prev) ||
    /\b(set.?up|sign.?up|tap.?(this|here|the)|click.?(this|here|the))\b/.test(
      prev,
    ) ||
    (
      /\b(remind|calendar|email|inbox|schedule)\b/.test(prev) &&
      /\b(before i can|can'?t until|cannot until|need.{0,40}verif|verif.{0,20}first|quick verif|do a verif|haven'?t verif|not verif|without verif|unlock|set.?up)\b/
        .test(prev)
    );

  if (priorMentionedVerifyOrGate) {
    const t = raw.trim();
    if (t.length <= 60) {
      // Question-style follow-ups
      if (
        /^(how(\s+do\s+i(\s+do\s+that)?)?|how\??|what(\s+link|\s+now|\s+do\s+i(\s+do)?)?|where(\s+is(\s+it)?)?|ok\s+how|yeah\s+how|and\s+how|so\s+how)\s*$/i
          .test(t)
      ) {
        return true;
      }
      // Affirmative responses — expanded to match more confirmations
      if (
        /^(yes|yep|yeah|yea|ya|please|ok|okay|sure|alright|sounds good|go ahead|let'?s go|let'?s do it|do it|go for it|ready|i'?m ready|send it|hit me|bet|down|absolutely|for sure|sweet|cool)\s*[!.]?$/i
          .test(t)
      ) {
        return true;
      }
      // "ok send it", "yeah send it", "sure send it" etc.
      if (
        /^(ok|okay|yeah|yes|sure|please)?\s*(send|give|share)\s*(it|me|the link|that)/
          .test(t.toLowerCase())
      ) {
        return true;
      }
      // "set me up", "connect me", "let's set up"
      if (
        /\b(set\s*(me|it)\s*up|connect\s*me|hook\s*me\s*up|let'?s\s*(set\s*up|do\s*(it|this|that)|go|get\s*(started|going)))\b/i
          .test(t)
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Detect when the model's response mentions verification/setup in a way that
 * implies the link should be attached. Covers both old "verify" language and
 * new human-friendly "set up" / "get that working" phrasing.
 */
function modelResponseWantsVerificationLink(responseText: string): boolean {
  if (!responseText) return false;
  const lower = responseText.toLowerCase();

  // Model uses explicit verify/unlock language
  if (
    /\b(need\s*(you\s*)?to\s*verif|quick\s*verif|do\s*a\s*verif|just\s*verif|verify\s*(first|real\s*quick|to\s*unlock)|unlock\s*(that|this|it|your)|before\s*i\s*can\b.*verif|sign\s*up\s*(to|and|so))\b/
      .test(lower)
  ) {
    return true;
  }

  // Model uses human-friendly setup language (new preferred phrasing)
  if (
    /\b(need\s*to\s*(set|get)\s*(that|it|this|calendar|inbox|email|reminder)\s*(up|working|sorted|going|set\s*up)|set\s*(that|it|this)\s*up\s*first|get\s*(that|it|this|calendar|inbox|email|reminder)\s*(working|set\s*up|sorted|going)\s*first|tiny\s*bit\s*of\s*setup|switch\s*(that|it|this)\s*on\s*first|set\s*up\s*(takes|is)|takes\s*about\s*\d+\s*seconds)\b/
      .test(lower)
  ) {
    return true;
  }

  // Model tells user to tap/click
  if (
    /\b(tap\s*(this|here|below|the)|click\s*(this|here|below|the))\b/.test(
      lower,
    )
  ) {
    return true;
  }

  // Model mentions sending or sharing a link
  if (
    /\b(here'?s?\s*(the|a|your)?\s*(link|url)|sending\s*(you\s*)?(the|a)?\s*link|link\s*(below|here|to\s*(get|verif|set)))\b/
      .test(lower)
  ) {
    return true;
  }

  return false;
}

/**
 * Detect when the user's message is about a gated feature (calendar, email, reminders).
 * Used to allow early verification link delivery before message 20.
 */
function userAsksForGatedFeature(userMessage: string): boolean {
  const lower = userMessage.toLowerCase();
  return /\b(remind|reminder|calendar|schedule|email|inbox|set.?a?.?timer|appointment)\b/
    .test(lower);
}

/**
 * Verification link gating:
 * - Before message 20: only attach the link if the user explicitly asks for verification
 *   OR asks about a gated feature (calendar/email/reminders).
 * - At message 20+: always allow the link (hard-gate handles this separately).
 */
const VERIFICATION_LINK_THRESHOLD = 20;

function enforceOnboardingVerificationBubble(
  text: string | null,
  onboardUrl: string,
  userMessage: string,
  lastAssistantPlainText: string,
  onboardCount: number,
): string | null {
  const userAsked = userWantsVerificationLink(
    userMessage,
    lastAssistantPlainText,
  );
  const gatedFeatureRequested = userAsksForGatedFeature(userMessage);

  const stripModelUrls = (t: string): string => {
    let out = t.replace(/https:\/\/nest\.expert\/\?token=[a-f0-9-]+/gi, "")
      .trim();
    out = out.replace(/\n---\s*\n?$/, "").replace(/\n{3,}/g, "\n\n").trim();
    return out;
  };

  if (!text || !text.trim()) {
    return userAsked ? onboardUrl : null;
  }

  // Check if model's response mentions verification before stripping URLs
  const modelWantsLink = modelResponseWantsVerificationLink(text);

  // If the MODEL mentioned verification, ALWAYS follow through with the link.
  // The model already has prompt instructions to only mention verification when
  // appropriate (gated feature requested, or message 20+). If it said "just need
  // a quick verify", we must send the link or the user gets a broken promise.
  //
  // The message-count gate only prevents the system from proactively injecting
  // links when neither the user nor the model asked for it.
  const shouldAttach = userAsked || modelWantsLink ||
    (onboardCount >= VERIFICATION_LINK_THRESHOLD && gatedFeatureRequested);

  let cleaned = stripModelUrls(text);

  if (!cleaned) {
    return shouldAttach ? onboardUrl : null;
  }

  if (!shouldAttach) {
    return cleaned;
  }

  // Always send the verification URL as a separate iMessage bubble (splitBubbles uses `---`).
  // Never leave the link inline only — stripModelUrls already removed model-hallucinated URLs.
  return `${cleaned}\n---\n${onboardUrl}`;
}

/**
 * Guard: if the model's response incorrectly acknowledges or congratulates the
 * user for verifying/completing setup while the user is still in onboarding
 * (status !== 'active'), intercept and replace the response.
 *
 * The fast model used for onboarding occasionally follows the user's claim
 * ("I just verified") instead of the system instruction to reject it.
 * This guard is the server-side safety net.
 */
function guardVerificationAcknowledgement(text: string | null): string | null {
  if (!text) return text;

  const lower = text.toLowerCase();

  // Detect responses that confirm or celebrate a verification/setup action
  const acknowledgesVerification =
    // "thanks for verifying / completing / setting up / signing up"
    /\bthanks?\s+for\s+(verif\w*|complet\w*|set\w*\s*up|signing\s+up|connect\w*)\b/i
      .test(lower) ||
    // "you're (now) verified / all set / good to go / set up / connected"
    /\byou'?re\s+(now\s+)?(verif\w*|all\s+set|good\s+to\s+go|set\s+up|connected|in!)\b/i
      .test(lower) ||
    // "verified!" or "you're verified" at the start of a bubble
    /^verif\w*[!.]/i.test(lower.trim()) ||
    // "perfect / great / awesome, you're set up / verified / all good"
    /\b(perfect|great|awesome|nice one|well done)[!,]?\s+(you'?re\s+(verif\w*|all\s+set|set\s+up|good\s+to\s+go)|you'?ve\s+verif\w*)\b/i
      .test(lower) ||
    // "welcome aboard" / "welcome to nest" with verification context
    /\bwelcome\s+(aboard|to\s+nest)\b/i.test(lower) ||
    // "you've verified" / "you've completed verification"
    /\byou'?ve\s+(verif\w*|complet\w*\s+verif\w*|set\s+up)\b/i.test(lower);

  if (!acknowledgesVerification) return text;

  console.warn(
    "[pipeline] verification-acknowledgement guard: model incorrectly acknowledged unverified user as verified — replacing response",
  );

  return `Not showing as set up on my end just yet! The flow might not have completed — want to try the link again?`;
}

function fireAndForget(promise: Promise<unknown>): void {
  promise.catch((err) =>
    console.warn("[pipeline] fire-and-forget error:", err)
  );
}

function isFormatTestRequest(text: string): boolean {
  return text.trim().toLowerCase() === "format test";
}

async function handleFormatTestRequest(
  message: NormalisedIncomingMessage,
): Promise<void> {
  const bubbles = [
    [
      "Formatting test matrix for iMessage.",
      "Each line is a different render attempt.",
      "---",
      "Reply with what actually rendered on your phone.",
    ].join("\n"),
    [
      "ASTERISK / UNDERSCORE",
      "*italic*",
      "_italic_",
      "**bold**",
      "__bold__",
      "***bold italic***",
      "___bold italic___",
      "**_bold italic_**",
      "__*bold italic*__",
    ].join("\n"),
    [
      "ALT MARKUP",
      "~~strikethrough~~",
      "~strikethrough~",
      "++underline++",
      "__underline?__",
      "`inline code`",
      "```code block```",
      "||spoiler||",
    ].join("\n"),
    [
      "HTML STYLE ATTEMPTS",
      "<b>bold</b>",
      "<strong>strong</strong>",
      "<i>italic</i>",
      "<em>emphasis</em>",
      "<u>underline</u>",
      "<s>strike</s>",
      "<del>delete</del>",
    ].join("\n"),
    [
      "UNICODE STYLE ATTEMPTS",
      "𝐁𝐨𝐥𝐝 𝐮𝐧𝐢𝐜𝐨𝐝𝐞",
      "𝘪𝘵𝘢𝘭𝘪𝘤 𝘶𝘯𝘪𝘤𝘰𝘥𝘦",
      "𝘽𝙤𝙡𝙙 𝙞𝙩𝙖𝙡𝙞𝙘 𝙪𝙣𝙞𝙘𝙤𝙙𝙚",
      "𝖒𝖔𝖓𝖔𝖘𝖕𝖆𝖈𝖊 𝖘𝖙𝖞𝖑𝖊",
      "S̲i̲n̲g̲l̲e̲ ̲u̲n̲d̲e̲r̲l̲i̲n̲e̲ ̲c̲o̲m̲b̲i̲n̲i̲n̲g̲",
      "S̶t̶r̶i̶k̶e̶ ̶c̶o̶m̶b̶i̶n̶i̶n̶g̶",
      "BIG ATTEMPT: ＢＩＧ  ＴＥＸＴ",
    ].join("\n"),
    [
      "UNICODE - EXTRA FONT FAMILIES",
      "𝗕𝗢𝗟𝗗 𝗦𝗔𝗡𝗦",
      "𝘉𝘰𝘭𝘥 𝘐𝘵𝘢𝘭𝘪𝘤 𝘚𝘢𝘯𝘴",
      "𝙼𝚘𝚗𝚘 𝚂𝚊𝚗𝚜 / 𝚃𝚢𝚙𝚎𝚠𝚛𝚒𝚝𝚎𝚛",
      "𝒮𝒸𝓇𝒾𝓅𝓉 𝓈𝓉𝓎𝓁𝑒",
      "𝓑𝓸𝓵𝓭 𝓼𝓬𝓻𝓲𝓹𝓽",
      "𝔽𝕦𝕝𝕝 𝕕𝕠𝕦𝕓𝕝𝕖-𝕤𝕥𝕣𝕦𝕔𝕜",
      "𝔊𝔬𝔱𝔥𝔦𝔠 𝔣𝔯𝔞𝔨𝔱𝔲𝔯",
      "𝕭𝖔𝖑𝖉 𝖋𝖗𝖆𝖐𝖙𝖚𝖗",
      "𝓈𝓂𝒶𝓁𝓁 𝒸𝒶𝓅𝓈 𝒶𝓉𝓉𝑒𝓂𝓅𝓉",
    ].join("\n"),
    [
      "UNICODE - SYMBOL/DECORATIVE",
      "Ⓒⓘⓡⓒⓛⓔⓓ ⓣⓔⓧⓣ",
      "🄱🄻🄾🄲🄺 🅃🄴🅇🅃",
      "Ⓢⓠⓤⓐⓡⓔⓓ ⓐⓛⓣ",
      "🅱🆄🅱🅱🅻🅴 🆂🆃🆈🅻🅴",
      "ₛᵤbₛcᵣᵢₚₜ ᵐᶦˣ",
      "ˢᵘᵖᵉʳˢᶜʳⁱᵖᵗ ᵐⁱˣ",
      "①②③ numbered symbols",
      "◆◇○● decorative separators ○●◇◆",
    ].join("\n"),
    [
      "UNICODE - COMBINING MARKS",
      "D̶o̶u̶b̶l̶e̶ ̶s̶t̶r̶i̶k̶e̶ ̶a̶t̶t̶e̶m̶p̶t̶",
      "D̳o̳u̳b̳l̳e̳ ̳u̳n̳d̳e̳r̳l̳i̳n̳e̳ ̳a̳t̳t̳e̳m̳p̳t̳",
      "O̅v̅e̅r̅l̅i̅n̅e̅ ̅a̅t̅t̅e̅m̅p̅t̅",
      "S̷l̷a̷s̷h̷ ̷o̷v̷e̷r̷l̷a̷y̷",
      "N̴o̴i̴s̴y̴ ̴g̴l̴i̴t̴c̴h̴ ̴m̴a̴r̴k̴s̴",
      "A͟l͟t͟ ͟u͟n͟d͟e͟r͟l͟i͟n͟e͟",
    ].join("\n"),
    [
      "UNICODE - SIZE / WIDTH TESTS",
      "Normal width text",
      "Ｆｕｌｌｗｉｄｔｈ ｔｅｘｔ",
      "H a i r s p a c e d",
      "WIDE    GAP    TEST",
      "〚bracketed unicode〛",
      "《angled unicode quotes》",
      "「CJK quote style」",
      "— em dash / – en dash / ‑ non-breaking hyphen",
    ].join("\n"),
  ];

  await addMessage(message.chatId, "user", message.text, message.from, {
    isGroupChat: message.isGroupChat,
    chatName: message.chatName,
    participantNames: message.participantNames,
    service: message.service,
  });

  for (const bubble of bubbles) {
    const formattedBubble = cleanResponse(bubble);
    const handle = await pSendMessage(message, formattedBubble);
    fireAndForget(logOutboundMessage(
      message.chatId,
      "text",
      { text: formattedBubble },
      "sent",
      handle,
    ));
    await addMessage(message.chatId, "assistant", formattedBubble);
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
}

function parseBugReport(
  text: string,
): { bugText: string; rawMessage: string } | null {
  const rawMessage = text.trim();
  const match = rawMessage.match(/^bug:\s*(.*)$/i);
  if (!match) return null;
  const bugText = (match[1] || "").trim() || "[no details provided]";
  return { bugText, rawMessage };
}

async function logBugReportIfNeeded(
  message: NormalisedIncomingMessage,
  authUserId: string | null,
): Promise<void> {
  const parsed = parseBugReport(message.text);
  if (!parsed) return;

  try {
    const priorMessages = await getConversation(
      message.chatId,
      10,
      NEST_CONVERSATION_FILTER,
    );
    await reportBug({
      chatId: message.chatId,
      senderHandle: message.from,
      authUserId,
      provider: message.provider,
      service: message.service,
      messageText: parsed.rawMessage,
      bugText: parsed.bugText,
      priorMessages,
      metadata: {
        message_id: message.messageId,
        is_group_chat: message.isGroupChat,
        chat_name: message.chatName,
        participant_names: message.participantNames,
      },
    });
  } catch (err) {
    console.error("[pipeline] failed to log bug report:", err);
  }
}

// ─── Messaging wrappers (LINQ) ───────────────────────────────────────────────

async function pSendMessage(
  msg: NormalisedIncomingMessage,
  text: string,
  effect?: MessageEffect,
  media?: MediaAttachment[],
  replyToMessageId?: string,
): Promise<string | null> {
  const replyTo = replyToMessageId
    ? { message_id: replyToMessageId }
    : undefined;
  // Parse inline **bold** / *italic* markers into Linq v3 `text_decorations`.
  // iMessage recipients render them inline; SMS/RCS silently receive the plain value.
  const { value, text_decorations } = text
    ? extractTextDecorations(text)
    : { value: text, text_decorations: [] };
  const decorations = text_decorations.length > 0
    ? text_decorations
    : undefined;
  const resp = await linqApi.sendMessage(
    msg.chatId,
    value,
    effect,
    media?.map((m) => ({ url: m.url })),
    replyTo,
    decorations,
  );
  return resp.message?.id ?? null;
}

async function pSendReaction(
  msg: NormalisedIncomingMessage,
  reaction: Reaction,
): Promise<void> {
  await linqApi.sendReaction(msg.messageId, reaction);
}

async function pStartTyping(msg: NormalisedIncomingMessage): Promise<void> {
  await linqApi.startTyping(msg.chatId);
}

// ─── Voice mode: TTS any response and send as voice memo ─────────────────────

const VOICE_PREFIX_RE = /^\/voice\s+/i;

function isVoiceRequest(text: string): boolean {
  return VOICE_PREFIX_RE.test(text.trim());
}

function stripVoicePrefix(text: string): string {
  return text.trim().replace(VOICE_PREFIX_RE, "").trim();
}

function cleanForTTS(text: string): string {
  return text
    // Strip bracketed metadata the model may echo from conversation history
    .replace(/\[Nest sent a voice memo[^\]]*\]/gi, "")
    .replace(/\[End of voice memo[^\]]*\]/gi, "")
    .replace(/\[voice memo:[^\]]*\]/gi, "")
    .replace(/\[[a-z_]+\]/g, "")
    // Strip model preambles
    .replace(/^(The user (asked|sent|said|requested|wants)[^.]*\.\s*)/i, "")
    .replace(/^(Nest will now respond[^.]*\.\s*)/i, "")
    .replace(/^(Here is (my|the|Nest's) response[^.]*[.:]\s*)/i, "")
    .replace(/^(Responding to the user[^.]*[.:]\s*)/i, "")
    // Strip ALL markdown formatting — TTS must receive clean spoken text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`[^`]+`/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    // Convert Unicode bold/italic (from cleanResponse) back to plain text
    .replace(/[\u{1D400}-\u{1D7FF}]/gu, (ch) => {
      const cp = ch.codePointAt(0)!;
      if (cp >= 0x1D5D4 && cp <= 0x1D5ED) {
        return String.fromCharCode(cp - 0x1D5D4 + 65);
      }
      if (cp >= 0x1D5EE && cp <= 0x1D607) {
        return String.fromCharCode(cp - 0x1D5EE + 97);
      }
      if (cp >= 0x1D7EC && cp <= 0x1D7F5) {
        return String.fromCharCode(cp - 0x1D7EC + 48);
      }
      return ch;
    })
    // Strip bullet points and numbered list markers
    .replace(/^[\s]*[-•*]\s+/gm, "")
    .replace(/^[\s]*\d+[.)]\s+/gm, "")
    // Strip URLs
    .replace(/https?:\/\/\S+/g, "")
    // Strip markdown links → keep display text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Clean up bubble delimiters
    .replace(/^---$/gm, "")
    // Collapse excessive whitespace
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ")
    .replace(/^\s+/, "")
    .trim();
}

async function deliverAsVoiceMemo(
  message: NormalisedIncomingMessage,
  responseText: string,
  engagement: ConversationEngagement = NEST_CONVERSATION_ENGAGEMENT,
): Promise<void> {
  const ttsText = cleanForTTS(responseText);

  console.log(
    `[pipeline] voice memo: delegating TTS to morning-brief-audio function (${ttsText.length} chars) for chat ${
      message.chatId.slice(0, 8)
    }...`,
  );

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL is not set");
  }

  const ttsResp = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/functions/v1/morning-brief-audio`,
    {
      method: "POST",
      headers: internalJsonHeaders(),
      body: JSON.stringify({
        action: "voice-tts",
        text: ttsText,
        chat_id: message.chatId,
        instructions: VOICE_MODE_TTS_INSTRUCTIONS,
      }),
    },
  );

  if (!ttsResp.ok) {
    const errBody = await ttsResp.text();
    throw new Error(
      `voice-tts function failed (${ttsResp.status}): ${errBody.slice(0, 300)}`,
    );
  }

  const ttsResult = await ttsResp.json() as {
    ok?: boolean;
    signed_url?: string;
    error?: string;
  };
  if (!ttsResult.ok || !ttsResult.signed_url) {
    throw new Error(
      `voice-tts returned error: ${ttsResult.error ?? "no signed_url"}`,
    );
  }

  console.log(`[pipeline] voice memo: TTS done, sending via Linq...`);
  await linqApi.sendVoiceMemo(message.chatId, ttsResult.signed_url);
  console.log(`[pipeline] voice memo: delivered successfully`);

  fireAndForget(
    addMessage(message.chatId, "assistant", ttsText, undefined, { engagement }),
  );
  fireAndForget(
    logOutboundMessage(message.chatId, "voice_memo", { text: ttsText }, "sent"),
  );
}

// ─── Reply-to decision (deterministic, no LLM) ──────────────────────────────

async function shouldReplyTo(
  message: NormalisedIncomingMessage,
): Promise<string | undefined> {
  const recent = await getConversation(
    message.chatId,
    6,
    NEST_CONVERSATION_FILTER,
  );

  if (message.isGroupChat) {
    // Thread only when multiple different people have spoken recently —
    // i.e. the chat is actively busy and attribution matters.
    const recentUserHandles = new Set(
      recent
        .filter((m) => m.role === "user" && m.handle)
        .map((m) => m.handle),
    );
    if (recentUserHandles.size >= 2) return message.messageId;
    return undefined;
  }

  // 1:1 chats: thread when there's a burst of user messages in a row
  // (3+ consecutive user messages with no assistant reply between them).
  let consecutiveUser = 0;
  for (const m of recent.reverse()) {
    if (m.role === "user") consecutiveUser++;
    else break;
  }
  if (consecutiveUser >= 3) return message.messageId;

  return undefined;
}

// ─── Delivery: split bubbles, send reactions, effects, images ────────────────

async function deliverResponse(
  message: NormalisedIncomingMessage,
  result: {
    text: string | null;
    reaction: Reaction | null;
    effect: MessageEffect | null;
    generatedImage: { url: string; prompt: string; isEdit?: boolean } | null;
  },
  replyToMessageId?: string,
  voiceMode = false,
): Promise<void> {
  // Send reaction
  if (result.reaction) {
    const display = result.reaction.type === "custom"
      ? (result.reaction as { type: "custom"; emoji: string }).emoji
      : result.reaction.type;
    await pSendReaction(message, result.reaction);
    fireAndForget(
      logOutboundMessage(
        message.chatId,
        "reaction",
        { reaction: display, message_id: message.messageId },
        "sent",
        message.messageId,
      ),
    );
  }

  // Generate effect text if no response text
  let finalText = result.text;
  if (!finalText && result.effect) {
    finalText = await getTextForEffect(result.effect.name);
  }

  // Voice mode: generate voice memo in background, don't block the pipeline
  if (voiceMode && finalText) {
    const cleanedText = cleanResponse(finalText);
    fireAndForget(
      deliverAsVoiceMemo(message, cleanedText).catch((err) => {
        const errMsg = (err as Error).message ?? String(err);
        console.error(
          `[pipeline] voice memo FAILED — sending text fallback. Error: ${errMsg}. Chat: ${
            message.chatId.slice(0, 8)
          }. Text length: ${cleanedText.length}`,
        );
        return pSendMessage(message, cleanedText).then((handle) => {
          fireAndForget(
            logOutboundMessage(
              message.chatId,
              "text",
              { text: cleanedText, voiceFallbackReason: errMsg },
              "sent",
              handle,
            ),
          );
        });
      }),
    );
    return;
  }

  // Send text bubbles
  if (finalText || result.generatedImage) {
    const bubbles = finalText
      ? splitBubbles(finalText).map((part) => cleanResponse(part)).filter(
        Boolean,
      )
      : [];

    for (let i = 0; i < bubbles.length; i++) {
      if (i > 0) await new Promise((resolve) => setTimeout(resolve, 2000));
      const isLast = i === bubbles.length - 1;
      const messageEffect = isLast && !result.generatedImage
        ? result.effect ?? undefined
        : undefined;
      const replyTo = i === 0 ? replyToMessageId : undefined;
      const handle = await pSendMessage(
        message,
        bubbles[i],
        messageEffect,
        undefined,
        replyTo,
      );
      fireAndForget(logOutboundMessage(
        message.chatId,
        "text",
        { text: bubbles[i], effect: messageEffect ?? null },
        "sent",
        handle,
      ));
    }

    // Send generated / edited image
    if (result.generatedImage) {
      await pStartTyping(message);

      let imageUrl: string | null;
      let logLabel: string;

      if (result.generatedImage.isEdit && result.generatedImage.url) {
        // Image already edited by Nano Banana Pro 2 (pre-resolved in pipeline)
        imageUrl = result.generatedImage.url;
        logLabel = "edited";
      } else if (result.generatedImage.isEdit && message.images.length > 0) {
        // Image edit via Nano Banana Pro 2 (fallback if not pre-resolved)
        const userImageUrls = message.images.map((img) => img.url);
        imageUrl = await editImage(result.generatedImage.prompt, userImageUrls);
        logLabel = "edited";
      } else {
        // Text-to-image generation (DALL-E fallback or Nano Banana Pro 2)
        imageUrl =
          await generateImageNanoBanana(result.generatedImage.prompt) ??
            await generateImage(result.generatedImage.prompt);
        logLabel = "generated";
      }

      if (imageUrl) {
        const handle = await pSendMessage(
          message,
          "",
          result.effect ?? undefined,
          [{ url: imageUrl }],
        );
        fireAndForget(logOutboundMessage(
          message.chatId,
          "image",
          {
            prompt: result.generatedImage.prompt,
            image_url: imageUrl,
            type: logLabel,
          },
          "sent",
          handle,
        ));
      } else {
        const handle = await pSendMessage(
          message,
          "sorry the image didnt work, try again?",
        );
        fireAndForget(logOutboundMessage(
          message.chatId,
          "text",
          { text: "sorry the image didnt work, try again?" },
          "sent",
          handle,
        ));
      }
    }
  }
}

async function handleRoutedBrandTurn(
  message: NormalisedIncomingMessage,
  brandKey: string,
  wantsVoice: boolean,
): Promise<void> {
  const isInternalRoute = brandKey.endsWith("-internal");

  try {
    console.log("[product-router] dispatching to brand handler", {
      chatId: message.chatId,
      sender: message.from,
      isGroupChat: message.isGroupChat,
      brandKey,
      internal: isInternalRoute,
    });

    const result = await handleBrandTurn({
      chatId: message.chatId,
      senderHandle: message.from,
      brandKey,
      message: message.text,
      sessionStartedAt: new Date().toISOString(),
      isGroupChat: message.isGroupChat,
      participantNames: message.participantNames,
      chatName: message.chatName,
      service: message.service,
      incomingEffect: message.incomingEffect,
      images: message.images,
      audio: message.audio,
      voiceMode: wantsVoice,
      providerMessageId: message.messageId,
    });

    if (wantsVoice) {
      const cleanedVoice = cleanResponse(result.text);
      fireAndForget(
        deliverAsVoiceMemo(message, cleanedVoice, { scope: "brand", brandKey })
          .catch((voiceErr) => {
            console.error(
              "[pipeline] brand voice mode failed, sending text:",
              (voiceErr as Error).message,
            );
            return pSendMessage(message, cleanedVoice).then((handle) => {
              fireAndForget(
                logOutboundMessage(
                  message.chatId,
                  "text",
                  { text: result.text },
                  "sent",
                  handle,
                ),
              );
            });
          }),
      );
      return;
    }

    const cleaned = cleanResponse(result.text);
    const bubbles = (isInternalRoute
      ? splitBubblesInternalBrand(cleaned)
      : splitBubbles(cleaned)).filter(Boolean);
    for (let i = 0; i < bubbles.length; i++) {
      if (i > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, 2000)
        );
      }
      const handle = await pSendMessage(message, bubbles[i]);
      fireAndForget(
        logOutboundMessage(
          message.chatId,
          "text",
          { text: bubbles[i] },
          "sent",
          handle,
        ),
      );
    }

    if (result.images && result.images.length > 0) {
      for (const img of result.images) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const handle = await pSendMessage(message, "", undefined, [{
          url: img.url,
        }]);
        fireAndForget(
          logOutboundMessage(
            message.chatId,
            "media",
            { imageUrl: img.url },
            "sent",
            handle,
          ),
        );
        console.log(`[pipeline] sent brand image: ${img.id}`);
      }
    }

    if (!isInternalRoute) {
      fireAndForget(
        linqApi.shareContactCard(message.chatId)
          .then(() =>
            console.log(`[pipeline] vCard sent for brand ${brandKey}`)
          )
          .catch((e) =>
            console.warn(`[pipeline] vCard failed for brand ${brandKey}:`, e)
          ),
      );
    }
  } catch (err) {
    console.error(`[pipeline] brand route failed for ${brandKey}:`, err);
    const fallback = isInternalRoute
      ? "Something went wrong pulling that data. Try again in a sec."
      : "Sorry, something went wrong. Try again in a sec.";
    const handle = await pSendMessage(message, fallback);
    fireAndForget(
      logOutboundMessage(
        message.chatId,
        "text",
        { text: fallback },
        "sent",
        handle,
      ),
    );
  }
}

// ─── Onboarding state machine events ─────────────────────────────────────────

async function emitOnboardingEvents(
  message: NormalisedIncomingMessage,
  nestUser: Awaited<ReturnType<typeof ensureNestUser>>,
  result: {
    rememberedUser:
      | { name?: string; fact?: string; isForSender?: boolean }
      | null;
  },
): Promise<void> {
  if (result.rememberedUser) {
    if (result.rememberedUser.name) {
      fireAndForget(setUserName(message.from, result.rememberedUser.name));
    }
    if (result.rememberedUser.fact) {
      fireAndForget(addUserFact(message.from, result.rememberedUser.fact));
    }

    if (MEMORY_V2_ENABLED) {
      import("./memory.ts").then(({ processRealtimeMemory }) => {
        fireAndForget(processRealtimeMemory(
          message.from,
          result.rememberedUser!.fact || "",
          result.rememberedUser!.name,
          message.chatId,
        ));
      }).catch((err) =>
        console.warn("[pipeline] onboard memory v2 failed:", err)
      );
    }

    if (result.rememberedUser.name) {
      fireAndForget(emitOnboardingEvent({
        handle: message.from,
        chatId: message.chatId,
        eventType: "new_user_name_captured",
        messageTurnIndex: nestUser.onboardCount + 1,
        currentState: nestUser.onboardState,
      }));
    }
  }

  if (nestUser.onboardCount >= 2 && !nestUser.secondEngagementAt) {
    fireAndForget(transitionOnboardState({
      handle: message.from,
      newState: "second_engagement_observed",
      secondEngagement: true,
    }));

    fireAndForget(emitOnboardingEvent({
      handle: message.from,
      chatId: message.chatId,
      eventType: "second_engagement_observed",
      messageTurnIndex: nestUser.onboardCount + 1,
      currentState: "second_engagement_observed",
    }));
  }
}

// ─── Wedge detection ─────────────────────────────────────────────────────────

function detectWedgeFromMessage(msg: string): ValueWedge | null {
  const lower = msg.toLowerCase();

  if (
    /\b(remind|reminder|remember|nudge|follow.?up|track|don'?t forget|set.?a?.?timer|schedule|appointment|pickup|call)\b/
      .test(lower)
  ) return "offload";
  if (
    /\b(write|draft|compose|help.?me.?(write|say|reply|respond)|message.?for|email.?to|text.?to|birthday.?message|thank.?you.?note)\b/
      .test(lower)
  ) return "draft";
  if (
    /\b(too.?much|overwhelm|chaos|messy|sort|organis|prioriti|plan.?my|help.?me.?sort|million.?things|so.?much.?to.?do|stressed|swamped)\b/
      .test(lower)
  ) return "organise";

  return null;
}

// ─── Pipeline ────────────────────────────────────────────────────────────────

export async function processWebhookEvent(
  event: WebhookEventRow,
): Promise<void> {
  return processMessage(event.normalized_payload, event.id);
}

export async function processMessage(
  message: NormalisedIncomingMessage,
  eventId?: number,
): Promise<void> {
  if (eventId) fireAndForget(markWebhookEventStatus(eventId, "processing"));

  if (await handleBuzzMessage(message)) {
    if (eventId) fireAndForget(markWebhookEventStatus(eventId, "completed"));
    return;
  }

  const productRoute = await resolveProductRoute(message);

  if (productRoute.routeSwitch) {
    await releaseLinqHumanMode({
      chatId: message.chatId,
      recipientHandle: message.from,
      botNumber: message.conversation.fromNumber,
      reason: "route_switch",
      releaseRoute: productRoute.route,
      releaseBrandKey: productRoute.brandKey,
    });
    const text = productRoute.routeSwitch.confirmation;
    const handle = await pSendMessage(message, text);
    fireAndForget(logOutboundMessage(
      message.chatId,
      "text",
      {
        text,
        productRoute: productRoute.route,
        routeBrandKey: productRoute.brandKey,
        routeSwitch: true,
        routeScope: productRoute.scope,
      },
      "sent",
      handle,
    ));
    fireAndForget(
      addMessage(message.chatId, "user", message.text, message.from, {
        isGroupChat: message.isGroupChat,
        chatName: message.chatName,
        participantNames: message.participantNames,
        service: message.service,
        metadata: {
          product_route_switch: true,
          product_route: productRoute.route,
        },
      }),
    );
    fireAndForget(addMessage(message.chatId, "assistant", text, undefined, {
      isGroupChat: message.isGroupChat,
      chatName: message.chatName,
      participantNames: message.participantNames,
      service: message.service,
      metadata: {
        product_route_confirmation: true,
        product_route: productRoute.route,
      },
    }));
    console.log("[product-router] route switch persisted and confirmed", {
      chatId: message.chatId,
      sender: message.from,
      isGroupChat: message.isGroupChat,
      route: productRoute.route,
      routeBrandKey: productRoute.brandKey,
      scope: productRoute.scope,
    });
    if (eventId) fireAndForget(markWebhookEventStatus(eventId, "completed"));
    return;
  }

  if (productRoute.route === "yellow-jersey-upload") {
    console.log(
      "[product-router] dispatching to yellow jersey upload handler",
      {
        chatId: message.chatId,
        sender: message.from,
        source: productRoute.source,
      },
    );
    try {
      await handleYellowJerseyUploadTurn(message);
    } catch (err) {
      console.error("[pipeline] yellow jersey upload route failed:", err);
      const fallback = "Text upload hit an issue. Try again in a minute.";
      const handle = await pSendMessage(message, fallback);
      fireAndForget(
        logOutboundMessage(
          message.chatId,
          "text",
          { text: fallback, productRoute: "yellow-jersey-upload" },
          "sent",
          handle,
        ),
      );
    }
    if (eventId) fireAndForget(markWebhookEventStatus(eventId, "completed"));
    return;
  }

  if (!message.isGroupChat) {
    const humanMode = await findActiveLinqHumanMode({
      chatId: message.chatId,
      recipientHandle: message.from,
      botNumber: message.conversation.fromNumber,
    });

    if (humanMode) {
      console.log("[linq-human-mode] bypassing AI for manual brand thread", {
        chatId: message.chatId,
        sender: message.from,
        brandKey: humanMode.brandKey,
      });
      fireAndForget(touchLinqHumanModeInbound({
        id: humanMode.id,
        chatId: message.chatId,
      }));
      await addMessageStrict(
        message.chatId,
        "user",
        historyContentForInbound(message.text, message.images),
        message.from,
        {
          isGroupChat: false,
          service: message.service,
          engagement: { scope: "brand", brandKey: humanMode.brandKey },
          metadata: {
            source: "linq_human_mode_bypass",
            linq_human_mode: true,
            human_mode_id: humanMode.id,
            bot_number: message.conversation.fromNumber,
            ...mediaMetadataFromParts({
              images: message.images,
              audio: message.audio,
              files: message.files,
            }),
          },
          providerMessageId: message.messageId,
        },
      );
      if (eventId) fireAndForget(markWebhookEventStatus(eventId, "completed"));
      return;
    }
  }

  if (productRoute.route === "quid") {
    console.log("[product-router] dispatching to quid handler", {
      chatId: message.chatId,
      sender: message.from,
      isGroupChat: message.isGroupChat,
      source: productRoute.source,
    });
    try {
      await invokeQuidSms(message);
    } catch (err) {
      console.error("[pipeline] quid route failed:", err);
      const fallback = "Quid tripped up there. Try again in a sec.";
      const handle = await pSendMessage(message, fallback);
      fireAndForget(
        logOutboundMessage(
          message.chatId,
          "text",
          { text: fallback, productRoute: "quid" },
          "sent",
          handle,
        ),
      );
    }
    if (eventId) fireAndForget(markWebhookEventStatus(eventId, "completed"));
    return;
  }

  if (productRoute.route === "brand" || productRoute.route === "ash-internal") {
    const brandKey = productRoute.route === "ash-internal"
      ? "ash-internal"
      : productRoute.brandKey ?? "ash";
    const wantsVoice = isVoiceRequest(message.text);
    if (wantsVoice) {
      message = { ...message, text: stripVoicePrefix(message.text) };
    }
    await handleRoutedBrandTurn(message, brandKey, wantsVoice);
    if (eventId) fireAndForget(markWebhookEventStatus(eventId, "completed"));
    return;
  }

  console.log("[product-router] dispatching to nest handler", {
    chatId: message.chatId,
    sender: message.from,
    isGroupChat: message.isGroupChat,
    source: productRoute.source,
  });

  const delegatedTarget = await handleContactDelegationTargetReply(message);
  if (delegatedTarget.handled) {
    console.log("[pipeline] contact delegation target turn handled", {
      chatId: message.chatId,
      messageId: message.messageId,
      reason: delegatedTarget.reason,
    });
    if (eventId) fireAndForget(markWebhookEventStatus(eventId, "completed"));
    return;
  }

  const delegatedContactCard = await handleContactDelegationContactCardTurn(
    message,
  );
  if (delegatedContactCard.handled) {
    console.log("[pipeline] contact delegation contact card handled", {
      chatId: message.chatId,
      messageId: message.messageId,
      reason: delegatedContactCard.reason,
    });
    if (eventId) fireAndForget(markWebhookEventStatus(eventId, "completed"));
    return;
  }

  if (shouldBufferInboundImages(message)) {
    await bufferPendingInboundImages({
      chatId: message.chatId,
      senderHandle: message.from,
      images: message.images,
    });
    console.log("[pipeline] buffered inbound images awaiting follow-up text", {
      chatId: message.chatId,
      from: message.from,
      imageCount: message.images.length,
    });
    if (eventId) fireAndForget(markWebhookEventStatus(eventId, "completed"));
    return;
  }

  if (shouldConsumeBufferedImages(message)) {
    const pendingImages = await consumePendingInboundImages(
      message.chatId,
      message.from,
    );
    if (pendingImages.length > 0) {
      message = mergeBufferedImages(message, pendingImages);
      console.log(
        "[pipeline] attached buffered inbound images to follow-up text",
        {
          chatId: message.chatId,
          from: message.from,
          pendingImageCount: pendingImages.length,
          totalImageCount: message.images.length,
        },
      );
    }
  }

  if (isFormatTestRequest(message.text)) {
    await handleFormatTestRequest(message);
    if (eventId) fireAndForget(markWebhookEventStatus(eventId, "completed"));
    return;
  }

  // ─── Voice mode: "voice: <instruction>" → run normally, deliver as voice memo ──
  const wantsVoice = isVoiceRequest(message.text);
  if (wantsVoice) {
    message = { ...message, text: stripVoicePrefix(message.text) };
  }

  let authUserId: string | null = null;
  let isOnboarding = false;
  let onboardingContext: OnboardingContext | undefined;
  let isProactiveReply = false;
  let userTimezone: string | null = null;
  let ownerDisplayName: string | null = null;

  if (message.isGroupChat) {
    userTimezone = await getUserTimezone(message.from).catch(() => null);
    if (!userTimezone) userTimezone = "Australia/Melbourne";
  }

  if (!message.isGroupChat) {
    const nestUser = await ensureNestUser(
      message.from,
      message.conversation.fromNumber,
    );
    authUserId = nestUser.authUserId ?? null;
    ownerDisplayName = nestUser.name ?? null;
    userTimezone = nestUser.timezone ?? null;

    if (!userTimezone) {
      userTimezone = await getUserTimezone(message.from).catch(() => null);
    }

    if (!userTimezone && authUserId) {
      try {
        const resolved = await resolveToken(authUserId);
        if (resolved.accessToken) {
          const isMicrosoft = resolved.provider === "microsoft";
          const tz = isMicrosoft
            ? await fetchOutlookTimezone(resolved.accessToken)
            : await fetchCalendarTimezone(resolved.accessToken);
          if (tz && tz !== "UTC") {
            userTimezone = tz;
            updateUserTimezone(message.from, tz).catch(() => {});
            console.log(
              `[pipeline] Backfilled timezone for ${
                message.from.slice(0, 6)
              }***: ${tz}`,
            );
          }
        }
      } catch (e) {
        console.warn(
          "[pipeline] Timezone backfill failed:",
          (e as Error).message,
        );
      }
    }

    if (!userTimezone) {
      userTimezone = "Australia/Melbourne";
    }

    if (nestUser.status !== "active") {
      isOnboarding = true;

      const onboardUrl =
        `https://nest.expert/?token=${nestUser.onboardingToken}`;

      // ─── Hard verification gate at 20 Nest replies ──────────────────────
      // After 20 messages, generate a contextual verification nudge and
      // append the link as a separate bubble. The model CANNOT skip this.
      const HARD_GATE_THRESHOLD = 20;
      if (nestUser.onboardCount >= HARD_GATE_THRESHOLD) {
        await addMessage(message.chatId, "user", message.text, message.from, {
          isGroupChat: false,
          service: message.service,
        });

        let gateText: string;
        try {
          const { geminiSimpleText } = await import("./ai/gemini.ts");
          const { MODEL_MAP } = await import("./ai/models.ts");
          const recentMessages = nestUser.onboardMessages.slice(-6).map(
            (m) => `${m.role}: ${m.content.substring(0, 100)}`,
          ).join("\n");
          const result = await geminiSimpleText({
            model: MODEL_MAP.fast,
            systemPrompt:
              `You are Nest, a casual contact people text. The user hasn't done a quick setup yet and you need them to before you can keep helping. Write a single message (2-3 sentences, max 50 words) that:
1. Actually engages with what they said. Give a genuine reaction or a taste of the answer. Don't just say "great question" or "i hear you". Start with real substance.
2. Then naturally say you need to get things set up first before you can keep going.

IMPORTANT LANGUAGE RULES:
- Do NOT use: "verify", "verification", "unlock", "authenticate", "permissions", "connect your account"
- DO use natural setup phrases like: "just need to set that up first", "just need to get that working first", "tiny bit of setup first", "just need to get things set up first"
- You can optionally mention "takes about 20 seconds" or "no forms or anything" to reduce friction

Start with an uppercase letter. Keep it casual, warm, and direct. No emojis. Don't mention a link (it will be sent separately). Vary the setup phrasing every time.

CRITICAL: You have ZERO access to any account data. NEVER fabricate calendar events, email content, contacts, or meeting details.

Example flow (do NOT copy, just the vibe):
User: "tell me about japan" → "Japan is unreal, the food alone is worth the trip! Just need to get things set up first so I can keep helping. Takes about 20 seconds."
User: "can you draft an email" → "Yeah drafting emails is literally my thing! Just need to get inbox stuff set up first and I'll get straight into it."
User: "what's on my calendar" → "That's exactly what I do! Just need to get calendar set up first, takes about 20 seconds, then I can check it properly."`,
            userMessage:
              `Recent conversation:\n${recentMessages}\n\nUser just said: "${message.text}"\n\nGenerate the response:`,
            maxOutputTokens: 150,
          });
          gateText = cleanResponse(result.text);

          // Post-response hallucination guard for the hard-gate path
          const GATE_HALLUCINATION =
            /\b(calendar|schedule|meeting|event|appointment|standup|sync|call|huddle)\b.*\b(\d{1,2}[:.]\d{2}\s*(am|pm)?|tomorrow|today|tonight|this week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/im;
          const GATE_EMAIL_HALLUCINATION =
            /\b(inbox|unread|emails?\s+from|(?:new|latest|recent)\s+emails?|you('ve| have)\s+(?:got|received)\s+(?:an?\s+)?emails?)\b/i;
          if (
            GATE_HALLUCINATION.test(gateText) ||
            GATE_EMAIL_HALLUCINATION.test(gateText)
          ) {
            console.warn(
              "[pipeline] hard-gate hallucination guard: fabricated account data detected, replacing",
            );
            gateText =
              `That's exactly my lane! Just need to get that set up first and I'll get straight into it`;
          }
        } catch (err) {
          console.warn(
            "[pipeline] gate message generation failed, using fallback:",
            err,
          );
          gateText =
            `I hear you! Just need to get things set up first before I can keep helping. Takes about 20 seconds, no forms or anything`;
        }

        // Only include the link every 3rd Nest message in the gate stage
        const LINK_FREQUENCY = 3;
        let nestMessagesSinceLastLink = 0;
        for (let i = nestUser.onboardMessages.length - 1; i >= 0; i--) {
          const m = nestUser.onboardMessages[i];
          if (
            m.role === "assistant" && m.content.includes("https://nest.expert/")
          ) break;
          if (m.role === "assistant") nestMessagesSinceLastLink++;
        }
        const includeLink = nestMessagesSinceLastLink >= LINK_FREQUENCY - 1;

        const bubbles = includeLink ? [gateText, onboardUrl] : [gateText];

        for (let i = 0; i < bubbles.length; i++) {
          if (i > 0) await new Promise((resolve) => setTimeout(resolve, 1500));
          const handle = await pSendMessage(message, bubbles[i]);
          fireAndForget(
            logOutboundMessage(
              message.chatId,
              "text",
              { text: bubbles[i] },
              "sent",
              handle,
            ),
          );
        }
        const historyText = includeLink
          ? `${gateText} ${onboardUrl}`
          : gateText;
        await addMessage(message.chatId, "assistant", historyText);

        const updatedMessages = [
          ...nestUser.onboardMessages,
          { role: "user", content: message.text },
          { role: "assistant", content: historyText },
        ];
        await updateOnboardState(
          message.from,
          updatedMessages,
          nestUser.onboardCount + 1,
        );

        if (eventId) {
          fireAndForget(markWebhookEventStatus(eventId, "completed"));
        }
        return;
      }

      const isFirstMessage = nestUser.onboardCount === 0;

      let experimentVariants: Record<string, string> = {};
      if (isFirstMessage) {
        const [nameVariant, promptVariant] = await Promise.all([
          assignExperiment(message.from, "name_first_vs_value_first", [
            "name_first",
            "value_first",
          ]),
          assignExperiment(message.from, "open_vs_guided", ["open", "guided"]),
        ]);
        experimentVariants = {
          name_first_vs_value_first: nameVariant,
          open_vs_guided: promptVariant,
        };

        fireAndForget(emitOnboardingEvent({
          handle: message.from,
          chatId: message.chatId,
          eventType: "new_user_first_inbound_received",
          messageTurnIndex: 1,
          currentState: nestUser.onboardState,
          experimentVariantIds: Object.values(experimentVariants),
        }));

        fireAndForget(transitionOnboardState({
          handle: message.from,
          newState: "new_user_intro_started",
        }));

        fireAndForget(
          linqApi.shareContactCard(message.chatId)
            .then(() =>
              console.log(
                `[pipeline] vCard sent on first inbound from ${
                  message.from.slice(0, 6)
                }***`,
              )
            ),
        );
      } else {
        experimentVariants = await getUserExperiments(message.from);

        if (nestUser.lastProactiveSentAt) {
          fireAndForget(markProactiveReplied(message.from));
        }
      }

      // Build PDL context if available
      let pdlContextStr: string | undefined;
      if (nestUser.pdlProfile) {
        try {
          const { profileToContext } = await import("./pdl.ts");
          pdlContextStr = profileToContext(nestUser.pdlProfile as any);
        } catch (err) {
          console.warn(
            "[pipeline] PDL context build failed:",
            (err as Error).message,
          );
        }
      }

      onboardingContext = {
        nestUser,
        onboardUrl,
        experimentVariants,
        pdlContext: pdlContextStr,
      };

      try {
        // Entry state classification (first message) — classify immediately so the opening reply is tailored
        const isFirstOnboardMessage = nestUser.onboardCount === 0;

        // ─── Hardcoded first message ─────────────────────────────────────
        // Skip the LLM entirely for the very first message. Send three fixed
        // bubbles so every new user gets a consistent, sharp intro.
        if (isFirstOnboardMessage) {
          const bubble1 = `Well, well, well....you finally found me!`;
          const bubble2 =
            `I'm Nest btw - nice to meet you! Think of me as the smartest contact in your phone.`;
          const bubble3 = `Is there anything on your mind i can help with?`;

          // Still run classification in the background for follow-up messages
          fireAndForget((async () => {
            try {
              const { classifyEntryState } = await import("./classifier.ts");
              const classification = await classifyEntryState(
                message.text,
                pdlContextStr,
              );
              if (classification) {
                fireAndForget(emitOnboardingEvent({
                  handle: message.from,
                  chatId: message.chatId,
                  eventType: "new_user_entry_state_classified",
                  messageTurnIndex: 1,
                  entryState: classification.entryState,
                  valueWedge: classification.recommendedWedge,
                  currentState: "new_user_intro_started",
                  confidenceScores: {
                    classification: classification.confidence,
                  },
                }));
                fireAndForget(transitionOnboardState({
                  handle: message.from,
                  newState: "first_value_pending",
                  entryState: classification.entryState,
                  firstValueWedge: classification.recommendedWedge,
                }));
              }
            } catch (err) {
              console.warn(
                "[pipeline] background classification failed:",
                (err as Error).message,
              );
            }
          })());

          // Persist user message
          fireAndForget(
            addMessage(message.chatId, "user", message.text, message.from, {
              isGroupChat: false,
              service: message.service,
            }),
          );

          // Send the three bubbles (first line uses Linq full-screen confetti)
          const handle1 = await pSendMessage(message, bubble1, {
            type: "screen",
            name: "confetti",
          });
          fireAndForget(
            logOutboundMessage(
              message.chatId,
              "text",
              { text: bubble1 },
              "sent",
              handle1,
            ),
          );
          await new Promise((resolve) => setTimeout(resolve, 1500));
          const handle2 = await pSendMessage(message, bubble2);
          fireAndForget(
            logOutboundMessage(
              message.chatId,
              "text",
              { text: bubble2 },
              "sent",
              handle2,
            ),
          );
          await new Promise((resolve) => setTimeout(resolve, 1500));
          const handle3 = await pSendMessage(message, bubble3);
          fireAndForget(
            logOutboundMessage(
              message.chatId,
              "text",
              { text: bubble3 },
              "sent",
              handle3,
            ),
          );

          // Persist assistant message and update onboard state
          const historyText = `${bubble1} ${bubble2} ${bubble3}`;
          fireAndForget(addMessage(message.chatId, "assistant", historyText));
          const updatedMessages = [
            ...nestUser.onboardMessages,
            { role: "user", content: message.text },
            { role: "assistant", content: historyText },
          ];
          await updateOnboardState(
            message.from,
            updatedMessages,
            nestUser.onboardCount + 1,
          );

          if (eventId) {
            fireAndForget(markWebhookEventStatus(eventId, "completed"));
          }
          return;
        }

        const turnInput: TurnInput = {
          chatId: message.chatId,
          userMessage: message.text,
          images: message.images,
          audio: message.audio,
          senderHandle: message.from,
          isGroupChat: false,
          participantNames: [],
          chatName: null,
          service: message.service,
          incomingEffect: message.incomingEffect,
          authUserId,
          isOnboarding: true,
          onboardingContext,
          timezone: userTimezone,
          voiceMode: wantsVoice,
        };

        // Wedge detection for messages 2+ (classification handles message 1)
        if (!isFirstOnboardMessage && nestUser.onboardCount >= 1) {
          const detectedWedge = detectWedgeFromMessage(message.text);
          if (detectedWedge) {
            fireAndForget(emitOnboardingEvent({
              handle: message.from,
              chatId: message.chatId,
              eventType: "new_user_first_value_wedge_selected",
              messageTurnIndex: nestUser.onboardCount + 1,
              valueWedge: detectedWedge,
              currentState: nestUser.onboardState,
            }));

            fireAndForget(transitionOnboardState({
              handle: message.from,
              newState: "first_value_delivered",
              firstValueDelivered: true,
              capabilityCategory: detectedWedge,
            }));
          }
        }

        const result = await handleTurn(turnInput);

        // Server-side safety net: catch any model response that wrongly agrees
        // the user is verified when the system still shows them as unverified.
        result.text = guardVerificationAcknowledgement(result.text);

        const lastAssistantPlain = [...nestUser.onboardMessages]
          .reverse()
          .find((m) => m.role === "assistant")?.content ?? "";
        result.text = enforceOnboardingVerificationBubble(
          result.text,
          onboardUrl,
          message.text,
          lastAssistantPlain,
          nestUser.onboardCount,
        );

        // Onboarding state machine events
        await emitOnboardingEvents(message, nestUser, result);

        // Update onboard state
        const historyText = result.text
          ? splitBubbles(result.text).join(" ")
          : "";
        const updatedMessages = [
          ...nestUser.onboardMessages,
          { role: "user", content: message.text },
          { role: "assistant", content: historyText },
        ];
        await updateOnboardState(
          message.from,
          updatedMessages,
          nestUser.onboardCount + 1,
        );

        // Deliver response
        await deliverResponse(message, result, undefined, wantsVoice);
      } catch (e) {
        console.error(
          "[pipeline] onboarding failed, sending fallback:",
          e instanceof Error ? e.message : e,
        );
        const onboardUrl =
          `https://nest.expert/?token=${nestUser.onboardingToken}`;

        let fallbackText: string;
        try {
          const { geminiSimpleText } = await import("./ai/gemini.ts");
          const { MODEL_MAP } = await import("./ai/models.ts");
          const result = await geminiSimpleText({
            model: MODEL_MAP.fast,
            systemPrompt:
              `You are Nest, a casual personal assistant. Something went wrong processing the user's message. Write a brief, natural reply (max 30 words) that:
1. Apologises casually for the hiccup
2. Asks them to try again or rephrase
Start with an uppercase letter. Keep it warm and casual. No emojis.`,
            userMessage: `User said: "${message.text.substring(0, 200)}"`,
            maxOutputTokens: 80,
          });
          fallbackText = cleanResponse(result.text);
        } catch {
          fallbackText =
            `Something tripped me up there. Mind trying that again?`;
        }

        const handle = await pSendMessage(message, fallbackText);
        fireAndForget(
          logOutboundMessage(
            message.chatId,
            "text",
            { text: fallbackText },
            "sent",
            handle,
          ),
        );
      }

      if (eventId) fireAndForget(markWebhookEventStatus(eventId, "completed"));
      return;
    }

    if (nestUser.lastProactiveSentAt) {
      isProactiveReply = shouldTreatAsProactiveReply(message.text);
      fireAndForget(markProactiveReplied(message.from));
    }
  }

  // Single source of truth for "composio mode": the env-driven flag.
  // No "hey comp" / "hey nest" keyword switching, no per-chat session row.
  // When the flag is false, normal Nest mode is the default for every chat.
  const composioModeActive = nestV3RuntimeEnabledForHandle(message.from);

  if (!composioModeActive) {
    const delegatedOwner = await handleContactDelegationTurn(
      message,
      authUserId,
      ownerDisplayName,
    );
    if (delegatedOwner.handled) {
      console.log("[pipeline] contact delegation owner turn handled", {
        chatId: message.chatId,
        messageId: message.messageId,
        reason: delegatedOwner.reason,
      });
      if (eventId) fireAndForget(markWebhookEventStatus(eventId, "completed"));
      return;
    }
  }

  await logBugReportIfNeeded(message, authUserId);

  // ─── Group chat: sync, classify action, enrich context ──────────────────
  let groupCtx: GroupContext | null = null;
  if (message.isGroupChat) {
    groupCtx = await syncGroupFromLinq(message.chatId).catch((err) => {
      console.warn("[pipeline] group sync failed:", (err as Error).message);
      return null;
    });

    if (groupCtx) {
      message.participantNames = groupCtx.participantNames;
      message.chatName = groupCtx.group.displayName;

      fireAndForget(recordGroupActivity(message.chatId));

      // Detect vibe after a few messages if still default
      if (groupCtx.group.groupVibe === "mixed") {
        fireAndForget(
          detectGroupVibe(message.chatId).then((vibe) => {
            if (vibe !== "mixed") {
              return updateGroupVibe(message.chatId, vibe);
            }
          }),
        );
      }
    }
  }

  // ─── Active user / group flow — through the orchestrator ────────────────
  const turnInput: TurnInput = {
    chatId: message.chatId,
    userMessage: message.text,
    images: message.images,
    audio: message.audio,
    senderHandle: message.from,
    isGroupChat: message.isGroupChat,
    participantNames: message.participantNames,
    chatName: message.chatName,
    service: message.service,
    incomingEffect: message.incomingEffect,
    authUserId,
    isOnboarding: false,
    isProactiveReply,
    timezone: userTimezone,
    voiceMode: wantsVoice,
    assistantMode: composioModeActive ? "composio" : "default",
    // Pre-ack: fires only when user_profiles.new_router = true and the route
    // predicts a tool-using action. Best-effort side-channel; main reply
    // continues to stream via deliverResponse below.
    onPreAck: async (text: string) => {
      try {
        const handle = await pSendMessage(message, text);
        fireAndForget(
          logOutboundMessage(
            message.chatId,
            "text",
            { text, preAck: true },
            "sent",
            handle,
          ),
        );
      } catch (err) {
        console.warn("[pipeline] pre-ack send failed:", (err as Error).message);
      }
    },
  };

  if (composioModeActive) {
    try {
      const run = await runNestAgent({
        source: "linq_inbound",
        triggerType: "inbound",
        userMessage: message.text,
        senderHandle: message.from,
        botNumber: message.conversation.recipientNumber,
        chatId: message.chatId,
        messageId: message.messageId,
        authUserId,
        timezone: userTimezone,
        metadata: {
          isGroupChat: message.isGroupChat,
          service: message.service,
          assistantMode: "composio",
        },
      });
      if (run.finalResponse) {
        for (
          const bubble of splitBubbles(run.finalResponse).map((part) =>
            cleanResponse(part)
          ).filter(Boolean)
        ) {
          const handle = await pSendMessage(message, bubble);
          fireAndForget(
            logOutboundMessage(
              message.chatId,
              "text",
              { text: bubble, runtime: "NESTV3", runId: run.runId },
              "sent",
              handle,
            ),
          );
          fireAndForget(
            addMessage(message.chatId, "assistant", bubble, undefined, {
              engagement: NEST_CONVERSATION_ENGAGEMENT,
              runtime: "NESTV3",
              runId: run.runId,
            }),
          );
        }
      }
      fireAndForget(
        addMessage(message.chatId, "user", message.text, message.from, {
          engagement: NEST_CONVERSATION_ENGAGEMENT,
          runtime: "NESTV3",
          runId: run.runId,
        }),
      );
      if (eventId) fireAndForget(markWebhookEventStatus(eventId, "completed"));
      return;
    } catch (error) {
      console.error(
        "[pipeline] NESTV3 runtime failed, falling back to legacy orchestrator:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  // If user sent images with text, run Nano Banana Pro 2 in parallel with the LLM turn
  const hasUserImages = message.images.length > 0 &&
    message.text.trim().length > 0;
  const nanoBananaPromise = hasUserImages
    ? editImage(message.text, message.images.map((img) => img.url))
      .catch((err) => {
        console.error("[pipeline] Nano Banana edit failed:", err);
        return null;
      })
    : Promise.resolve(null);

  const [result, nanoBananaUrl] = await Promise.all([
    handleTurn(turnInput),
    nanoBananaPromise,
  ]);

  // If Nano Banana produced an image, inject it into the result
  if (nanoBananaUrl && !result.generatedImage) {
    result.generatedImage = {
      url: nanoBananaUrl,
      prompt: message.text,
      isEdit: true,
    };
  }

  const replyToMessageId = await shouldReplyTo(message);
  await deliverResponse(message, result, replyToMessageId, wantsVoice);

  if (message.isGroupChat) {
    fireAndForget(
      linqApi.shareContactCard(message.chatId)
        .then(() =>
          console.log(
            `[pipeline] vCard sent to group ${message.chatId.slice(0, 8)}***`,
          )
        ),
    );
  }

  if (eventId) fireAndForget(markWebhookEventStatus(eventId, "completed"));
}
