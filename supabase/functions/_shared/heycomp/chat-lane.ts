import { getOpenAIClient, getResponseText } from "../ai/models.ts";
import { getConversation } from "../state.ts";
import type { AgentLoopResult, TurnInput } from "../orchestrator/types.ts";
import { buildHeyCompLoopResult } from "./lane-result.ts";

const HEY_COMP_CHAT_MODEL = "gpt-5.4-mini";

const HEY_COMP_CHAT_SYSTEM = `You are Hey Comp in Chat mode.

Chat mode has no tools, no Composio, no personal context, no semantic search, no internet, no weather, no maps, and no connected-account checks.

Use it only for general chat, static knowledge, writing help, explanations, brainstorming, and normal conversation where you can answer directly.

If the user might need personal data, current data, account data, external data, or an action, say briefly that this needs Smart mode and ask them to say exactly what they want done.`;

export async function runHeyCompChatLane(input: TurnInput): Promise<AgentLoopResult> {
  const history = await getConversation(input.chatId, 6);
  const messages = [
    ...history.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    { role: "user", content: input.userMessage },
  ];

  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: input.modelOverride ?? HEY_COMP_CHAT_MODEL,
    instructions: HEY_COMP_CHAT_SYSTEM,
    input: messages as Parameters<typeof client.responses.create>[0]["input"],
    max_output_tokens: 700,
    store: false,
  } as Parameters<typeof client.responses.create>[0]);

  // deno-lint-ignore no-explicit-any
  const usage = (response as any).usage as Record<string, unknown> | undefined;
  // deno-lint-ignore no-explicit-any
  const inputDetails = (usage as any)?.input_tokens_details as Record<string, number> | undefined;

  return buildHeyCompLoopResult({
    text: getResponseText(response).trim() || null,
    systemPrompt: HEY_COMP_CHAT_SYSTEM,
    initialMessages: messages,
    availableToolNames: [],
    effectiveModel: input.modelOverride ?? HEY_COMP_CHAT_MODEL,
    inputTokens: (usage?.input_tokens as number) ?? 0,
    outputTokens: (usage?.output_tokens as number) ?? 0,
    cachedTokens: inputDetails?.cached_tokens ?? 0,
  });
}
