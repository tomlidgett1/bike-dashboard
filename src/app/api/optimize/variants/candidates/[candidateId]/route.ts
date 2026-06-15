import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { VariantCandidateItem, VariantOptionType } from "@/lib/variants/types";

export const dynamic = "force-dynamic";

type EditBody = {
  proposed_master_title?: string;
  option_types?: VariantOptionType[];
  // Edited membership: product_id + the per-option values the user set.
  items?: { product_id: string; variant_values?: Record<string, string> }[];
};

/** PATCH — edit a candidate's master title, option names, values, or membership. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ candidateId: string }> }) {
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
    return NextResponse.json({ error: "Cannot edit an applied group" }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as EditBody;
  const patch: Record<string, unknown> = {};

  if (typeof body.proposed_master_title === "string" && body.proposed_master_title.trim()) {
    patch.proposed_master_title = body.proposed_master_title.trim();
  }

  if (Array.isArray(body.option_types)) {
    patch.option_types = body.option_types
      .map((o) => ({ name: (o?.name ?? "").trim() }))
      .filter((o) => o.name);
  }

  if (Array.isArray(body.items)) {
    const ids = [...new Set(body.items.map((i) => i.product_id).filter(Boolean))];
    if (ids.length < 2) {
      return NextResponse.json({ error: "A group needs at least two products." }, { status: 400 });
    }

    const { data: products, error } = await supabase
      .from("products")
      .select("id, lightspeed_item_id, display_name, description, price, qoh, primary_image_url, is_active, variant_group_id, user_id")
      .in("id", ids)
      .eq("user_id", user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const byId = new Map((products ?? []).map((p) => [p.id as string, p]));
    const items: VariantCandidateItem[] = [];
    for (const edited of body.items) {
      const p = byId.get(edited.product_id);
      // Skip products that vanished, were hidden, or belong to another group.
      if (!p || p.is_active === false || (p.variant_group_id && p.variant_group_id !== null)) continue;
      items.push({
        product_id: p.id,
        lightspeed_item_id: (p.lightspeed_item_id as string | null) ?? null,
        title: ((p.display_name as string) || (p.description as string) || "").trim(),
        variant_values: edited.variant_values ?? {},
        price: typeof p.price === "number" ? p.price : p.price ? Number(p.price) : null,
        qoh: typeof p.qoh === "number" ? p.qoh : p.qoh ? Number(p.qoh) : null,
        image_url: (p.primary_image_url as string | null) ?? null,
      });
    }

    if (items.length < 2) {
      return NextResponse.json(
        { error: "Fewer than two of the selected products are still groupable." },
        { status: 400 },
      );
    }
    patch.items = items;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data: updated, error: updateError } = await supabase
    .from("product_variant_detection_candidates")
    .update(patch)
    .eq("id", candidateId)
    .eq("user_id", user.id)
    .select("id, status, proposed_master_title, option_types, items, warnings, brand, category_name, base_title, confidence, explanation")
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await supabase.from("product_variant_audit_logs").insert({
    user_id: user.id,
    candidate_id: candidateId,
    run_id: candidate.run_id,
    action: "edited",
    detail: { fields: Object.keys(patch) },
  });

  return NextResponse.json({ ok: true, candidate: updated });
}
