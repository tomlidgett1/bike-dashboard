import type { SupabaseClient } from "@supabase/supabase-js";
import {
  releasePortalHumanMode,
  shouldReleaseHumanModeForInboundMessage,
} from "@/lib/nest/human-mode";
import {
  syncNestInboxFromPortal,
  syncNestThreadFromPortal,
} from "@/lib/store/unified-inbox-sync";

export type NestInboxSyncEvent = {
  brandKey: string;
  chatId?: string | null;
  role?: string | null;
  recipientHandle?: string | null;
  botNumber?: string | null;
  metadata?: Record<string, unknown> | null;
  source?: string | null;
};

async function resolveStoreUserIdsForBrand(
  supabase: SupabaseClient,
  brandKey: string,
): Promise<string[]> {
  const key = brandKey.trim().toLowerCase();
  const { data, error } = await supabase
    .from("users")
    .select("user_id, nest_brand_key, business_name")
    .eq("account_type", "bicycle_store")
    .eq("bicycle_store", true)
    .limit(100);

  if (error) {
    console.error("[nest-inbox-webhook] store lookup failed:", error.message);
    return [];
  }

  const { resolveStoreNestBrandKey } = await import("@/lib/nest/resolve-store-brand-key");
  const userIds: string[] = [];
  for (const profile of data ?? []) {
    const resolved = resolveStoreNestBrandKey(profile);
    if (resolved === key) {
      const userId = String(profile.user_id ?? "").trim();
      if (userId) userIds.push(userId);
    }
  }
  return userIds;
}

export async function handleNestInboxSyncEvent(
  supabase: SupabaseClient,
  event: NestInboxSyncEvent,
): Promise<{ syncedStores: number; releasedHumanMode: boolean }> {
  const brandKey = event.brandKey.trim().toLowerCase();
  if (!brandKey) return { syncedStores: 0, releasedHumanMode: false };

  const metadata = event.metadata ?? {};
  const role = String(event.role ?? "").trim();

  let releasedHumanMode = false;
  if (role === "user") {
    const releaseDecision = shouldReleaseHumanModeForInboundMessage(metadata);
    if (releaseDecision.release) {
      releasedHumanMode = await releasePortalHumanMode(supabase, {
        chatId: event.chatId ?? null,
        recipientHandle: event.recipientHandle ?? null,
        botNumber: event.botNumber ?? null,
        brandKey,
        reason: releaseDecision.reason,
        releaseRoute: releaseDecision.releaseRoute,
      });
    }
  } else if (role === "assistant") {
    const releaseDecision = shouldReleaseHumanModeForInboundMessage(metadata);
    if (releaseDecision.release) {
      releasedHumanMode = await releasePortalHumanMode(supabase, {
        chatId: event.chatId ?? null,
        recipientHandle: event.recipientHandle ?? null,
        botNumber: event.botNumber ?? null,
        brandKey,
        reason: releaseDecision.reason,
        releaseRoute: releaseDecision.releaseRoute,
      });
    }
  }

  const userIds = await resolveStoreUserIdsForBrand(supabase, brandKey);
  if (userIds.length === 0) return { syncedStores: 0, releasedHumanMode };

  const chatId = event.chatId?.trim() || null;
  let syncedStores = 0;

  await Promise.all(
    userIds.map(async (userId) => {
      try {
        if (chatId) {
          await syncNestThreadFromPortal(supabase, userId, brandKey, chatId, {
            enrichLightspeed: false,
            syncThreads: false,
          });
        } else {
          await syncNestInboxFromPortal(supabase, userId, brandKey, {
            enrichLightspeed: false,
            syncThreads: true,
            threadLimit: 24,
          });
        }
        syncedStores += 1;
      } catch (error) {
        console.error("[nest-inbox-webhook] sync failed:", userId, error);
      }
    }),
  );

  return { syncedStores, releasedHumanMode };
}
