import type {
  ConsentChannel,
  ConsentPurpose,
  CustomerConsent,
} from "./types";

export type ConsentEligibilityInput = {
  channel: ConsentChannel;
  purpose: ConsentPurpose;
  consents: CustomerConsent[];
  hasExistingCustomerRelationship: boolean;
};

export type ConsentEligibility = {
  eligible: boolean;
  basis: "express_consent" | "existing_relationship" | "none";
  reason: string;
};

const EXPRESS_CONSENT_PURPOSES = new Set<ConsentPurpose>([
  "marketing",
  "community",
  "events",
  "reviews",
]);

export function consentEligibility(input: ConsentEligibilityInput): ConsentEligibility {
  const applicable = input.consents
    .filter((consent) => consent.channel === input.channel && consent.purpose === input.purpose)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const latest = applicable[0];

  if (latest?.status === "withdrawn" || latest?.status === "denied") {
    return {
      eligible: false,
      basis: "none",
      reason: `The customer has declined ${input.channel} contact for ${input.purpose}.`,
    };
  }

  if (latest?.status === "granted") {
    return {
      eligible: true,
      basis: "express_consent",
      reason: `The customer granted ${input.channel} consent for ${input.purpose}.`,
    };
  }

  if (EXPRESS_CONSENT_PURPOSES.has(input.purpose)) {
    return {
      eligible: false,
      basis: "none",
      reason: `Express ${input.channel} consent is required for ${input.purpose}.`,
    };
  }

  if (input.hasExistingCustomerRelationship) {
    return {
      eligible: true,
      basis: "existing_relationship",
      reason: `The message is ${input.purpose}-related and an existing customer relationship is recorded.`,
    };
  }

  return {
    eligible: false,
    basis: "none",
    reason: `No consent or existing customer relationship supports ${input.channel} contact.`,
  };
}
