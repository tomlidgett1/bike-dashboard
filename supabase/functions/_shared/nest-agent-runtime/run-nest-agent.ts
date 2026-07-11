import { buildRuntimeContext } from "./context.ts";
import { planNestTurn } from "./agents/planner.ts";
import { runPlannerAgent } from "./agents/planner-agent.ts";
import { orchestrateNestTurn } from "./agents/orchestrator.ts";
import { verifyRun } from "./verifier/verify-run.ts";
import {
  addArtifact,
  addRunStep,
  appendDebugEvent,
  clearRunSequenceCache,
  createAgentRun,
  updateAgentRun,
} from "./persistence/store.ts";
import type { RunNestAgentInput, RunNestAgentResult } from "./types.ts";
import { NESTV3_RUNTIME_VERSION } from "./constants.ts";

export async function runNestAgent(input: RunNestAgentInput): Promise<RunNestAgentResult> {
  const runId = input.runId ?? await createAgentRun(input);
  clearRunSequenceCache(runId);
  const ctx = await buildRuntimeContext(runId, {
    ...input,
    resumeContext: {
      ...(input.resumeContext ?? {}),
      originalMessage: input.userMessage,
    },
  });

  await updateAgentRun(runId, {
    status: "running",
    startedAt: new Date().toISOString(),
    metadata: {
      ...(input.metadata ?? {}),
      runtimeVersion: NESTV3_RUNTIME_VERSION,
    },
  });
  await appendDebugEvent({ runId, phase: "runtime", summary: "Nest Agent Runtime started" });

  try {
    const plannerStepId = await addRunStep({
      runId,
      phase: "planner",
      stepType: "planner",
      status: "running",
      inputSummary: input.userMessage,
    });
    const routerPlan = await planNestTurn(input.userMessage, ctx);
    const planner = routerPlan.mode === "casual"
      ? {
        ...routerPlan,
        planSummary: "Router classified this as casual chat, so the GPT-5.4 planner was skipped.",
        executionSteps: ["Use recent conversation and user profile context", "Write a concise iMessage reply"],
        assumptions: [],
        risks: [],
        verificationPlan: ["Verify the reply does not claim tool or write actions"],
        plannerAgentModel: "router_fast_path",
      }
      : await runPlannerAgent({
        userMessage: input.userMessage,
        router: routerPlan,
        ctx,
      });
    await addArtifact({
      runId,
      artifactType: planner.mode === "automation_create" ? "automation_plan" : "run_plan",
      revision: 1,
      title: "Planner output",
      payload: {
        ...planner,
        routerPlan,
      } as unknown as Record<string, unknown>,
    });
    await updateAgentRun(runId, {
      plannerOutput: {
        ...planner,
        routerPlan,
      } as unknown as Record<string, unknown>,
      requiredApps: planner.requiredApps,
      requiredCapabilities: planner.requiredCapabilities,
    });
    await appendDebugEvent({
      runId,
      phase: "planner",
      summary: planner.planSummary ?? planner.intent,
      payload: {
        mode: planner.mode,
        model: planner.plannerAgentModel,
        executionSteps: planner.executionSteps,
      },
    });

    // Mark planner step completed after the artifact write so the localhost
    // inspector sees the structured plan before the timeline advances.
    const { completeRunStep } = await import("./persistence/store.ts");
    await completeRunStep(plannerStepId, {
      status: "completed",
      outputSummary: planner.planSummary ?? planner.intent,
      payload: {
        ...planner,
        routerPlan,
      } as unknown as Record<string, unknown>,
    });

    const orchestrator = await orchestrateNestTurn({ message: input.userMessage, planner, ctx });
    const verifier = verifyRun({ planner, orchestrator });
    await addArtifact({
      runId,
      artifactType: "verifier_report",
      revision: 1,
      title: "Verifier report",
      payload: verifier as unknown as Record<string, unknown>,
    });
    await addRunStep({
      runId,
      phase: "verifier",
      stepType: "verifier",
      status: verifier.ok ? "completed" : "blocked",
      outputSummary: verifier.status,
      payload: verifier as unknown as Record<string, unknown>,
    });

    const finalStatus = verifier.status === "needs_connection"
      ? "waiting_for_connection"
      : verifier.status === "clarification_needed"
        ? "clarification_needed"
        : verifier.ok
          ? orchestrator.status
          : "failed";

    await updateAgentRun(runId, {
      status: finalStatus,
      finalResponse: verifier.finalResponse,
      verifierStatus: verifier.status,
      completedAt: ["completed", "failed", "cancelled"].includes(finalStatus) ? new Date().toISOString() : null,
    });

    await appendDebugEvent({ runId, phase: "runtime", summary: `Runtime finished: ${finalStatus}` });

    return {
      runId,
      status: finalStatus,
      finalResponse: verifier.finalResponse,
      verifier,
      requiredApps: planner.requiredApps,
      requiredCapabilities: planner.requiredCapabilities,
      artifacts: [{ artifactType: "verifier_report", revision: 1 }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await addRunStep({
      runId,
      phase: "runtime",
      stepType: "error",
      status: "failed",
      error: message,
    });
    await updateAgentRun(runId, {
      status: "failed",
      finalResponse: "I hit an error while processing that.",
      error: message,
      completedAt: new Date().toISOString(),
    });
    throw error;
  }
}
