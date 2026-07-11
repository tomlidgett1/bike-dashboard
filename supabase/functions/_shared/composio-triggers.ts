import { getComposioClient, formatComposioAuthErrorMessage } from "./composio-client.ts";
import { listComposioConnectedAccounts } from "./composio-tools.ts";
import {
  getComposioTriggerRegistration,
  upsertComposioTriggerRegistration,
} from "./composio-state.ts";
import { getAdminClient } from "./supabase.ts";

function sortKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    out[k] = sortKeysDeep(obj[k]);
  }
  return out;
}

function stableTriggerConfigKey(config: Record<string, unknown>): string {
  return JSON.stringify(sortKeysDeep(config));
}

async function resolveBotNumberForHandle(handle: string): Promise<string | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("bot_number")
    .eq("handle", handle)
    .maybeSingle();
  if (error || !data) return null;
  const n = data.bot_number;
  return typeof n === "string" && n.trim().length > 0 ? n.trim() : null;
}

export async function listComposioTriggerTypes(args: {
  toolkits?: string[];
  limit?: number;
  cursor?: string;
}) {
  const composio = getComposioClient();
  return composio.triggers.listTypes({
    toolkits: args.toolkits,
    limit: args.limit,
    cursor: args.cursor,
  });
}

export async function getComposioTriggerType(slug: string) {
  const composio = getComposioClient();
  return composio.triggers.getType(slug);
}

export async function listComposioActiveTriggers(args: {
  connectedAccountIds?: string[];
  triggerNames?: string[];
  showDisabled?: boolean;
  limit?: number;
  cursor?: string;
}) {
  const composio = getComposioClient();
  return composio.triggers.listActive(args);
}

/**
 * List active triggers only for this Composio user's connected accounts.
 * Calling listActive without connectedAccountIds can return org-wide triggers.
 */
export async function listComposioActiveTriggersForUser(
  composioUserId: string,
  query: {
    connectedAccountIds?: string[];
    triggerNames?: string[];
    showDisabled?: boolean;
    limit?: number;
    cursor?: string;
  },
) {
  const accounts = await listComposioConnectedAccounts(composioUserId);
  const defaultIds = accounts.map((a) => a.id).filter(Boolean);
  const mergedIds = query.connectedAccountIds?.length
    ? query.connectedAccountIds
    : defaultIds;
  if (!mergedIds.length) {
    return { items: [] as Array<{ id: string; triggerConfig?: Record<string, unknown>; connectedAccountId?: string }> };
  }
  return listComposioActiveTriggers({
    ...query,
    connectedAccountIds: mergedIds,
  });
}

export async function createComposioTrigger(args: {
  userId: string;
  authUserId: string | null;
  handle: string;
  chatId: string;
  botNumber: string | null;
  slug: string;
  triggerConfig: Record<string, unknown>;
  connectedAccountId?: string;
}) {
  const composio = getComposioClient();
  const triggerType = await composio.triggers.getType(args.slug) as {
    toolkit?: { slug?: string | null; logo?: string | null };
  };
  const toolkitSlug = String(triggerType.toolkit?.slug ?? args.slug.split("_")[0] ?? "").toLowerCase();
  if (!toolkitSlug) throw new Error(`Could not infer toolkit for trigger ${args.slug}`);

  const accounts = await listComposioConnectedAccounts(args.userId);
  const toolkitAccounts = accounts.filter((a) =>
    a.toolkit.toLowerCase() === toolkitSlug
  );
  const accountIdsForDedupe = args.connectedAccountId
    ? [args.connectedAccountId]
    : toolkitAccounts.map((a) => a.id).filter(Boolean);

  const existing = accountIdsForDedupe.length > 0
    ? await composio.triggers.listActive({
      triggerNames: [args.slug],
      connectedAccountIds: accountIdsForDedupe,
      showDisabled: false,
      limit: 50,
    })
    : { items: [] };

  const wantKey = stableTriggerConfigKey(args.triggerConfig);
  const duplicate = existing.items.find((item) =>
    stableTriggerConfigKey((item.triggerConfig ?? {}) as Record<string, unknown>) === wantKey
  );

  const botNumber = args.botNumber ?? await resolveBotNumberForHandle(args.handle);

  if (duplicate) {
    await upsertComposioTriggerRegistration({
      triggerId: duplicate.id,
      composioUserId: args.userId,
      authUserId: args.authUserId,
      handle: args.handle,
      chatId: args.chatId,
      botNumber,
      triggerSlug: args.slug,
      toolkitSlug,
      connectedAccountId: duplicate.connectedAccountId ?? args.connectedAccountId ?? null,
      triggerConfig: duplicate.triggerConfig ?? args.triggerConfig,
      active: true,
    });

    return {
      triggerId: duplicate.id,
      triggerSlug: args.slug,
      toolkit: toolkitSlug,
      duplicate: true,
    };
  }

  const created = await composio.triggers.create(args.userId, args.slug, {
    triggerConfig: args.triggerConfig,
    connectedAccountId: args.connectedAccountId,
  });

  await upsertComposioTriggerRegistration({
    triggerId: created.triggerId,
    composioUserId: args.userId,
    authUserId: args.authUserId,
    handle: args.handle,
    chatId: args.chatId,
    botNumber,
    triggerSlug: args.slug,
    toolkitSlug,
    connectedAccountId: args.connectedAccountId ?? null,
    triggerConfig: args.triggerConfig,
    active: true,
  });

  return {
    triggerId: created.triggerId,
    triggerSlug: args.slug,
    toolkit: toolkitSlug,
  };
}

export async function verifyComposioWebhook(args: {
  payload: string;
  id: string;
  timestamp: string;
  signature: string;
  secret: string;
}) {
  const composio = getComposioClient();
  return composio.triggers.verifyWebhook(args);
}

export async function resolveTriggerRecipient(args: {
  triggerId: string;
  userId: string | null;
}) {
  const registration = await getComposioTriggerRegistration(args.triggerId);
  if (registration) return registration;

  if (!args.userId) return null;

  const supabase = getAdminClient();

  if (args.userId.startsWith("handle:")) {
    const handle = args.userId.replace(/^handle:/, "");
    const { data, error } = await supabase
      .from("user_profiles")
      .select("handle, bot_number, auth_user_id")
      .eq("handle", handle)
      .maybeSingle();
    if (error || !data?.handle) return null;
    return {
      triggerId: args.triggerId,
      composioUserId: args.userId,
      authUserId: data.auth_user_id ?? null,
      handle: data.handle,
      chatId: null,
      botNumber: data.bot_number ?? null,
      triggerSlug: "unknown",
      toolkitSlug: null,
      connectedAccountId: null,
      triggerConfig: {},
      active: true,
    };
  }

  const authUserId = args.userId.startsWith("auth:") ? args.userId.replace(/^auth:/, "") : null;
  if (!authUserId) return null;

  const { data, error } = await supabase
    .from("user_profiles")
    .select("handle, bot_number")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error || !data?.handle) return null;

  return {
    triggerId: args.triggerId,
    composioUserId: args.userId,
    authUserId,
    handle: data.handle,
    chatId: null,
    botNumber: data.bot_number ?? null,
    triggerSlug: "unknown",
    toolkitSlug: null,
    connectedAccountId: null,
    triggerConfig: {},
    active: true,
  };
}

export function formatComposioTriggerError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return formatComposioAuthErrorMessage(raw);
}
