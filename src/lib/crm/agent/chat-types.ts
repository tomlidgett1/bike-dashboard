// CRM campaign chat agent — SSE event protocol + shared draft state types.
//
// The chat route streams these events; the panel folds them into chat,
// activity feed, preview, and specs state. The client is the state holder
// between turns: it sends messages + current draft back on every request.

import type { CampaignContent } from "../types";
import type {
  AgentComposeResult,
  AgentProductPick,
  AudienceResolution,
  AudienceRule,
} from "./types";

export type CrmChatRole = "user" | "assistant";

export type CrmChatMessage = {
  role: CrmChatRole;
  content: string;
};

export type CrmActivityKind =
  | "sql"
  | "audience"
  | "customers"
  | "products"
  | "compose"
  | "template"
  | "verify";

export type CrmActivityStatus = "running" | "done" | "error";

/** One row in the live activity feed (persistent tool log with shimmer while running). */
export type CrmChatActivity = {
  id: string;
  kind: CrmActivityKind;
  label: string;
  detail?: string;
  status: CrmActivityStatus;
};

export type CampaignVerificationCheck = {
  label: string;
  ok: boolean;
  detail?: string;
};

export type CampaignVerification = {
  checks: CampaignVerificationCheck[];
};

export type CrmEmailTemplateSummary = {
  id: string;
  name: string;
  description: string | null;
  subject: string;
  template_key: string;
  use_count: number;
  updated_at: string;
};

export type CrmEmailTemplateRecord = CrmEmailTemplateSummary & {
  content: CampaignContent;
};

export type CrmNamedAudience = AudienceResolution & { name?: string };

export type CrmChatEvent =
  | { type: "status"; phase: string; text: string }
  | { type: "activity"; activity: CrmChatActivity }
  | { type: "assistant_delta"; text: string }
  | { type: "assistant_message"; text: string }
  | { type: "audience"; audience: CrmNamedAudience }
  | { type: "products"; products: AgentProductPick[] }
  | { type: "campaign"; campaign: AgentComposeResult; verification?: CampaignVerification }
  | { type: "suggestions"; suggestions: string[] }
  | { type: "template_saved"; template: CrmEmailTemplateSummary }
  | { type: "error"; message: string }
  | { type: "done"; runId: string | null };

/** Draft state the client holds between turns and sends back with each message. */
export type CrmChatClientState = {
  campaign?: AgentComposeResult | null;
  audienceRules?: AudienceRule[] | null;
  audienceName?: string | null;
  audienceCount?: number | null;
  /** Set when the user applied a saved template client-side since the last turn. */
  appliedTemplateName?: string | null;
};

export type CrmChatRequestBody = {
  messages: CrmChatMessage[];
  state?: CrmChatClientState;
};
