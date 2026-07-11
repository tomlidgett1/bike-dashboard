import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { pickServerEnv } from "../src/lib/nest-portal/lib/server-env";

async function tryUrl(label: string, base: string | undefined, secret: string | undefined) {
  if (!base || !secret) {
    console.log(label, "missing url/secret");
    return;
  }
  const url = `${base.replace(/\/+$/, "")}/functions/v1/brand-chat`;
  const brandKey = "ash";
  const chatId = `portal-test#${brandKey}#${Date.now()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": secret,
    },
    body: JSON.stringify({
      chatId,
      senderHandle: `portal-test@${brandKey}`,
      brandKey,
      message: "What are your opening hours?",
    }),
  });
  const text = await res.text();
  console.log(label, res.status, text.slice(0, 300));
}

async function main() {
  const secret = pickServerEnv(["INTERNAL_EDGE_SHARED_SECRET", "NEST_INTERNAL_EDGE_SHARED_SECRET"]);
  const yj = pickServerEnv(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]);
  const nest = pickServerEnv(["NEST_SUPABASE_URL", "NEST_PUBLIC_SUPABASE_URL"]);
  console.log({ yj, nest, hasSecret: Boolean(secret) });
  await tryUrl("YJ", yj, secret);
  await tryUrl("NEST", nest, secret);
}

main().catch(console.error);
