import { getComposioClient } from "../../composio-client.ts";
import { getOpenAIClient, MODEL_MAP } from "../../ai/models.ts";
import { addRunStep, completeRunStep } from "../persistence/store.ts";
import type { GatewayToolResult, PlannerOutput, RuntimeContext } from "../types.ts";
import { createComposioTrigger } from "../tool-gateway/composio-triggers.ts";
import { NEST_IMESSAGE_FORMATTING_RULES } from "./imessage-formatting.ts";

export const NESTV3_AGENT_MODEL = MODEL_MAP.agent; // gpt-5.4 reasoning model

async function chooseSessionUserId(ctx: RuntimeContext, planner: PlannerOutput): Promise<string> {
  const candidateIds = ctx.composioUserIds.length ? ctx.composioUserIds : [ctx.composioUserId];
  const wanted = new Set(planner.allowedToolkits.map((toolkit) => toolkit.toLowerCase()));
  if (wanted.size === 0) return candidateIds[0] ?? ctx.composioUserId;

  for (const userId of candidateIds) {
    const accounts = await import("../../composio-tools.ts")
      .then((mod) => mod.listComposioConnectedAccounts(userId))
      .catch(() => []);
    if (accounts.some((account) =>
      (account.status === "ACTIVE" || account.status === "active") &&
      wanted.has(account.toolkit.toLowerCase())
    )) {
      return userId;
    }
  }
  return candidateIds[0] ?? ctx.composioUserId;
}

function responseToolNames(response: { output?: unknown[] }): string[] {
  const names: string[] = [];
  for (const item of response.output ?? []) {
    const record = item as Record<string, unknown>;
    if (record.type === "function_call" && typeof record.name === "string") {
      names.push(record.name);
    }
  }
  return names;
}

function normaliseFinalText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1: $2")
    .replace(/#{1,6}\s*/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\n\nIf you want,[\s\S]*$/i, "")
    .replace(/\n\nIf you'd like,[\s\S]*$/i, "")
    .trim();
}

function extractSenderEmail(message: string): string | null {
  return message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
}

async function createEmailTriggerIfRequested(args: {
  ctx: RuntimeContext;
  planner: PlannerOutput;
  userMessage: string;
}): Promise<{ text: string; toolResults: GatewayToolResult[] } | null> {
  if (args.planner.mode !== "trigger_create") return null;
  const mentionsEmail = args.planner.requiredApps.includes("email_provider") ||
    args.planner.requiredCapabilities.some((capability) => capability.includes("email"));
  if (!mentionsEmail) return null;

  const triggerUserId = await chooseSessionUserId(args.ctx, {
    ...args.planner,
    allowedToolkits: ["gmail", "outlook"],
  });
  const sender = extractSenderEmail(args.userMessage);
  const slug = "GMAIL_NEW_GMAIL_MESSAGE";
  const triggerConfig = sender ? { query: `from:${sender}` } : {};
  const stepId = await addRunStep({
    runId: args.ctx.runId,
    phase: "session_agent",
    stepType: "tool",
    toolName: "NESTV3_CREATE_EMAIL_TRIGGER",
    status: "running",
    inputSummary: sender ? `from:${sender}` : "new gmail message",
    payload: { slug, triggerConfig },
  });

  try {
    const result = await createComposioTrigger({
      userId: triggerUserId,
      authUserId: args.ctx.authUserId,
      handle: args.ctx.senderHandle,
      chatId: args.ctx.chatId,
      botNumber: args.ctx.botNumber,
      slug,
      triggerConfig,
    });
    await completeRunStep(stepId, {
      status: "completed",
      outputSummary: String(result.triggerId ?? "trigger created"),
      payload: result as unknown as Record<string, unknown>,
    });
    return {
      text: sender
        ? `Done ✓ I’ll let you know whenever you get an email from ${sender}.`
        : "Done ✓ I’ll let you know whenever a new email comes in.",
      toolResults: [{
        name: "NESTV3_CREATE_EMAIL_TRIGGER",
        status: "success",
        summary: "Created email trigger",
        payload: result as unknown as Record<string, unknown>,
        risk: "write",
      }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await completeRunStep(stepId, {
      status: "failed",
      error: message,
      payload: { slug, triggerConfig },
    });
    return {
      text: "I couldn’t create that email trigger yet. The connected Gmail trigger setup failed.",
      toolResults: [{
        name: "NESTV3_CREATE_EMAIL_TRIGGER",
        status: "error",
        summary: message,
        payload: { slug, triggerConfig },
        risk: "write",
      }],
    };
  }
}

export async function runComposioSessionAgent(args: {
  ctx: RuntimeContext;
  planner: PlannerOutput;
  userMessage: string;
}): Promise<{ text: string; toolResults: GatewayToolResult[] }> {
  const { ctx, planner, userMessage } = args;
  const localTrigger = await createEmailTriggerIfRequested({ ctx, planner, userMessage });
  if (localTrigger) return localTrigger;

  const sessionUserId = await chooseSessionUserId(ctx, planner);
  const composio = getComposioClient();
  const session = await composio.create(sessionUserId, {
    manageConnections: true,
    workbench: { enable: true, sandboxSize: "standard" },
  });
  const tools = await session.tools();
  const client = getOpenAIClient();

  const instructions = [
    "You are Nest Agent Runtime's connected-app execution agent.",
    "Use Composio session meta-tools directly. Start with COMPOSIO_SEARCH_TOOLS when the concrete tool is unknown.",
    "If a required app is not connected, call COMPOSIO_MANAGE_CONNECTIONS and include the returned URL in the final iMessage.",
    "If connected, execute with COMPOSIO_MULTI_EXECUTE_TOOL. Use COMPOSIO_REMOTE_WORKBENCH for large summaries or data processing.",
    "For trigger_create / whenever / notify-me-when requests: do not suggest Gmail filters, stars, forwarding, or rules as the answer.",
    "For email trigger requests, find and create the Composio/Nest trigger that monitors incoming mail, with a sender query such as from:person@example.com when requested.",
    "A trigger setup is only successful if a trigger/create/register tool actually runs. If no trigger tool is available, say you couldn't create that trigger yet; do not offer unrelated Gmail mailbox actions.",
    NEST_IMESSAGE_FORMATTING_RULES,
    "Do not expose JSON, tool protocol, session IDs, or raw payloads in the final message.",
    "Never say Done unless the requested read/write actually completed.",
  ].join("\n");

  const input: Array<Record<string, unknown>> = [{
    role: "user",
    content: [
      `User request: ${userMessage}`,
      `Runtime timezone: ${ctx.timezone ?? "Australia/Melbourne"}`,
      `Planner output: ${JSON.stringify(planner)}`,
    ].join("\n\n"),
  }];

  const toolResults: GatewayToolResult[] = [];
  for (let round = 0; round < 12; round++) {
    const stepId = await addRunStep({
      runId: ctx.runId,
      phase: "session_agent",
      stepType: "orchestrator",
      status: "running",
      inputSummary: `round ${round + 1}`,
      payload: { model: NESTV3_AGENT_MODEL },
    });

    const response = await client.responses.create({
      model: NESTV3_AGENT_MODEL,
      instructions,
      input: input as unknown as Parameters<typeof client.responses.create>[0]["input"],
      tools: tools as Parameters<typeof client.responses.create>[0]["tools"],
      max_output_tokens: 6000,
      // Multi-step Responses API tool loops with reasoning can include response
      // item IDs that must be retrievable in the next round.
      store: true,
      prompt_cache_key: "NESTV3-session-agent",
      reasoning: { effort: "medium" as const },
    } as Parameters<typeof client.responses.create>[0]) as unknown as {
      output: unknown[];
      output_text?: string;
    };

    const names = responseToolNames(response);
    await completeRunStep(stepId, {
      status: "completed",
      outputSummary: names.length ? `tool calls: ${names.join(", ")}` : "model response",
      payload: { toolCalls: names },
    });

    if (names.length === 0) {
      const text = normaliseFinalText(typeof response.output_text === "string" ? response.output_text : "");
      return {
        text: text || "I couldn't get a usable response from the connected-app agent.",
        toolResults,
      };
    }

    const toolStepId = await addRunStep({
      runId: ctx.runId,
      phase: "session_agent",
      stepType: "tool",
      toolName: "composio_session_tools",
      status: "running",
      inputSummary: names.join(", "),
      payload: { toolCalls: names },
    });

    const outputs = await composio.provider.handleResponse(
      sessionUserId,
      response as never,
    );
    await completeRunStep(toolStepId, {
      status: "completed",
      outputSummary: `${outputs.length} tool result(s)`,
      payload: { toolCalls: names, resultCount: outputs.length },
    });

    toolResults.push(...names.map((name) => ({
      name,
      status: "success" as const,
      summary: name,
      payload: {},
    })));

    input.push(...response.output as unknown as Record<string, unknown>[]);
    input.push(...outputs as unknown as Record<string, unknown>[]);
  }

  return {
    text: "I couldn't finish that connected-app request within the safe step limit.",
    toolResults,
  };
}
