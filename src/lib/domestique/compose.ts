// Copywriting for Domestique plays.
//
// Every playbook has a reliable deterministic template so the nightly loop
// never depends on the LLM being up; when OPENAI_API_KEY is configured the
// copy is polished into the store's voice with gpt-5.5 (same stack as the
// CRM agent). The LLM writes words only — audiences, discounts and numbers
// are locked before it runs.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DetectedOpportunity } from "./detectors";
import type { DomestiqueActionPlan, DomestiqueEmailPlan } from "@/lib/types/domestique";
import { getPlaybook } from "./playbooks";
import { CRM_AGENT_MODEL, extractOutputText, getCrmOpenAI, parseJsonFromModel } from "@/lib/crm/agent/openai";
import { storeUrl } from "@/lib/seo/site";

export interface ComposeContext {
  storeName: string;
  storeId: string;
}

export async function loadComposeContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<ComposeContext> {
  const { data } = await supabase
    .from("users")
    .select("business_name, name")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    storeName: data?.business_name || data?.name || "our store",
    storeId: userId,
  };
}

type CopyDraft = { email?: DomestiqueEmailPlan; sms?: { body: string } };

function deterministicCopy(found: DetectedOpportunity, ctx: ComposeContext): CopyDraft {
  const shopUrl = storeUrl(ctx.storeId);

  switch (found.playbook_key) {
    case "service_chase":
      return {
        email: {
          subject: `Is your bike due its annual service?`,
          title: "Time for a tune-up",
          body: `It's been about a year since you picked up your bike from us — right on time for its annual service.\n\nA yearly once-over keeps everything shifting sweetly, catches wear before it becomes expensive, and keeps you safe on the road or trail.\n\nReply to this email or drop in and we'll book you a slot that suits.`,
          ctaText: "Book a service",
          ctaUrl: shopUrl,
          templateKey: "service_reminder",
        },
        sms: {
          body: `it's been about a year since you got your bike from us — it's due its annual service. Want us to book you in? Just reply here.`,
        },
      };
    case "first_service_rescue":
      return {
        sms: {
          body: `how's the new bike treating you? Your free first service is ready whenever you are — cables and spokes settle in over the first few weeks and a quick tune keeps everything perfect. Reply here and we'll book you in.`,
        },
      };
    case "vip_winback":
      return {
        email: {
          subject: `We've missed you at ${ctx.storeName}`,
          title: "It's been a while",
          body: `You're one of our best customers, and we noticed it's been a few months since we've seen you.\n\nNo sales pitch — just wanted to say the workshop and the floor are always open, and if there's anything your bike needs (or anything new you're curious about), we'd love to help.\n\nDrop in any time, or reply and we'll sort you out personally.`,
          ctaText: "See what's new",
          ctaUrl: shopUrl,
          templateKey: "store_announcement",
        },
      };
    case "consumables_cadence":
      return {
        email: {
          subject: `Your drivetrain might be due some love`,
          title: "Wear parts check",
          body: `Based on when you last picked up parts from us, your chain, tyres or brake pads are likely coming due.\n\nReplacing a worn chain early is the cheapest insurance there is — leave it too long and it takes the cassette and chainrings with it.\n\nSwing past and we'll check the wear for free, or grab replacements online.`,
          ctaText: "Browse parts",
          ctaUrl: shopUrl,
          templateKey: "store_announcement",
        },
      };
    case "dead_stock_mover":
      return {};
  }
}

const POLISH_INSTRUCTIONS = `You polish outreach copy for an independent bike store. Rewrite the provided email and/or SMS drafts in the store's voice: warm, personal, no marketing clichés, Australian English. Keep them SHORT. Rules:
- Keep the same intent and factual claims; do not invent offers, discounts or prices.
- SMS body must be under 300 characters, no greeting and no sign-off (those are added automatically), start lowercase mid-sentence style is fine.
- Email body: 2–3 short paragraphs separated by blank lines. No HTML.
- Return JSON: {"email_subject": string|null, "email_title": string|null, "email_body": string|null, "sms_body": string|null}. Use null for channels not present in the draft.`;

async function polishWithLlm(
  found: DetectedOpportunity,
  ctx: ComposeContext,
  draft: CopyDraft,
): Promise<CopyDraft> {
  if (!process.env.OPENAI_API_KEY) return draft;
  if (!draft.email && !draft.sms) return draft;

  try {
    const openai = getCrmOpenAI();
    const response = await openai.responses.create({
      model: CRM_AGENT_MODEL,
      instructions: POLISH_INSTRUCTIONS,
      input: JSON.stringify({
        store_name: ctx.storeName,
        playbook: getPlaybook(found.playbook_key)?.name ?? found.playbook_key,
        play_summary: found.summary,
        email: draft.email
          ? { subject: draft.email.subject, title: draft.email.title, body: draft.email.body }
          : null,
        sms: draft.sms ? { body: draft.sms.body } : null,
      }),
    });

    const parsed = parseJsonFromModel<{
      email_subject: string | null;
      email_title: string | null;
      email_body: string | null;
      sms_body: string | null;
    }>(extractOutputText(response));
    if (!parsed) return draft;

    const out: CopyDraft = { ...draft };
    if (out.email) {
      out.email = {
        ...out.email,
        subject: parsed.email_subject?.trim() || out.email.subject,
        title: parsed.email_title?.trim() || out.email.title,
        body: parsed.email_body?.trim() || out.email.body,
      };
    }
    if (out.sms && parsed.sms_body?.trim()) {
      const body = parsed.sms_body.trim();
      out.sms = { body: body.length > 320 ? out.sms.body : body };
    }
    return out;
  } catch (error) {
    console.error("[domestique/compose] LLM polish failed, using template copy:", error);
    return draft;
  }
}

/** Build the concrete action plan for a detected opportunity. */
export async function composeActionPlan(
  found: DetectedOpportunity,
  ctx: ComposeContext,
): Promise<DomestiqueActionPlan> {
  const playbook = getPlaybook(found.playbook_key);
  const channel = playbook?.channel ?? "email";

  if (channel === "discount") {
    return {
      channel: "discount",
      discounts: found.discounts ?? [],
      discount_days: 7,
    };
  }

  const copy = await polishWithLlm(found, ctx, deterministicCopy(found, ctx));

  return {
    channel,
    email: channel === "email" || channel === "email_sms" ? copy.email : undefined,
    sms: channel === "sms" || channel === "email_sms" ? copy.sms : undefined,
    contacts: found.contacts,
  };
}
