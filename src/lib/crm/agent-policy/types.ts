import type {
  AgentRiskTier,
  ConsentChannel,
  ConsentPurpose,
  JsonValue,
} from "../customer-graph/types";

export const AGENT_ACTION_KINDS = [
  "read_customer",
  "search_customers",
  "create_internal_note",
  "create_internal_task",
  "update_internal_task",
  "send_email",
  "send_sms",
  "make_phone_call",
  "publish_campaign",
  "apply_discount",
  "issue_refund",
  "take_payment",
  "delete_customer",
  "merge_identity",
  "export_customer_data",
] as const;

export type AgentActionKind = (typeof AGENT_ACTION_KINDS)[number];

export type AgentActionIntent = {
  kind: AgentActionKind;
  channel?: ConsentChannel | null;
  consentPurpose?: ConsentPurpose | null;
  programmeKey?: string | null;
  customerId?: string | null;
  amountAud?: number | null;
  destructive?: boolean;
  external?: boolean;
  metadata?: Record<string, JsonValue>;
};

export type TrustGrantScope = {
  actionKinds: AgentActionKind[];
  channels?: ConsentChannel[];
  programmeKeys?: string[];
  customerIds?: string[];
  maximumAmountAud?: number;
};

export type AgentTrustGrant = {
  id: string;
  storeId: string;
  label: string;
  scope: TrustGrantScope;
  enabled: boolean;
  grantedByUserId: string;
  grantedAt: string;
  expiresAt: string | null;
};

export type RiskDecision = {
  baselineTier: AgentRiskTier;
  effectiveTier: AgentRiskTier;
  requiresApproval: boolean;
  mayExecuteAutonomously: boolean;
  matchedTrustGrantId: string | null;
  reason: string;
};
