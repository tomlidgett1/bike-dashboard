/**
 * AI-recommended customer groups.
 *
 * POST /api/store/crm/groups/recommend
 * Scans Lightspeed sales/inventory aggregates + CRM contact stats, builds
 * candidate groups, verifies exact member counts deterministically, and
 * returns curated proposals (nothing is persisted until /groups/accept).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recommendSmartGroups } from "@/lib/crm/smart-groups";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const { data: storeRow } = await supabase
      .from("users")
      .select("business_name, name")
      .eq("user_id", user.id)
      .maybeSingle();
    const storeName = storeRow?.business_name || storeRow?.name || "Your Bike Store";

    const proposals = await recommendSmartGroups(supabase, user.id, storeName);
    return NextResponse.json({ proposals });
  } catch (error) {
    console.error("[crm] group recommendations failed:", error);
    return NextResponse.json({ error: "Failed to build recommendations" }, { status: 500 });
  }
}
