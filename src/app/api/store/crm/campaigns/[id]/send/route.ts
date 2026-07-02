/**
 * CRM campaign send
 *
 * POST /api/store/crm/campaigns/[id]/send
 *
 * Guardrails enforced here (not just in the UI):
 * - sender must be configured (RESEND_API_KEY + CRM_FROM_EMAIL/FROM_EMAIL)
 * - subject and body content must be non-empty
 * - opted-out and invalid contacts are skipped even if rows exist
 * - the draft→sending transition is atomic, so a campaign can only ever be
 *   sent once — duplicating into a new campaign is the only way to resend
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCrmEmailProvider, type CrmEmailMessage } from "@/lib/crm/email-provider";
import { renderCampaignEmail } from "@/lib/crm/templates";
import { normalizeEmail, type CampaignContent } from "@/lib/crm/types";
import { SITE_URL } from "@/lib/seo/site";

export const maxDuration = 300;

type PendingRecipient = {
  id: string;
  email: string;
  contact: {
    unsubscribe_token: string;
    opted_out: boolean;
    first_name: string | null;
  } | null;
};

async function updateRecipientStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
  patch: Record<string, unknown>,
) {
  for (let i = 0; i < ids.length; i += 200) {
    await supabase
      .from("crm_campaign_recipients")
      .update(patch)
      .in("id", ids.slice(i, i + 200));
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { id } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const provider = getCrmEmailProvider();
  if (!provider) {
    return NextResponse.json(
      {
        error:
          "Email sending is not configured. Set RESEND_API_KEY and CRM_FROM_EMAIL (see docs/CRM_EMAIL.md).",
      },
      { status: 409 },
    );
  }

  // Load + validate the draft before claiming it.
  const { data: campaign, error: campaignError } = await supabase
    .from("crm_campaigns")
    .select("id, subject, template_key, content, status")
    .eq("user_id", user.id)
    .eq("id", id)
    .single();
  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const subject = String(campaign.subject ?? "").trim();
  const content = (campaign.content ?? {}) as CampaignContent;
  if (!subject) {
    return NextResponse.json({ error: "Subject is empty" }, { status: 400 });
  }
  if (!String(content.title ?? "").trim() || !String(content.body ?? "").trim()) {
    return NextResponse.json({ error: "Email body content is empty" }, { status: 400 });
  }

  // Atomically claim the draft. If another request (or a double-click) got
  // here first, status is no longer 'draft' and zero rows come back.
  const { data: claimed, error: claimError } = await supabase
    .from("crm_campaigns")
    .update({ status: "sending", sender_email: provider.fromEmail, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "draft")
    .select("id");
  if (claimError) {
    return NextResponse.json({ error: "Failed to start send" }, { status: 500 });
  }
  if (!claimed || claimed.length === 0) {
    return NextResponse.json(
      { error: "This campaign has already been sent. Duplicate it to send again." },
      { status: 409 },
    );
  }

  try {
    // Load all pending recipients with their contact's opt-out + token.
    const pending: PendingRecipient[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from("crm_campaign_recipients")
        .select("id, email, contact:crm_contacts(unsubscribe_token, opted_out, first_name)")
        .eq("user_id", user.id)
        .eq("campaign_id", id)
        .eq("status", "pending")
        .order("created_at")
        .range(offset, offset + 999);
      if (error) throw error;
      const rows = (data ?? []) as unknown as PendingRecipient[];
      pending.push(...rows);
      if (rows.length < 1000) break;
    }

    // Partition: final opt-out/validity check happens at send time.
    const skippedOptedOut: string[] = [];
    const skippedInvalid: string[] = [];
    const toSend: { rowId: string; message: CrmEmailMessage }[] = [];

    for (const recipient of pending) {
      const email = normalizeEmail(recipient.email);
      if (recipient.contact?.opted_out) {
        skippedOptedOut.push(recipient.id);
        continue;
      }
      if (!email || !recipient.contact?.unsubscribe_token) {
        skippedInvalid.push(recipient.id);
        continue;
      }
      const token = recipient.contact.unsubscribe_token;
      const unsubscribeUrl = `${SITE_URL}/unsubscribe?token=${token}`;
      const { html, text } = renderCampaignEmail({
        templateKey: campaign.template_key,
        content,
        unsubscribeUrl,
      });
      toSend.push({
        rowId: recipient.id,
        message: {
          to: email,
          subject,
          html,
          text,
          headers: {
            // One-click endpoint accepts the RFC 8058 POST; humans get the page.
            "List-Unsubscribe": `<${SITE_URL}/api/crm/unsubscribe?token=${token}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        },
      });
    }

    const now = new Date().toISOString();
    await updateRecipientStatus(supabase, skippedOptedOut, {
      status: "skipped_opted_out",
    });
    await updateRecipientStatus(supabase, skippedInvalid, { status: "skipped_invalid" });

    // Send and record outcomes.
    const results = await provider.sendBatch(toSend.map((entry) => entry.message));
    const sentIds: string[] = [];
    const failed: { id: string; error: string }[] = [];
    results.forEach((result, index) => {
      const rowId = toSend[index]?.rowId;
      if (!rowId) return;
      if (result.success) sentIds.push(rowId);
      else failed.push({ id: rowId, error: result.error ?? "Send failed" });
    });

    await updateRecipientStatus(supabase, sentIds, { status: "sent", sent_at: now });
    for (const failure of failed) {
      await supabase
        .from("crm_campaign_recipients")
        .update({ status: "failed", error: failure.error.slice(0, 500) })
        .eq("id", failure.id);
    }

    const finalStatus = sentIds.length > 0 ? "sent" : "failed";
    await supabase
      .from("crm_campaigns")
      .update({
        status: finalStatus,
        sent_count: sentIds.length,
        failed_count: failed.length,
        sent_at: now,
        updated_at: now,
      })
      .eq("id", id)
      .eq("user_id", user.id);

    return NextResponse.json({
      success: finalStatus === "sent",
      status: finalStatus,
      sent: sentIds.length,
      failed: failed.length,
      skippedOptedOut: skippedOptedOut.length,
      skippedInvalid: skippedInvalid.length,
    });
  } catch (error) {
    console.error("[crm] campaign send failed:", error);
    const now = new Date().toISOString();
    await supabase
      .from("crm_campaigns")
      .update({ status: "failed", updated_at: now })
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("status", "sending");
    return NextResponse.json({ error: "Send failed part-way — check campaign history" }, { status: 500 });
  }
}
