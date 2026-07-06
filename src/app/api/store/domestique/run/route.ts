// Manual "Run now" — lets the store owner trigger the nightly loop on demand
// (first-run experience and testing). Never auto-executes; manual runs always
// propose for approval.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedStoreUserId } from "@/lib/domestique/api-helpers";
import { loadDomestiqueConfig } from "@/lib/domestique/config";
import { runDomestiqueForStore } from "@/lib/domestique/run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  try {
    const supabase = await createClient();
    const { userId, error } = await getVerifiedStoreUserId(supabase);
    if (error) return NextResponse.json({ error: error.message }, { status: error.status });

    // Throttle: one manual run per 10 minutes.
    const { data: recent } = await supabase
      .from("domestique_runs")
      .select("started_at")
      .eq("user_id", userId!)
      .gte("started_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .limit(1);
    if ((recent ?? []).length > 0) {
      return NextResponse.json(
        { error: "A run finished in the last 10 minutes. Give the Domestique a moment." },
        { status: 429 },
      );
    }

    const config = await loadDomestiqueConfig(supabase, userId!);
    const summary = await runDomestiqueForStore(supabase, userId!, config, "manual");
    return NextResponse.json({ summary });
  } catch (err) {
    console.error("[domestique/run] POST failed:", err);
    return NextResponse.json({ error: "Run failed" }, { status: 500 });
  }
}
