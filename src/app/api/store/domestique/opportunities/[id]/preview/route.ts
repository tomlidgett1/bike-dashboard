// Render the exact email a play will send, using the same CRM template
// pipeline as the real send (renderCampaignEmail + merge tags).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedStoreUserId } from "@/lib/domestique/api-helpers";
import { renderCampaignEmail } from "@/lib/crm/templates";
import { applyMergeTags } from "@/lib/crm/merge-tags";
import { SITE_URL } from "@/lib/seo/site";
import type { DomestiqueOpportunity } from "@/lib/types/domestique";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { userId, error } = await getVerifiedStoreUserId(supabase);
    if (error) return NextResponse.json({ error: error.message }, { status: error.status });

    const { id } = await params;
    const { data: row, error: fetchError } = await supabase
      .from("domestique_opportunities")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId!)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!row) return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });

    const opportunity = row as DomestiqueOpportunity;
    const email = opportunity.action_plan.email;
    if (!email) {
      return NextResponse.json({ error: "This play does not send an email." }, { status: 400 });
    }

    const { data: storeRow } = await supabase
      .from("users")
      .select("business_name, name, logo_url")
      .eq("user_id", userId!)
      .maybeSingle();
    const store = {
      name: storeRow?.business_name || storeRow?.name || "Your Bike Store",
      logoUrl: storeRow?.logo_url ?? null,
    };

    // Sample first name so merge tags render as recipients will see them.
    const sampleFirstName =
      opportunity.action_plan.contacts?.find((c) => c.first_name)?.first_name ?? "Sam";

    const { html } = renderCampaignEmail({
      templateKey: email.templateKey,
      content: {
        title: email.title,
        body: email.body,
        ctaText: email.ctaText,
        ctaUrl: email.ctaUrl,
        footerText: "You're receiving this because you're a customer of our store.",
      },
      store,
      unsubscribeUrl: `${SITE_URL}/unsubscribe?token=preview`,
    });

    return NextResponse.json({
      subject: applyMergeTags(email.subject, { firstName: sampleFirstName }),
      html: applyMergeTags(html, { firstName: sampleFirstName }),
      sample_first_name: sampleFirstName,
    });
  } catch (err) {
    console.error("[domestique/opportunities/:id/preview] GET failed:", err);
    return NextResponse.json({ error: "Failed to render preview" }, { status: 500 });
  }
}
