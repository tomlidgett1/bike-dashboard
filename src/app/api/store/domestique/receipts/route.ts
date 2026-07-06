// Weekly receipts + running attribution totals for the Receipts tab.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedStoreUserId } from "@/lib/domestique/api-helpers";

export const dynamic = "force-dynamic";

function num(value: number | string | null | undefined): number {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return Number.isFinite(n) ? (n as number) : 0;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { userId, error } = await getVerifiedStoreUserId(supabase);
    if (error) return NextResponse.json({ error: error.message }, { status: error.status });

    const [{ data: receipts }, { data: touches }, { count: executedCount }] = await Promise.all([
      supabase
        .from("domestique_receipts")
        .select("*")
        .eq("user_id", userId!)
        .order("week_start", { ascending: false })
        .limit(26),
      supabase
        .from("domestique_touches")
        .select("is_holdout, attributed_revenue")
        .eq("user_id", userId!)
        .limit(10_000),
      supabase
        .from("domestique_opportunities")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId!)
        .eq("status", "executed"),
    ]);

    let totalAttributed = 0;
    let totalTouches = 0;
    let totalHoldouts = 0;
    for (const touch of (touches ?? []) as Array<{ is_holdout: boolean; attributed_revenue: number | string | null }>) {
      if (touch.is_holdout) {
        totalHoldouts += 1;
      } else {
        totalTouches += 1;
        totalAttributed += num(touch.attributed_revenue);
      }
    }

    return NextResponse.json({
      receipts: receipts ?? [],
      summary: {
        total_attributed_revenue: Math.round(totalAttributed * 100) / 100,
        total_touches: totalTouches,
        total_holdouts: totalHoldouts,
        plays_executed: executedCount ?? 0,
      },
    });
  } catch (err) {
    console.error("[domestique/receipts] GET failed:", err);
    return NextResponse.json({ error: "Failed to load receipts" }, { status: 500 });
  }
}
