import type { CustomerIdentityKind } from "./types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const IDENTITY_VALUE_MAX_LENGTH = 512;

export type NormalisedIdentity = {
  kind: CustomerIdentityKind;
  value: string;
  key: string;
};

export type IdentityCandidate = {
  customerId: string;
  kind: CustomerIdentityKind;
  value: string | null | undefined;
  source: string;
};

export type IdentityConflict = {
  kind: CustomerIdentityKind;
  normalisedValue: string;
  customerIds: string[];
  sources: string[];
  reason: "exact_identity_claimed_by_multiple_customers";
};

export type CustomerMergeProposal = {
  proposalKey: string;
  primaryCustomerId: string;
  duplicateCustomerId: string;
  matchingIdentities: NormalisedIdentity[];
  conflicts: IdentityConflict[];
  automaticMergeAllowed: false;
};

export function normaliseEmail(value: string | null | undefined): string | null {
  const email = String(value ?? "").trim().toLocaleLowerCase("en-AU");
  if (!email || email.length > 320 || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

/**
 * Normalises Australian phone numbers to E.164. It deliberately does not
 * guess missing area codes or match suffixes.
 */
export function normaliseAuPhone(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const withoutExtension = raw.replace(/\s*(?:ext\.?|x)\s*\d+\s*$/i, "");
  let digits = withoutExtension.replace(/[^\d+]/g, "");
  if (digits.startsWith("0061")) digits = `+61${digits.slice(4)}`;
  if (digits.startsWith("61") && !digits.startsWith("+")) digits = `+${digits}`;
  if (digits.startsWith("0")) digits = `+61${digits.slice(1)}`;

  if (!/^\+61[2-478]\d{8}$/.test(digits)) return null;
  return digits;
}

export function normaliseExternalId(value: string | null | undefined): string | null {
  const id = String(value ?? "").trim();
  if (!id || id.length > IDENTITY_VALUE_MAX_LENGTH) return null;
  return id;
}

export function normaliseIdentityValue(
  kind: CustomerIdentityKind,
  value: string | null | undefined,
): string | null {
  if (kind === "email" || kind === "gmail_sender") return normaliseEmail(value);
  if (kind === "phone" || kind === "nest_handle") return normaliseAuPhone(value);
  return normaliseExternalId(value);
}

export function identityKey(
  kind: CustomerIdentityKind,
  value: string | null | undefined,
): string | null {
  const normalised = normaliseIdentityValue(kind, value);
  return normalised ? `${kind}:${normalised}` : null;
}

export function exactIdentityMatch(
  leftKind: CustomerIdentityKind,
  leftValue: string | null | undefined,
  rightKind: CustomerIdentityKind,
  rightValue: string | null | undefined,
): boolean {
  if (leftKind !== rightKind) return false;
  const left = identityKey(leftKind, leftValue);
  return left !== null && left === identityKey(rightKind, rightValue);
}

export function collectIdentityConflicts(candidates: IdentityCandidate[]): IdentityConflict[] {
  const claims = new Map<string, { candidate: NormalisedIdentity; customers: Set<string>; sources: Set<string> }>();

  for (const candidate of candidates) {
    const value = normaliseIdentityValue(candidate.kind, candidate.value);
    if (!value) continue;
    const key = `${candidate.kind}:${value}`;
    const claim = claims.get(key) ?? {
      candidate: { kind: candidate.kind, value, key },
      customers: new Set<string>(),
      sources: new Set<string>(),
    };
    claim.customers.add(candidate.customerId);
    claim.sources.add(candidate.source);
    claims.set(key, claim);
  }

  return [...claims.values()]
    .filter((claim) => claim.customers.size > 1)
    .map((claim) => ({
      kind: claim.candidate.kind,
      normalisedValue: claim.candidate.value,
      customerIds: [...claim.customers].sort(),
      sources: [...claim.sources].sort(),
      reason: "exact_identity_claimed_by_multiple_customers" as const,
    }))
    .sort((a, b) =>
      `${a.kind}:${a.normalisedValue}`.localeCompare(`${b.kind}:${b.normalisedValue}`, "en-AU"),
    );
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function proposeExactCustomerMerge(
  primaryCustomerId: string,
  duplicateCustomerId: string,
  candidates: IdentityCandidate[],
): CustomerMergeProposal | null {
  if (!primaryCustomerId || !duplicateCustomerId || primaryCustomerId === duplicateCustomerId) {
    return null;
  }

  const byCustomer = new Map<string, Map<string, NormalisedIdentity>>();
  for (const candidate of candidates) {
    if (candidate.customerId !== primaryCustomerId && candidate.customerId !== duplicateCustomerId) {
      continue;
    }
    const value = normaliseIdentityValue(candidate.kind, candidate.value);
    if (!value) continue;
    const normalised = { kind: candidate.kind, value, key: `${candidate.kind}:${value}` };
    const identities = byCustomer.get(candidate.customerId) ?? new Map<string, NormalisedIdentity>();
    identities.set(normalised.key, normalised);
    byCustomer.set(candidate.customerId, identities);
  }

  const primary = byCustomer.get(primaryCustomerId) ?? new Map<string, NormalisedIdentity>();
  const duplicate = byCustomer.get(duplicateCustomerId) ?? new Map<string, NormalisedIdentity>();
  const matchingIdentities = [...primary.values()]
    .filter((identity) => duplicate.has(identity.key))
    .sort((a, b) => a.key.localeCompare(b.key, "en-AU"));
  if (matchingIdentities.length === 0) return null;

  const orderedCustomers = [primaryCustomerId, duplicateCustomerId].sort();
  return {
    proposalKey: `merge:${stableHash(`${orderedCustomers.join(":")}:${matchingIdentities.map((item) => item.key).join("|")}`)}`,
    primaryCustomerId,
    duplicateCustomerId,
    matchingIdentities,
    conflicts: collectIdentityConflicts(candidates).filter(
      (conflict) =>
        conflict.customerIds.includes(primaryCustomerId) &&
        conflict.customerIds.includes(duplicateCustomerId),
    ),
    automaticMergeAllowed: false,
  };
}
