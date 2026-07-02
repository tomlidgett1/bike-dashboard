// Create a draft campaign from agent output — shared by API and automation.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getCrmTemplate } from "@/lib/crm/templates";
import { getCrmSenderEmail } from "@/lib/crm/email-provider";
import { normalizeEmail, type CampaignContent } from "@/lib/crm/types";

export type CreateCampaignFromAgentInput = {
  subject: string;
  templateKey: string;
  content: CampaignContent;
  contactIds: string[];
  agentRunId?: string;
};

export async function createCampaignFromAgent(
  supabase: SupabaseClient,
  userId: string,
  input: CreateCampaignFromAgentInput,
): Promise<{ campaignId: string; recipientCount: number }> {
  const subject = String(input.subject ?? "").trim();
  const templateKey = String(input.templateKey ?? "");
  const content = input.content;
  const contactIds = input.contactIds.slice(0, 10000);

  if (!subject) throw new Error("Subject is required");
  if (!getCrmTemplate(templateKey)) throw new Error("Unknown template");
  if (!String(content.title ?? "").trim() || !String(content.body ?? "").trim()) {
    throw new Error("Email title and body are required");
  }
  if (contactIds.length === 0) throw new Error("No recipients");

  const { data: contacts, error: contactsError } = await supabase
    .from("crm_contacts")
    .select("id, email, opted_out")
    .eq("user_id", userId)
    .in("id", contactIds);
  if (contactsError) throw contactsError;

  const eligible: { id: string; email: string }[] = [];
  for (const contact of contacts ?? []) {
    if (contact.opted_out) continue;
    const email = normalizeEmail(contact.email);
    if (!email) continue;
    eligible.push({ id: contact.id, email });
  }

  if (eligible.length === 0) {
    throw new Error("No eligible recipients");
  }

  const senderEmail = await getCrmSenderEmail();
  const { data: campaign, error: campaignError } = await supabase
    .from("crm_campaigns")
    .insert({
      user_id: userId,
      subject,
      template_key: templateKey,
      content,
      sender_email: senderEmail,
      status: "draft",
      intended_count: eligible.length,
      created_by: userId,
    })
    .select("id")
    .single();
  if (campaignError || !campaign) throw campaignError ?? new Error("Insert failed");

  const recipientRows = eligible.map((contact) => ({
    campaign_id: campaign.id,
    contact_id: contact.id,
    user_id: userId,
    email: contact.email,
    status: "pending",
  }));

  for (let i = 0; i < recipientRows.length; i += 500) {
    const { error } = await supabase
      .from("crm_campaign_recipients")
      .insert(recipientRows.slice(i, i + 500));
    if (error) {
      await supabase.from("crm_campaigns").delete().eq("id", campaign.id).eq("user_id", userId);
      throw error;
    }
  }

  if (input.agentRunId) {
    await supabase
      .from("crm_agent_runs")
      .update({ campaign_id: campaign.id })
      .eq("id", input.agentRunId)
      .eq("user_id", userId);
  }

  return { campaignId: String(campaign.id), recipientCount: eligible.length };
}
