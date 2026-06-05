import type { SupabaseClient } from "@supabase/supabase-js";
import { isLightspeedConnected, type LightspeedNotSyncedSummary } from "@/lib/lightspeed/not-synced-count";

const PAGE_SIZE = 1000;
const DEFAULT_LIST_LIMIT = 50;

export type NotSyncedLightspeedProduct = {
  itemId: string;
  name: string;
  sku: string | null;
  categoryId: string | null;
  price: number;
  totalQoh: number | null;
};

export type LightspeedOverviewData = LightspeedNotSyncedSummary & {
  notSyncedProducts: NotSyncedLightspeedProduct[];
  notSyncedProductsLimit: number;
};

type LsRow = {
  lightspeed_item_id: string;
  description: string | null;
  system_sku: string | null;
  category_id: string | null;
  price: number | string | null;
  total_qoh: number | null;
};

async function paginateLsProducts(service: SupabaseClient, userId: string) {
  const rows: LsRow[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await service
      .from("products_all_ls")
      .select("lightspeed_item_id, description, system_sku, category_id, price, total_qoh")
      .eq("user_id", userId)
      .order("description", { ascending: true })
      .range(from, to);

    if (error) throw error;

    if (data && data.length > 0) {
      rows.push(...(data as LsRow[]));
      page++;
      hasMore = data.length === PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  return rows;
}

async function paginateSyncedItemIds(service: SupabaseClient, userId: string) {
  const ids = new Set<string>();
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await service
      .from("products")
      .select("lightspeed_item_id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .range(from, to);

    if (error) throw error;

    if (data && data.length > 0) {
      for (const row of data) {
        ids.add(row.lightspeed_item_id);
      }
      page++;
      hasMore = data.length === PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  return ids;
}

export async function getLightspeedOverviewData(
  service: SupabaseClient,
  userId: string,
  listLimit = DEFAULT_LIST_LIMIT
): Promise<LightspeedOverviewData> {
  const connected = await isLightspeedConnected(service, userId);
  if (!connected) {
    return {
      connected: false,
      notSynced: null,
      totalInLightspeed: null,
      notSyncedProducts: [],
      notSyncedProductsLimit: listLimit,
    };
  }

  const [lsProducts, syncedIds] = await Promise.all([
    paginateLsProducts(service, userId),
    paginateSyncedItemIds(service, userId),
  ]);

  const notSyncedRows = lsProducts.filter((row) => !syncedIds.has(row.lightspeed_item_id));

  const notSyncedProducts: NotSyncedLightspeedProduct[] = notSyncedRows
    .slice(0, listLimit)
    .map((row) => ({
      itemId: row.lightspeed_item_id,
      name: row.description?.trim() || "Untitled product",
      sku: row.system_sku,
      categoryId: row.category_id,
      price: Number(row.price) || 0,
      totalQoh: row.total_qoh,
    }));

  return {
    connected: true,
    notSynced: notSyncedRows.length,
    totalInLightspeed: lsProducts.length,
    notSyncedProducts,
    notSyncedProductsLimit: listLimit,
  };
}
