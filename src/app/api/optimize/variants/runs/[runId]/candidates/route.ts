import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "approved", "rejected", "applied_local", "applied_lightspeed", "failed"] as const;

/** GET /api/optimize/variants/runs/[runId]/candidates — candidates + status counts. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("product_variant_detection_candidates")
    .select(
      "id, run_id, status, proposed_master_title, base_title, brand, category_name, option_types, items, confidence, explanation, warnings, applied_group_id, error_message, created_at, updated_at",
    )
    .eq("run_id", runId)
    .eq("user_id", user.id)
    .order("confidence", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const candidates = data ?? [];
  const counts: Record<string, number> = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const c of candidates) counts[c.status as string] = (counts[c.status as string] ?? 0) + 1;

  return NextResponse.json({ candidates, counts, total: candidates.length });
}
