import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isComposioConfigured,
  listGmailConnections,
} from "@/lib/composio/gmail";

const GMAIL_STATE_TTL_MS = 5 * 60 * 1000;

export type InboxGmailState = {
  configured: boolean;
  connected: boolean;
  connectUrl: string | null;
  accounts: Array<{
    id: string;
    label: string;
    email_address: string | null;
    status: string;
  }>;
};

type StoredGmailState = InboxGmailState & { checkedAt: string | null };

export async function loadCachedGmailState(
  supabase: SupabaseClient,
  userId: string,
): Promise<StoredGmailState | null> {
  const { data, error } = await supabase
    .from("store_inbox_connection_state")
    .select("gmail_configured, gmail_connected, gmail_accounts, gmail_checked_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const checkedAt = data.gmail_checked_at as string | null;
  if (!checkedAt) return null;
  if (Date.now() - new Date(checkedAt).getTime() > GMAIL_STATE_TTL_MS) return null;

  const accounts = Array.isArray(data.gmail_accounts) ? data.gmail_accounts : [];

  return {
    configured: Boolean(data.gmail_configured),
    connected: Boolean(data.gmail_connected),
    connectUrl: null,
    accounts: accounts as StoredGmailState["accounts"],
    checkedAt,
  };
}

export async function refreshAndStoreGmailState(
  supabase: SupabaseClient,
  userId: string,
): Promise<InboxGmailState> {
  const configured = isComposioConfigured();
  const connections = configured ? await listGmailConnections(userId).catch(() => []) : [];
  const now = new Date().toISOString();

  const state: InboxGmailState = {
    configured,
    connected: connections.length > 0,
    connectUrl: null,
    accounts: connections.map((connection) => ({
      id: connection.id,
      label: connection.label,
      email_address: connection.email_address ?? null,
      status: connection.status,
    })),
  };

  await supabase.from("store_inbox_connection_state").upsert(
    {
      user_id: userId,
      gmail_configured: state.configured,
      gmail_connected: state.connected,
      gmail_accounts: state.accounts,
      gmail_checked_at: now,
      updated_at: now,
    },
    { onConflict: "user_id" },
  );

  return state;
}

export async function resolveGmailState(
  supabase: SupabaseClient,
  userId: string,
  options?: { forceRefresh?: boolean },
): Promise<InboxGmailState> {
  if (!options?.forceRefresh) {
    const cached = await loadCachedGmailState(supabase, userId);
    if (cached) {
      return {
        configured: cached.configured,
        connected: cached.connected,
        connectUrl: cached.connectUrl,
        accounts: cached.accounts,
      };
    }
  }

  return refreshAndStoreGmailState(supabase, userId);
}
