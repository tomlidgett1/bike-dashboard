import type { SupabaseClient } from "@supabase/supabase-js";
import { formatVariantOptionLabel, type ProductVariantSummary } from "./product-variant-display";

type ProductRow = {
  id: string;
  variant_group_id?: string | null;
  variant_master_title?: string | null;
  variant_hidden_from_grid?: boolean | null;
};

type GroupItemRow = {
  product_id: string;
  group_id: string;
  is_master: boolean;
  value_assignments: Record<string, string> | null;
};

type GroupRow = {
  id: string;
  master_title: string;
};

export type EnrichedVariantFields = ProductVariantSummary;

const EMPTY_VARIANT: EnrichedVariantFields = {
  variant_group_id: null,
  variant_master_title: null,
  variant_hidden_from_grid: false,
  variant_is_master: null,
  variant_option_label: null,
  variant_sibling_count: null,
  variant_group_title: null,
};

/** Attach variant group metadata for products list rows. */
export async function enrichProductsWithVariantMetadata<T extends ProductRow>(
  supabase: SupabaseClient,
  products: T[],
): Promise<Array<T & EnrichedVariantFields>> {
  if (products.length === 0) return [];

  const groupIds = [
    ...new Set(
      products
        .map((p) => p.variant_group_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (groupIds.length === 0) {
    return products.map((p) => ({
      ...p,
      ...EMPTY_VARIANT,
      variant_group_id: p.variant_group_id ?? null,
      variant_master_title: p.variant_master_title ?? null,
      variant_hidden_from_grid: p.variant_hidden_from_grid ?? false,
    }));
  }

  const [{ data: items, error: itemsError }, { data: groups, error: groupsError }] =
    await Promise.all([
      supabase
        .from("product_variant_group_items")
        .select("product_id, group_id, is_master, value_assignments")
        .in("group_id", groupIds),
      supabase.from("product_variant_groups").select("id, master_title").in("id", groupIds),
    ]);

  if (itemsError) throw itemsError;
  if (groupsError) throw groupsError;

  const countByGroup = new Map<string, number>();
  const itemByProduct = new Map<string, GroupItemRow>();
  for (const row of (items ?? []) as GroupItemRow[]) {
    countByGroup.set(row.group_id, (countByGroup.get(row.group_id) ?? 0) + 1);
    itemByProduct.set(row.product_id, row);
  }

  const titleByGroup = new Map<string, string>();
  for (const group of (groups ?? []) as GroupRow[]) {
    titleByGroup.set(group.id, group.master_title);
  }

  return products.map((product) => {
    const groupId = product.variant_group_id ?? null;
    if (!groupId) {
      return {
        ...product,
        ...EMPTY_VARIANT,
        variant_master_title: product.variant_master_title ?? null,
        variant_hidden_from_grid: product.variant_hidden_from_grid ?? false,
      };
    }

    const item = itemByProduct.get(product.id);
    const groupTitle = titleByGroup.get(groupId) ?? null;

    return {
      ...product,
      variant_group_id: groupId,
      variant_master_title: product.variant_master_title ?? null,
      variant_hidden_from_grid: product.variant_hidden_from_grid ?? false,
      variant_is_master: item?.is_master ?? null,
      variant_option_label: formatVariantOptionLabel(item?.value_assignments),
      variant_sibling_count: countByGroup.get(groupId) ?? null,
      variant_group_title: groupTitle,
    };
  });
}

/** Count distinct products referenced in pending variant detection candidates. */
export async function countPendingVariantReviewProducts(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("product_variant_detection_candidates")
    .select("items")
    .eq("user_id", userId)
    .eq("status", "pending");

  if (error) throw error;

  const productIds = new Set<string>();
  for (const row of data ?? []) {
    const items = row.items as Array<{ product_id?: string }> | null;
    for (const item of items ?? []) {
      if (item?.product_id) productIds.add(item.product_id);
    }
  }

  return productIds.size;
}
