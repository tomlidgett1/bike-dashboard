import { getOpenAIClient, getResponseText } from "../ai/models.ts";
import { logHeyCompAck } from "./persistence.ts";

const ACK_MODEL = "gpt-5.4-mini";
const INITIAL_ACK_PROMPT =
  "Write one contextual iMessage acknowledgement for Hey Comp. Max 18 words. Name the specific app, data, route, weather, search, or action implied. No emojis. Do not ask a question. Never say done, scheduled, set up, created, saved, or completed.";
const FOLLOWUP_ACK_PROMPT =
  "The Hey Comp task is still running. Write one contextual iMessage progress update. Max 18 words. Name the step that is still running. No apology. No emojis. Never say done, scheduled, set up, created, saved, or completed.";

async function generateAckText(
  kind: "initial" | "followup",
  userText: string,
  routeReason: string,
): Promise<string> {
  const client = getOpenAIClient();
  const response = await client.responses.create(
    {
      model: ACK_MODEL,
      instructions: kind === "initial"
        ? INITIAL_ACK_PROMPT
        : FOLLOWUP_ACK_PROMPT,
      input: [
        {
          role: "user",
          content: `User message: ${userText.slice(0, 500)}\nRouter reason: ${
            routeReason.slice(0, 500)
          }`,
        },
      ],
      max_output_tokens: 80,
      store: false,
    } as Parameters<typeof client.responses.create>[0],
  );
  const text = getResponseText(response).trim().replace(/^["“]|["”]$/g, "");
  if (text) return text;
  return kind === "initial"
    ? "Yep, I’ll check the right tools first and keep the reply tight."
    : "Still checking the tool side properly rather than guessing.";
}

export interface HeyCompAckScheduler {
  fireInitial(): Promise<void>;
  armFollowup(delayMs?: number): void;
  markFinal(): void;
}

export function createAckScheduler(args: {
  turnId: string;
  chatId: string;
  senderHandle: string | null;
  userText: string;
  routeReason: string;
  send: (text: string) => Promise<void> | void;
}): HeyCompAckScheduler {
  let final = false;
  let initialSent = false;
  let followupSent = false;
  let timer: number | null = null;

  async function send(kind: "initial" | "followup"): Promise<void> {
    if (final) {
      await logHeyCompAck({
        turnId: args.turnId,
        chatId: args.chatId,
        senderHandle: args.senderHandle,
        kind,
        text: "",
        status: "skipped",
        metadata: { reason: "final_already_sent" },
      });
      return;
    }

    if (kind === "initial" && initialSent) return;
    if (kind === "followup" && followupSent) return;
    if (kind === "initial") initialSent = true;
    if (kind === "followup") followupSent = true;

    const start = Date.now();
    let text = "";
    try {
      text = await generateAckText(kind, args.userText, args.routeReason);
      if (final) return;
      await args.send(text);
      await logHeyCompAck({
        turnId: args.turnId,
        chatId: args.chatId,
        senderHandle: args.senderHandle,
        kind,
        text,
        status: "sent",
        latencyMs: Date.now() - start,
      });
    } catch (error) {
      await logHeyCompAck({
        turnId: args.turnId,
        chatId: args.chatId,
        senderHandle: args.senderHandle,
        kind,
        text,
        status: "failed",
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    fireInitial: () => send("initial"),
    armFollowup: (delayMs = 10_000) => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        send("followup").catch((error) =>
          console.warn(
            "[heycomp:ack] followup failed:",
            error instanceof Error ? error.message : error,
          )
        );
      }, delayMs);
    },
    markFinal: () => {
      final = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
