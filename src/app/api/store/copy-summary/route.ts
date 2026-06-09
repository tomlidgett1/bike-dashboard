/**
 * GET /api/store/copy-summary
 *
 * Per-Lightspeed-category counts of active in-stock products missing
 * optimised title or description. Used by the optimise category step.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { needsCopy } from "@/lib/optimize/copy-needs";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const { data: rows, error } = await supabase
      .from("products")
      .select("lightspeed_category_id, description, display_name, product_description, listing_source")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .gt("qoh", 0);

    if (error) {
      console.error("[copy-summary] Query error:", error);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    const summary = new Map<string, { total: number; missing_copy: number }>();

    for (const row of rows || []) {
      const catId = row.lightspeed_category_id ? String(row.lightspeed_category_id) : null;
      if (!catId) continue;

      const cur = summary.get(catId) ?? { total: 0, missing_copy: 0 };
      cur.total++;
      if (needsCopy(row)) cur.missing_copy++;
      summary.set(catId, cur);
    }

    const result = Array.from(summary.entries()).map(([ls_category_id, { total, missing_copy }]) => ({
      ls_category_id,
      total,
      missing_copy,
    }));

    return NextResponse.json({ summary: result });
  } catch (err) {
    console.error("[copy-summary] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
