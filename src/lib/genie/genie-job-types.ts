export type GenieJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type GenieJobSource = "homev2" | "panel";

export type GenieModelProfile = "default" | "nano";

/** Special long-running run modes. "deep_research" = the multi-phase forensic
 * Deep Business Review (autonomous ~20-25 min investigation → board-memo report). */
export type GenieRunMode = "deep_research";

export type GenieJobMetadata = {
  composio_session_ids?: Record<string, string>;
  client_assistant_id?: string;
  source?: GenieJobSource;
  model_profile?: GenieModelProfile;
  /** Set for special long-running modes; absent for normal chat turns. */
  mode?: GenieRunMode;
  step_index?: number;
  raw_debug_logs?: GenieRawDebugLogEntry[];
};

export type GenieRawDebugLogEntry = {
  seq: number;
  at: string;
  payload: Record<string, unknown>;
};

export type GenieAssistantJobResult = {
  assistantMessage: Record<string, unknown>;
};

export type GenieJob = {
  id: string;
  status: GenieJobStatus;
  prompt: string;
  message: string | null;
  progressPhase: string | null;
  errorMessage: string | null;
  conversationId: string | null;
  metadata: GenieJobMetadata;
  result: GenieAssistantJobResult | null;
  updatedAt: string;
  completedAt: string | null;
};
