export type NestAgentRunStatus =
  | "queued"
  | "running"
  | "waiting_for_connection"
  | "waiting_for_approval"
  | "clarification_needed"
  | "completed"
  | "failed"
  | "cancelled";

export type NestAgentRunSource =
  | "linq_inbound"
  | "automation_runner"
  | "manual"
  | "retry"
  | "trigger"
  | "connection_resumed"
  | "debug";

export interface RunNestAgentInput {
  runId?: string;
  source?: NestAgentRunSource;
  triggerType?: string;
  userMessage: string;
  senderHandle: string;
  botNumber?: string | null;
  chatId: string;
  messageId?: string | null;
  authUserId?: string | null;
  timezone?: string | null;
  agentSpecMarkdown?: string | null;
  resumeContext?: Record<string, unknown>;
  dryRun?: boolean;
  metadata?: Record<string, unknown>;
}

export interface RunNestAgentResult {
  runId: string;
  status: NestAgentRunStatus;
  finalResponse: string;
  verifier: VerifierReport;
  requiredApps: string[];
  requiredCapabilities: string[];
  artifacts: Array<{ artifactType: string; id?: string; revision?: number }>;
}

export interface RuntimeContext {
  runId: string;
  authUserId: string | null;
  senderHandle: string;
  botNumber: string | null;
  chatId: string;
  messageId: string | null;
  timezone: string | null;
  composioUserId: string;
  composioUserIds: string[];
  recentTurns: Array<{
    role: "user" | "assistant";
    content: string;
    createdAt?: string;
  }>;
  userProfile: {
    handle: string;
    name: string | null;
    facts: string[];
    contextProfile?: Record<string, unknown> | null;
    genz?: boolean;
  } | null;
  agentSpecMarkdown: string | null;
  resumeContext: Record<string, unknown>;
  pendingClarification: {
    runId: string;
    question: string;
    intent: string;
    userMessage: string;
    plannerOutput: Record<string, unknown> | null;
  } | null;
  latestAutomation: {
    id: string;
    agentSpecId: string;
    intent: string;
    cronExpression: string;
    nextRunAt: string;
    metadata: Record<string, unknown>;
  } | null;
  dryRun: boolean;
}

export type PlannerMode =
  | "casual"
  | "smart"
  | "automation_create"
  | "automation_cancel"
  | "trigger_create"
  | "clarification_needed";

export interface PlannerOutput {
  mode: PlannerMode;
  intent: string;
  immediateRunRequested: boolean;
  schedule?: {
    type: "daily" | "cron" | "none";
    cronExpression?: string;
    timezone?: string;
  };
  requiredCapabilities: string[];
  requiredApps: string[];
  candidateEmailApps: string[];
  selectedEmailApp: string | null;
  writeActions: string[];
  approval: Record<string, string>;
  successConditions: string[];
  allowedToolkits: string[];
  clarificationQuestion?: string;
}

export interface GatewayToolInput {
  name: string;
  input: Record<string, unknown>;
}

export interface GatewayToolResult {
  name: string;
  status: "success" | "blocked" | "needs_connection" | "error";
  summary: string;
  payload: Record<string, unknown>;
  requiredToolkits?: string[];
  connectionLinks?: Array<{ toolkit: string; url: string }>;
  risk?: "read" | "write";
}

export interface OrchestratorResult {
  finalResponse: string;
  status: NestAgentRunStatus;
  toolResults: GatewayToolResult[];
  requiredApps: string[];
  requiredCapabilities: string[];
  createdSpecId?: string;
  createdAutomationId?: string;
}

export interface VerifierReport {
  ok: boolean;
  status: "verified" | "blocked" | "needs_connection" | "clarification_needed" | "failed";
  checks: Array<{ name: string; passed: boolean; detail?: string }>;
  finalResponse: string;
}
