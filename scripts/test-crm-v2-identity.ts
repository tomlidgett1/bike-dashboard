import assert from "node:assert/strict";
import {
  collectIdentityConflicts,
  exactIdentityMatch,
  identityKey,
  normaliseAuPhone,
  normaliseEmail,
  proposeExactCustomerMerge,
  type IdentityCandidate,
} from "../src/lib/crm/customer-graph/normalise";

assert.equal(normaliseEmail(" Rider@Example.COM "), "rider@example.com");
assert.equal(normaliseEmail("not-an-email"), null);
assert.equal(normaliseAuPhone("0412 345 678"), "+61412345678");
assert.equal(normaliseAuPhone("(02) 1234 5678"), "+61212345678");
assert.equal(normaliseAuPhone("0061 412 345 678"), "+61412345678");
assert.equal(normaliseAuPhone("12345"), null);
assert.equal(identityKey("email", "A@EXAMPLE.COM"), "email:a@example.com");
assert.equal(
  exactIdentityMatch("phone", "0412 345 678", "phone", "+61 412 345 678"),
  true,
);
assert.equal(
  exactIdentityMatch("phone", "0412 345 678", "phone", "0412 345 679"),
  false,
);
assert.equal(
  exactIdentityMatch("email", "rider@example.com", "gmail_sender", "rider@example.com"),
  false,
);

const candidates: IdentityCandidate[] = [
  { customerId: "customer-a", kind: "email", value: "rider@example.com", source: "lightspeed" },
  { customerId: "customer-b", kind: "email", value: "RIDER@example.com", source: "gmail" },
  { customerId: "customer-a", kind: "phone", value: "0412 345 678", source: "lightspeed" },
  { customerId: "customer-b", kind: "phone", value: "+61 412 345 678", source: "nest" },
];
const conflicts = collectIdentityConflicts(candidates);
assert.equal(conflicts.length, 2);
assert.deepEqual(conflicts[0]?.customerIds, ["customer-a", "customer-b"]);

const proposal = proposeExactCustomerMerge("customer-a", "customer-b", candidates);
assert.ok(proposal);
assert.equal(proposal.automaticMergeAllowed, false);
assert.equal(proposal.matchingIdentities.length, 2);
assert.equal(
  proposal.proposalKey,
  proposeExactCustomerMerge("customer-a", "customer-b", candidates)?.proposalKey,
);

console.log("CRM v2 identity assertions passed.");
