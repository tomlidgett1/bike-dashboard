import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadGmailInquiryReadMapFromSupabase(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("store_customer_inquiry_reads")
    .select("inquiry_id, last_read_at")
    .eq("user_id", userId);

  if (error) {
    console.error("[inbox-read-supabase] gmail read map load failed:", error.message);
    return {};
  }

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.inquiry_id && row.last_read_at) {
      map[row.inquiry_id] = row.last_read_at;
    }
  }
  return map;
}

export async function markGmailInquiryReadInSupabase(
  supabase: SupabaseClient,
  userId: string,
  inquiryId: string,
  lastReadAt: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from("store_customer_inquiry_reads").upsert(
    {
      user_id: userId,
      inquiry_id: inquiryId,
      last_read_at: lastReadAt,
      updated_at: now,
    },
    { onConflict: "user_id,inquiry_id" },
  );

  if (error) {
    console.error("[inbox-read-supabase] gmail mark read failed:", error.message);
  }
}

export async function markAllGmailInquiryReadsInSupabase(
  supabase: SupabaseClient,
  userId: string,
  reads: Array<{ inquiryId: string; lastReadAt: string }>,
): Promise<void> {
  if (reads.length === 0) return;
  const now = new Date().toISOString();
  const rows = reads.map((read) => ({
    user_id: userId,
    inquiry_id: read.inquiryId,
    last_read_at: read.lastReadAt,
    updated_at: now,
  }));
  const { error } = await supabase
    .from("store_customer_inquiry_reads")
    .upsert(rows, { onConflict: "user_id,inquiry_id" });

  if (error) {
    console.error("[inbox-read-supabase] gmail mark all read failed:", error.message);
  }
}

export async function markAllNestReadInSupabase(
  supabase: SupabaseClient,
  userId: string,
  reads: Array<{ chatId: string; lastReadAt: string }>,
): Promise<void> {
  if (reads.length === 0) return;
  const now = new Date().toISOString();
  const rows = reads.map((read) => ({
    user_id: userId,
    chat_id: read.chatId,
    last_read_at: read.lastReadAt,
    updated_at: now,
  }));
  const { error } = await supabase
    .from("store_nest_conversation_reads")
    .upsert(rows, { onConflict: "user_id,chat_id" });

  if (error) {
    console.error("[inbox-read-supabase] nest mark all read failed:", error.message);
  }
}
