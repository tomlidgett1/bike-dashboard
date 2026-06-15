import {
  formatAustralianSpacedMobile,
  phoneLookupKeys,
} from "../src/lib/services/lightspeed/customer-search";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const phone = "+61428808811";
const digits = phone.replace(/\D+/g, "");
const keys = phoneLookupKeys(phone);
const spaced = formatAustralianSpacedMobile(digits);

assert(keys.includes("61428808811"), "expected full E.164 digits in lookup keys");
assert(keys.includes("0428808811"), "expected local 0-prefixed digits in lookup keys");
assert(keys.includes("428808811"), "expected national digits without leading 0");
assert(spaced === "0428 808 811", `expected spaced AU mobile, got ${spaced}`);

console.log("lightspeed phone variant checks passed");
console.log({ phone, keys, spaced });
