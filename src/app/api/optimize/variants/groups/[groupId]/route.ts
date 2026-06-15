import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any>;

async function loadMembers(supabase: DB, groupId: string) {
  const { data } = await supabase
    .from("product_variant_group_items")
    .select("product_id, is_master, value_assignments, position, products!inner(display_name, description, primary_image_url, price, qoh)")
    .eq("group_id", groupId)
    .order("position", { ascending: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    product_id: row.product_id as string,
    is_master: Boolean(row.is_master),
    value_assignments: (row.value_assignments ?? {}) as Record<string, string>,
    title: ((row.products?.display_name as string) || (row.products?.description as string) || "").trim(),
    image_url: (row.products?.primary_image_url as string | null) ?? null,
    price: typeof row.products?.price === "number" ? row.products.price : row.products?.price ? Number(row.products.price) : null,
    qoh: typeof row.products?.qoh === "number" ? row.products.qoh : row.products?.qoh ? Number(row.products.qoh) : null,
  }));
}

// Recompute products.variant_hidden_from_grid + variant_master_title for every
// member, based on the chosen master and the group's visibility mode.
async function recomputeFlags(supabase: DB, userId: string, groupId: string, visibilityMode: string, masterTitle: string) {
  const { data: members } = await supabase
    .from("product_variant_group_items")
    .select("product_id, is_master")
    .eq("group_id", groupId);
  if (!members?.length) return;
  const masterId = members.find((m) => m.is_master)?.product_id ?? members[0].product_id;
  const masterOnly = visibilityMode === "master_only";

  for (const m of members) {
    const isMaster = m.product_id === masterId;
    await supabase
      .from("products")
      .update({
        variant_group_id: groupId,
        variant_hidden_from_grid: masterOnly && !isMaster,
        variant_master_title: isMaster && masterOnly ? masterTitle : null,
      })
      .eq("id", m.product_id)
      .eq("user_id", userId);
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: group } = await supabase
    .from("product_variant_groups")
    .select("id, master_title, visibility_mode, lightspeed_status")
    .eq("id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  return NextResponse.json({ group, members: await loadMembers(supabase, groupId) });
}

type PatchBody = {
  setMasterProductId?: string;
  addProductIds?: string[];
  removeProductIds?: string[];
};

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: group } = await supabase
    .from("product_variant_groups")
    .select("id, master_title, visibility_mode, user_id")
    .eq("id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as PatchBody;

  // Remove members ----------------------------------------------------------
  for (const productId of body.removeProductIds ?? []) {
    await supabase.from("product_variant_group_items").delete().eq("group_id", groupId).eq("product_id", productId);
    await supabase
      .from("products")
      .update({ variant_group_id: null, variant_hidden_from_grid: false, variant_master_title: null })
      .eq("id", productId)
      .eq("user_id", user.id);
  }

  // Add members -------------------------------------------------------------
  const addIds = [...new Set(body.addProductIds ?? [])];
  if (addIds.length) {
    const { data: products } = await supabase
      .from("products")
      .select("id, is_active, variant_group_id")
      .in("id", addIds)
      .eq("user_id", user.id);
    const byId = new Map((products ?? []).map((p) => [p.id as string, p]));

    let position = (await loadMembers(supabase, groupId)).length;
    for (const productId of addIds) {
      const p = byId.get(productId);
      if (!p || p.is_active === false || p.variant_group_id) continue; // skip missing / already grouped
      await supabase.from("product_variant_group_items").insert({
        group_id: groupId,
        user_id: user.id,
        product_id: productId,
        is_master: false,
        value_assignments: {},
        position: position++,
      });
    }
  }

  // Set master / hero -------------------------------------------------------
  if (body.setMasterProductId) {
    const members = await loadMembers(supabase, groupId);
    if (members.some((m) => m.product_id === body.setMasterProductId)) {
      await supabase.from("product_variant_group_items").update({ is_master: false }).eq("group_id", groupId);
      await supabase
        .from("product_variant_group_items")
        .update({ is_master: true })
        .eq("group_id", groupId)
        .eq("product_id", body.setMasterProductId);
    }
  }

  await recomputeFlags(supabase, user.id, groupId, group.visibility_mode as string, group.master_title as string);

  await supabase.rpc("refresh_public_marketplace_cards").then(
    () => {},
    () => {},
  );

  await supabase.from("product_variant_audit_logs").insert({
    user_id: user.id,
    group_id: groupId,
    action: "edited",
    detail: {
      set_master: body.setMasterProductId ?? null,
      added: body.addProductIds ?? [],
      removed: body.removeProductIds ?? [],
    },
  });

  return NextResponse.json({ ok: true, members: await loadMembers(supabase, groupId) });
}
