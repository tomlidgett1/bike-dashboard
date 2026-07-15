import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanSmsPhone, isValidSmsPhone } from "@/lib/sms/smsbroadcast";

export type SmsLastSentEntry = {
  phone: string;
  lastSentAt: string;
  contactId: string | null;
};

export async function recordSmsSends(args: {
  supabase: SupabaseClient;
  userId: string;
  sends: { phone: string; contactId?: string | null }[];
}): Promise<void> {
  const now = new Date().toISOString();
  const rows = args.sends
    .filter((entry) => isValidSmsPhone(entry.phone))
    .map((entry) => ({
      user_id: args.userId,
      phone: cleanSmsPhone(entry.phone),
      contact_id: entry.contactId ?? null,
      last_sent_at: now,
    }));

  if (rows.length === 0) return;

  const { error } = await args.supabase
    .from("store_sms_last_sent")
    .upsert(rows, { onConflict: "user_id,phone" });

  if (error) throw error;
}

export async function getSmsLastSentByPhoneMap(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<Map<string, string>> {
  const { data, error } = await args.supabase
    .from("store_sms_last_sent")
    .select("phone, last_sent_at")
    .eq("user_id", args.userId);

  if (error) throw error;

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const phone = cleanSmsPhone(String(row.phone));
    if (!phone) continue;
    map.set(phone, String(row.last_sent_at));
  }
  return map;
}

export async function getSmsLastSentEntries(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<SmsLastSentEntry[]> {
  const { data, error } = await args.supabase
    .from("store_sms_last_sent")
    .select("phone, last_sent_at, contact_id")
    .eq("user_id", args.userId)
    .order("last_sent_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    phone: cleanSmsPhone(String(row.phone)),
    lastSentAt: String(row.last_sent_at),
    contactId: row.contact_id ? String(row.contact_id) : null,
  }));
}
