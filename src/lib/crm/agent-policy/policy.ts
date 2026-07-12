import type {
  AgentActionIntent,
  AgentTrustGrant,
  RiskDecision,
} from "./types";

const READ_ONLY = new Set(["read_customer", "search_customers"]);
const INTERNAL = new Set(["create_internal_note", "create_internal_task", "update_internal_task"]);
const EXTERNAL_COMMUNICATION = new Set([
  "send_email",
  "send_sms",
  "make_phone_call",
  "publish_campaign",
]);
const ALWAYS_RESTRICTED = new Set([
  "apply_discount",
  "issue_refund",
  "take_payment",
  "delete_customer",
  "merge_identity",
  "export_customer_data",
]);

function grantMatches(
  intent: AgentActionIntent,
  grant: AgentTrustGrant,
  now: Date,
): boolean {
  if (!grant.enabled || (grant.expiresAt && Date.parse(grant.expiresAt) <= now.getTime())) return false;
  if (!grant.scope.actionKinds.includes(intent.kind)) return false;
  if (
    grant.scope.channels?.length &&
    (!intent.channel || !grant.scope.channels.includes(intent.channel))
  ) {
    return false;
  }
  if (
    grant.scope.programmeKeys?.length &&
    (!intent.programmeKey || !grant.scope.programmeKeys.includes(intent.programmeKey))
  ) {
    return false;
  }
  if (
    grant.scope.customerIds?.length &&
    (!intent.customerId || !grant.scope.customerIds.includes(intent.customerId))
  ) {
    return false;
  }
  if (
    grant.scope.maximumAmountAud !== undefined &&
    (intent.amountAud == null || intent.amountAud > grant.scope.maximumAmountAud)
  ) {
    return false;
  }
  return true;
}

export function classifyAgentRisk(
  intent: AgentActionIntent,
  trustGrants: AgentTrustGrant[] = [],
  now = new Date(),
): RiskDecision {
  if (intent.destructive || ALWAYS_RESTRICTED.has(intent.kind)) {
    return {
      baselineTier: "restricted",
      effectiveTier: "restricted",
      requiresApproval: true,
      mayExecuteAutonomously: false,
      matchedTrustGrantId: null,
      reason:
        intent.kind === "merge_identity"
          ? "Identity merges always require a person to approve the exact records."
          : "Financial, destructive and sensitive data actions always require approval.",
    };
  }

  if (READ_ONLY.has(intent.kind) || INTERNAL.has(intent.kind)) {
    return {
      baselineTier: "low",
      effectiveTier: "low",
      requiresApproval: false,
      mayExecuteAutonomously: true,
      matchedTrustGrantId: null,
      reason: "Read-only and reversible internal actions may run autonomously.",
    };
  }

  if (intent.external || EXTERNAL_COMMUNICATION.has(intent.kind)) {
    const matchingGrant = trustGrants.find((grant) => grantMatches(intent, grant, now));
    if (matchingGrant) {
      return {
        baselineTier: "approval",
        effectiveTier: "low",
        requiresApproval: false,
        mayExecuteAutonomously: true,
        matchedTrustGrantId: matchingGrant.id,
        reason: `A narrow trust grant permits this exact ${intent.kind} scope.`,
      };
    }
    return {
      baselineTier: "approval",
      effectiveTier: "approval",
      requiresApproval: true,
      mayExecuteAutonomously: false,
      matchedTrustGrantId: null,
      reason: "External customer communication requires approval by default.",
    };
  }

  return {
    baselineTier: "approval",
    effectiveTier: "approval",
    requiresApproval: true,
    mayExecuteAutonomously: false,
    matchedTrustGrantId: null,
    reason: "Unrecognised write actions require approval.",
  };
}
