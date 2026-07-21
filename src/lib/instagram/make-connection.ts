/**
 * Per-store Make.com webhook connection for Instagram posting.
 * Meta Graph OAuth is not used; Make owns the Instagram connection.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";

export type MakeInstagramStatus = {
  connected: boolean;
  webhookConfigured: boolean;
  webhookHost: string | null;
  connectedAt: string | null;
  lastError: string | null;
};

function admin() {
  return createServiceRoleClient();
}

function webhookHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export async function getMakeInstagramRow(userId: string) {
  const { data, error } = await admin()
    .from("store_instagram_connections")
    .select(
      "id, user_id, status, make_webhook_url, make_webhook_secret, connected_at, last_error, updated_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[ig-make] get row failed:", error.message);
    return null;
  }
  return data;
}

export function toMakeInstagramStatus(
  row: Awaited<ReturnType<typeof getMakeInstagramRow>>,
): MakeInstagramStatus {
  const url = row?.make_webhook_url?.trim() || null;
  const connected = Boolean(url) && row?.status === "connected";
  return {
    connected,
    webhookConfigured: Boolean(url),
    webhookHost: webhookHost(url),
    connectedAt: row?.connected_at ?? null,
    lastError: row?.last_error ?? null,
  };
}

export async function saveMakeWebhook(payload: {
  userId: string;
  webhookUrl: string;
  webhookSecret?: string | null;
}): Promise<MakeInstagramStatus> {
  const url = payload.webhookUrl.trim();
  if (!url) {
    throw new Error("Make webhook URL is required.");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Make webhook URL is not a valid URL.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Make webhook URL must start with https://");
  }

  // Make custom webhooks are typically hook.eu*.make.com or hook.us*.make.com
  const host = parsed.hostname.toLowerCase();
  if (!host.includes("make.com") && !host.includes("integromat.com")) {
    throw new Error(
      "Webhook URL should be a Make.com custom webhook (hook.*.make.com).",
    );
  }

  const now = new Date().toISOString();
  const { data, error } = await admin()
    .from("store_instagram_connections")
    .upsert(
      {
        user_id: payload.userId,
        status: "connected",
        make_webhook_url: url,
        make_webhook_secret: payload.webhookSecret?.trim() || null,
        connected_at: now,
        disconnected_at: null,
        last_error: null,
        last_error_at: null,
        error_count: 0,
        // Clear any leftover Meta tokens; Make owns Instagram auth now.
        access_token_encrypted: null,
        user_access_token_encrypted: null,
        oauth_state: null,
        oauth_state_expires_at: null,
      },
      { onConflict: "user_id" },
    )
    .select(
      "id, user_id, status, make_webhook_url, make_webhook_secret, connected_at, last_error, updated_at",
    )
    .single();

  if (error || !data) {
    throw new Error(`Could not save Make webhook: ${error?.message ?? "unknown"}`);
  }

  return toMakeInstagramStatus(data);
}

export async function disconnectMakeWebhook(userId: string): Promise<MakeInstagramStatus> {
  const now = new Date().toISOString();
  const { data, error } = await admin()
    .from("store_instagram_connections")
    .upsert(
      {
        user_id: userId,
        status: "disconnected",
        make_webhook_url: null,
        make_webhook_secret: null,
        disconnected_at: now,
        access_token_encrypted: null,
        user_access_token_encrypted: null,
        last_error: null,
        last_error_at: null,
      },
      { onConflict: "user_id" },
    )
    .select(
      "id, user_id, status, make_webhook_url, make_webhook_secret, connected_at, last_error, updated_at",
    )
    .single();

  if (error || !data) {
    throw new Error(`Could not disconnect Make webhook: ${error?.message ?? "unknown"}`);
  }

  return toMakeInstagramStatus(data);
}

export async function triggerMakeInstagramPost(payload: {
  userId: string;
  imageUrl: string;
  caption: string;
  prompt?: string | null;
  postId?: string | null;
}): Promise<{ executionId: string; responseText: string }> {
  const row = await getMakeInstagramRow(payload.userId);
  const webhookUrl = row?.make_webhook_url?.trim();
  if (!webhookUrl || row?.status !== "connected") {
    throw new Error("Add your Make.com webhook URL first.");
  }

  const body = {
    imageUrl: payload.imageUrl,
    caption: payload.caption,
    prompt: payload.prompt ?? "",
    postId: payload.postId ?? "",
    source: "yellow-jersey-store-instagram",
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (row.make_webhook_secret) {
    headers["X-Make-Apikey"] = row.make_webhook_secret;
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const responseText = (await res.text()).slice(0, 1000);
  if (!res.ok) {
    await admin()
      .from("store_instagram_connections")
      .update({
        last_error: `Make webhook failed (${res.status}): ${responseText || res.statusText}`,
        last_error_at: new Date().toISOString(),
        error_count: (row as { error_count?: number } | null)?.error_count
          ? Number((row as { error_count?: number }).error_count) + 1
          : 1,
      })
      .eq("user_id", payload.userId);

    throw new Error(
      `Make webhook failed (${res.status}). Check your scenario is on and the webhook URL is correct.`,
    );
  }

  let executionId = `make_${Date.now()}`;
  try {
    const json = JSON.parse(responseText) as Record<string, unknown>;
    executionId = String(
      json.executionId || json.id || json.scenarioExecutionId || executionId,
    );
  } catch {
    // Make often returns empty body on success
  }

  return { executionId, responseText };
}
