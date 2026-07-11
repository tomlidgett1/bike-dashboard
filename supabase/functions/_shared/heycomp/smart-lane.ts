import { getComposioUserId, mintComposioConnectLink } from "../composio-tools.ts";
import {
  authConfigsForComposioToolkits,
  formatComposioAuthErrorMessage,
  getComposioClient,
} from "../composio-client.ts";
import { getOpenAIClient, getResponseText, type OpenAITool } from "../ai/models.ts";
import { getConversation } from "../state.ts";
import { getTool } from "../tools/registry.ts";
import { toOpenAITool, type ToolContext } from "../tools/types.ts";
import type {
  AgentLoopResult,
  SideEffect,
  ToolCallBlockedTrace,
  ToolCallTrace,
  ToolNamespace,
  TurnInput,
} from "../orchestrator/types.ts";
import { buildHeyCompLoopResult } from "./lane-result.ts";
import {
  createHeyCompPendingConfirmation,
  createHeyCompPendingResumeTask,
  logHeyCompAck,
  logHeyCompSmartRun,
  markHeyCompPendingConfirmation,
  type HeyCompPendingConfirmation,
} from "./persistence.ts";
import {
  buildConfirmationPrompt,
  classifyHeyCompToolRisk,
} from "./side-effect-gate.ts";

const HEY_COMP_SMART_MODEL = "gpt-5.4";
const MAX_SMART_ROUNDS = 6;

export const SMART_NATIVE_TOOL_NAMES = [
  "web_search",
  "places_search",
  "travel_time",
  "weather_lookup",
  "semantic_search",
  "deep_recall_search",
  "composio_list_connected_accounts",
  "composio_list_trigger_types",
  "composio_get_trigger_type",
  "composio_create_trigger",
  "composio_list_active_triggers",
] as const;

const HEY_COMP_SMART_SYSTEM = `You are Hey Comp in Smart mode inside an iMessage conversation.

Use Composio tools for connected apps, account data, workflows, automations, and actions.
Use the Nest-native exception tools only for internet search, Google Maps/places/directions/travel time, weather, semantic search, and memory retrieval.
For ongoing alerts or automations ("alert me when", "whenever", "notify me", "let me know when"), create a Composio trigger. Do not suggest Gmail filters or say live iMessage alerts are not possible. Use the trigger tools: list trigger types, inspect the trigger type, create the trigger, then confirm that future matching events will be sent back to this iMessage chat.
For Gmail sender alerts, prefer Gmail trigger type GMAIL_NEW_GMAIL_MESSAGE and set query to Gmail search syntax like from:tom@example.com when the schema supports it.

Plan quietly. Do not expose internal tool planning unless it helps the user.
If an account is missing, use the connection link flow rather than failing awkwardly.
Keep final iMessage replies short, clear, and human.`;

function normaliseFunctionToolName(tool: unknown): string | null {
  const value = tool as Record<string, unknown>;
  if (typeof value.name === "string") return value.name;
  const fn = value.function as Record<string, unknown> | undefined;
  if (typeof fn?.name === "string") return fn.name;
  return null;
}

function extractFunctionCalls(response: unknown): Array<{ call_id: string; name: string; arguments: string }> {
  const output = (response as { output?: unknown[] }).output ?? [];
  const calls: Array<{ call_id: string; name: string; arguments: string }> = [];
  for (const item of output) {
    const value = item as Record<string, unknown>;
    if (value.type !== "function_call") continue;
    calls.push({
      call_id: String(value.call_id ?? value.id ?? crypto.randomUUID()),
      name: String(value.name ?? ""),
      arguments: typeof value.arguments === "string" ? value.arguments : "{}",
    });
  }
  return calls.filter((c) => c.name.length > 0);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function titleCaseToolkit(slug: string): string {
  const special: Record<string, string> = {
    gmail: "Gmail",
    googlecalendar: "Google Calendar",
    google_calendar: "Google Calendar",
    slack: "Slack",
    xero: "Xero",
    notion: "Notion",
    github: "GitHub",
    linear: "Linear",
  };
  const key = slug.toLowerCase();
  if (special[key]) return special[key];
  return slug
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function collectConnectionLinks(value: unknown): Array<{ toolkit: string; url: string }> {
  const links: Array<{ toolkit: string; url: string }> = [];

  function visit(node: unknown, inheritedToolkit = ""): void {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, inheritedToolkit);
      return;
    }

    const obj = node as Record<string, unknown>;
    const toolkit = typeof obj.toolkit === "string"
      ? obj.toolkit
      : typeof obj.toolkit_slug === "string"
      ? obj.toolkit_slug
      : inheritedToolkit;
    const url = typeof obj.redirect_url === "string"
      ? obj.redirect_url
      : typeof obj.redirectUrl === "string"
      ? obj.redirectUrl
      : null;

    if (url) links.push({ toolkit: toolkit || "account", url });

    for (const [key, child] of Object.entries(obj)) {
      visit(child, toolkit || key);
    }
  }

  visit(value);
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = `${link.toolkit}:${link.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatConnectionLinksForIMessage(value: unknown): string | null {
  const links = collectConnectionLinks(value);
  if (links.length === 0) return null;

  if (links.length === 1) {
    const link = links[0];
    return `I’ve started the ${titleCaseToolkit(link.toolkit)} connection. Tap this link to finish:\n${link.url}`;
  }

  const lines = links.map((link) => `${titleCaseToolkit(link.toolkit)}: ${link.url}`);
  return `I’ve started those connections. Tap each link to finish:\n${lines.join("\n")}`;
}

function formatToolResultForIMessage(toolName: string, output: unknown): string {
  const connectionText = formatConnectionLinksForIMessage(output);
  if (connectionText) return connectionText;

  const data = (output as { data?: unknown })?.data;
  const message = typeof (data as { message?: unknown })?.message === "string"
    ? (data as { message: string }).message
    : typeof (output as { message?: unknown })?.message === "string"
    ? (output as { message: string }).message
    : null;

  if (message) return `Done. ${message}`;
  return `Done. I ran ${toolName.toLowerCase().replace(/_/g, " ")}.`;
}

function parseArguments(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function inferToolkitFromToolName(toolName: string): string | null {
  const first = toolName.split("_")[0]?.trim().toLowerCase();
  if (!first || first === "composio" || first === "tool") return null;
  return first;
}

function extractToolkitFromAuthError(message: string, toolName: string): string | null {
  const lower = message.toLowerCase();
  const quoted = lower.match(/toolkits?\s+require auth configs.*?:\s*([a-z0-9_, -]+)/i)?.[1];
  if (quoted) return quoted.split(/[, ]+/).find(Boolean) ?? inferToolkitFromToolName(toolName);
  const toolkit = lower.match(/\btoolkit[s]?\s+['"]?([a-z0-9_]+)['"]?/i)?.[1];
  return toolkit ?? inferToolkitFromToolName(toolName);
}

function looksLikeConnectionError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("connected account") ||
    lower.includes("not connected") ||
    lower.includes("auth") ||
    lower.includes("unauthorized") ||
    lower.includes("access denied") ||
    lower.includes("toolrouterv2_badrequest");
}

function namespaceForComposioRisk(risk: ReturnType<typeof classifyHeyCompToolRisk>): ToolNamespace {
  return risk === "read" ? "composio.read" : "composio.write";
}

function sideEffectForRisk(risk: ReturnType<typeof classifyHeyCompToolRisk>): SideEffect {
  return risk === "read" ? "read" : risk === "low_risk_write" ? "draft" : "commit";
}

async function getSmartTools(): Promise<{ openaiTools: OpenAITool[]; nativeNames: Set<string> }> {
  const nativeContracts = SMART_NATIVE_TOOL_NAMES
    .map((name) => getTool(name))
    .filter((tool): tool is NonNullable<ReturnType<typeof getTool>> => Boolean(tool));
  return {
    openaiTools: nativeContracts.map(toOpenAITool),
    nativeNames: new Set(nativeContracts.map((tool) => tool.name)),
  };
}

export async function executeConfirmedHeyCompTool(args: {
  input: TurnInput;
  pending: HeyCompPendingConfirmation;
}): Promise<AgentLoopResult> {
  const start = Date.now();
  const native = getTool(args.pending.toolName);
  const toolCtx: ToolContext = {
    chatId: args.input.chatId,
    senderHandle: args.input.senderHandle,
    authUserId: args.input.authUserId,
    timezone: args.input.timezone ?? null,
    pendingEmailSend: null,
    pendingEmailSends: [],
  };

  let text: string;
  const traces: ToolCallTrace[] = [];
  try {
    let output: unknown;
    if (native) {
      const result = await native.handler(args.pending.toolArguments, toolCtx);
      output = result.structuredData ?? result.content;
      traces.push({
        name: native.name,
        namespace: native.namespace,
        sideEffect: native.sideEffect,
        latencyMs: Date.now() - start,
        outcome: "success",
        approvalGranted: true,
        approvalMethod: "explicit",
        pendingActionId: args.pending.id,
      });
    } else {
      const composio = getComposioClient();
      const userId = getComposioUserId(args.input.authUserId, args.input.senderHandle);
      const session = await composio.create(userId, { manageConnections: true });
      output = await session.execute(args.pending.toolName, args.pending.toolArguments);
      traces.push({
        name: args.pending.toolName,
        namespace: "composio.write",
        sideEffect: "commit",
        latencyMs: Date.now() - start,
        outcome: "success",
        approvalGranted: true,
        approvalMethod: "explicit",
        pendingActionId: args.pending.id,
      });
    }
    await markHeyCompPendingConfirmation(args.pending.id, "completed");
    text = formatToolResultForIMessage(args.pending.toolName, output);
  } catch (error) {
    text = `I tried to run that, but it failed: ${error instanceof Error ? error.message : String(error)}`;
    await markHeyCompPendingConfirmation(args.pending.id, "cancelled");
  }

  return buildHeyCompLoopResult({
    text,
    systemPrompt: HEY_COMP_SMART_SYSTEM,
    initialMessages: [{ role: "user", content: args.input.userMessage }],
    availableToolNames: [args.pending.toolName],
    effectiveModel: "deterministic:heycomp-confirmed-tool",
    toolCallTraces: traces,
    toolsUsed: traces.map((t) => ({ tool: t.name })),
  });
}

export async function runHeyCompSmartLane(args: {
  input: TurnInput;
  turnId: string;
  routeReason: string;
}): Promise<AgentLoopResult> {
  const start = Date.now();
  const input = args.input;
  const composioUserId = getComposioUserId(input.authUserId, input.senderHandle);
  await logHeyCompSmartRun({
    turnId: args.turnId,
    chatId: input.chatId,
    senderHandle: input.senderHandle,
    authUserId: input.authUserId,
    composioUserId,
    status: "started",
    routeReason: args.routeReason,
    model: input.modelOverride ?? HEY_COMP_SMART_MODEL,
  });

  const client = getOpenAIClient();
  const composio = getComposioClient();
  const session = await composio.create(composioUserId, {
    manageConnections: true,
    authConfigs: authConfigsForComposioToolkits([]) ?? {},
  });

  const composioTools = await session.tools() as unknown[];
  const { openaiTools: nativeTools, nativeNames } = await getSmartTools();
  const tools = [...composioTools, ...nativeTools] as Parameters<typeof client.responses.create>[0]["tools"];
  const availableToolNames = [
    ...composioTools.map(normaliseFunctionToolName).filter((name): name is string => Boolean(name)),
    ...nativeNames,
  ];

  const history = await getConversation(input.chatId, 8);
  const initialMessages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: input.userMessage },
  ];
  const apiInput = [...initialMessages] as Array<Record<string, unknown>>;

  let response = await client.responses.create({
    model: input.modelOverride ?? HEY_COMP_SMART_MODEL,
    instructions: HEY_COMP_SMART_SYSTEM,
    input: initialMessages as Parameters<typeof client.responses.create>[0]["input"],
    tools,
    max_output_tokens: 1800,
    store: false,
  } as Parameters<typeof client.responses.create>[0]);

  const toolTraces: ToolCallTrace[] = [];
  const blocked: ToolCallBlockedTrace[] = [];
  const toolsUsed: Array<{ tool: string; detail?: string }> = [];
  const toolCalls: Array<Record<string, unknown>> = [];
  const toolResults: Array<Record<string, unknown>> = [];
  let rounds = 1;

  for (; rounds <= MAX_SMART_ROUNDS; rounds++) {
    const calls = extractFunctionCalls(response);
    if (calls.length === 0) break;

    const outputs: Array<{ type: "function_call_output"; call_id: string; output: string }> = [];
    for (const call of calls) {
      const callStart = Date.now();
      const parsedArgs = parseArguments(call.arguments);
      toolCalls.push({ name: call.name, arguments: parsedArgs });
      toolsUsed.push({ tool: call.name });
      const risk = classifyHeyCompToolRisk(call.name, parsedArgs);
      const native = nativeNames.has(call.name) ? getTool(call.name) : undefined;

      if (risk === "confirm_required") {
        const promptText = buildConfirmationPrompt(call.name, parsedArgs);
        const pendingId = await createHeyCompPendingConfirmation({
          turnId: args.turnId,
          chatId: input.chatId,
          senderHandle: input.senderHandle,
          authUserId: input.authUserId,
          toolName: call.name,
          toolArguments: parsedArgs,
          promptText,
          metadata: { routeReason: args.routeReason },
        });
        blocked.push({
          name: call.name,
          namespace: native?.namespace ?? namespaceForComposioRisk(risk),
          reason: "side_effect_denied",
          detail: "awaiting_iMessage_confirmation",
          pendingActionId: pendingId ?? undefined,
        });
        await logHeyCompSmartRun({
          turnId: args.turnId,
          chatId: input.chatId,
          senderHandle: input.senderHandle,
          authUserId: input.authUserId,
          composioUserId,
          status: "waiting_for_confirmation",
          routeReason: args.routeReason,
          model: input.modelOverride ?? HEY_COMP_SMART_MODEL,
          toolPlan: { availableToolNames },
          toolCalls,
          toolResults,
          finalText: promptText,
          latencyMs: Date.now() - start,
        });
        return buildHeyCompLoopResult({
          text: promptText,
          systemPrompt: HEY_COMP_SMART_SYSTEM,
          initialMessages,
          availableToolNames,
          effectiveModel: input.modelOverride ?? HEY_COMP_SMART_MODEL,
          rounds,
          toolCallTraces: toolTraces,
          toolCallsBlocked: blocked,
          toolsUsed,
        });
      }

      try {
        let result: unknown;
        if (native) {
          const toolCtx: ToolContext = {
            chatId: input.chatId,
            senderHandle: input.senderHandle,
            authUserId: input.authUserId,
            timezone: input.timezone ?? null,
            pendingEmailSend: null,
            pendingEmailSends: [],
          };
          const nativeResult = await native.handler(parsedArgs, toolCtx);
          result = nativeResult.structuredData ?? nativeResult.content;
          toolTraces.push({
            name: native.name,
            namespace: native.namespace,
            sideEffect: native.sideEffect,
            latencyMs: Date.now() - callStart,
            outcome: "success",
            approvalGranted: true,
            approvalMethod: "exempt",
          });
        } else {
          result = await session.execute(call.name, parsedArgs);
          toolTraces.push({
            name: call.name,
            namespace: namespaceForComposioRisk(risk),
            sideEffect: sideEffectForRisk(risk),
            latencyMs: Date.now() - callStart,
            outcome: "success",
            approvalGranted: risk === "read" || risk === "low_risk_write",
            approvalMethod: risk === "read" ? "exempt" : "implicit",
          });
        }
        toolResults.push({ name: call.name, result });
        const connectionText = formatConnectionLinksForIMessage(result);
        if (connectionText) {
          await logHeyCompSmartRun({
            turnId: args.turnId,
            chatId: input.chatId,
            senderHandle: input.senderHandle,
            authUserId: input.authUserId,
            composioUserId,
            status: "completed",
            routeReason: args.routeReason,
            model: input.modelOverride ?? HEY_COMP_SMART_MODEL,
            toolPlan: { availableToolNames },
            toolCalls,
            toolResults,
            finalText: connectionText,
            latencyMs: Date.now() - start,
          });
          return buildHeyCompLoopResult({
            text: connectionText,
            systemPrompt: HEY_COMP_SMART_SYSTEM,
            initialMessages,
            availableToolNames,
            effectiveModel: input.modelOverride ?? HEY_COMP_SMART_MODEL,
            rounds,
            toolCallTraces: toolTraces,
            toolCallsBlocked: blocked,
            toolsUsed,
          });
        }
        outputs.push({ type: "function_call_output", call_id: call.call_id, output: safeJson(result) });
      } catch (error) {
        const message = formatComposioAuthErrorMessage(error instanceof Error ? error.message : String(error));
        const toolkit = extractToolkitFromAuthError(message, call.name);
        if (!native && looksLikeConnectionError(message) && toolkit) {
          const link = await mintComposioConnectLink({ userId: composioUserId, toolkit });
          const text = `I can do that, but I need ${toolkit} connected first. Start here: ${link.url}`;
          await args.input.onPreAck?.(text);
          await logHeyCompAck({
            turnId: args.turnId,
            chatId: input.chatId,
            senderHandle: input.senderHandle,
            kind: "connection_link",
            text,
            status: "sent",
            metadata: { toolkit, toolName: call.name },
          });
          await createHeyCompPendingResumeTask({
            turnId: args.turnId,
            chatId: input.chatId,
            senderHandle: input.senderHandle,
            authUserId: input.authUserId,
            composioUserId,
            userText: input.userMessage,
            missingToolkits: [toolkit],
            connectionUrl: link.url,
            metadata: { toolName: call.name },
          });
          await logHeyCompSmartRun({
            turnId: args.turnId,
            chatId: input.chatId,
            senderHandle: input.senderHandle,
            authUserId: input.authUserId,
            composioUserId,
            status: "waiting_for_connection",
            routeReason: args.routeReason,
            model: input.modelOverride ?? HEY_COMP_SMART_MODEL,
            toolCalls,
            toolResults,
            finalText: text,
            latencyMs: Date.now() - start,
          });
          return buildHeyCompLoopResult({
            text,
            systemPrompt: HEY_COMP_SMART_SYSTEM,
            initialMessages,
            availableToolNames,
            effectiveModel: input.modelOverride ?? HEY_COMP_SMART_MODEL,
            rounds,
            toolCallTraces: toolTraces,
            toolCallsBlocked: blocked,
            toolsUsed,
          });
        }

        toolTraces.push({
          name: call.name,
          namespace: native?.namespace ?? namespaceForComposioRisk(risk),
          sideEffect: native?.sideEffect ?? sideEffectForRisk(risk),
          latencyMs: Date.now() - callStart,
          outcome: "error",
          inputSummary: message.slice(0, 200),
        });
        toolResults.push({ name: call.name, error: message });
        outputs.push({ type: "function_call_output", call_id: call.call_id, output: safeJson({ error: message }) });
      }
    }

    apiInput.push(...((response as { output?: Record<string, unknown>[] }).output ?? []));
    apiInput.push(...outputs);
    response = await client.responses.create({
      model: input.modelOverride ?? HEY_COMP_SMART_MODEL,
      instructions: HEY_COMP_SMART_SYSTEM,
      tools,
      input: apiInput as Parameters<typeof client.responses.create>[0]["input"],
      max_output_tokens: 1800,
      store: false,
    } as Parameters<typeof client.responses.create>[0]);
  }

  const text = getResponseText(response as never).trim() || "Done.";
  await logHeyCompSmartRun({
    turnId: args.turnId,
    chatId: input.chatId,
    senderHandle: input.senderHandle,
    authUserId: input.authUserId,
    composioUserId,
    status: "completed",
    routeReason: args.routeReason,
    model: input.modelOverride ?? HEY_COMP_SMART_MODEL,
    toolPlan: { availableToolNames },
    toolCalls,
    toolResults,
    finalText: text,
    latencyMs: Date.now() - start,
  });

  return buildHeyCompLoopResult({
    text,
    systemPrompt: HEY_COMP_SMART_SYSTEM,
    initialMessages,
    availableToolNames,
    effectiveModel: input.modelOverride ?? HEY_COMP_SMART_MODEL,
    rounds,
    toolCallTraces: toolTraces,
    toolCallsBlocked: blocked,
    toolsUsed,
  });
}
