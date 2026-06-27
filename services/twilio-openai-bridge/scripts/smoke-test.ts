/**
 * Smoke test for Twilio signature validation + TwiML generation.
 * Run: npx tsx services/twilio-openai-bridge/scripts/smoke-test.ts
 */

import crypto from "node:crypto";
import {
  buildTwilioValidationUrl,
  twimlConnectStream,
  validateTwilioRequest,
} from "../src/twilio-auth.js";

const authToken = "test-auth-token";
const url = buildTwilioValidationUrl("https://example.fly.dev", "/twilio/incoming");
const params = { CallSid: "CA123", From: "+61400000000", To: "+61290000000" };

const data = Object.keys(params)
  .sort()
  .reduce((acc, key) => acc + key + params[key as keyof typeof params], url);

const signature = crypto.createHmac("sha1", authToken).update(data).digest("base64");

const valid = validateTwilioRequest(authToken, signature, url, params);
const invalid = validateTwilioRequest(authToken, "bad", url, params);

const twiml = twimlConnectStream("wss://example.fly.dev/media", {
  From: params.From,
  To: params.To,
});

if (!valid || invalid) {
  console.error("Twilio signature smoke test failed");
  process.exit(1);
}

if (!twiml.includes("wss://example.fly.dev/media") || !twiml.includes("+61400000000")) {
  console.error("TwiML smoke test failed");
  process.exit(1);
}

console.log("phone-ai bridge smoke tests passed");
