import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

async function main() {
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: conn } = await sb
    .from("lightspeed_connections")
    .select("status, last_error, token_expires_at, last_token_refresh_at")
    .eq("user_id", "3acef09d-8b28-46e8-a0c3-45ce59c61972")
    .single();
  console.log("lightspeed_connections:", conn);

  const patterns = ["428808811", "0428808811", "61428808811", "Julie"];
  for (const p of patterns) {
    const { data, error } = await sb
      .from("store_nest_conversations")
      .select("conversation_id, customer_name, customer_phone, lightspeed_customer_id, updated_at")
      .or(`customer_phone.ilike.%${p}%,customer_name.ilike.%${p}%`)
      .limit(5);
    if (data?.length) console.log("store_nest_conversations", p, data);
    if (error && error.code !== "PGRST205") console.log("error", p, error.message);
  }
}

main();
