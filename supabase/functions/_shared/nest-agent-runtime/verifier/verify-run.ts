import type { OrchestratorResult, PlannerOutput, VerifierReport } from "../types.ts";

function addCheck(
  checks: VerifierReport["checks"],
  name: string,
  passed: boolean,
  detail?: string,
) {
  checks.push({ name, passed, ...(detail ? { detail } : {}) });
}

export function verifyRun(args: {
  planner: PlannerOutput;
  orchestrator: OrchestratorResult;
}): VerifierReport {
  const checks: VerifierReport["checks"] = [];
  const { planner, orchestrator } = args;

  if (orchestrator.status === "waiting_for_connection") {
    addCheck(checks, "missing_connection_truthful", !orchestrator.finalResponse.includes("Done ✓"));
    return {
      ok: true,
      status: "needs_connection",
      checks,
      finalResponse: orchestrator.finalResponse,
    };
  }

  if (orchestrator.status === "clarification_needed") {
    addCheck(checks, "clarification_truthful", !orchestrator.finalResponse.includes("Done ✓"));
    return {
      ok: true,
      status: "clarification_needed",
      checks,
      finalResponse: orchestrator.finalResponse,
    };
  }

  if (orchestrator.status === "failed") {
    addCheck(checks, "failure_truthful", !orchestrator.finalResponse.includes("Done ✓"));
    return {
      ok: true,
      status: "failed",
      checks,
      finalResponse: orchestrator.finalResponse,
    };
  }

  const toolResults = orchestrator.toolResults;
  if (planner.mode === "automation_create") {
    addCheck(checks, "agent_spec_created", Boolean(orchestrator.createdSpecId));
    addCheck(checks, "automation_created", Boolean(orchestrator.createdAutomationId));
    const ok = checks.every((check) => check.passed);
    return {
      ok,
      status: ok ? "verified" : "blocked",
      checks,
      finalResponse: ok
        ? orchestrator.finalResponse
        : "I couldn’t verify that the daily agent was fully created, so I’m not marking it done.",
    };
  }

  if (planner.mode === "trigger_create") {
    const triggerCreated = toolResults.some((result) =>
      /TRIGGER|trigger/i.test(result.name) && result.status === "success"
    );
    addCheck(checks, "trigger_created", triggerCreated);
    const ok = checks.every((check) => check.passed);
    return {
      ok,
      status: ok ? "verified" : "blocked",
      checks,
      finalResponse: ok
        ? orchestrator.finalResponse
        : "I couldn’t verify that the trigger was created, so I’m not marking it done.",
    };
  }

  if (planner.mode === "automation_cancel") {
    const cancelled = toolResults.some((result) => result.name === "cancel_automation" && result.status === "success");
    addCheck(checks, "automation_cancelled", cancelled);
    const ok = checks.every((check) => check.passed);
    return {
      ok,
      status: ok ? "verified" : "blocked",
      checks,
      finalResponse: ok
        ? orchestrator.finalResponse
        : "I couldn’t verify that the automation was cancelled, so I’m not marking it done.",
    };
  }

  for (const capability of planner.requiredCapabilities) {
    if (capability === "create_agent_spec") {
      addCheck(checks, "agent_spec_created", Boolean(orchestrator.createdSpecId));
    } else if (capability === "create_automation") {
      addCheck(checks, "automation_created", Boolean(orchestrator.createdAutomationId));
    } else {
      addCheck(
        checks,
        `${capability}_executed`,
        toolResults.some((result) => result.name === capability && result.status === "success") ||
          toolResults.some((result) => result.name === "composio_execute_tool" && result.status === "success") ||
          toolResults.some((result) => result.name === "COMPOSIO_MULTI_EXECUTE_TOOL" && result.status === "success") ||
          toolResults.some((result) => result.name === "COMPOSIO_REMOTE_WORKBENCH" && result.status === "success") ||
          toolResults.some((result) => result.name === "web_search" && result.status === "success"),
      );
    }
  }

  const writeActions = new Set(planner.writeActions);
  const claimsNotionFiled = /\b(notion|filed|page)\b/i.test(orchestrator.finalResponse);
  if (writeActions.has("notion_create_page") && claimsNotionFiled) {
    addCheck(
      checks,
      "notion_write_verified",
      toolResults.some((result) =>
        result.name === "notion_create_page" && result.status === "success" ||
        result.name === "composio_execute_tool" && result.risk === "write" && result.status === "success"
      ),
      "Notion write must be confirmed before claiming it was filed.",
    );
  }

  const writesOk = checks.filter((check) => check.name.includes("created") || check.name.includes("write")).every((check) => check.passed);
  const hasDone = orchestrator.finalResponse.includes("Done ✓");
  addCheck(checks, "done_claim_matches_writes", !hasDone || writesOk);

  const ok = checks.every((check) => check.passed);
  return {
    ok,
    status: ok ? "verified" : "blocked",
    checks,
    finalResponse: ok
      ? orchestrator.finalResponse
      : orchestrator.finalResponse.replace(/Done ✓\s*/g, "").trim() ||
        "I couldn’t verify that everything completed, so I’m not marking it done.",
  };
}
