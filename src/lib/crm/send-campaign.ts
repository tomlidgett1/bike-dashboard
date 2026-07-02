// Shared CRM campaign send logic — used by API route and automation cron.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getCrmEmailProvider, type CrmEmailMessage } from "@/lib/crm/email-provider";
import { renderCampaignEmail } from "@/lib/crm/templates";
import { getStoredCampaignHtml } from "@/lib/crm/campaign-html";
import { applyMergeTags } from "@/lib/crm/merge-tags";
import { normalizeEmail, type CampaignContent } from "@/lib/crm/types";
import { SITE_URL } from "@/lib/seo/site";

type PendingRecipient = {
  id: string;
  email: string;
  contact: {
    unsubscribe_token: string;
    opted_out: boolean;
    first_name: string | null;
  } | null;
};

export type SendCampaignResult = {
  success: boolean;
  status: "sent" | "failed";
  sent: number;
  failed: number;
  skippedOptedOut: number;
  skippedInvalid: number;
};

async function updateRecipientStatus(
  supabase: SupabaseClient,
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

export async function sendCrmCampaign(
  supabase: SupabaseClient,
  userId: string,
  campaignId: string,
): Promise<SendCampaignResult> {
  const provider = await getCrmEmailProvider();
  if (!provider) {
    throw new Error("Email sending is not configured");
  }

  const { data: campaign, error: campaignError } = await supabase
    .from("crm_campaigns")
    .select("id, subject, template_key, content, status")
    .eq("user_id", userId)
    .eq("id", campaignId)
    .single();
  if (campaignError || !campaign) {
    throw new Error("Campaign not found");
  }

  const subject = String(campaign.subject ?? "").trim();
  const content = (campaign.content ?? {}) as CampaignContent;
  if (!subject) throw new Error("Subject is empty");
  const storedHtml = getStoredCampaignHtml(content);
  const hasHtml = Boolean(storedHtml?.trim());
  if (!hasHtml && (!String(content.title ?? "").trim() || !String(content.body ?? "").trim())) {
    throw new Error("Email body content is empty");
  }

  const { data: claimed, error: claimError } = await supabase
    .from("crm_campaigns")
    .update({ status: "sending", sender_email: provider.fromEmail, updated_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("user_id", userId)
    .eq("status", "draft")
    .select("id");
  if (claimError) throw new Error("Failed to start send");
  if (!claimed || claimed.length === 0) {
    throw new Error("Campaign already sent");
  }

  try {
    const { data: storeRow } = await supabase
      .from("users")
      .select("business_name, name, logo_url")
      .eq("user_id", userId)
      .maybeSingle();
    const store = {
      name: storeRow?.business_name || storeRow?.name || "Your Bike Store",
      logoUrl: storeRow?.logo_url ?? null,
    };

    const pending: PendingRecipient[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from("crm_campaign_recipients")
        .select("id, email, contact:crm_contacts(unsubscribe_token, opted_out, first_name)")
        .eq("user_id", userId)
        .eq("campaign_id", campaignId)
        .eq("status", "pending")
        .order("created_at")
        .range(offset, offset + 999);
      if (error) throw error;
      const rows = (data ?? []) as unknown as PendingRecipient[];
      pending.push(...rows);
      if (rows.length < 1000) break;
    }

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
      const openTrackingUrl = `${SITE_URL}/api/crm/open?r=${recipient.id}`;
      const { html, text } = renderCampaignEmail({
        templateKey: campaign.template_key,
        content,
        store,
        unsubscribeUrl,
        openTrackingUrl,
      });
      const firstName = recipient.contact?.first_name ?? null;
      toSend.push({
        rowId: recipient.id,
        message: {
          to: email,
          subject: applyMergeTags(subject, { firstName }),
          html: applyMergeTags(html, { firstName }),
          text: text ? applyMergeTags(text, { firstName }) : text,
          headers: {
            "List-Unsubscribe": `<${SITE_URL}/api/crm/unsubscribe?token=${token}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
          tags: [
            { name: "crm_recipient_id", value: recipient.id },
            { name: "crm_campaign_id", value: campaignId },
          ],
        },
      });
    }

    const now = new Date().toISOString();
    await updateRecipientStatus(supabase, skippedOptedOut, { status: "skipped_opted_out" });
    await updateRecipientStatus(supabase, skippedInvalid, { status: "skipped_invalid" });

    const results = await provider.sendBatch(toSend.map((entry) => entry.message));
    const sentIds: string[] = [];
    const failed: { id: string; error: string }[] = [];
    results.forEach((result, index) => {
      const rowId = toSend[index]?.rowId;
      if (!rowId) return;
      if (result.success) sentIds.push(rowId);
      else failed.push({ id: rowId, error: result.error ?? "Send failed" });
    });

    for (let i = 0; i < sentIds.length; i += 200) {
      const chunk = sentIds.slice(i, i + 200);
      await Promise.all(
        chunk.map((rowId) => {
          const index = toSend.findIndex((entry) => entry.rowId === rowId);
          const emailId = index >= 0 ? results[index]?.emailId : undefined;
          return supabase
            .from("crm_campaign_recipients")
            .update({
              status: "sent",
              sent_at: now,
              ...(emailId ? { resend_email_id: emailId } : {}),
            })
            .eq("id", rowId);
        }),
      );
    }
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
      .eq("id", campaignId)
      .eq("user_id", userId);

    return {
      success: finalStatus === "sent",
      status: finalStatus,
      sent: sentIds.length,
      failed: failed.length,
      skippedOptedOut: skippedOptedOut.length,
      skippedInvalid: skippedInvalid.length,
    };
  } catch (error) {
    const now = new Date().toISOString();
    await supabase
      .from("crm_campaigns")
      .update({ status: "failed", updated_at: now })
      .eq("id", campaignId)
      .eq("user_id", userId)
      .eq("status", "sending");
    throw error;
  }
}
