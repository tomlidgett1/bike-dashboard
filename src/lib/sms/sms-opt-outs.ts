import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanSmsPhone, isValidSmsPhone } from "@/lib/sms/smsbroadcast";

const STOP_KEYWORDS = new Set(["stop", "unsubscribe", "cancel", "end", "quit", "optout", "opt-out"]);

export function extractPhoneFromSmsbroadcastPayload(
  payload: Record<string, unknown>,
): string | null {
  const candidates = [
    payload.sourceAddress,
    payload.source_address,
    payload.phone,
    payload.mobile,
    payload.from,
    payload.ProfileNumber,
    payload.profileNumber,
  ];
  for (const value of candidates) {
    const phone = String(value ?? "").trim();
    if (isValidSmsPhone(phone)) return cleanSmsPhone(phone);
  }
  return null;
}

export function isSmsStopMessage(content: string | null | undefined): boolean {
  const normalised = String(content ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z-]/g, "");
  return STOP_KEYWORDS.has(normalised);
}

export async function recordSmsOptOut(args: {
  supabase: SupabaseClient;
  userId: string;
  phone: string;
  reason?: string | null;
  source?: string;
}): Promise<void> {
  const phone = cleanSmsPhone(args.phone);
  if (!isValidSmsPhone(phone)) return;

  const { error } = await args.supabase.from("store_sms_opt_outs").upsert(
    {
      user_id: args.userId,
      phone,
      opted_out_at: new Date().toISOString(),
      source: args.source ?? "smsbroadcast",
      reason: args.reason ?? null,
    },
    { onConflict: "user_id,phone" },
  );
  if (error) throw error;
}

export async function removeSmsOptOut(args: {
  supabase: SupabaseClient;
  userId: string;
  phone: string;
}): Promise<void> {
  const phone = cleanSmsPhone(args.phone);
  if (!phone) return;
  await args.supabase
    .from("store_sms_opt_outs")
    .delete()
    .eq("user_id", args.userId)
    .eq("phone", phone);
}

export async function getSmsOptedOutPhoneSet(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<Set<string>> {
  const { data, error } = await args.supabase
    .from("store_sms_opt_outs")
    .select("phone")
    .eq("user_id", args.userId);
  if (error) throw error;
  return new Set((data ?? []).map((row) => cleanSmsPhone(String(row.phone))));
}

export function isSmsOptedOut(phone: string | null | undefined, optedOutPhones: Set<string>): boolean {
  if (!phone || !isValidSmsPhone(phone)) return false;
  return optedOutPhones.has(cleanSmsPhone(phone));
}
