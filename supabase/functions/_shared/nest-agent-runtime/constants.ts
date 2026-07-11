export const NESTV3_TABLES = {
  agentRuns: "NESTV3_agent_runs",
  agentRunSteps: "NESTV3_agent_run_steps",
  agentArtifacts: "NESTV3_agent_artifacts",
  agentSpecs: "NESTV3_agent_specs",
  automations: "NESTV3_automations",
  automationRuns: "NESTV3_automation_runs",
  userConnectedAccounts: "NESTV3_user_connected_accounts",
  agentPendingIntents: "NESTV3_agent_pending_intents",
  toolProfiles: "NESTV3_tool_profiles",
  runtimeDebugEvents: "NESTV3_runtime_debug_events",
} as const;

export const NESTV3_RPCS = {
  claimScheduledRun: "NESTV3_claim_scheduled_run",
  touchAutomation: "NESTV3_touch_automation",
} as const;

export const NESTV3_RUNTIME_VERSION = "v1";
