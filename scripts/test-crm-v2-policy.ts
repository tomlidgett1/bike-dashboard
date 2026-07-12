import assert from "node:assert/strict";
import { classifyAgentRisk, type AgentTrustGrant } from "../src/lib/crm/agent-policy";
import { consentEligibility } from "../src/lib/crm/customer-graph/consent";
import type { CustomerConsent } from "../src/lib/crm/customer-graph/types";
import {
  BIKE_PROGRAMMES,
  getBikeProgramme,
  validateBikeProgrammeRegistry,
} from "../src/lib/crm/programmes";
import {
  crmPerformanceRating,
  validateCrmPerformanceEvent,
} from "../src/lib/crm/performance";

assert.equal(classifyAgentRisk({ kind: "read_customer" }).effectiveTier, "low");
assert.equal(classifyAgentRisk({ kind: "create_internal_task" }).mayExecuteAutonomously, true);
assert.equal(classifyAgentRisk({ kind: "send_email" }).requiresApproval, true);
assert.equal(classifyAgentRisk({ kind: "apply_discount" }).effectiveTier, "restricted");
assert.equal(classifyAgentRisk({ kind: "merge_identity" }).mayExecuteAutonomously, false);

const trustGrant: AgentTrustGrant = {
  id: "grant-1",
  storeId: "store-1",
  label: "First-service texts",
  scope: {
    actionKinds: ["send_sms"],
    channels: ["sms"],
    programmeKeys: ["first_service"],
  },
  enabled: true,
  grantedByUserId: "owner-1",
  grantedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2027-01-01T00:00:00.000Z",
};
const trusted = classifyAgentRisk(
  { kind: "send_sms", channel: "sms", programmeKey: "first_service" },
  [trustGrant],
  new Date("2026-07-01T00:00:00.000Z"),
);
assert.equal(trusted.effectiveTier, "low");
assert.equal(trusted.matchedTrustGrantId, "grant-1");
assert.equal(
  classifyAgentRisk(
    { kind: "send_sms", channel: "sms", programmeKey: "annual_service" },
    [trustGrant],
    new Date("2026-07-01T00:00:00.000Z"),
  ).requiresApproval,
  true,
);
assert.equal(
  classifyAgentRisk({ kind: "apply_discount" }, [trustGrant]).effectiveTier,
  "restricted",
);

const consent = (
  status: CustomerConsent["status"],
  purpose: CustomerConsent["purpose"] = "marketing",
): CustomerConsent => ({
  id: `${purpose}-${status}`,
  customerId: "customer-1",
  channel: "email",
  purpose,
  status,
  source: "customer",
  legalBasis: status === "granted" ? "express" : null,
  grantedAt: status === "granted" ? "2026-01-01T00:00:00.000Z" : null,
  withdrawnAt: status === "withdrawn" ? "2026-02-01T00:00:00.000Z" : null,
  updatedAt: "2026-02-01T00:00:00.000Z",
});

assert.equal(
  consentEligibility({
    channel: "email",
    purpose: "marketing",
    consents: [consent("granted")],
    hasExistingCustomerRelationship: false,
  }).eligible,
  true,
);
assert.equal(
  consentEligibility({
    channel: "email",
    purpose: "marketing",
    consents: [],
    hasExistingCustomerRelationship: true,
  }).eligible,
  false,
);
assert.equal(
  consentEligibility({
    channel: "email",
    purpose: "service",
    consents: [],
    hasExistingCustomerRelationship: true,
  }).eligible,
  true,
);
assert.equal(
  consentEligibility({
    channel: "email",
    purpose: "service",
    consents: [consent("withdrawn", "service")],
    hasExistingCustomerRelationship: true,
  }).eligible,
  false,
);

assert.equal(BIKE_PROGRAMMES.length, 12);
assert.deepEqual(validateBikeProgrammeRegistry(), []);
assert.equal(getBikeProgramme("first_service")?.consentPurpose, "service");
assert.equal(getBikeProgramme("compatible_upgrades")?.consentPurpose, "marketing");
assert.equal(getBikeProgramme("at_risk_rider")?.consentPurpose, "marketing");
assert.equal(getBikeProgramme("not_a_programme"), null);
assert.ok(BIKE_PROGRAMMES.every((programme) => programme.mechanics.length >= 2));
assert.ok(
  BIKE_PROGRAMMES.every(
    (programme) =>
      programme.riskTier === "approval" || programme.riskTier === "restricted",
  ),
);

const telemetry = validateCrmPerformanceEvent({
  metric: "timeline",
  value: 420,
  route: "/settings/store/crm/customers/[id]",
  customerId: "customer-1",
  metadata: { operation: "load_more" },
});
assert.equal(telemetry.valid, true);
assert.equal(
  validateCrmPerformanceEvent({ metric: "unknown", value: 1, route: "/crm" }).valid,
  false,
);
assert.equal(crmPerformanceRating("lcp", 1_500), "good");
assert.equal(crmPerformanceRating("lcp", 2_000), "needs-improvement");
assert.equal(crmPerformanceRating("lcp", 4_000), "poor");

console.log("CRM v2 policy, consent and programme assertions passed.");
