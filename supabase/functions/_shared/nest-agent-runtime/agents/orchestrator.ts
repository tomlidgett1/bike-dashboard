import type { OrchestratorResult, PlannerOutput, RuntimeContext } from "../types.ts";
import { addArtifact, addRunStep } from "../persistence/store.ts";
import { cancelAutomation } from "../persistence/records.ts";
import { ensureRequiredConnections, executeGatewayTool } from "../tool-gateway/index.ts";
import { runComposioSessionAgent } from "./session-agent.ts";
import { inferLocalToolInput, inferOneShotFollowUpSchedule, shapeEvidenceForIMessage, shapeLocalToolForIMessage, writeCasualIMessageReply } from "./response-shaper.ts";

function connectionLabel(toolkit: string): string {
  if (toolkit === "gmail") return "Gmail";
  if (toolkit === "outlook") return "Outlook";
  if (toolkit === "googlecalendar") return "Google Calendar";
  if (toolkit === "googledrive") return "Google Drive";
  return toolkit.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function connectionMessage(result: NonNullable<Awaited<ReturnType<typeof ensureRequiredConnections>>>): string {
  const links = result.connectionLinks ?? [];
  if (links.length === 0) return "I need you to connect the required app first. I’ll continue automatically once it’s connected.";
  const lines = links.map((link) => `${connectionLabel(link.toolkit)}: ${link.url}`);
  return [
    "I need a quick app connection before I can continue.",
    "",
    ...lines,
    "",
    "Once connected, I’ll continue automatically.",
  ].join("\n");
}

function isDelayedFollowUp(planner: PlannerOutput): boolean {
  return planner.mode === "automation_create" &&
    planner.requiredCapabilities.includes("web_search") &&
    /after|finish|finishes|finished|ends?|final score|overview|match|game|race/i.test(planner.intent);
}

export async function orchestrateNestTurn(args: {
  message: string;
  planner: PlannerOutput;
  ctx: RuntimeContext;
}): Promise<OrchestratorResult> {
  const { message, planner, ctx } = args;

  await addRunStep({
    runId: ctx.runId,
    phase: "orchestrator",
    stepType: "orchestrator",
    status: "completed",
    outputSummary: `Mode: ${planner.mode}`,
    payload: { mode: planner.mode, intent: planner.intent },
  });

  if (planner.mode === "casual") {
    return {
      status: "completed",
      finalResponse: await writeCasualIMessageReply({
        userMessage: message,
        timezone: ctx.timezone,
        recentTurns: ctx.recentTurns,
        userProfile: ctx.userProfile,
      }),
      toolResults: [],
      requiredApps: [],
      requiredCapabilities: [],
    };
  }

  if (planner.mode === "clarification_needed") {
    return {
      status: "clarification_needed",
      finalResponse: planner.clarificationQuestion?.trim() ||
        "I can help — just need one detail first. What did you mean?",
      toolResults: [],
      requiredApps: planner.requiredApps,
      requiredCapabilities: planner.requiredCapabilities,
    };
  }

  if (planner.mode === "automation_cancel") {
    if (!ctx.latestAutomation) {
      return {
        status: "clarification_needed",
        finalResponse: "I can cancel it — which automation do you mean?",
        toolResults: [],
        requiredApps: planner.requiredApps,
        requiredCapabilities: planner.requiredCapabilities,
      };
    }
    const stepId = await addRunStep({
      runId: ctx.runId,
      phase: "gateway",
      stepType: "tool",
      toolName: "cancel_automation",
      status: "running",
      inputSummary: ctx.latestAutomation.intent,
      payload: { automationId: ctx.latestAutomation.id },
    });
    try {
      const result = await cancelAutomation({
        automationId: ctx.latestAutomation.id,
        reason: `Cancelled by user request in run ${ctx.runId}`,
      });
      const { completeRunStep } = await import("../persistence/store.ts");
      await completeRunStep(stepId, {
        status: result.cancelled ? "completed" : "failed",
        outputSummary: result.cancelled ? "cancelled" : "not found",
        payload: result,
      });
      return {
        status: result.cancelled ? "completed" : "failed",
        finalResponse: result.cancelled
          ? "Done ✓ I cancelled that. I won’t send it."
          : "I couldn’t find that automation to cancel.",
        toolResults: [{
          name: "cancel_automation",
          status: result.cancelled ? "success" : "error",
          summary: result.cancelled ? "Cancelled automation" : "Automation not found",
          payload: result,
          risk: "write",
        }],
        requiredApps: planner.requiredApps,
        requiredCapabilities: planner.requiredCapabilities,
      };
    } catch (error) {
      const { completeRunStep } = await import("../persistence/store.ts");
      await completeRunStep(stepId, {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        payload: { automationId: ctx.latestAutomation.id },
      });
      return {
        status: "failed",
        finalResponse: "I couldn’t cancel that automation.",
        toolResults: [{
          name: "cancel_automation",
          status: "error",
          summary: error instanceof Error ? error.message : String(error),
          payload: { automationId: ctx.latestAutomation.id },
          risk: "write",
        }],
        requiredApps: planner.requiredApps,
        requiredCapabilities: planner.requiredCapabilities,
      };
    }
  }

  const connection = await ensureRequiredConnections(ctx, planner);
  if (connection) {
    return {
      status: connection.status === "blocked" ? "clarification_needed" : "waiting_for_connection",
      finalResponse: connection.status === "blocked"
        ? connection.summary
        : connectionMessage(connection),
      toolResults: [connection],
      requiredApps: planner.requiredApps,
      requiredCapabilities: planner.requiredCapabilities,
    };
  }

  if (planner.mode === "smart") {
    const localMapsTool = planner.requiredCapabilities.includes("travel_time")
      ? "travel_time"
      : planner.requiredCapabilities.includes("places_search")
      ? "places_search"
      : null;
    if (localMapsTool && planner.requiredCapabilities.length === 1) {
      const input = await inferLocalToolInput({
        userMessage: message,
        toolName: localMapsTool,
        timezone: ctx.timezone,
      });
      const result = await executeGatewayTool(ctx, planner, {
        name: localMapsTool,
        input,
      });
      const fallbackQuery = typeof result.payload.fallback_query === "string"
        ? result.payload.fallback_query
        : null;
      const fallback = result.status === "error" && fallbackQuery
        ? await executeGatewayTool(ctx, { ...planner, requiredCapabilities: ["web_search"] }, {
          name: "web_search",
          input: { query: fallbackQuery },
        })
        : null;
      const evidence = fallback?.status === "success"
        ? { mapsError: result.payload, fallback: fallback.payload }
        : result.payload && Object.keys(result.payload).length
        ? result.payload
        : result.summary;
      const finalResponse = await shapeLocalToolForIMessage({
        userMessage: message,
        toolName: localMapsTool,
        evidence,
        timezone: ctx.timezone,
      });
      return {
        status: result.status === "success" || fallback?.status === "success" ? "completed" : "failed",
        finalResponse,
        toolResults: fallback ? [result, fallback] : [result],
        requiredApps: planner.requiredApps,
        requiredCapabilities: planner.requiredCapabilities,
      };
    }

    if (planner.requiredCapabilities.includes("web_search") && planner.requiredCapabilities.length === 1) {
      const resolvedMessage = ctx.pendingClarification
        ? [
          `Original request: ${ctx.pendingClarification.userMessage}`,
          `Clarification answer: ${message}`,
          `Resolved intent: ${planner.intent}`,
        ].join("\n")
        : message;
      const result = await executeGatewayTool(ctx, planner, {
        name: "web_search",
        input: { query: resolvedMessage },
      });
      const finalResponse = result.status === "success"
        ? await shapeEvidenceForIMessage({
          userMessage: resolvedMessage,
          evidence: result.payload && Object.keys(result.payload).length ? result.payload : result.summary,
          timezone: ctx.timezone,
        })
        : result.summary;
      return {
        status: result.status === "success" ? "completed" : "failed",
        finalResponse,
        toolResults: [result],
        requiredApps: planner.requiredApps,
        requiredCapabilities: planner.requiredCapabilities,
      };
    }
    const sessionResult = await runComposioSessionAgent({ ctx, planner, userMessage: message });
    const usedManageConnections = sessionResult.toolResults.some((result) => result.name === "COMPOSIO_MANAGE_CONNECTIONS");
    const usedExecute = sessionResult.toolResults.some((result) =>
      result.name === "COMPOSIO_MULTI_EXECUTE_TOOL" ||
      result.name === "COMPOSIO_REMOTE_WORKBENCH"
    );
    return {
      status: usedManageConnections && !usedExecute ? "waiting_for_connection" : "completed",
      finalResponse: sessionResult.text,
      toolResults: sessionResult.toolResults,
      requiredApps: planner.requiredApps,
      requiredCapabilities: planner.requiredCapabilities,
    };
  }

  if (planner.mode === "automation_create") {
    let oneShotSchedule: { nextRunAt: string; explanation: string } | null = null;
    if (isDelayedFollowUp(planner)) {
      const evidence = await executeGatewayTool(ctx, planner, {
        name: "web_search",
        input: { query: `Find the fixture/start time and expected finish time for: ${message}` },
      });
      if (evidence.status === "success") {
        oneShotSchedule = await inferOneShotFollowUpSchedule({
          userMessage: message,
          evidence: evidence.payload && Object.keys(evidence.payload).length ? evidence.payload : evidence.summary,
          timezone: ctx.timezone,
        });
      }
    }

    const specResult = await executeGatewayTool(ctx, planner, {
      name: "create_agent_spec",
      input: {},
    });
    if (specResult.status !== "success") {
      return {
        status: specResult.status === "blocked" ? "waiting_for_approval" : "failed",
        finalResponse: "I couldn’t create the agent spec.",
        toolResults: [specResult],
        requiredApps: planner.requiredApps,
        requiredCapabilities: planner.requiredCapabilities,
      };
    }

    const markdown = String(specResult.payload.markdown ?? "");
    await addArtifact({
      runId: ctx.runId,
      artifactType: "markdown_agent_spec_draft",
      revision: 1,
      title: "Markdown agent spec draft",
      contentText: markdown,
      payload: { specId: specResult.payload.specId },
    });
    await addArtifact({
      runId: ctx.runId,
      artifactType: "markdown_agent_spec",
      revision: 1,
      title: "Markdown agent spec",
      contentText: markdown,
      payload: { specId: specResult.payload.specId },
    });

    const automationResult = await executeGatewayTool(ctx, planner, {
      name: "create_automation",
      input: {
        agentSpecId: specResult.payload.specId,
        ...(oneShotSchedule ? { cronExpression: "once", nextRunAt: oneShotSchedule.nextRunAt } : {}),
      },
    });
    const ok = automationResult.status === "success";
    const nextRunAt = typeof automationResult.payload.nextRunAt === "string"
      ? new Date(automationResult.payload.nextRunAt).toLocaleString("en-AU", {
        timeZone: ctx.timezone ?? "Australia/Melbourne",
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
      : null;
    const hour = planner.schedule?.cronExpression?.match(/^\d+\s+(\d+)\s/)?.[1];
    const hourNum = hour ? Number(hour) : null;
    const cadence = hourNum === null
      ? "each day"
      : hourNum < 12
        ? "every morning"
        : hourNum < 17
          ? "every afternoon"
          : "every evening";
    return {
      status: ok ? "completed" : "failed",
      finalResponse: ok
        ? isDelayedFollowUp(planner)
          ? [
            "Done ✓ I’ll text you after the match finishes.",
            nextRunAt ? `I’ve scheduled the check for ${nextRunAt}.` : null,
          ].filter(Boolean).join("\n")
          : [
            `Done ✓ I’ll send you an email summary ${cadence}.`,
            nextRunAt ? `First run: ${nextRunAt}.` : null,
            "I’ll use your connected Gmail account.",
          ].filter(Boolean).join("\n")
        : "I created the spec, but couldn’t schedule the automation.",
      toolResults: [specResult, automationResult],
      requiredApps: planner.requiredApps,
      requiredCapabilities: planner.requiredCapabilities,
      createdSpecId: String(specResult.payload.specId ?? ""),
      createdAutomationId: String(automationResult.payload.automationId ?? ""),
    };
  }

  if (planner.mode === "trigger_create") {
    const sessionResult = await runComposioSessionAgent({ ctx, planner, userMessage: message });
    const usedManageConnections = sessionResult.toolResults.some((result) => result.name === "COMPOSIO_MANAGE_CONNECTIONS");
    const usedExecute = sessionResult.toolResults.some((result) =>
      result.name === "COMPOSIO_MULTI_EXECUTE_TOOL" ||
      result.name === "COMPOSIO_REMOTE_WORKBENCH"
    );
    return {
      status: usedManageConnections && !usedExecute ? "waiting_for_connection" : "completed",
      finalResponse: sessionResult.text,
      toolResults: sessionResult.toolResults,
      requiredApps: planner.requiredApps,
      requiredCapabilities: planner.requiredCapabilities,
    };
  }

  return {
    status: "failed",
    finalResponse: "I couldn’t work out how to run that safely.",
    toolResults: [],
    requiredApps: planner.requiredApps,
    requiredCapabilities: planner.requiredCapabilities,
  };
}
