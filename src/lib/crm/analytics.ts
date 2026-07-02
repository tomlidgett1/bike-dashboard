// Process Resend webhook events for CRM campaign analytics.

import type { SupabaseClient } from "@supabase/supabase-js";

export type ResendWebhookEvent = {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    tags?: { name: string; value: string }[] | Record<string, string>;
  };
};

function tagValue(
  tags: { name: string; value: string }[] | Record<string, string> | undefined,
  name: string,
): string | null {
  if (!tags) return null;
  if (Array.isArray(tags)) {
    const hit = tags.find((tag) => tag.name === name);
    return hit?.value ?? null;
  }
  const value = tags[name];
  return value ? String(value) : null;
}

function eventTimestamp(event: ResendWebhookEvent): string {
  return event.created_at ?? new Date().toISOString();
}

async function incrementCampaignCounter(
  supabase: SupabaseClient,
  campaignId: string,
  field: "delivered_count" | "opened_count" | "clicked_count" | "bounced_count",
) {
  const { data: row } = await supabase
    .from("crm_campaigns")
    .select("delivered_count, opened_count, clicked_count, bounced_count")
    .eq("id", campaignId)
    .maybeSingle();
  const current = Number((row as Record<string, number> | null)?.[field] ?? 0);
  await supabase
    .from("crm_campaigns")
    .update({ [field]: current + 1, updated_at: new Date().toISOString() })
    .eq("id", campaignId);
}

const RECIPIENT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Record an open from our first-party tracking pixel (or Resend webhook). */
export async function recordRecipientOpen(
  supabase: SupabaseClient,
  recipientId: string,
  at?: string,
): Promise<{ recorded: boolean; reason?: string }> {
  if (!RECIPIENT_ID_RE.test(recipientId)) {
    return { recorded: false, reason: "invalid recipient id" };
  }

  const { data: recipient, error } = await supabase
    .from("crm_campaign_recipients")
    .select("id, campaign_id, opened_at")
    .eq("id", recipientId)
    .maybeSingle();
  if (error || !recipient) {
    return { recorded: false, reason: "recipient not found" };
  }
  if (recipient.opened_at) {
    return { recorded: true, reason: "already opened" };
  }

  const openedAt = at ?? new Date().toISOString();
  await supabase
    .from("crm_campaign_recipients")
    .update({ opened_at: openedAt })
    .eq("id", recipient.id);
  await incrementCampaignCounter(supabase, String(recipient.campaign_id), "opened_count");
  return { recorded: true };
}

export async function processResendWebhookEvent(
  supabase: SupabaseClient,
  event: ResendWebhookEvent,
): Promise<{ handled: boolean; reason?: string }> {
  const emailId = event.data?.email_id ? String(event.data.email_id) : null;
  const recipientId = tagValue(event.data?.tags, "crm_recipient_id");
  const campaignId = tagValue(event.data?.tags, "crm_campaign_id");
  const at = eventTimestamp(event);

  let recipientQuery = supabase.from("crm_campaign_recipients").select("id, campaign_id, delivered_at, opened_at, clicked_at, bounced_at");

  if (recipientId) {
    recipientQuery = recipientQuery.eq("id", recipientId);
  } else if (emailId) {
    recipientQuery = recipientQuery.eq("resend_email_id", emailId);
  } else {
    return { handled: false, reason: "no recipient identifier" };
  }

  const { data: recipient, error } = await recipientQuery.maybeSingle();
  if (error || !recipient) {
    return { handled: false, reason: "recipient not found" };
  }

  const resolvedCampaignId = campaignId ?? String(recipient.campaign_id);

  switch (event.type) {
    case "email.delivered": {
      if (recipient.delivered_at) return { handled: true };
      await supabase
        .from("crm_campaign_recipients")
        .update({ delivered_at: at })
        .eq("id", recipient.id);
      await incrementCampaignCounter(supabase, resolvedCampaignId, "delivered_count");
      return { handled: true };
    }
    case "email.opened": {
      const result = await recordRecipientOpen(supabase, recipient.id, at);
      return { handled: result.recorded, reason: result.reason };
    }
    case "email.clicked": {
      if (recipient.clicked_at) return { handled: true };
      await supabase
        .from("crm_campaign_recipients")
        .update({ clicked_at: at })
        .eq("id", recipient.id);
      await incrementCampaignCounter(supabase, resolvedCampaignId, "clicked_count");
      return { handled: true };
    }
    case "email.bounced": {
      if (recipient.bounced_at) return { handled: true };
      await supabase
        .from("crm_campaign_recipients")
        .update({ bounced_at: at, status: "failed", error: "bounced" })
        .eq("id", recipient.id);
      await incrementCampaignCounter(supabase, resolvedCampaignId, "bounced_count");
      return { handled: true };
    }
    default:
      return { handled: false, reason: `ignored event type ${event.type}` };
  }
}
