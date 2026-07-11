/**
 * POST /api/store/crm/lifecycle/programs/[id]/design
 *
 * AI design pass for a lifecycle program's email — the same HTML-editing
 * model the Create tab uses, scoped to this program's fixed audience.
 * Body: {
 *   message: string,
 *   draft?: { subject, templateKey, content } | null,  // current working design
 *   conversation?: Array<{ role, content }>,
 * }
 * Returns { subject, subjectVariants, templateKey, content, summary } —
 * nothing is saved; the client persists via PATCH ../ when the owner saves.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  CRM_AGENT_MODEL,
  extractOutputText,
  getCrmOpenAI,
  parseJsonFromModel,
} from "@/lib/crm/agent/openai";
import { REFINE_INSTRUCTIONS } from "@/lib/crm/agent/prompts";
import { REFINE_JSON_SCHEMA } from "@/lib/crm/agent/schemas";
import { loadStoreAgentContext } from "@/lib/crm/agent/store-context";
import { buildHtmlCampaignContent, getStoredCampaignHtml } from "@/lib/crm/campaign-html";
import { normalizeMergeTags } from "@/lib/crm/merge-tags";
import { renderCampaignEmail } from "@/lib/crm/templates";
import type { CampaignContent, CampaignItem } from "@/lib/crm/types";
import { deterministicDraft, loadLifecycleComposeContext } from "@/lib/crm/lifecycle/compose";
import { loadLifecyclePrograms, programDefinition } from "@/lib/crm/lifecycle/programs";
import { mergeDraftOntoTemplateContent } from "@/lib/crm/lifecycle/template-config";
import { stageDefinition } from "@/lib/crm/lifecycle/stages";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type DesignRequestDraft = {
  subject?: string;
  templateKey?: string;
  content?: CampaignContent | null;
};

type RefineOutput = {
  layout_preference: "classic" | "minimal" | "editorial";
  subject: string;
  subject_variants: string[];
  title: string;
  body: string;
  cta_text: string;
  cta_url: string;
  footer_text: string;
  reasoning: string;
  assistant_summary: string;
  html: string;
};

const LIFECYCLE_DESIGN_EXTRA = `

LIFECYCLE PROGRAM MODE:
- This email belongs to an automated lifecycle program with a FIXED audience. Always return update_audience: false and audience_rules: [].
- Keep {{FIRST_NAME}} personalisation tokens exactly as written (add a greeting with {{FIRST_NAME}} if none exists).
- This design is reused for every future send of the program, so avoid one-off dates or countdown urgency unless explicitly requested.
- Never invent discounts, prices or offers that are not in the current email or the edit request.`;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "AI design is not configured on this environment" },
        { status: 503 },
      );
    }

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      message?: string;
      draft?: DesignRequestDraft | null;
      conversation?: Array<{ role: "user" | "assistant"; content: string }>;
    };
    const message = String(body.message ?? "").trim();
    if (!message) return NextResponse.json({ error: "Tell the AI what to change" }, { status: 400 });

    const programs = await loadLifecyclePrograms(supabase, user.id);
    const program = programs.find((p) => p.id === id);
    if (!program) return NextResponse.json({ error: "Program not found" }, { status: 404 });
    const definition = programDefinition(program.key);

    const [context, composeCtx] = await Promise.all([
      loadStoreAgentContext(supabase, user.id),
      loadLifecycleComposeContext(supabase, user.id, program.key),
    ]);

    // Current design = the client's working draft, else the program default.
    const fallback = deterministicDraft(program, composeCtx);
    const subject = String(body.draft?.subject ?? "").trim() || fallback.subject;
    const templateKey = String(body.draft?.templateKey ?? "").trim() || fallback.templateKey;
    const content: CampaignContent =
      body.draft?.content && typeof body.draft.content === "object"
        ? body.draft.content
        : mergeDraftOntoTemplateContent(fallback, null);

    const currentHtml =
      getStoredCampaignHtml(content) ??
      renderCampaignEmail({
        templateKey,
        content,
        store: { name: context.storeName, logoUrl: context.logoUrl },
        unsubscribeUrl: "{{UNSUBSCRIBE_URL}}",
      }).html;

    const openai = getCrmOpenAI();
    const response = await openai.responses.create({
      model: CRM_AGENT_MODEL,
      instructions: REFINE_INSTRUCTIONS + LIFECYCLE_DESIGN_EXTRA,
      text: {
        format: {
          type: "json_schema",
          name: "lifecycle_program_design",
          strict: true,
          schema: REFINE_JSON_SCHEMA,
        },
      },
      input: JSON.stringify({
        edit_request: message,
        conversation: (body.conversation ?? []).slice(-8),
        current_html: currentHtml,
        current_subject: subject,
        lifecycle_program: {
          name: program.name,
          stage: stageDefinition(program.stage).label,
          objective: definition?.objective,
          why_it_works: definition?.why,
          offer_policy: program.offer_policy,
        },
        learned_lessons: composeCtx.lessons,
        products: (content.items ?? []).map((item: CampaignItem) => ({
          title: item.title,
          subtitle: item.subtitle,
          price: item.price,
          original_price: item.originalPrice,
          badge: item.badge,
          on_sale: item.onSale,
          image_url: item.imageUrl,
          url: item.url,
        })),
        store_name: context.storeName,
        store_logo_url: context.logoUrl,
        unsubscribe_placeholder: "{{UNSUBSCRIBE_URL}}",
      }),
    });

    const parsed = parseJsonFromModel<RefineOutput>(extractOutputText(response));
    if (!parsed?.html?.trim()) {
      return NextResponse.json({ error: "The AI couldn't produce a design — try rephrasing" }, { status: 502 });
    }

    const nextContent = buildHtmlCampaignContent({
      title: String(parsed.title ?? subject).trim(),
      body: normalizeMergeTags(String(parsed.body ?? "").trim()),
      html: normalizeMergeTags(parsed.html),
      ctaText: String(parsed.cta_text ?? "").trim() || undefined,
      ctaUrl: String(parsed.cta_url ?? "").trim() || undefined,
      footerText: String(parsed.footer_text ?? "").trim() || undefined,
      layout: parsed.layout_preference ?? "classic",
      items: content.items?.length ? content.items : undefined,
    });

    const subjects = [
      normalizeMergeTags(String(parsed.subject ?? "").trim()),
      ...(parsed.subject_variants ?? []).map((s) => normalizeMergeTags(String(s).trim())),
    ].filter(Boolean);

    return NextResponse.json({
      subject: subjects[0] ?? subject,
      subjectVariants: [...new Set(subjects)].slice(0, 3),
      templateKey,
      content: nextContent,
      summary: String(parsed.assistant_summary ?? "").trim() || "Updated the design.",
    });
  } catch (err) {
    console.error("[crm/lifecycle/design] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI design failed" },
      { status: 500 },
    );
  }
}
