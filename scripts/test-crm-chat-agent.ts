// Smoke test for the CRM campaign chat agent (real store data, one short run).
// Usage: npx tsx scripts/test-crm-chat-agent.ts "your prompt"
// Auth: expects CRM_TEST_ACCESS_TOKEN + CRM_TEST_REFRESH_TOKEN in env, or reads
// a session JSON path from CRM_TEST_SESSION_FILE.

import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { runCrmChatAgent } from "../src/lib/crm/agent/chat-agent";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  let accessToken = process.env.CRM_TEST_ACCESS_TOKEN;
  let refreshToken = process.env.CRM_TEST_REFRESH_TOKEN;
  const sessionFile = process.env.CRM_TEST_SESSION_FILE;
  if ((!accessToken || !refreshToken) && sessionFile) {
    const raw = readFileSync(sessionFile, "utf8").trim();
    const session = JSON.parse(
      Buffer.from(raw.replace(/^base64-/, ""), "base64url").toString(),
    ) as { access_token: string; refresh_token: string };
    accessToken = session.access_token;
    refreshToken = session.refresh_token;
  }
  if (!accessToken || !refreshToken) {
    console.error("Missing CRM_TEST_ACCESS_TOKEN/CRM_TEST_REFRESH_TOKEN or CRM_TEST_SESSION_FILE");
    process.exit(1);
  }

  const supabase = createClient(url, anon);
  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error || !data.user) {
    console.error("Auth failed:", error?.message);
    process.exit(1);
  }
  console.log("Authed as", data.user.email);

  const prompt = process.argv[2] ?? "How many of my customers bought anything in the last 90 days? Just tell me, don't build a campaign yet.";

  await runCrmChatAgent({
    supabase,
    userId: data.user.id,
    messages: [{ role: "user", content: prompt }],
    emit: (event) => {
      if (event.type === "assistant_delta") return; // too noisy
      if (event.type === "assistant_message") {
        console.log("\n=== ASSISTANT ===\n" + event.text + "\n=================");
        return;
      }
      const compact = JSON.stringify(event);
      console.log("[event]", compact.length > 400 ? compact.slice(0, 400) + "…" : compact);
    },
  });
}

main().catch((error) => {
  console.error("FATAL", error);
  process.exit(1);
});
