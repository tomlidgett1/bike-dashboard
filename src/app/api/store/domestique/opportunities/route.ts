// List the store's Domestique opportunities (the play feed).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedStoreUserId } from "@/lib/domestique/api-helpers";

export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set([
  "proposed",
  "approved",
  "executing",
  "executed",
  "skipped",
  "failed",
  "expired",
]);

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { userId, error } = await getVerifiedStoreUserId(supabase);
    if (error) return NextResponse.json({ error: error.message }, { status: error.status });

    const statusParam = request.nextUrl.searchParams.get("status");
    const limitParam = parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;

    let query = supabase
      .from("domestique_opportunities")
      .select("*")
      .eq("user_id", userId!)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (statusParam) {
      const statuses = statusParam.split(",").filter((s) => VALID_STATUSES.has(s));
      if (statuses.length > 0) query = query.in("status", statuses);
    }

    const { data, error: queryError } = await query;
    if (queryError) throw queryError;

    return NextResponse.json({ opportunities: data ?? [] });
  } catch (err) {
    console.error("[domestique/opportunities] GET failed:", err);
    return NextResponse.json({ error: "Failed to load opportunities" }, { status: 500 });
  }
}
