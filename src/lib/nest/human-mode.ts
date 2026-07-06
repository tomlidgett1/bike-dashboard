import type { SupabaseClient } from "@supabase/supabase-js";

export type HumanModeReleaseReason = "route_switch" | "store_call_reentry" | "system";

export type HumanModeThreadRow = {
  chat_id: string;
  recipient_handle: string;
  bot_number: string;
  brand_key: string;
  released_at: string | null;
};

type ExistingHumanModeRow = {
  id: string;
  chat_id: string;
  brand_key: string;
  released_at: string | null;
};

function normaliseBrandKey(brandKey: string): string {
  return brandKey.trim().toLowerCase();
}

export async function fetchActiveHumanModeChatIds(
  supabase: SupabaseClient,
  brandKey: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("linq_human_mode_threads")
    .select("chat_id")
    .eq("brand_key", normaliseBrandKey(brandKey))
    .is("released_at", null);

  if (error) {
    console.error("[nest-human-mode] active chat lookup failed:", error.message);
    return new Set();
  }

  return new Set(
    (data ?? [])
      .map((row) => String(row.chat_id ?? "").trim())
      .filter(Boolean),
  );
}

export async function isHumanModeActiveForChat(
  supabase: SupabaseClient,
  chatId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("linq_human_mode_threads")
    .select("id")
    .eq("chat_id", chatId)
    .is("released_at", null)
    .maybeSingle();

  if (error) {
    console.error("[nest-human-mode] chat lookup failed:", error.message);
    return false;
  }

  return Boolean(data?.id);
}

export async function assertPortalHumanModeAvailable(
  supabase: SupabaseClient,
  params: { recipientHandle: string; botNumber: string; brandKey: string },
): Promise<void> {
  const brandKey = normaliseBrandKey(params.brandKey);
  const { data: active, error } = await supabase
    .from("linq_human_mode_threads")
    .select("brand_key")
    .eq("recipient_handle", params.recipientHandle)
    .eq("bot_number", params.botNumber)
    .is("released_at", null)
    .maybeSingle<{ brand_key: string }>();

  if (error) throw new Error(`Could not check human-only mode: ${error.message}`);
  if (active?.brand_key && normaliseBrandKey(active.brand_key) !== brandKey) {
    throw new Error("This recipient is already in human-only mode for another brand.");
  }
}

export async function activatePortalHumanMode(
  supabase: SupabaseClient,
  params: {
    chatId: string;
    recipientHandle: string;
    botNumber: string;
    brandKey: string;
    source: "brand_portal_manual_reply" | "brand_portal_start_message";
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await assertPortalHumanModeAvailable(supabase, {
    recipientHandle: params.recipientHandle,
    botNumber: params.botNumber,
    brandKey: params.brandKey,
  });

  const now = new Date().toISOString();
  const brandKey = normaliseBrandKey(params.brandKey);
  const payload = {
    chat_id: params.chatId,
    recipient_handle: params.recipientHandle,
    bot_number: params.botNumber,
    brand_key: brandKey,
    source: params.source,
    activated_by: `staff@${brandKey}`,
    activated_at: now,
    last_staff_message_at: now,
    released_at: null,
    released_reason: null,
    release_route: null,
    release_brand_key: null,
    metadata: params.metadata ?? {},
  };

  const [chatLookup, recipientLookup] = await Promise.all([
    supabase
      .from("linq_human_mode_threads")
      .select("id, chat_id, brand_key, released_at")
      .eq("chat_id", params.chatId)
      .maybeSingle<ExistingHumanModeRow>(),
    supabase
      .from("linq_human_mode_threads")
      .select("id, chat_id, brand_key, released_at")
      .eq("recipient_handle", params.recipientHandle)
      .eq("bot_number", params.botNumber)
      .maybeSingle<ExistingHumanModeRow>(),
  ]);

  if (chatLookup.error) {
    throw new Error(`Could not activate human-only mode: ${chatLookup.error.message}`);
  }
  if (recipientLookup.error) {
    throw new Error(`Could not activate human-only mode: ${recipientLookup.error.message}`);
  }

  const existingByChat = chatLookup.data ?? null;
  const existingByRecipient = recipientLookup.data ?? null;

  if (
    existingByRecipient?.released_at == null &&
    existingByRecipient?.brand_key &&
    normaliseBrandKey(existingByRecipient.brand_key) !== brandKey
  ) {
    throw new Error("This recipient is already in human-only mode for another brand.");
  }

  if (
    existingByChat?.id &&
    existingByRecipient?.id &&
    existingByChat.id !== existingByRecipient.id
  ) {
    if (existingByRecipient.released_at == null) {
      throw new Error("This recipient is already in human-only mode for another chat.");
    }

    // Older migrations used non-partial unique constraints. Remove stale released
    // recipient rows before reusing the chat row as the canonical active record.
    const { error } = await supabase
      .from("linq_human_mode_threads")
      .delete()
      .eq("id", existingByRecipient.id);
    if (error) throw new Error(`Could not activate human-only mode: ${error.message}`);
  }

  const existing = existingByChat ?? existingByRecipient;

  if (existing?.id) {
    const { error } = await supabase
      .from("linq_human_mode_threads")
      .update(payload)
      .eq("id", existing.id);
    if (error) throw new Error(`Could not activate human-only mode: ${error.message}`);
    return;
  }

  const { error } = await supabase.from("linq_human_mode_threads").insert(payload);
  if (error) throw new Error(`Could not activate human-only mode: ${error.message}`);
}

export async function releasePortalHumanMode(
  supabase: SupabaseClient,
  params: {
    recipientHandle?: string | null;
    botNumber?: string | null;
    chatId?: string | null;
    brandKey?: string | null;
    reason: HumanModeReleaseReason;
    releaseRoute?: string | null;
  },
): Promise<boolean> {
  const now = new Date().toISOString();
  let query = supabase
    .from("linq_human_mode_threads")
    .update({
      released_at: now,
      released_reason: params.reason,
      release_route: params.releaseRoute ?? null,
      release_brand_key: params.brandKey ? normaliseBrandKey(params.brandKey) : null,
    })
    .is("released_at", null);

  if (params.chatId?.trim()) {
    query = query.eq("chat_id", params.chatId.trim());
  } else if (params.recipientHandle?.trim() && params.botNumber?.trim()) {
    query = query
      .eq("recipient_handle", params.recipientHandle.trim())
      .eq("bot_number", params.botNumber.trim());
  } else {
    return false;
  }

  const { data, error } = await query.select("id");
  if (error) {
    console.error("[nest-human-mode] release failed:", error.message);
    return false;
  }

  return (data?.length ?? 0) > 0;
}

const STOREFRONT_CHAT_SOURCES = new Set([
  "storefront_chat",
  "website_chat",
  "brand_storefront",
  "store_website_chat",
  "brand_website_chat",
]);

export function shouldReleaseHumanModeForInboundMessage(metadata: Record<string, unknown>): {
  release: boolean;
  reason: HumanModeReleaseReason;
  releaseRoute: string | null;
} {
  const source = typeof metadata.source === "string" ? metadata.source.trim() : "";
  const service = typeof metadata.service === "string" ? metadata.service.trim() : "";

  if (source === "twilio-voice-webhook" || service === "twilio-voice-webhook") {
    return { release: true, reason: "store_call_reentry", releaseRoute: "twilio_voice" };
  }

  if (metadata.route_switch === true || metadata.reenter_bot_mode === true) {
    return {
      release: true,
      reason: "route_switch",
      releaseRoute: typeof metadata.route === "string" ? metadata.route : "route_switch",
    };
  }

  if (STOREFRONT_CHAT_SOURCES.has(source) || STOREFRONT_CHAT_SOURCES.has(service)) {
    return { release: true, reason: "route_switch", releaseRoute: source || service };
  }

  return { release: false, reason: "route_switch", releaseRoute: null };
}
