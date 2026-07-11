import { webSearchTool } from "../../tools/web-search.ts";
import { placesSearchTool } from "../../tools/places-search.ts";
import { travelTimeTool } from "../../tools/travel-time.ts";
import { getOpenAIClient, getResponseText } from "../../ai/models.ts";
import type { PlannerOutput, RuntimeContext, GatewayToolInput, GatewayToolResult } from "../types.ts";
import { addRunStep, completeRunStep } from "../persistence/store.ts";
import { createAgentSpec, createAutomation, createPendingIntent } from "../persistence/records.ts";
import { buildAgentSpecMarkdown } from "../markdown/build-agent-spec.ts";
import { nextRunFromCron } from "../scheduling/cron.ts";
import { capabilitySearchQuery, capabilityToRequiredToolkits } from "./capability-map.ts";
import { emailProviderToolkitsToConnect, hasToolkit, refreshConnectedAccounts, resolveEmailProvider } from "./connection-state.ts";
import { executeComposioActionTool, executeComposioReadTool, executeComposioSessionTool, getComposioToolSchema, mintComposioConnectLink, searchComposioSessionTools, searchComposioTools } from "./composio-tools.ts";
import { createComposioTrigger } from "./composio-triggers.ts";
import { inferRiskFromSlug, writeApproved } from "./policy.ts";
import { assertToolAllowed, buildToolSandboxPolicy } from "./tool-sandbox.ts";
import { normaliseComposioToolkitSlug, toolkitForApp } from "./provider-bindings.ts";

export const NESTV3_TOOL_RESOLVER_MODEL = "gpt-5.4-mini";

function safeJsonSummary(value: unknown, max = 600): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const redacted = text
    .replace(/Invalid API key:\s*[^"',\s}]+/gi, "Invalid API key: [REDACTED]")
    .replace(/(api[_-]?key|authorization|bearer|token|secret)["':=\s]+[^"',\s}]+/gi, "$1=[REDACTED]");
  return redacted.length > max ? `${redacted.slice(0, max)}…` : redacted;
}

async function logTool<T>(
  ctx: RuntimeContext,
  name: string,
  inputSummary: string,
  fn: () => Promise<T>,
): Promise<T> {
  const stepId = await addRunStep({
    runId: ctx.runId,
    phase: "gateway",
    stepType: "tool",
    toolName: name,
    status: "running",
    inputSummary,
  });
  try {
    const result = await fn();
    await completeRunStep(stepId, {
      status: "completed",
      outputSummary: safeJsonSummary(result, 300),
      payload: { summary: safeJsonSummary(result, 1200) },
    });
    return result;
  } catch (error) {
    await completeRunStep(stepId, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      payload: {},
    });
    throw error;
  }
}

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`No JSON object in model response: ${trimmed.slice(0, 200)}`);
    return JSON.parse(match[0]) as Record<string, unknown>;
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

async function callResolverJson(args: {
  instructions: string;
  input: Record<string, unknown>;
  cacheKey: string;
}): Promise<Record<string, unknown>> {
  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: NESTV3_TOOL_RESOLVER_MODEL,
    instructions: args.instructions,
    input: JSON.stringify(args.input),
    max_output_tokens: 1500,
    store: false,
    prompt_cache_key: args.cacheKey,
    reasoning: { effort: "low" as const },
  } as Parameters<typeof client.responses.create>[0]);
  return parseJsonObject(getResponseText(response));
}

async function buildDynamicSearchQueries(args: {
  capability: string;
  userMessage: string;
  toolkits: string[];
  timezone: string | null;
}): Promise<string[]> {
  const fallback = [
    capabilitySearchQuery(args.capability),
    `${args.toolkits.join(" ")} ${args.userMessage}`,
    `${args.toolkits.join(" ")} list activities summary stats`,
  ].filter((query) => query.trim().length > 0);

  try {
    const json = await callResolverJson({
      cacheKey: "NESTV3-tool-query-v1",
      instructions: [
        "You generate Composio tool search queries.",
        "Return strict JSON: {\"queries\":[\"...\"]}.",
        "Use 2-4 concise queries. Include likely domain nouns and verbs.",
        "For Strava summaries, include activities, athlete stats, distance, elevation, list activities.",
      ].join("\n"),
      input: args,
    });
    const queries = stringArray(json.queries).slice(0, 4);
    return queries.length ? [...new Set([...queries, ...fallback])] : fallback;
  } catch {
    return fallback;
  }
}

async function chooseDynamicTool(args: {
  capability: string;
  userMessage: string;
  tools: Array<Record<string, unknown>>;
}): Promise<{ slug: string; reason: string }> {
  const json = await callResolverJson({
    cacheKey: "NESTV3-tool-select-v1",
    instructions: [
      "You select the best Composio tool for a Nest capability.",
      "Return strict JSON: {\"slug\":\"TOOL_SLUG\",\"reason\":\"short reason\"}.",
      "Only choose a slug that appears in the provided tools list.",
      "If none fit, return {\"slug\":\"\",\"reason\":\"no suitable tool\"}.",
    ].join("\n"),
    input: args,
  });
  return {
    slug: typeof json.slug === "string" ? json.slug : "",
    reason: typeof json.reason === "string" ? json.reason : "",
  };
}

async function buildDynamicToolArguments(args: {
  capability: string;
  userMessage: string;
  timezone: string | null;
  schema: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const json = await callResolverJson({
    cacheKey: "NESTV3-tool-args-v1",
    instructions: [
      "You build JSON arguments for a Composio tool schema.",
      "Return strict JSON: {\"input\":{...}}.",
      "Use only fields that exist in the schema. Omit unknown fields.",
      "For date ranges, use the user's request and runtime timezone. If the schema asks for Unix timestamps, use seconds unless it explicitly says milliseconds.",
      "Never invent credentials, tokens, or connected account IDs.",
    ].join("\n"),
    input: args,
  });
  return json.input && typeof json.input === "object" && !Array.isArray(json.input)
    ? json.input as Record<string, unknown>
    : {};
}

async function summariseDynamicToolResult(args: {
  capability: string;
  userMessage: string;
  toolSlug: string;
  toolResult: Record<string, unknown>;
}): Promise<string> {
  try {
    const json = await callResolverJson({
      cacheKey: "NESTV3-tool-summarise-v1",
      instructions: [
        "You summarise a connected-app tool result for an iMessage user.",
        "Return strict JSON: {\"summary\":\"...\"}.",
        "Use Australian English. Be concise but useful.",
        "If the tool result is empty or incomplete, say exactly what is missing.",
        "Do not claim more than the tool result supports.",
      ].join("\n"),
      input: {
        capability: args.capability,
        userMessage: args.userMessage,
        toolSlug: args.toolSlug,
        toolResult: safeJsonSummary(args.toolResult, 6000),
      },
    });
    if (typeof json.summary === "string" && json.summary.trim()) return json.summary.trim();
  } catch {
    // Fall through to safe summary.
  }
  return safeJsonSummary(args.toolResult, 1200);
}

async function executeDynamicCapability(args: {
  ctx: RuntimeContext;
  planner: PlannerOutput;
  capability: string;
  input: Record<string, unknown>;
  policy: ReturnType<typeof buildToolSandboxPolicy>;
}): Promise<GatewayToolResult> {
  const { ctx, planner, capability, policy } = args;
  const userMessage = String(args.input.query ?? args.input.userMessage ?? "");
  const toolkits = capabilityToRequiredToolkits(capability).filter((toolkit) =>
    policy.allowedToolkits.includes(toolkit)
  );
  const queries = await buildDynamicSearchQueries({
    capability,
    userMessage,
    toolkits,
    timezone: ctx.timezone,
  });

  const foundTools: Array<Record<string, unknown>> = [];
  let lastSessionSearch: Awaited<ReturnType<typeof searchComposioSessionTools>> | null = null;
  for (const query of queries) {
    const scopedResult = await logTool(ctx, "COMPOSIO_SEARCH_TOOLS", `${capability}: ${query}`, () =>
      searchComposioSessionTools({ userId: ctx.composioUserId, query, toolkits, limit: 8 })
    ).catch((error) => ({
      items: [] as Array<Record<string, unknown>>,
      total: 0,
      sessionId: null,
      toolkitConnectionStatuses: [],
      nextStepsGuidance: [],
      error: error instanceof Error ? error.message : String(error),
    }));
    lastSessionSearch = scopedResult as Awaited<ReturnType<typeof searchComposioSessionTools>>;

    const unscopedResult = (scopedResult.items?.length ?? 0) > 0
      ? { items: [] as Array<Record<string, unknown>>, total: 0, sessionId: null, toolkitConnectionStatuses: [], nextStepsGuidance: [] }
      : await logTool(ctx, "COMPOSIO_SEARCH_TOOLS", `${capability}: ${query} (unscoped fallback)`, () =>
        searchComposioSessionTools({ userId: ctx.composioUserId, query, limit: 12 })
      ).catch((error) => ({
        items: [] as Array<Record<string, unknown>>,
        total: 0,
        sessionId: null,
        toolkitConnectionStatuses: [],
        nextStepsGuidance: [],
        error: error instanceof Error ? error.message : String(error),
      }));
    if ((unscopedResult.items?.length ?? 0) > 0) {
      lastSessionSearch = unscopedResult as Awaited<ReturnType<typeof searchComposioSessionTools>>;
    }

    for (const item of [...(scopedResult.items ?? []), ...(unscopedResult.items ?? [])]) {
      const itemToolkit = String(item.toolkit ?? "").toLowerCase();
      if (toolkits.length > 0 && itemToolkit && !toolkits.includes(itemToolkit)) continue;
      if (item?.slug && !foundTools.some((tool) => tool.slug === item.slug)) foundTools.push(item);
    }
    if (foundTools.length >= 8) break;
  }

  if (foundTools.length === 0) {
    return {
      name: capability,
      status: "blocked",
      summary: `I can see this needs ${toolkits.join(", ") || "a connected app"}, but Composio did not return a usable tool for ${capability}.`,
      payload: {
        queries,
        toolkits,
        connectionStatuses: lastSessionSearch?.toolkitConnectionStatuses ?? [],
        guidance: lastSessionSearch?.nextStepsGuidance ?? [],
      },
      risk: "read",
    };
  }

  const choice = await chooseDynamicTool({ capability, userMessage, tools: foundTools });
  if (!choice.slug) {
    return {
      name: capability,
      status: "blocked",
      summary: `I found Composio tools for ${toolkits.join(", ")}, but none was suitable for ${capability}.`,
      payload: { queries, toolkits, foundTools, choice },
      risk: "read",
    };
  }

  const selectedFromSearch = foundTools.find((tool) => tool.slug === choice.slug);
  const schema = selectedFromSearch?.inputParameters
    ? {
      slug: choice.slug,
      name: String(selectedFromSearch.name ?? choice.slug),
      description: String(selectedFromSearch.description ?? ""),
      toolkit: String(selectedFromSearch.toolkit ?? ""),
      risk: selectedFromSearch.risk as "read" | "write",
      inputParameters: selectedFromSearch.inputParameters,
    }
    : await logTool(ctx, "COMPOSIO_GET_TOOL_SCHEMAS", choice.slug, () => getComposioToolSchema(choice.slug));
  const risk = inferRiskFromSlug(choice.slug, String(schema.description ?? ""));
  const allowed = assertToolAllowed({
    slug: choice.slug,
    toolkit: schema.toolkit,
    risk,
    policy,
    writeApproved: writeApproved({ toolName: choice.slug, approvals: planner.approval, dryRun: ctx.dryRun }),
  });
  if (!allowed.ok) {
    return {
      name: capability,
      status: "blocked",
      summary: `I found ${choice.slug}, but Nest policy blocked it: ${allowed.reason}.`,
      payload: { choice, schema: { slug: schema.slug, toolkit: schema.toolkit, risk } },
      risk,
    };
  }

  const input = await buildDynamicToolArguments({
    capability,
    userMessage,
    timezone: ctx.timezone,
    schema: schema as unknown as Record<string, unknown>,
  });
  const result = await logTool(ctx, "COMPOSIO_MULTI_EXECUTE_TOOL", `${choice.slug} for ${capability}`, () =>
    executeComposioSessionTool({ userId: ctx.composioUserId, slug: choice.slug, input, toolkits })
  ) as Record<string, unknown>;
  const summary = await summariseDynamicToolResult({
    capability,
    userMessage,
    toolSlug: choice.slug,
    toolResult: result,
  });

  return {
    name: capability,
    status: "success",
    summary,
    payload: {
      toolSlug: choice.slug,
      reason: choice.reason,
      risk,
      resultSummary: safeJsonSummary(result, 2000),
    },
    risk,
  };
}

export async function ensureRequiredConnections(
  ctx: RuntimeContext,
  planner: PlannerOutput,
): Promise<GatewayToolResult | null> {
  const connected = await refreshConnectedAccounts(ctx);
  const missingToolkits = new Set<string>();
  const connectionLinks: Array<{ toolkit: string; url: string }> = [];

  if (planner.requiredApps.includes("email_provider")) {
    const email = resolveEmailProvider({ connected, selectedEmailApp: planner.selectedEmailApp });
    if (email.ambiguous) {
      return {
        name: "check_connected_app",
        status: "blocked",
        summary: planner.clarificationQuestion ??
          "I can do that. Which email should I use for the daily summary — Gmail or Outlook?",
        payload: { reason: "email_provider_ambiguous" },
      };
    }
    if (email.missing) {
      for (const toolkit of emailProviderToolkitsToConnect({
        selectedEmailApp: planner.selectedEmailApp,
        candidateEmailApps: planner.candidateEmailApps,
      })) {
        missingToolkits.add(toolkit);
      }
    }
  }

  for (const app of planner.requiredApps) {
    if (app === "email_provider") continue;
    for (const toolkit of toolkitForApp(app)) {
      if (!hasToolkit(connected, toolkit)) missingToolkits.add(toolkit);
    }
  }

  if (missingToolkits.size === 0) return null;

  for (const toolkit of missingToolkits) {
    const normalisedToolkit = normaliseComposioToolkitSlug(toolkit);
    try {
      const link = await logTool(ctx, "create_connection_request", normalisedToolkit, () =>
        mintComposioConnectLink({ userId: ctx.composioUserId, toolkit: normalisedToolkit })
      );
      connectionLinks.push(link);
    } catch (error) {
      await addRunStep({
        runId: ctx.runId,
        phase: "gateway",
        stepType: "gateway_policy",
        status: "failed",
        toolName: "create_connection_request",
        inputSummary: normalisedToolkit,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const pendingIntentId = await createPendingIntent({
    originalRunId: ctx.runId,
    authUserId: ctx.authUserId,
    senderHandle: ctx.senderHandle,
    botNumber: ctx.botNumber,
    chatId: ctx.chatId,
    composioUserId: ctx.composioUserId,
    originalMessage: String(ctx.resumeContext.originalMessage ?? ""),
    requiredApps: planner.requiredApps,
    requiredToolkits: [...missingToolkits].map(normaliseComposioToolkitSlug),
    candidateApps: planner.candidateEmailApps,
    resumeContext: { planner },
  });

  return {
    name: "create_connection_request",
    status: "needs_connection",
    summary: "Missing connected apps. Created connection links and stored pending intent.",
    requiredToolkits: [...missingToolkits].map(normaliseComposioToolkitSlug),
    connectionLinks,
    payload: { pendingIntentId, connectionLinks },
  };
}

export async function executeGatewayTool(
  ctx: RuntimeContext,
  planner: PlannerOutput,
  call: GatewayToolInput,
): Promise<GatewayToolResult> {
  const policy = buildToolSandboxPolicy({ requestedToolkits: planner.allowedToolkits });
  const approvals = planner.approval;

  if (call.name === "web_search") {
    const result = await logTool(ctx, "web_search", String(call.input.query ?? ""), () =>
      webSearchTool.handler({ query: String(call.input.query ?? "") }, {
        chatId: ctx.chatId,
        senderHandle: ctx.senderHandle,
        authUserId: ctx.authUserId,
        timezone: ctx.timezone,
        pendingEmailSend: null,
        pendingEmailSends: [],
      })
    );
    return {
      name: "web_search",
      status: "success",
      summary: result.content,
      payload: result.structuredData ?? {},
      risk: "read",
    };
  }

  if (call.name === "places_search") {
    const input = {
      ...call.input,
      query: String(call.input.query ?? call.input.search ?? ""),
      max_results: Number(call.input.max_results ?? 3),
    };
    const result = await logTool(ctx, "places_search", safeJsonSummary(input, 300), () =>
      placesSearchTool.handler(input, {
        chatId: ctx.chatId,
        senderHandle: ctx.senderHandle,
        authUserId: ctx.authUserId,
        timezone: ctx.timezone,
        pendingEmailSend: null,
        pendingEmailSends: [],
      })
    );
    return {
      name: "places_search",
      status: typeof result.structuredData?.error === "string" ? "error" : "success",
      summary: result.content,
      payload: result.structuredData ?? {},
      risk: "read",
    };
  }

  if (call.name === "travel_time") {
    const result = await logTool(ctx, "travel_time", safeJsonSummary(call.input, 300), () =>
      travelTimeTool.handler(call.input, {
        chatId: ctx.chatId,
        senderHandle: ctx.senderHandle,
        authUserId: ctx.authUserId,
        timezone: ctx.timezone,
        pendingEmailSend: null,
        pendingEmailSends: [],
      })
    );
    return {
      name: "travel_time",
      status: typeof result.structuredData?.error === "string" ? "error" : "success",
      summary: result.content,
      payload: result.structuredData ?? {},
      risk: "read",
    };
  }

  if (call.name === "composio_search_tools") {
    const query = String(call.input.query ?? "");
    const toolkits = Array.isArray(call.input.toolkits)
      ? (call.input.toolkits as unknown[]).map(String).filter((toolkit) => policy.allowedToolkits.includes(toolkit.toLowerCase()))
      : policy.allowedToolkits;
    const result = await logTool(ctx, "composio_search_tools", query, () =>
      searchComposioTools({ query, toolkits, limit: Math.min(Number(call.input.limit ?? 12), policy.maxResults) })
    );
    return { name: call.name, status: "success", summary: `${result.items.length} tools found`, payload: result, risk: "read" };
  }

  if (call.name === "composio_get_tool_schema") {
    const slug = String(call.input.slug ?? "");
    const schema = await logTool(ctx, "composio_get_tool_schema", slug, () => getComposioToolSchema(slug));
    const allowed = assertToolAllowed({
      slug,
      toolkit: schema.toolkit,
      risk: schema.risk,
      policy,
      writeApproved: writeApproved({ toolName: slug, approvals, dryRun: ctx.dryRun }),
    });
    if (!allowed.ok) return { name: call.name, status: "blocked", summary: allowed.reason, payload: { schema }, risk: schema.risk };
    return { name: call.name, status: "success", summary: schema.description ?? slug, payload: schema, risk: schema.risk };
  }

  if (call.name === "composio_execute_tool") {
    const slug = String(call.input.slug ?? "");
    const input = (call.input.input && typeof call.input.input === "object" ? call.input.input : {}) as Record<string, unknown>;
    const schema = await getComposioToolSchema(slug);
    const risk = inferRiskFromSlug(slug, schema.description);
    const allowed = assertToolAllowed({
      slug,
      toolkit: schema.toolkit,
      risk,
      policy,
      writeApproved: writeApproved({ toolName: slug, approvals, dryRun: ctx.dryRun }),
    });
    if (!allowed.ok) return { name: call.name, status: "blocked", summary: allowed.reason, payload: { slug, toolkit: schema.toolkit }, risk };
    const executor = risk === "write" ? executeComposioActionTool : executeComposioReadTool;
    const result = await logTool(ctx, "composio_execute_tool", slug, () =>
      executor({ userId: ctx.composioUserId, slug, input })
    );
    return { name: call.name, status: "success", summary: safeJsonSummary(result), payload: result, risk };
  }

  if (call.name === "create_agent_spec") {
    if (!writeApproved({ toolName: "create_agent_spec", approvals, dryRun: ctx.dryRun })) {
      return { name: call.name, status: "blocked", summary: "automation creation not approved", payload: {}, risk: "write" };
    }
    const built = buildAgentSpecMarkdown({
      planner,
      timezone: ctx.timezone,
      selectedEmailProvider: planner.selectedEmailApp,
    });
    const specId = await logTool(ctx, "create_agent_spec", built.slug, () =>
      createAgentSpec({
        authUserId: ctx.authUserId,
        senderHandle: ctx.senderHandle,
        chatId: ctx.chatId,
        name: built.name,
        slug: built.slug,
        description: planner.intent,
        markdownBody: built.markdown,
        sourceRunId: ctx.runId,
        metadata: { planner },
      })
    );
    return { name: call.name, status: "success", summary: `Created agent spec ${built.slug}`, payload: { specId, ...built }, risk: "write" };
  }

  if (call.name === "create_automation") {
    if (!writeApproved({ toolName: "create_automation", approvals, dryRun: ctx.dryRun })) {
      return { name: call.name, status: "blocked", summary: "automation creation not approved", payload: {}, risk: "write" };
    }
    const specId = String(call.input.agentSpecId ?? "");
    if (!specId) return { name: call.name, status: "error", summary: "missing agentSpecId", payload: {}, risk: "write" };
    const cronExpression = planner.schedule?.cronExpression ?? String(call.input.cronExpression ?? "0 9 * * *");
    const timezone = planner.schedule?.timezone ?? ctx.timezone ?? "Australia/Melbourne";
    const explicitNextRunAt = typeof call.input.nextRunAt === "string" && !Number.isNaN(new Date(call.input.nextRunAt).getTime())
      ? new Date(call.input.nextRunAt).toISOString()
      : null;
    const nextRunAt = explicitNextRunAt ?? nextRunFromCron(cronExpression, timezone);
    const automationId = await logTool(ctx, "create_automation", cronExpression, () =>
      createAutomation({
        agentSpecId: specId,
        authUserId: ctx.authUserId,
        senderHandle: ctx.senderHandle,
        chatId: ctx.chatId,
        cronExpression,
        timezone,
        nextRunAt,
        metadata: {
          planner,
          ...(explicitNextRunAt ? { oneShot: true } : {}),
        },
      })
    );
    return { name: call.name, status: "success", summary: `Created automation`, payload: { automationId, nextRunAt }, risk: "write" };
  }

  if (call.name === "create_external_trigger") {
    const slug = String(call.input.slug ?? "");
    const triggerConfig = (call.input.triggerConfig && typeof call.input.triggerConfig === "object")
      ? call.input.triggerConfig as Record<string, unknown>
      : {};
    const result = await logTool(ctx, "create_external_trigger", slug, () =>
      createComposioTrigger({
        userId: ctx.composioUserId,
        authUserId: ctx.authUserId,
        handle: ctx.senderHandle,
        chatId: ctx.chatId,
        botNumber: ctx.botNumber,
        slug,
        triggerConfig,
        connectedAccountId: typeof call.input.connectedAccountId === "string" ? call.input.connectedAccountId : undefined,
      })
    );
    return { name: call.name, status: "success", summary: "Created external trigger", payload: result, risk: "write" };
  }

  return executeDynamicCapability({ ctx, planner, capability: call.name, input: call.input, policy });
}
