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
  // Prefer idempotent RPC (GREATEST) so concurrent/stale writes never move the
  // high-water mark backwards. Fall back to upsert if the migration is not applied yet.
  const { error: rpcError } = await supabase.rpc("mark_customer_inquiry_read", {
    p_user_id: userId,
    p_inquiry_id: inquiryId,
    p_last_read_at: lastReadAt,
  });

  if (!rpcError) return;

  if (
    rpcError.message &&
    !/mark_customer_inquiry_read|Could not find the function/i.test(rpcError.message)
  ) {
    console.error("[inbox-read-supabase] gmail mark read rpc failed:", rpcError.message);
  }

  const existingMap = await loadGmailInquiryReadMapFromSupabase(supabase, userId);
  const existing = existingMap[inquiryId];
  const existingMs = existing ? new Date(existing).getTime() : 0;
  const nextMs = new Date(lastReadAt).getTime();
  if (Number.isFinite(existingMs) && Number.isFinite(nextMs) && existingMs >= nextMs) {
    return;
  }

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

  // Merge with existing so bulk mark-all never regresses a newer per-thread mark.
  const existingMap = await loadGmailInquiryReadMapFromSupabase(supabase, userId);
  const now = new Date().toISOString();
  const rows = reads.map((read) => {
    const existing = existingMap[read.inquiryId];
    const existingMs = existing ? new Date(existing).getTime() : 0;
    const nextMs = new Date(read.lastReadAt).getTime();
    const lastReadAt =
      Number.isFinite(existingMs) && existingMs > nextMs && existing
        ? existing
        : read.lastReadAt;
    return {
      user_id: userId,
      inquiry_id: read.inquiryId,
      last_read_at: lastReadAt,
      updated_at: now,
    };
  });
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

  const { data: existingRows, error: loadError } = await supabase
    .from("store_nest_conversation_reads")
    .select("chat_id, last_read_at")
    .eq("user_id", userId);

  if (loadError) {
    console.error("[inbox-read-supabase] nest read map load failed:", loadError.message);
  }

  const existingMap: Record<string, string> = {};
  for (const row of existingRows ?? []) {
    if (row.chat_id && row.last_read_at) {
      existingMap[row.chat_id] = row.last_read_at;
    }
  }

  const now = new Date().toISOString();
  const rows = reads.map((read) => {
    const existing = existingMap[read.chatId];
    const existingMs = existing ? new Date(existing).getTime() : 0;
    const nextMs = new Date(read.lastReadAt).getTime();
    const lastReadAt =
      Number.isFinite(existingMs) && existingMs > nextMs && existing
        ? existing
        : read.lastReadAt;
    return {
      user_id: userId,
      chat_id: read.chatId,
      last_read_at: lastReadAt,
      updated_at: now,
    };
  });
  const { error } = await supabase
    .from("store_nest_conversation_reads")
    .upsert(rows, { onConflict: "user_id,chat_id" });

  if (error) {
    console.error("[inbox-read-supabase] nest mark all read failed:", error.message);
  }
}
