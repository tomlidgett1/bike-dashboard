import { COMPOSIO_TRIGGER_REGISTRATIONS_TABLE } from "./env.ts";
import { getAdminClient } from "./supabase.ts";

// Per-chat "hey comp" / "hey nest" keyword switching has been removed.
// Composio mode is now controlled solely by the env-level `composio` flag
// (see nestV3RuntimeEnabledForHandle). When that flag is false, normal
// Nest mode is the default for every inbound message.

export interface ComposioTriggerRegistration {
  triggerId: string;
  composioUserId: string;
  authUserId: string | null;
  handle: string;
  chatId: string | null;
  botNumber: string | null;
  triggerSlug: string;
  toolkitSlug: string | null;
  connectedAccountId: string | null;
  triggerConfig: Record<string, unknown>;
  active: boolean;
}

export async function upsertComposioTriggerRegistration(
  registration: ComposioTriggerRegistration,
): Promise<void> {
  const supabase = getAdminClient();
  const { error } = await supabase
    .from(COMPOSIO_TRIGGER_REGISTRATIONS_TABLE)
    .upsert(
      {
        trigger_id: registration.triggerId,
        composio_user_id: registration.composioUserId,
        auth_user_id: registration.authUserId,
        handle: registration.handle,
        chat_id: registration.chatId,
        bot_number: registration.botNumber,
        trigger_slug: registration.triggerSlug,
        toolkit_slug: registration.toolkitSlug,
        connected_account_id: registration.connectedAccountId,
        trigger_config: registration.triggerConfig,
        active: registration.active,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "trigger_id" },
    );

  if (error) {
    throw new Error(`Failed to upsert Composio trigger registration: ${error.message}`);
  }
}

export async function getComposioTriggerRegistration(
  triggerId: string,
): Promise<ComposioTriggerRegistration | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from(COMPOSIO_TRIGGER_REGISTRATIONS_TABLE)
    .select(
      "trigger_id, composio_user_id, auth_user_id, handle, chat_id, bot_number, trigger_slug, toolkit_slug, connected_account_id, trigger_config, active",
    )
    .eq("trigger_id", triggerId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    triggerId: data.trigger_id,
    composioUserId: data.composio_user_id,
    authUserId: data.auth_user_id ?? null,
    handle: data.handle,
    chatId: data.chat_id ?? null,
    botNumber: data.bot_number ?? null,
    triggerSlug: data.trigger_slug,
    toolkitSlug: data.toolkit_slug ?? null,
    connectedAccountId: data.connected_account_id ?? null,
    triggerConfig: (data.trigger_config as Record<string, unknown> | null) ?? {},
    active: data.active ?? true,
  };
}

export async function touchComposioTriggerRegistration(triggerId: string): Promise<void> {
  const supabase = getAdminClient();
  await supabase
    .from(COMPOSIO_TRIGGER_REGISTRATIONS_TABLE)
    .update({ last_webhook_at: new Date().toISOString() })
    .eq("trigger_id", triggerId);
}
