/**
 * CRM campaigns
 *
 * GET  /api/store/crm/campaigns — history, newest first
 * POST /api/store/crm/campaigns — create a draft campaign + its recipient list
 *
 * Recipients are resolved server-side: opted-out and invalid contacts are
 * always excluded, whatever the client sent. The response reports how many
 * were excluded so the review step can surface it.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCrmTemplate } from "@/lib/crm/templates";
import { getCrmFromEmail } from "@/lib/crm/email-provider";
import { normalizeEmail, type CampaignContent } from "@/lib/crm/types";

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

    const { data: campaigns, error } = await supabase
      .from("crm_campaigns")
      .select(
        "id, subject, template_key, content, sender_email, status, intended_count, sent_count, failed_count, created_at, sent_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    return NextResponse.json({
      campaigns: campaigns ?? [],
      senderEmail: getCrmFromEmail(),
    });
  } catch (error) {
    console.error("[crm] campaigns list failed:", error);
    return NextResponse.json({ error: "Failed to load campaigns" }, { status: 500 });
  }
}

type CreateBody = {
  subject?: string;
  templateKey?: string;
  content?: CampaignContent;
  recipientMode?: "all" | "selected";
  contactIds?: string[];
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const body = (await request.json()) as CreateBody;
    const subject = String(body.subject ?? "").trim();
    const templateKey = String(body.templateKey ?? "");
    const content = body.content ?? ({} as CampaignContent);
    const recipientMode = body.recipientMode === "selected" ? "selected" : "all";
    const contactIds = Array.isArray(body.contactIds) ? body.contactIds : [];

    // Guardrails — same rules the send endpoint re-checks.
    if (!subject) {
      return NextResponse.json({ error: "Subject is required" }, { status: 400 });
    }
    if (!getCrmTemplate(templateKey)) {
      return NextResponse.json({ error: "Unknown template" }, { status: 400 });
    }
    if (!String(content.title ?? "").trim() || !String(content.body ?? "").trim()) {
      return NextResponse.json(
        { error: "Email title and body content are required" },
        { status: 400 },
      );
    }
    if (recipientMode === "selected" && contactIds.length === 0) {
      return NextResponse.json({ error: "Select at least one recipient" }, { status: 400 });
    }

    // Resolve recipients — eligible contacts only.
    let contactsQuery = supabase
      .from("crm_contacts")
      .select("id, email, opted_out")
      .eq("user_id", user.id);
    if (recipientMode === "selected") {
      contactsQuery = contactsQuery.in("id", contactIds.slice(0, 10000));
    }
    const { data: candidates, error: contactsError } = await contactsQuery;
    if (contactsError) throw contactsError;

    let excludedOptedOut = 0;
    let excludedInvalid = 0;
    const eligible: { id: string; email: string }[] = [];
    for (const contact of candidates ?? []) {
      if (contact.opted_out) {
        excludedOptedOut++;
        continue;
      }
      const email = normalizeEmail(contact.email);
      if (!email) {
        excludedInvalid++;
        continue;
      }
      eligible.push({ id: contact.id, email });
    }

    if (eligible.length === 0) {
      return NextResponse.json(
        { error: "No eligible recipients — everyone selected is opted out or has an invalid email" },
        { status: 400 },
      );
    }

    const { data: campaign, error: campaignError } = await supabase
      .from("crm_campaigns")
      .insert({
        user_id: user.id,
        subject,
        template_key: templateKey,
        content,
        sender_email: getCrmFromEmail(),
        status: "draft",
        intended_count: eligible.length,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (campaignError || !campaign) throw campaignError ?? new Error("Insert failed");

    const recipientRows = eligible.map((contact) => ({
      campaign_id: campaign.id,
      contact_id: contact.id,
      user_id: user.id,
      email: contact.email,
      status: "pending",
    }));
    for (let i = 0; i < recipientRows.length; i += 500) {
      const { error } = await supabase
        .from("crm_campaign_recipients")
        .insert(recipientRows.slice(i, i + 500));
      if (error) {
        // Don't leave a half-built draft behind.
        await supabase.from("crm_campaigns").delete().eq("id", campaign.id).eq("user_id", user.id);
        throw error;
      }
    }

    return NextResponse.json({
      campaignId: campaign.id,
      recipientCount: eligible.length,
      excludedOptedOut,
      excludedInvalid,
      senderEmail: getCrmFromEmail(),
    });
  } catch (error) {
    console.error("[crm] campaign create failed:", error);
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }
}
