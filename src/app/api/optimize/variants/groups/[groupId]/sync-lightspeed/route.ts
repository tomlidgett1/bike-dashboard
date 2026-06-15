import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncVariantGroupToLightspeed } from "@/lib/services/lightspeed/variant-matrix";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST — sync (or retry syncing) a variant group to Lightspeed as a matrix. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  // Confirm ownership before touching Lightspeed.
  const { data: group } = await supabase
    .from("product_variant_groups")
    .select("id")
    .eq("id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!group) return NextResponse.json({ error: "Variant group not found" }, { status: 404 });

  const result = await syncVariantGroupToLightspeed(user.id, groupId);
  const status = result.status === "synced" ? 200 : 502;
  return NextResponse.json({ ok: result.status === "synced", lightspeed: result }, { status });
}
