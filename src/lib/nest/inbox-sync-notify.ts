import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { handleNestInboxSyncEvent, type NestInboxSyncEvent } from "@/lib/nest/inbox-webhook-sync";

function getServiceSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Push a fresh copy of a Nest thread into the YJ inbox mirror as soon as the
 * portal writes a message — avoids waiting for cron or client polling.
 */
export async function notifyNestInboxSync(event: NestInboxSyncEvent): Promise<void> {
  const supabase = getServiceSupabase();
  if (!supabase || !event.brandKey?.trim()) return;

  try {
    await handleNestInboxSyncEvent(supabase, event);
  } catch (error) {
    console.error("[nest-inbox-notify] sync failed:", error);
  }
}
