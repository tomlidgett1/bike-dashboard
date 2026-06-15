import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applyCandidateLocally, type CandidateForApply, type SyncTarget, type VisibilityMode } from "@/lib/variants/apply-group";
import { syncVariantGroupToLightspeed } from "@/lib/services/lightspeed/variant-matrix";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VISIBILITY: VisibilityMode[] = ["master_only", "individual_and_master"];
const TARGETS: SyncTarget[] = ["local", "lightspeed"];

/** POST — create the local variant group, then optionally sync to Lightspeed. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ candidateId: string }> }) {
  const { candidateId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const visibilityMode = body.visibilityMode as VisibilityMode;
  const syncTarget = body.syncTarget as SyncTarget;

  if (!VISIBILITY.includes(visibilityMode)) {
    return NextResponse.json({ error: "Invalid visibility mode" }, { status: 400 });
  }
  if (!TARGETS.includes(syncTarget)) {
    return NextResponse.json({ error: "Invalid sync target" }, { status: 400 });
  }

  const { data: candidate } = await supabase
    .from("product_variant_detection_candidates")
    .select("id, user_id, status, proposed_master_title, brand, category_name, option_types, items")
    .eq("id", candidateId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });

  // Resolve a Lightspeed category id from the candidate's products (for the matrix).
  let lightspeedCategoryId: string | null = null;
  const productIds = (candidate.items as { product_id: string }[]).map((i) => i.product_id);
  if (productIds.length) {
    const { data: rows } = await supabase
      .from("products")
      .select("lightspeed_category_id")
      .in("id", productIds)
      .not("lightspeed_category_id", "is", null)
      .limit(1);
    lightspeedCategoryId = (rows?.[0]?.lightspeed_category_id as string | null) ?? null;
  }

  const result = await applyCandidateLocally(supabase, user.id, candidate as CandidateForApply, {
    visibilityMode,
    syncTarget,
    lightspeedCategoryId,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason, conflictProductIds: result.conflictProductIds ?? [] },
      { status: 409 },
    );
  }

  // Refresh the public card feed so visibility changes show immediately
  // (the minute cron would also catch up). Best-effort.
  await supabase.rpc("refresh_public_marketplace_cards").then(
    () => {},
    () => {},
  );

  if (syncTarget === "lightspeed") {
    const sync = await syncVariantGroupToLightspeed(user.id, result.groupId);
    return NextResponse.json({
      ok: true,
      groupId: result.groupId,
      visibilityMode,
      lightspeed: sync,
    });
  }

  return NextResponse.json({ ok: true, groupId: result.groupId, visibilityMode, lightspeed: null });
}
