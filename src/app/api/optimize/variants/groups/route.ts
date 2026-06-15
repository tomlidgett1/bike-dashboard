import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** GET /api/optimize/variants/groups — applied variant groups for the store. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data, error } = await supabase
    .from("product_variant_groups")
    .select(
      "id, master_title, brand, category_name, visibility_mode, sync_target, lightspeed_status, lightspeed_item_matrix_id, lightspeed_error, lightspeed_synced_item_ids, status, created_at, product_variant_group_items(count), product_variant_options(name, position)",
    )
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ groups: data ?? [] });
}
