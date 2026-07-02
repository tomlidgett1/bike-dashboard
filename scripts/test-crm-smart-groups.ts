// Smoke test for smart group recommendations (read-only — nothing persisted).
// Usage: CRM_TEST_SESSION_FILE=<path> npx tsx scripts/test-crm-smart-groups.ts

import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { recommendSmartGroups } from "../src/lib/crm/smart-groups";

async function main() {
  const sessionFile = process.env.CRM_TEST_SESSION_FILE;
  if (!sessionFile) {
    console.error("Set CRM_TEST_SESSION_FILE");
    process.exit(1);
  }
  const raw = readFileSync(sessionFile, "utf8").trim();
  const session = JSON.parse(Buffer.from(raw.replace(/^base64-/, ""), "base64url").toString()) as {
    access_token: string;
    refresh_token: string;
  };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data, error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (error || !data.user) {
    console.error("Auth failed:", error?.message);
    process.exit(1);
  }
  console.log("Authed as", data.user.email);

  const started = Date.now();
  const proposals = await recommendSmartGroups(supabase, data.user.id, "Test Store");
  console.log(`\n${proposals.length} proposals in ${Math.round((Date.now() - started) / 1000)}s:\n`);
  for (const proposal of proposals) {
    console.log(`— ${proposal.name} (${proposal.count} members)`);
    console.log(`  ${proposal.description}`);
    console.log(`  why: ${proposal.reason}`);
    console.log(`  rules: ${proposal.rules.map((rule) => `${rule.type}=${rule.value ?? ""}`).join(", ")}`);
    console.log(`  sample: ${proposal.sample.slice(0, 3).map((c) => c.first_name ?? c.email).join(", ")}\n`);
  }
}

main().catch((error) => {
  console.error("FATAL", error);
  process.exit(1);
});
