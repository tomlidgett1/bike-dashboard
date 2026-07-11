import { pickServerEnv } from "@/lib/nest-portal/lib/server-env";
import {
  COACH_CONFIG_FIELDS,
  type PromptCoachChatMessage,
} from "@/lib/nest/prompt-coach-types";
import { loadPromptCoachContext } from "@/lib/nest/prompt-coach";

function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function extractOpenAiText(openaiData: Record<string, unknown>): string {
  if (typeof openaiData.output_text === "string") return openaiData.output_text;
  if (Array.isArray(openaiData.output)) {
    for (const item of openaiData.output) {
      if (
        item &&
        typeof item === "object" &&
        (item as { type?: string }).type === "message" &&
        Array.isArray((item as { content?: unknown }).content)
      ) {
        for (const block of (item as { content: unknown[] }).content) {
          if (
            block &&
            typeof block === "object" &&
            (block as { type?: string }).type === "output_text" &&
            typeof (block as { text?: string }).text === "string"
          ) {
            return (block as { text: string }).text;
          }
        }
      }
    }
  }
  return "";
}

function buildBrandTestInstructions(args: {
  brandKey: string;
  config: Record<string, string>;
  knowledge: Array<{ title: string; content_text: string; summary?: string }>;
}): string {
  const displayName =
    args.config.business_display_name?.trim() || args.brandKey;

  const configBlock = COACH_CONFIG_FIELDS.map((field) => {
    const value = args.config[field]?.trim();
    if (!value) return null;
    return `### ${field}\n${truncate(value, 1200)}`;
  })
    .filter(Boolean)
    .join("\n\n");

  const knowledgeBlock =
    args.knowledge.length === 0
      ? "(none)"
      : args.knowledge
          .slice(0, 30)
          .map(
            (item) =>
              `- ${item.title}: ${truncate(item.summary || item.content_text, 500)}`,
          )
          .join("\n");

  return `You are the Nest customer chatbot for ${displayName}, an Australian bike shop.

Reply as the shop would over SMS / iMessage:
- Short Australian English, warm and direct
- 1–3 short sentences unless the customer asks for detail
- Use ONLY the business facts below — do not invent hours, prices, stock, or policies
- If something is not in the facts, say you are not sure and offer to have the team confirm
- Do not mention that you are an AI, Nest, or a test mode
- Do not use tools or claim you checked live stock / bookings unless the facts already say so

## Business facts

${configBlock || "(no structured config yet)"}

## Knowledge base
${knowledgeBlock}`;
}

/**
 * Fast portal Test path: same Nest config/knowledge as Train, answered on YJ
 * without the ~40s Nest brand-chat edge stack.
 */
export async function runNestTestChatLocal(args: {
  brandKey: string;
  message: string;
  chatHistory?: PromptCoachChatMessage[];
}): Promise<{ reply: string; brand: string }> {
  const openaiKey = pickServerEnv(["OPENAI_API_KEY", "NEST_OPENAI_API_KEY"]);
  if (!openaiKey) {
    throw new Error("AI is not configured for Nest Test.");
  }

  const message = args.message.trim();
  if (!message) {
    throw new Error("message is required");
  }

  const ctx = await loadPromptCoachContext(args.brandKey);
  const displayName =
    ctx.config.business_display_name?.trim() || args.brandKey;
  const history = (args.chatHistory ?? []).slice(-12);

  const input: { role: string; content: string }[] = [
    ...history.map((turn) => ({
      role: turn.role === "assistant" ? "assistant" : "user",
      content: turn.text,
    })),
    { role: "user", content: message },
  ];

  const openaiRes = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      instructions: buildBrandTestInstructions({
        brandKey: args.brandKey,
        config: ctx.config,
        knowledge: ctx.knowledge,
      }),
      input,
      store: false,
      max_output_tokens: 400,
    }),
  });

  if (!openaiRes.ok) {
    const errText = await openaiRes.text();
    console.error(
      "[nest-test-chat] OpenAI error:",
      openaiRes.status,
      errText.slice(0, 400),
    );
    throw new Error(`Nest Test failed (${openaiRes.status})`);
  }

  const openaiData = (await openaiRes.json()) as Record<string, unknown>;
  const reply = extractOpenAiText(openaiData).trim();
  if (!reply) {
    throw new Error("Nest did not return a reply.");
  }

  return { reply, brand: displayName };
}
