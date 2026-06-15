// Read-only diagnosis: npx tsx --env-file=.env.local scripts/diagnose-variants.ts
import { createServiceRoleClient } from "../src/lib/supabase/server";

async function main() {
  const db = createServiceRoleClient();

  console.log("=== Products matching 'Alma' ===");
  const { data: products, error } = await db
    .from("products")
    .select("id, display_name, description, is_active, qoh, variant_group_id, variant_hidden_from_grid, variant_master_title, primary_image_url")
    .or("display_name.ilike.%alma%,description.ilike.%alma%")
    .limit(50);
  if (error) {
    console.error("products query error:", error.message);
    return;
  }
  for (const p of products ?? []) {
    console.log({
      id: p.id,
      name: p.display_name || p.description,
      active: p.is_active,
      qoh: p.qoh,
      group: p.variant_group_id,
      hidden_from_grid: p.variant_hidden_from_grid,
      master_title: p.variant_master_title,
    });
  }

  const groupIds = [...new Set((products ?? []).map((p) => p.variant_group_id).filter(Boolean))];
  console.log("\n=== Variant groups ===");
  for (const gid of groupIds) {
    const { data: g } = await db.from("product_variant_groups").select("*").eq("id", gid).maybeSingle();
    console.log({ id: gid, master_title: g?.master_title, visibility_mode: g?.visibility_mode, sync_target: g?.sync_target, lightspeed_status: g?.lightspeed_status, status: g?.status });
  }

  // Does the view expose variant_hidden_from_grid (i.e. did 120100 apply)?
  console.log("\n=== Does marketplace_ready_products expose variant_hidden_from_grid? ===");
  const { error: viewErr } = await db.from("marketplace_ready_products").select("id, variant_hidden_from_grid, variant_master_title").limit(1);
  console.log(viewErr ? `NO — ${viewErr.message}` : "YES — column exists on the view");

  // Do the hidden children still appear in the public card feed?
  console.log("\n=== Hidden children still in public_marketplace_cards? ===");
  const childIds = (products ?? []).filter((p) => p.variant_hidden_from_grid).map((p) => p.id);
  if (childIds.length === 0) {
    console.log("(no products are flagged variant_hidden_from_grid)");
  } else {
    const { data: cards, error: cardErr } = await db
      .from("public_marketplace_cards")
      .select("id, display_name")
      .in("id", childIds);
    if (cardErr) console.log("card feed query error:", cardErr.message);
    else console.log(`${cards?.length ?? 0} of ${childIds.length} hidden children STILL in card feed:`, cards?.map((c) => c.display_name));
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
