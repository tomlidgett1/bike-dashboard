// Copywriting for lifecycle program sends.
//
// Same philosophy as the Domestique: a reliable deterministic draft per
// program so the loop never depends on the LLM being up, polished into
// the store's voice with the CRM model when available. Learned lessons
// from past program performance are injected into the polish prompt —
// this is where the closed loop feeds back into the outreach itself.
// Audiences and numbers are locked before the model runs; it writes
// words only. Personalisation uses the {{FIRST_NAME}} merge tag.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CRM_AGENT_MODEL,
  extractOutputText,
  getCrmOpenAI,
  parseJsonFromModel,
} from "../agent/openai";
import { storeUrl } from "@/lib/seo/site";
import { getCrmTemplate } from "../templates";
import type { CampaignContent } from "../types";
import type { LifecycleEmailDraft, LifecycleProgram } from "./types";
import {
  mergeDraftOntoTemplateContent,
  readProgramCustomEmail,
  readProgramTemplateConfig,
} from "./template-config";

export { mergeDraftOntoTemplateContent, readProgramTemplateConfig } from "./template-config";

/**
 * Apply a program's preferred design (saved template or layout key) onto a
 * composed draft. Falls back to the draft as-is when nothing is configured.
 */
export async function applyProgramTemplatePreference(
  supabase: SupabaseClient,
  userId: string,
  program: LifecycleProgram,
  draft: LifecycleEmailDraft,
): Promise<LifecycleEmailDraft> {
  const pref = readProgramTemplateConfig(program);

  if (pref.templateId) {
    const { data } = await supabase
      .from("crm_email_templates")
      .select("id, name, subject, template_key, content")
      .eq("user_id", userId)
      .eq("id", pref.templateId)
      .maybeSingle();
    if (data?.template_key && getCrmTemplate(String(data.template_key))) {
      const content = (data.content ?? {}) as CampaignContent;
      return {
        ...draft,
        templateKey: String(data.template_key),
        templateLabel: String(data.name ?? pref.templateLabel ?? "Saved template"),
        content: mergeDraftOntoTemplateContent(draft, content),
      };
    }
  }

  if (pref.templateKey && getCrmTemplate(pref.templateKey)) {
    return {
      ...draft,
      templateKey: pref.templateKey,
      templateLabel: pref.templateLabel ?? getCrmTemplate(pref.templateKey)?.name,
      content: undefined,
    };
  }

  return {
    ...draft,
    templateLabel: draft.templateLabel ?? getCrmTemplate(draft.templateKey)?.name,
  };
}

export type LifecycleComposeContext = {
  storeName: string;
  storeId: string;
  /** Active learned lessons for this program (newest first). */
  lessons: string[];
  /** Top past subjects by open rate, for the model to learn tone from. */
  winningSubjects: string[];
};

export async function loadLifecycleComposeContext(
  supabase: SupabaseClient,
  userId: string,
  programKey: string,
): Promise<LifecycleComposeContext> {
  const [{ data: profile }, { data: insightRows }, { data: pastActions }] = await Promise.all([
    supabase.from("users").select("business_name, name").eq("user_id", userId).maybeSingle(),
    supabase
      .from("crm_lifecycle_insights")
      .select("detail")
      .eq("user_id", userId)
      .eq("status", "active")
      .or(`program_key.eq.${programKey},program_key.is.null`)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("crm_lifecycle_actions")
      .select("subject, campaign:crm_campaigns(delivered_count, opened_count)")
      .eq("user_id", userId)
      .eq("program_key", programKey)
      .eq("status", "sent")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const winningSubjects = ((pastActions ?? []) as Array<Record<string, unknown>>)
    .map((row) => {
      const campaign = row.campaign as { delivered_count?: number; opened_count?: number } | null;
      const delivered = Number(campaign?.delivered_count ?? 0);
      const opened = Number(campaign?.opened_count ?? 0);
      return {
        subject: String(row.subject ?? ""),
        openRate: delivered > 0 ? opened / delivered : 0,
      };
    })
    .filter((entry) => entry.subject && entry.openRate > 0.3)
    .sort((a, b) => b.openRate - a.openRate)
    .slice(0, 3)
    .map((entry) => entry.subject);

  return {
    storeName: profile?.business_name || profile?.name || "our store",
    storeId: userId,
    lessons: (insightRows ?? []).map((row) => String(row.detail ?? "")).filter(Boolean),
    winningSubjects,
  };
}

/** Deterministic fallback drafts — never blocked on the LLM. */
export function deterministicDraft(
  program: LifecycleProgram,
  ctx: LifecycleComposeContext,
): LifecycleEmailDraft {
  const shopUrl = storeUrl(ctx.storeId);
  const base = { ctaUrl: shopUrl, templateKey: "store_announcement" };

  switch (program.key) {
    case "welcome_new":
      return {
        ...base,
        subject: `Welcome to ${ctx.storeName}, {{FIRST_NAME}}`,
        title: "Great to have you riding with us",
        body: `Hi {{FIRST_NAME}},\n\nThanks for your first visit — we hope the new gear is treating you well.\n\nA quick heads-up on how we work: our workshop is open six days a week, advice is always free, and if anything's not right with your purchase, bring it straight back and we'll sort it.\n\nWhen the bike's due its first check-over, we'd love to see you again.`,
        ctaText: "See what's in store",
      };
    case "nurture_active":
      return {
        ...base,
        subject: `A quick one from ${ctx.storeName}`,
        title: "Keeping you rolling",
        body: `Hi {{FIRST_NAME}},\n\nJust a quick note from the shop — new season stock has been landing and the workshop calendar is filling up.\n\nIf your bike's making any noises it shouldn't, or you're just curious what's new, drop in any time. Advice is always free.`,
        ctaText: "See what's new",
      };
    case "vip_thanks":
      return {
        ...base,
        subject: `A personal thank-you from ${ctx.storeName}`,
        title: "You're one of our best customers",
        body: `Hi {{FIRST_NAME}},\n\nNo sales pitch today — just a genuine thank-you. Customers like you are the reason this shop exists.\n\nIf there's ever anything your bike needs, you get priority in the workshop. And when new stock lands, you'll hear about it here first.\n\nSee you out on the road.`,
        ctaText: "First look at new arrivals",
      };
    case "save_at_risk":
      return {
        ...base,
        subject: `Is your bike due a once-over, {{FIRST_NAME}}?`,
        title: "It's been a little while",
        body: `Hi {{FIRST_NAME}},\n\nIt's been a while since your last visit, which usually means one of two things: the bike's running perfectly, or it's sitting in the shed making you feel guilty.\n\nEither way, we can help. A quick check-over keeps small problems cheap, and if you're after anything new we're happy to talk you through it — no pressure.`,
        ctaText: "Book a check-over",
        templateKey: "service_reminder",
      };
    case "winback_dormant":
      return {
        ...base,
        subject: `We'd love to see you back at ${ctx.storeName}`,
        title: "It's been too long",
        body: `Hi {{FIRST_NAME}},\n\nIt's been a fair while since we've seen you, and we wanted to check in.\n\nA lot has changed in store — new brands on the floor, and the workshop is better than ever. If your bike's been gathering dust, bring it past and we'll get it rolling again.\n\nIf now's not the time, no worries at all — we'll be here when you're ready.`,
        ctaText: "See what's changed",
      };
    case "lastcall_churned":
      return {
        ...base,
        subject: `Still riding, {{FIRST_NAME}}?`,
        title: "A note from your old bike shop",
        body: `Hi {{FIRST_NAME}},\n\nIt's been a long time between visits, so we'll keep this short.\n\nIf you're still riding, we'd genuinely love to see you again — the shop has changed a lot and the workshop is open six days a week. If cycling's dropped off the radar, that's okay too.\n\nEither way, thanks for having supported a local bike shop.`,
        ctaText: "Have a look around",
      };
    case "thank_reactivated":
      return {
        ...base,
        subject: `Good to see you back, {{FIRST_NAME}}`,
        title: "Welcome back",
        body: `Hi {{FIRST_NAME}},\n\nJust a quick note to say it was great to see you back in the shop recently.\n\nIf the bike needs anything to keep it running sweetly — a service, spares, or just some advice — you know where we are.`,
        ctaText: "Book the workshop",
        templateKey: "service_reminder",
      };
    case "first_purchase_prospect":
      return {
        ...base,
        subject: `Come say hi at ${ctx.storeName}`,
        title: "Your local bike shop",
        body: `Hi {{FIRST_NAME}},\n\nYou're on our list but we haven't properly met yet.\n\nWhether you're after a new bike, a repair, or just honest advice, the door's open six days a week and there's no such thing as a silly question.\n\nDrop in — we'd love to help you get rolling.`,
        ctaText: "Browse the store",
      };
    default:
      return {
        ...base,
        subject: `A note from ${ctx.storeName}`,
        title: "From the shop",
        body: `Hi {{FIRST_NAME}},\n\nJust a quick note from the team — drop in any time, the workshop and the floor are always open.`,
        ctaText: "Visit the store",
      };
  }
}

const POLISH_INSTRUCTIONS = `You polish lifecycle outreach copy for an independent Australian bike store. Rewrite the provided email draft in the store's voice: warm, personal, honest, no marketing clichés, Australian English, no emoji. Rules:
- Keep the same intent, lifecycle stage framing and factual claims. NEVER invent discounts, percentages, prices or offers.
- Keep {{FIRST_NAME}} merge tags exactly as written (including in the subject if present).
- Body: 2–4 short paragraphs separated by blank lines. No HTML. Keep it SHORT.
- Apply the provided learned lessons — they come from this store's real campaign results.
- If winning past subjects are provided, match their energy without copying them.
- Return JSON: {"subject": string, "title": string, "body": string, "cta_text": string}.`;

export async function composeProgramEmail(
  program: LifecycleProgram,
  ctx: LifecycleComposeContext,
  audienceSummary: string,
  supabase?: SupabaseClient,
  userId?: string,
): Promise<LifecycleEmailDraft> {
  // A store-designed campaign wins over everything: no generated copy, no
  // template preference — the email goes out exactly as the owner built it.
  const custom = readProgramCustomEmail(program);
  if (custom) {
    return {
      subject: custom.subject,
      title: String(custom.content.title ?? custom.subject),
      body: String(custom.content.body ?? ""),
      ctaText: custom.content.ctaText,
      ctaUrl: custom.content.ctaUrl,
      templateKey: custom.templateKey,
      templateLabel: custom.templateLabel ?? "Your design",
      content: custom.content,
    };
  }

  const draft = deterministicDraft(program, ctx);
  let polished = draft;

  if (process.env.OPENAI_API_KEY) {
    try {
      const openai = getCrmOpenAI();
      const response = await openai.responses.create({
        model: CRM_AGENT_MODEL,
        instructions: POLISH_INSTRUCTIONS,
        input: JSON.stringify({
          store_name: ctx.storeName,
          program: program.name,
          lifecycle_stage: program.stage,
          audience: audienceSummary,
          offer_policy: program.offer_policy,
          learned_lessons: ctx.lessons,
          winning_past_subjects: ctx.winningSubjects,
          draft: {
            subject: draft.subject,
            title: draft.title,
            body: draft.body,
            cta_text: draft.ctaText,
          },
        }),
      });

      const parsed = parseJsonFromModel<{
        subject: string;
        title: string;
        body: string;
        cta_text: string;
      }>(extractOutputText(response));
      if (parsed) {
        polished = {
          ...draft,
          subject: parsed.subject?.trim() || draft.subject,
          title: parsed.title?.trim() || draft.title,
          body: parsed.body?.trim() || draft.body,
          ctaText: parsed.cta_text?.trim() || draft.ctaText,
        };
      }
    } catch (error) {
      console.error("[lifecycle/compose] LLM polish failed, using template copy:", error);
    }
  }

  if (supabase && userId) {
    return applyProgramTemplatePreference(supabase, userId, program, polished);
  }
  return {
    ...polished,
    templateLabel: polished.templateLabel ?? getCrmTemplate(polished.templateKey)?.name,
  };
}
