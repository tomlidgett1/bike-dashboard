import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** POST — reject a candidate (it will not be applied). */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ candidateId: string }> }) {
  const { candidateId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: candidate } = await supabase
    .from("product_variant_detection_candidates")
    .select("id, status, run_id")
    .eq("id", candidateId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  if (candidate.status === "applied_local" || candidate.status === "applied_lightspeed") {
    return NextResponse.json({ error: "Cannot reject an applied group" }, { status: 409 });
  }

  const { error } = await supabase
    .from("product_variant_detection_candidates")
    .update({ status: "rejected" })
    .eq("id", candidateId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("product_variant_audit_logs").insert({
    user_id: user.id,
    candidate_id: candidateId,
    run_id: candidate.run_id,
    action: "rejected",
    detail: {},
  });

  return NextResponse.json({ ok: true, status: "rejected" });
}
