import { createClient } from "@supabase/supabase-js";
const yj = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
async function main() {
  const since = new Date(Date.now() - 30*60*1000).toISOString(); // last 30 min
  const { data, error } = await yj.from("conversation_messages")
    .select("created_at, role, engagement_brand_key, content")
    .eq("engagement_scope","brand")
    .gt("created_at", since)
    .order("created_at", { ascending: false }).limit(5);
  if (error) { console.log("err:", error.message); return; }
  const { count } = await yj.from("conversation_messages").select("*",{count:"exact",head:true}).eq("engagement_scope","brand").gt("created_at", since);
  console.log(`brand messages in last 30 min (= live inbound after the data copy): ${count ?? 0}`);
  for (const r of data||[]) console.log(`  ${r.created_at} ${r.role} [${r.engagement_brand_key}] ${(r.content||"").slice(0,50)}`);
  if (!count) console.log("  -> no new inbound yet (webhook not saved, or no message received since)");
}
main().catch(e=>console.log("note:",e.message));
