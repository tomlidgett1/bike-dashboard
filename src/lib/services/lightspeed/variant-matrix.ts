// ============================================================
// Lightspeed variant matrix write-back
// ============================================================
// Turns a Yellow Jersey variant group into a Lightspeed ItemMatrix by
// re-parenting the EXISTING items (preserving item IDs / inventory /
// history) rather than creating new ones:
//
//   1. resolve/create an ItemAttributeSet matching the option types
//   2. create the ItemMatrix (parent) from the master title
//   3. PUT each child Item with itemMatrixID + ItemAttributes
//
// Partial failures keep the matrix id + the set of items already synced
// so a retry only re-parents the remaining items. The local Yellow Jersey
// group is never rolled back by a Lightspeed failure.

import { createServiceRoleClient } from "@/lib/supabase/server";
import { createLightspeedClient } from "./lightspeed-client";
import type { LightspeedItemAttributes, LightspeedItemAttributeSet } from "./types";

/** Kill-switch. Set LIGHTSPEED_VARIANT_WRITE_ENABLED="false" to disable live writes. */
export const LIGHTSPEED_VARIANT_WRITE_ENABLED =
  process.env.LIGHTSPEED_VARIANT_WRITE_ENABLED !== "false";

// ---------- Pure builders (unit tested) ----------

export type AttributeSetPlan = {
  mode: "reuse" | "create";
  setId?: string;
  createSpec?: { name: string; attributeName1: string; attributeName2?: string; attributeName3?: string };
  /** Canonical attribute names in slot order (attribute1, attribute2, attribute3). */
  attributeNames: string[];
};

/** Map a Yellow Jersey option name to a Lightspeed dimension name. */
export function canonicalDimension(name: string): string {
  const n = name.trim().toLowerCase();
  if (n === "colour" || n === "color") return "Color";
  if (n === "size") return "Size";
  return name.trim(); // custom dimension keeps its label, e.g. "Frame Size"
}

// Color before Size so a two-dimension matrix matches Lightspeed's
// system "Color/Size" set (attributeName1=Color, attributeName2=Size).
function slotPriority(canonical: string): number {
  const c = canonical.toLowerCase();
  if (c === "color") return 0;
  if (c === "size") return 1;
  return 2;
}

/**
 * Decide whether to reuse an existing attribute set or create a new one, and
 * in what slot order the option values should be written.
 */
export function resolveAttributeSetPlan(
  optionTypes: { name: string }[],
  existingSets: LightspeedItemAttributeSet[],
): AttributeSetPlan {
  const options = optionTypes.map((o) => o.name.trim()).filter(Boolean).slice(0, 3);
  if (options.length === 0) throw new Error("VARIANT_MATRIX_NO_OPTIONS");

  const ordered = [...options].sort(
    (a, b) => slotPriority(canonicalDimension(a)) - slotPriority(canonicalDimension(b)),
  );
  const orderedCanon = ordered.map(canonicalDimension);
  const want = new Set(orderedCanon.map((c) => c.toLowerCase()));

  for (const set of existingSets) {
    if (set.archived === "true") continue;
    const names = [set.attributeName1, set.attributeName2, set.attributeName3]
      .map((s) => (s ?? "").trim())
      .filter(Boolean);
    if (names.length !== orderedCanon.length) continue;
    const have = new Set(names.map((n) => n.toLowerCase()));
    if (have.size === want.size && [...want].every((n) => have.has(n))) {
      return { mode: "reuse", setId: set.itemAttributeSetID, attributeNames: names };
    }
  }

  return {
    mode: "create",
    createSpec: {
      name: orderedCanon.join("/").slice(0, 100),
      attributeName1: orderedCanon[0],
      attributeName2: orderedCanon[1],
      attributeName3: orderedCanon[2],
    },
    attributeNames: orderedCanon,
  };
}

/** Map each option name to its 1-based slot within the chosen attribute set. */
export function computeSlotByOption(
  optionTypes: { name: string }[],
  attributeNames: string[],
): Record<string, number> {
  const slot: Record<string, number> = {};
  for (const opt of optionTypes) {
    const canon = canonicalDimension(opt.name).toLowerCase();
    const idx = attributeNames.findIndex((n) => (n ?? "").trim().toLowerCase() === canon);
    if (idx >= 0) slot[opt.name] = idx + 1;
  }
  return slot;
}

/** Build the ItemAttributes payload for re-parenting one child item. */
export function buildReparentAttributes(
  setId: string,
  slotByOption: Record<string, number>,
  valueAssignments: Record<string, string>,
): LightspeedItemAttributes {
  const attrs: LightspeedItemAttributes = { itemAttributeSetID: String(setId) };
  for (const [option, value] of Object.entries(valueAssignments)) {
    const slot = slotByOption[option];
    if (slot === 1) attrs.attribute1 = value;
    else if (slot === 2) attrs.attribute2 = value;
    else if (slot === 3) attrs.attribute3 = value;
  }
  return attrs;
}

/** Items still needing a re-parent PUT (used by the retry path). */
export function selectRemainingItemIds(allItemIds: string[], syncedItemIds: string[]): string[] {
  const synced = new Set(syncedItemIds);
  return allItemIds.filter((id) => id && !synced.has(id));
}

// ---------- Orchestrator ----------

type ChildItem = {
  lightspeedItemId: string;
  manufacturerId: string | null;
  lightspeedCategoryId: string | null;
  valueAssignments: Record<string, string>;
  isMaster: boolean;
};

export type VariantSyncResult = {
  status: "synced" | "failed";
  matrixId: string | null;
  syncedItemIds: string[];
  error?: string;
};

async function logAudit(
  supabase: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  groupId: string,
  candidateId: string | null,
  action: string,
  detail: Record<string, unknown>,
) {
  await supabase.from("product_variant_audit_logs").insert({
    user_id: userId,
    group_id: groupId,
    candidate_id: candidateId,
    action,
    detail,
  });
}

/**
 * Sync (or retry syncing) a variant group to Lightspeed as an ItemMatrix.
 * Idempotent on retry: an existing matrix id + synced-item list are reused.
 */
export async function syncVariantGroupToLightspeed(
  userId: string,
  groupId: string,
): Promise<VariantSyncResult> {
  const supabase = createServiceRoleClient();

  const { data: group } = await supabase
    .from("product_variant_groups")
    .select("*")
    .eq("id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!group) return { status: "failed", matrixId: null, syncedItemIds: [], error: "Variant group not found" };

  if (!LIGHTSPEED_VARIANT_WRITE_ENABLED) {
    const error = "Lightspeed variant write-back is disabled on this server";
    await supabase
      .from("product_variant_groups")
      .update({ lightspeed_status: "failed", lightspeed_error: error })
      .eq("id", groupId);
    return { status: "failed", matrixId: group.lightspeed_item_matrix_id ?? null, syncedItemIds: [], error };
  }

  const candidateId = (group.source_candidate_id as string | null) ?? null;

  const { data: optionRows } = await supabase
    .from("product_variant_options")
    .select("name, position")
    .eq("group_id", groupId)
    .order("position", { ascending: true });

  const { data: itemRows } = await supabase
    .from("product_variant_group_items")
    .select("is_master, value_assignments, position, products!inner(lightspeed_item_id, manufacturer_id, lightspeed_category_id)")
    .eq("group_id", groupId)
    .order("position", { ascending: true });

  await supabase
    .from("product_variant_groups")
    .update({ lightspeed_status: "requested", sync_target: "lightspeed", lightspeed_error: null })
    .eq("id", groupId);

  const isRetry = Boolean(group.lightspeed_item_matrix_id);
  await logAudit(supabase, userId, groupId, candidateId, isRetry ? "lightspeed_sync_retried" : "lightspeed_sync_requested", {});

  try {
    type ItemRow = {
      is_master: boolean | null;
      value_assignments: Record<string, string> | null;
      products: { lightspeed_item_id: string | null; manufacturer_id: string | null; lightspeed_category_id: string | null } | null;
    };
    const children: ChildItem[] = ((itemRows ?? []) as unknown as ItemRow[])
      .map((row) => ({
        lightspeedItemId: row.products?.lightspeed_item_id ?? null,
        manufacturerId: row.products?.manufacturer_id ?? null,
        lightspeedCategoryId: row.products?.lightspeed_category_id ?? null,
        valueAssignments: (row.value_assignments ?? {}) as Record<string, string>,
        isMaster: Boolean(row.is_master),
      }))
      .filter((c): c is ChildItem => Boolean(c.lightspeedItemId));

    if (children.length < 2) {
      throw new Error("This group needs at least two products linked to Lightspeed to build a matrix");
    }

    const optionTypes = (optionRows ?? []).length
      ? (optionRows ?? []).map((o) => ({ name: o.name as string }))
      : Object.keys(children[0].valueAssignments).map((name) => ({ name }));

    const client = createLightspeedClient(userId);

    let matrixId = (group.lightspeed_item_matrix_id as string | null) ?? null;
    let attributeSetId = (group.lightspeed_attribute_set_id as string | null) ?? null;
    let attributeNames: string[] = [];

    const existingSets = await client.getItemAttributeSets();

    if (!matrixId) {
      const plan = resolveAttributeSetPlan(optionTypes, existingSets);
      if (plan.mode === "reuse") {
        attributeSetId = plan.setId ?? null;
        attributeNames = plan.attributeNames;
      } else {
        const created = await client.createItemAttributeSet(plan.createSpec!);
        attributeSetId = created.itemAttributeSetID;
        attributeNames = [created.attributeName1, created.attributeName2, created.attributeName3]
          .map((s) => (s ?? "").trim())
          .filter(Boolean);
      }

      const rep = children.find((c) => c.isMaster) ?? children[0];
      const matrix = await client.createItemMatrix({
        description: group.master_title as string,
        itemAttributeSetID: attributeSetId!,
        manufacturerID: rep.manufacturerId ?? undefined,
        categoryID: (group.lightspeed_category_id as string | null) ?? rep.lightspeedCategoryId ?? undefined,
      });
      matrixId = matrix.itemMatrixID;

      await supabase
        .from("product_variant_groups")
        .update({ lightspeed_item_matrix_id: matrixId, lightspeed_attribute_set_id: attributeSetId })
        .eq("id", groupId);
    } else {
      // Retry — line attributes up against the already-chosen set.
      const set = existingSets.find((s) => s.itemAttributeSetID === attributeSetId);
      attributeNames = set
        ? [set.attributeName1, set.attributeName2, set.attributeName3].map((s) => (s ?? "").trim()).filter(Boolean)
        : resolveAttributeSetPlan(optionTypes, existingSets).attributeNames;
    }

    const slotByOption = computeSlotByOption(optionTypes, attributeNames);

    const syncedItemIds: string[] = [...((group.lightspeed_synced_item_ids as string[] | null) ?? [])];
    const remaining = selectRemainingItemIds(children.map((c) => c.lightspeedItemId), syncedItemIds);

    for (const child of children) {
      if (!remaining.includes(child.lightspeedItemId)) continue;
      await client.updateItem(child.lightspeedItemId, {
        itemMatrixID: matrixId!,
        ItemAttributes: buildReparentAttributes(attributeSetId!, slotByOption, child.valueAssignments),
      });
      syncedItemIds.push(child.lightspeedItemId);
      await supabase
        .from("product_variant_groups")
        .update({ lightspeed_synced_item_ids: syncedItemIds })
        .eq("id", groupId);
    }

    await supabase
      .from("product_variant_groups")
      .update({ lightspeed_status: "synced", lightspeed_error: null })
      .eq("id", groupId);

    if (candidateId) {
      await supabase
        .from("product_variant_detection_candidates")
        .update({ status: "applied_lightspeed" })
        .eq("id", candidateId);
    }

    await logAudit(supabase, userId, groupId, candidateId, "lightspeed_sync_succeeded", {
      matrix_id: matrixId,
      synced: syncedItemIds.length,
    });

    return { status: "synced", matrixId, syncedItemIds };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lightspeed sync failed";
    await supabase
      .from("product_variant_groups")
      .update({ lightspeed_status: "failed", lightspeed_error: message })
      .eq("id", groupId);
    await logAudit(supabase, userId, groupId, candidateId, "lightspeed_sync_failed", { error: message });
    return {
      status: "failed",
      matrixId: (group.lightspeed_item_matrix_id as string | null) ?? null,
      syncedItemIds: (group.lightspeed_synced_item_ids as string[] | null) ?? [],
      error: message,
    };
  }
}
