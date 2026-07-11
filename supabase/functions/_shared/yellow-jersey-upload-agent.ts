import { geminiSimpleText, isGeminiModel } from "./ai/gemini.ts";
import {
  getOpenAIClient,
  getResponseText,
  MODEL_MAP,
  REASONING_EFFORT,
  type ResponsesCreateResult,
} from "./ai/models.ts";
import { cleanResponse } from "./imessage-text-format.ts";

export type UploadAction =
  | "start_new"
  | "finish"
  | "finish_bulk"
  | "cancel"
  | "resend_link"
  | "chat";

export interface UploadTurnDecision {
  action: UploadAction;
  reply: string;
}

export interface UploadTurnContext {
  userMessage: string;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  sessionStatus: "open" | "processing" | "ready" | "failed" | "cancelled";
  photosBeforeMessage: number;
  photosAfterMessage: number;
  incomingPhotoCount: number;
  maxImages: number;
  hasHandoffLink: boolean;
  isProcessing: boolean;
  previousListingReady: boolean;
}

const UPLOAD_AGENT_INSTRUCTIONS = `You are Nest, texting someone who is creating a Yellow Jersey marketplace listing by sending you product photos over iMessage.

Each turn, understand what they mean in plain natural language — including casual phrasing like "lets do a new one", "another listing", "ok sweet build it", "nah forget it", "can I get that link again", "how does this work", or just "hey".

Pick exactly one action and write a short natural reply (1-3 sentences). Sound like a helpful mate texting back: warm, direct, Australian English. No bullet points, no scripted templates, no repeating the same wording every time.

Actions:
- start_new: They want a fresh listing — new item, another one, start over, do a new one, sell something else, etc.
- finish: They clearly want you to build ONE listing from the photos collected so far
- finish_bulk: The photos are MULTIPLE different products and they want each listed separately — e.g. "they're all different bikes", "list these separately", "a few different things here", "can you do them as separate listings"
- cancel: They want to stop or abandon the current upload
- resend_link: They want the existing listing link again (only when a link was already built)
- chat: Greetings, questions, small talk, photo acknowledgements, or anything that is not clearly start/finish/cancel/resend

Rules:
- If isProcessing is true, action must be "chat" — tell them you're still building the last listing.
- Before building (finish or finish_bulk): if the recent messages show you have NOT yet asked whether there's anything they'd like to highlight in the listing (upgrades, extras included, service history, condition quirks — anything at all), use "chat" to ask that one quick question instead of building. Once they've answered it — even with "nah all good" — build straight away with finish/finish_bulk; don't ask again or wait for another go-ahead.
- Use "finish" only when they clearly want the listing built AND photosAfterMessage > 0. If they want to finish but there are no photos yet, use "chat" and ask for photos naturally.
- Use "finish_bulk" only when photosAfterMessage > 1 and they've made clear the photos cover more than one product. If you're not sure whether the photos are one item or several, use "chat" and ask naturally (e.g. "is this all the one bike, or a few different things?").
- Use "start_new" whenever they want another item, even if a previous link exists or photos are already on the old listing.
- If the previous listing is already finished and they send new photos, that is automatically a fresh listing — treat it as the new item, never the old one.
- Use "resend_link" only when hasHandoffLink is true and they are asking for the link again.
- If they sent photos this turn and are not starting fresh or finishing, usually "chat" with a natural acknowledgement. If they send several photos that look like they could be different products, it's good to ask whether it's one item or a few.
- Never invent or include URLs — the system appends links separately.
- Do not mention JSON, actions, or that you are an AI.

Respond with ONLY valid JSON:
{
  "action": "start_new" | "finish" | "finish_bulk" | "cancel" | "resend_link" | "chat",
  "reply": "your natural iMessage reply"
}`;

const VALID_ACTIONS = new Set<UploadAction>([
  "start_new",
  "finish",
  "finish_bulk",
  "cancel",
  "resend_link",
  "chat",
]);

export function parseUploadTurnDecision(raw: string): UploadTurnDecision | null {
  try {
    let text = raw.trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) text = fence[1].trim();

    const parsed = JSON.parse(text) as { action?: string; reply?: string };
    if (!parsed.action || !VALID_ACTIONS.has(parsed.action as UploadAction)) {
      return null;
    }

    const reply = typeof parsed.reply === "string"
      ? cleanResponse(parsed.reply.trim())
      : "";
    if (!reply) return null;

    return {
      action: parsed.action as UploadAction,
      reply,
    };
  } catch {
    return null;
  }
}

function buildUserPayload(ctx: UploadTurnContext): string {
  const history = ctx.recentMessages
    .slice(-8)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");

  return [
    history ? `Recent messages:\n${history}` : "",
    `Session status: ${ctx.sessionStatus}`,
    `Photos collected before this message: ${ctx.photosBeforeMessage} (max ${ctx.maxImages})`,
    `Photos that will be on this listing after this message: ${ctx.photosAfterMessage}`,
    `Photos attached to this message: ${ctx.incomingPhotoCount}`,
    `Listing link already built: ${ctx.hasHandoffLink ? "yes" : "no"}`,
    ctx.previousListingReady
      ? "The previous listing is already finished — if they want another item, use start_new."
      : "",
    ctx.isProcessing ? "A listing is currently being built right now." : "",
    `User just said: "${ctx.userMessage || "[sent photos only]"} "`,
  ].filter(Boolean).join("\n\n");
}

function sanitiseDecision(
  decision: UploadTurnDecision,
  ctx: UploadTurnContext,
): UploadTurnDecision {
  if (ctx.isProcessing) {
    return { action: "chat", reply: decision.reply };
  }

  if (decision.action === "finish" && ctx.photosAfterMessage === 0) {
    return { action: "chat", reply: decision.reply };
  }

  if (decision.action === "finish_bulk" && ctx.photosAfterMessage < 2) {
    // Can't split fewer than two photos into multiple listings.
    return ctx.photosAfterMessage === 1
      ? { action: "finish", reply: decision.reply }
      : { action: "chat", reply: decision.reply };
  }

  if (decision.action === "resend_link" && !ctx.hasHandoffLink) {
    return { action: "chat", reply: decision.reply };
  }

  return decision;
}

function fallbackDecision(ctx: UploadTurnContext): UploadTurnDecision {
  if (ctx.isProcessing) {
    return {
      action: "chat",
      reply: "Still putting that listing together — I'll send the link through as soon as it's ready.",
    };
  }

  if (ctx.incomingPhotoCount > 0) {
    const total = ctx.photosAfterMessage;
    return {
      action: "chat",
      reply: total > 0
        ? `Got them — ${total} photo${total === 1 ? "" : "s"} for this listing so far. Send more if you need, or tell me when you want me to build it.`
        : `Got ${
          ctx.incomingPhotoCount === 1 ? "that photo" : "those photos"
        }. Send any others, then let me know when you're ready for the listing.`,
    };
  }

  return {
    action: "chat",
    reply: "Happy to help you list something on Yellow Jersey — send through the photos whenever you're ready.",
  };
}

export async function decideUploadTurn(
  ctx: UploadTurnContext,
): Promise<UploadTurnDecision> {
  const userPayload = buildUserPayload(ctx);

  try {
    const model = MODEL_MAP.fast;
    let text: string | undefined;

    if (isGeminiModel(model)) {
      const result = await geminiSimpleText({
        model,
        systemPrompt: UPLOAD_AGENT_INSTRUCTIONS,
        userMessage: userPayload,
        maxOutputTokens: 256,
        temperature: 0.8,
      });
      text = result.text;
    } else {
      const client = getOpenAIClient();
      const response = (await client.responses.create({
        model,
        instructions: UPLOAD_AGENT_INSTRUCTIONS,
        input: userPayload,
        max_output_tokens: 256,
        store: false,
        reasoning: { effort: REASONING_EFFORT.fast },
      } as Parameters<typeof client.responses.create>[0])) as ResponsesCreateResult;
      text = getResponseText(response);
    }

    const parsed = text ? parseUploadTurnDecision(text) : null;
    if (parsed) return sanitiseDecision(parsed, ctx);
  } catch (error) {
    console.warn(
      "[yellow-jersey-upload-agent] turn decision failed:",
      error instanceof Error ? error.message : error,
    );
  }

  return fallbackDecision(ctx);
}
