// Approve, skip or edit a proposed play. Approval executes immediately through
// the existing rails (CRM email, Nest texts, storefront discounts). PATCH lets
// the owner tune the copy, discount duration or product list before approving.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedStoreUserId } from "@/lib/domestique/api-helpers";
import { loadDomestiqueConfig } from "@/lib/domestique/config";
import { executeOpportunity } from "@/lib/domestique/execute";
import type {
  DomestiqueActionPlan,
  DomestiqueOpportunity,
  DomestiqueOpportunityEdit,
} from "@/lib/types/domestique";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function cleanString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { userId, error } = await getVerifiedStoreUserId(supabase);
    if (error) return NextResponse.json({ error: error.message }, { status: error.status });

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as DomestiqueOpportunityEdit;

    const { data: row, error: fetchError } = await supabase
      .from("domestique_opportunities")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId!)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!row) return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });

    const opportunity = row as DomestiqueOpportunity;
    if (opportunity.status !== "proposed") {
      return NextResponse.json(
        { error: `This play is ${opportunity.status} and can no longer be edited.` },
        { status: 409 },
      );
    }

    const plan: DomestiqueActionPlan = { ...opportunity.action_plan };

    if (body.email && plan.email) {
      plan.email = {
        ...plan.email,
        subject: cleanString(body.email.subject, 200) ?? plan.email.subject,
        title: cleanString(body.email.title, 200) ?? plan.email.title,
        body: cleanString(body.email.body, 5000) ?? plan.email.body,
        ctaText: body.email.ctaText !== undefined ? (cleanString(body.email.ctaText, 80) ?? undefined) : plan.email.ctaText,
        ctaUrl: body.email.ctaUrl !== undefined ? (cleanString(body.email.ctaUrl, 500) ?? undefined) : plan.email.ctaUrl,
      };
    }

    if (body.sms && plan.sms) {
      const smsBody = cleanString(body.sms.body, 320);
      if (smsBody) plan.sms = { body: smsBody };
    }

    if (body.discount_days !== undefined && plan.discounts) {
      const days = Math.trunc(Number(body.discount_days));
      if (Number.isFinite(days) && days >= 1 && days <= 30) plan.discount_days = days;
    }

    let productCount = opportunity.product_count;
    if (Array.isArray(body.remove_discount_product_ids) && plan.discounts) {
      const toRemove = new Set(body.remove_discount_product_ids.filter((v) => typeof v === "string"));
      if (toRemove.size > 0) {
        const remaining = plan.discounts.filter((item) => !toRemove.has(item.product_id));
        if (remaining.length === 0) {
          return NextResponse.json(
            { error: "A discount play needs at least one product. Skip the play instead." },
            { status: 400 },
          );
        }
        plan.discounts = remaining;
        productCount = remaining.length;
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from("domestique_opportunities")
      .update({ action_plan: plan, product_count: productCount })
      .eq("id", id)
      .eq("user_id", userId!)
      .eq("status", "proposed")
      .select("*")
      .single();
    if (updateError || !updated) {
      return NextResponse.json({ error: "Play was already actioned." }, { status: 409 });
    }

    return NextResponse.json({ opportunity: updated });
  } catch (err) {
    console.error("[domestique/opportunities/:id] PATCH failed:", err);
    return NextResponse.json({ error: "Failed to save changes" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { userId, error } = await getVerifiedStoreUserId(supabase);
    if (error) return NextResponse.json({ error: error.message }, { status: error.status });

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { action?: string };
    const action = body.action;
    if (action !== "approve" && action !== "skip") {
      return NextResponse.json({ error: "Action must be 'approve' or 'skip'." }, { status: 400 });
    }

    const { data: row, error: fetchError } = await supabase
      .from("domestique_opportunities")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId!)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!row) return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });

    const opportunity = row as DomestiqueOpportunity;
    if (opportunity.status !== "proposed") {
      return NextResponse.json(
        { error: `This play is ${opportunity.status} and can no longer be actioned.` },
        { status: 409 },
      );
    }

    if (action === "skip") {
      const { data: updated } = await supabase
        .from("domestique_opportunities")
        .update({ status: "skipped" })
        .eq("id", id)
        .eq("user_id", userId!)
        .select("*")
        .single();
      return NextResponse.json({ opportunity: updated });
    }

    // Approve: claim atomically, then execute.
    const { data: claimed, error: claimError } = await supabase
      .from("domestique_opportunities")
      .update({ status: "executing", approved_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId!)
      .eq("status", "proposed")
      .select("*")
      .single();
    if (claimError || !claimed) {
      return NextResponse.json({ error: "Play was already actioned." }, { status: 409 });
    }

    const config = await loadDomestiqueConfig(supabase, userId!);
    const result = await executeOpportunity(supabase, userId!, config, claimed as DomestiqueOpportunity);

    const { data: final } = await supabase
      .from("domestique_opportunities")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId!)
      .single();

    return NextResponse.json({ opportunity: final, result });
  } catch (err) {
    console.error("[domestique/opportunities/:id] POST failed:", err);
    return NextResponse.json({ error: "Failed to action the play" }, { status: 500 });
  }
}
