import type { SupabaseClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;

async function paginateLightspeedItemIds(
  service: SupabaseClient,
  table: "products_all_ls" | "products",
  userId: string,
  activeOnly: boolean
) {
  const ids: string[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = service
      .from(table)
      .select("lightspeed_item_id")
      .eq("user_id", userId)
      .range(from, to);

    if (activeOnly) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;
    if (error) throw error;

    if (data && data.length > 0) {
      ids.push(...data.map((row) => row.lightspeed_item_id));
      page++;
      hasMore = data.length === PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  return ids;
}

export type LightspeedNotSyncedSummary = {
  connected: boolean;
  notSynced: number | null;
  totalInLightspeed: number | null;
};

export async function isLightspeedConnected(
  service: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await service
    .from("lightspeed_connections")
    .select("status, access_token_encrypted")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data?.status === "connected" && !!data?.access_token_encrypted;
}

/** Mirrors /api/lightspeed/inventory-overview totals.totalNotSynced */
export async function getLightspeedNotSyncedStats(
  service: SupabaseClient,
  userId: string
): Promise<LightspeedNotSyncedSummary> {
  const connected = await isLightspeedConnected(service, userId);
  if (!connected) {
    return { connected: false, notSynced: null, totalInLightspeed: null };
  }

  const [lsItemIds, syncedItemIds] = await Promise.all([
    paginateLightspeedItemIds(service, "products_all_ls", userId, false),
    paginateLightspeedItemIds(service, "products", userId, true),
  ]);

  const syncedSet = new Set(syncedItemIds);
  const notSynced = lsItemIds.filter((id) => !syncedSet.has(id)).length;

  return {
    connected: true,
    notSynced,
    totalInLightspeed: lsItemIds.length,
  };
}
