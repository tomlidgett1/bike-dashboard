// Execute an approved Domestique play through the existing rails:
// CRM email (Resend), Nest texts (Linq/Twilio) and storefront discounts.
// Every customer contact — and every withheld holdout — is recorded in
// domestique_touches, the attribution ledger.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DomestiqueConfig,
  DomestiqueExecutionResult,
  DomestiqueOpportunity,
  DomestiqueTargetContact,
} from "@/lib/types/domestique";
import { createCampaignFromAgent } from "@/lib/crm/agent/create-campaign";
import { sendCrmCampaign } from "@/lib/crm/send-campaign";
import { resolveStoreNestBrandKey } from "@/lib/nest/resolve-store-brand-key";
import { proxyNestBrandPortalRequest } from "@/lib/nest/brand-portal-client";
import { formatNestOutboundMessage } from "@/lib/nest/message-format";

type TouchInsert = {
  user_id: string;
  opportunity_id: string;
  playbook_key: string;
  contact_id: string | null;
  lightspeed_customer_id: string | null;
  channel: "email" | "sms" | "holdout";
  is_holdout: boolean;
};

async function insertTouches(supabase: SupabaseClient, touches: TouchInsert[]): Promise<void> {
  for (let i = 0; i < touches.length; i += 500) {
    const { error } = await supabase.from("domestique_touches").insert(touches.slice(i, i + 500));
    if (error) console.error("[domestique/execute] touch insert failed:", error.message);
  }
}

function splitHoldouts(contacts: DomestiqueTargetContact[]): {
  live: DomestiqueTargetContact[];
  holdouts: DomestiqueTargetContact[];
} {
  const live: DomestiqueTargetContact[] = [];
  const holdouts: DomestiqueTargetContact[] = [];
  for (const contact of contacts) {
    (contact.is_holdout ? holdouts : live).push(contact);
  }
  return { live, holdouts };
}

async function executeEmail(
  supabase: SupabaseClient,
  userId: string,
  opportunity: DomestiqueOpportunity,
  live: DomestiqueTargetContact[],
  result: DomestiqueExecutionResult,
  touches: TouchInsert[],
): Promise<void> {
  const email = opportunity.action_plan.email;
  if (!email) return;
  const emailTargets = live.filter((c) => c.email);
  if (emailTargets.length === 0) return;

  try {
    const { campaignId } = await createCampaignFromAgent(supabase, userId, {
      subject: email.subject,
      templateKey: email.templateKey,
      content: {
        title: email.title,
        body: email.body,
        ctaText: email.ctaText,
        ctaUrl: email.ctaUrl,
        footerText: "You're receiving this because you're a customer of our store.",
      },
      contactIds: emailTargets.map((c) => c.contact_id),
    });
    const send = await sendCrmCampaign(supabase, userId, campaignId);
    result.campaign_id = campaignId;
    result.emails_sent = send.sent;
    result.emails_failed = send.failed;

    for (const contact of emailTargets) {
      touches.push({
        user_id: userId,
        opportunity_id: opportunity.id,
        playbook_key: opportunity.playbook_key,
        contact_id: contact.contact_id,
        lightspeed_customer_id: contact.lightspeed_customer_id,
        channel: "email",
        is_holdout: false,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email send failed";
    console.error("[domestique/execute] email failed:", message);
    (result.errors ??= []).push(`Email: ${message}`);
  }
}

async function executeSms(
  supabase: SupabaseClient,
  userId: string,
  config: DomestiqueConfig,
  opportunity: DomestiqueOpportunity,
  live: DomestiqueTargetContact[],
  result: DomestiqueExecutionResult,
  touches: TouchInsert[],
): Promise<void> {
  const sms = opportunity.action_plan.sms;
  if (!sms?.body) return;

  // On email_sms plays, text only the contacts we couldn't email.
  const smsTargets = live
    .filter((c) => c.phone && (opportunity.action_plan.channel === "sms" || !c.email))
    .slice(0, config.max_sms_per_play);
  if (smsTargets.length === 0) return;

  const contactIds = smsTargets.map((contact) => contact.contact_id).filter(Boolean);
  const { data: linkedContacts, error: linkedContactsError } = await supabase
    .from("crm_contacts")
    .select("id, customer_id")
    .eq("user_id", userId)
    .in("id", contactIds);
  if (linkedContactsError) throw new Error(`Could not verify SMS recipients: ${linkedContactsError.message}`);
  const customerByContact = new Map(
    (linkedContacts ?? [])
      .filter((contact) => contact.customer_id)
      .map((contact) => [String(contact.id), String(contact.customer_id)]),
  );
  const customerIds = [...new Set(customerByContact.values())];
  const { data: smsConsents, error: smsConsentError } = customerIds.length > 0
    ? await supabase
        .from("store_customer_consents")
        .select("customer_id, status")
        .eq("channel", "sms")
        .eq("purpose", "marketing")
        .in("customer_id", customerIds)
    : { data: [], error: null };
  if (smsConsentError) throw new Error(`Could not verify SMS consent: ${smsConsentError.message}`);
  const grantedCustomerIds = new Set(
    (smsConsents ?? [])
      .filter((consent) => consent.status === "granted")
      .map((consent) => String(consent.customer_id)),
  );
  const consentedSmsTargets = smsTargets.filter((contact) => {
    const customerId = customerByContact.get(contact.contact_id);
    return customerId ? grantedCustomerIds.has(customerId) : false;
  });
  const suppressed = smsTargets.length - consentedSmsTargets.length;
  if (suppressed > 0) {
    (result.errors ??= []).push(
      `SMS: ${suppressed} recipient${suppressed === 1 ? "" : "s"} suppressed because marketing consent was not recorded`,
    );
  }
  if (consentedSmsTargets.length === 0) return;

  const { data: profile } = await supabase
    .from("users")
    .select("nest_brand_key, business_name, nest_message_intro, nest_message_signoff")
    .eq("user_id", userId)
    .maybeSingle();
  const brandKey = resolveStoreNestBrandKey(profile);
  const templates = {
    intro: (profile?.nest_message_intro as string | null) ?? undefined,
    signoff: (profile?.nest_message_signoff as string | null) ?? undefined,
  };

  let sent = 0;
  let failed = 0;
  for (const contact of consentedSmsTargets) {
    try {
      const content = formatNestOutboundMessage(sms.body, {
        firstName: contact.first_name,
        storeName: profile?.business_name as string | null,
        templates,
      });
      await proxyNestBrandPortalRequest(brandKey, {
        method: "POST",
        body: {
          action: "start_message",
          mobile: contact.phone,
          content,
          customerName: contact.first_name ?? undefined,
        },
      });
      sent += 1;
      touches.push({
        user_id: userId,
        opportunity_id: opportunity.id,
        playbook_key: opportunity.playbook_key,
        contact_id: contact.contact_id,
        lightspeed_customer_id: contact.lightspeed_customer_id,
        channel: "sms",
        is_holdout: false,
      });
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "SMS failed";
      console.error(`[domestique/execute] sms to contact ${contact.contact_id} failed:`, message);
    }
  }
  result.sms_sent = sent;
  result.sms_failed = failed;
  if (failed > 0) {
    (result.errors ??= []).push(`SMS: ${failed} of ${consentedSmsTargets.length} failed`);
  }
}

async function executeDiscounts(
  supabase: SupabaseClient,
  userId: string,
  opportunity: DomestiqueOpportunity,
  result: DomestiqueExecutionResult,
): Promise<void> {
  const discounts = opportunity.action_plan.discounts ?? [];
  if (discounts.length === 0) return;

  const days = opportunity.action_plan.discount_days ?? 7;
  const endsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  let applied = 0;
  for (const item of discounts) {
    const { error } = await supabase
      .from("products")
      .update({
        discount_percent: item.discount_percent,
        discount_active: true,
        discount_ends_at: endsAt,
      })
      .eq("id", item.product_id)
      .eq("user_id", userId);
    if (error) {
      console.error(`[domestique/execute] discount on ${item.product_id} failed:`, error.message);
      (result.errors ??= []).push(`Discount ${item.name}: ${error.message}`);
    } else {
      applied += 1;
    }
  }
  result.products_discounted = applied;
}

/**
 * Execute an opportunity's action plan. The caller must have already moved
 * status to 'executing'; this function writes the terminal status + result.
 */
export async function executeOpportunity(
  supabase: SupabaseClient,
  userId: string,
  config: DomestiqueConfig,
  opportunity: DomestiqueOpportunity,
): Promise<DomestiqueExecutionResult> {
  const result: DomestiqueExecutionResult = {};
  const touches: TouchInsert[] = [];
  const { live, holdouts } = splitHoldouts(opportunity.action_plan.contacts ?? []);

  await executeEmail(supabase, userId, opportunity, live, result, touches);
  await executeSms(supabase, userId, config, opportunity, live, result, touches);
  await executeDiscounts(supabase, userId, opportunity, result);

  // Record holdouts — withheld on purpose so the receipt can prove lift.
  for (const contact of holdouts) {
    touches.push({
      user_id: userId,
      opportunity_id: opportunity.id,
      playbook_key: opportunity.playbook_key,
      contact_id: contact.contact_id,
      lightspeed_customer_id: contact.lightspeed_customer_id,
      channel: "holdout",
      is_holdout: true,
    });
  }
  result.holdouts = holdouts.length;

  await insertTouches(supabase, touches);

  const didAnything =
    (result.emails_sent ?? 0) > 0 ||
    (result.sms_sent ?? 0) > 0 ||
    (result.products_discounted ?? 0) > 0;
  const status = didAnything ? "executed" : "failed";

  await supabase
    .from("domestique_opportunities")
    .update({
      status,
      status_detail: didAnything ? null : (result.errors?.join("; ") ?? "Nothing to execute"),
      result,
      executed_at: new Date().toISOString(),
    })
    .eq("id", opportunity.id)
    .eq("user_id", userId);

  return result;
}
