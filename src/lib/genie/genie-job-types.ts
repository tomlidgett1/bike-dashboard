export type GenieJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type GenieJobSource = "homev2" | "panel";

export type GenieModelProfile = "default" | "nano";

export type GenieJobMetadata = {
  composio_session_ids?: Record<string, string>;
  client_assistant_id?: string;
  source?: GenieJobSource;
  model_profile?: GenieModelProfile;
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
