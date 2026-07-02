// CRM campaign chat agent tools — Lightspeed SQL, deterministic audience
// resolution, verified customer/product lookups, HTML composition with
// self-verification, and the saved-template library.
//
// Every numeric claim the agent makes must originate from one of these tools:
// recipient counts come only from resolve_audience, prices/images only from
// search_store_products, analytics only from run_lightspeed_sql.

import { randomUUID } from "crypto";
import { tool } from "@openai/agents";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { buildHtmlCampaignContent } from "../campaign-html";
import {
  catalogRowToPick,
  resolveCrmProductImageUrl,
  searchCatalogProducts,
} from "../product-catalog";
import { resolveLivePrice } from "@/lib/marketplace/pricing";
import { formatAud, type CampaignContent } from "../types";
import type {
  CampaignVerification,
  CrmActivityKind,
  CrmChatEvent,
  CrmEmailTemplateSummary,
  CrmEmailImageAttachment,
  CrmNamedAudience,
} from "./chat-types";
import { normalizeMergeTags } from "../merge-tags";
import { extractImageUrls, verificationProblems, verifyCampaignEmail } from "./email-verification";
import { runCrmLightspeedSql } from "./lightspeed-sql";
import { CRM_AGENT_MODEL, extractOutputText, getCrmOpenAI } from "./openai";
import { resolveAudience } from "./resolve-audience";
import type {
  AgentComposeResult,
  AgentProductPick,
  AudienceRule,
  CrmAgentBrief,
  StoreAgentContext,
} from "./types";

export type CrmChatToolState = {
  audience: CrmNamedAudience | null;
  candidateProducts: Map<string, AgentProductPick>;
  featuredProducts: AgentProductPick[];
  campaign: AgentComposeResult | null;
  verification: CampaignVerification | null;
  knownImageUrls: Set<string>;
  suggestions: string[] | null;
};

export type CrmEmit = (event: CrmChatEvent) => void;

const AUDIENCE_RULE_TYPES = [
  "min_spend",
  "max_spend",
  "min_visits",
  "max_visits",
  "joined_within_days",
  "joined_before_days",
  "last_purchase_within_days",
  "no_purchase_within_days",
  "inactive_days",
  "purchased_category",
  "purchased_brand",
  "purchased_keyword",
  "not_purchased_category",
  "not_purchased_brand",
  "not_purchased_keyword",
  "lapsed",
  "new_members",
  "high_value",
] as const;

const audienceRuleSchema = z.object({
  type: z.enum(AUDIENCE_RULE_TYPES),
  value: z
    .union([z.string(), z.number()])
    .nullable()
    .describe("Threshold (AUD, days, count) or search term. Null for lapsed/high_value defaults."),
  label: z.string().describe('Short human label shown on the specs sheet, e.g. "Bought Muc-Off in the last 2 years".'),
});

export function createCrmChatToolState(context: StoreAgentContext): CrmChatToolState {
  const knownImageUrls = new Set<string>();
  if (context.logoUrl) knownImageUrls.add(context.logoUrl);
  return {
    audience: null,
    candidateProducts: new Map(),
    featuredProducts: [],
    campaign: null,
    verification: null,
    knownImageUrls,
    suggestions: null,
  };
}

/** Re-hydrate state from the client's held draft so refinement turns can edit it. */
export function seedCrmChatToolState(
  state: CrmChatToolState,
  seed: {
    campaign?: AgentComposeResult | null;
    audienceRules?: AudienceRule[] | null;
    uploadedImages?: CrmEmailImageAttachment[] | null;
  },
): void {
  if (seed.campaign?.content) {
    state.campaign = seed.campaign;
    const html = seed.campaign.content.design?.html ?? "";
    for (const url of extractImageUrls(html)) state.knownImageUrls.add(url);
  }
  for (const image of seed.uploadedImages ?? []) {
    if (image.url) state.knownImageUrls.add(image.url);
  }
}

function briefForProductSearch(query: string, brand: string | null, onlyOnSale: boolean): CrmAgentBrief {
  return {
    campaign_goal: query,
    tone: "",
    audience_description: "",
    product_focus: query,
    layout_preference: "classic",
    include_products: true,
    max_recipients: null,
    promo: {
      kind: onlyOnSale ? "on_sale_only" : "none",
      discount_percent: null,
      brand,
      keyword: null,
      label: null,
      only_on_sale: onlyOnSale,
    },
  };
}

function injectPreheader(html: string, preheader: string): string {
  const trimmed = preheader.trim();
  if (!trimmed || html.includes(trimmed)) return html;
  const hidden = `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${trimmed
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}</div>`;
  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body([^>]*)>/i, `<body$1>${hidden}`);
  }
  return `${hidden}${html}`;
}

export function buildCrmChatTools(args: {
  supabase: SupabaseClient;
  userId: string;
  context: StoreAgentContext;
  state: CrmChatToolState;
  emit: CrmEmit;
}) {
  const { supabase, userId, state, emit } = args;

  const activity = (kind: CrmActivityKind, label: string, detail?: string): string => {
    const id = randomUUID();
    emit({ type: "activity", activity: { id, kind, label, detail, status: "running" } });
    return id;
  };
  const finishActivity = (
    id: string,
    kind: CrmActivityKind,
    label: string,
    detail: string | undefined,
    status: "done" | "error" = "done",
  ) => {
    emit({ type: "activity", activity: { id, kind, label, detail, status } });
  };
  const status = (phase: string, text: string) => emit({ type: "status", phase, text });

  return [
    tool({
      name: "search_web",
      description:
        "Search the live internet for current public information: cycling news, event dates, bike industry trends, product launches/recalls, competitor positioning, seasonal hooks, or campaign inspiration. Do NOT use this for store-specific facts, customer counts, inventory, prices, discounts, or recipient counts — those must come from CRM/Lightspeed tools. Return concise research notes with source names so the owner can see what the campaign angle is based on.",
      parameters: z.object({
        query: z.string().min(3).max(300).describe('Search query, e.g. "Australia cycling service trends July 2026"'),
        purpose: z
          .string()
          .min(3)
          .max(180)
          .describe('Why this lookup helps the campaign, e.g. "Find a timely hook for a winter servicing email".'),
      }),
      async execute({ query, purpose }) {
        const id = activity("web", `Searching web: ${purpose}`);
        status("web", `Searching web: ${purpose}`);
        try {
          const openai = getCrmOpenAI();
          const response = await openai.responses.create({
            model: CRM_AGENT_MODEL,
            instructions:
              "You are a concise research assistant for an Australian bicycle shop email marketer. Use web search results only. Return short, practical notes with source names and URLs when available. If results are thin or uncertain, say so.",
            tools: [
              {
                type: "web_search_preview" as const,
                search_context_size: "medium" as const,
                user_location: { type: "approximate" as const, country: "AU" },
              },
            ],
            input: `Purpose: ${purpose}\nQuery: ${query}\n\nFind current public information that could help with CRM campaign strategy or copy. Keep it factual and brief.`,
          });

          const text = extractOutputText(response).trim();
          finishActivity(id, "web", `Web: ${purpose}`, text ? "Research notes ready" : "No useful results found");
          return {
            status: "ok",
            query,
            purpose,
            notes: text || "No useful public web results found for this query.",
            guidance:
              "Use this only for public context or campaign inspiration. Do not replace CRM/Lightspeed data for customer, product, price, or recipient-count claims.",
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Web search failed";
          finishActivity(id, "web", `Web: ${purpose}`, message, "error");
          return { status: "error", query, purpose, error: message };
        }
      },
    }),

    tool({
      name: "run_lightspeed_sql",
      description:
        "Run one validated read-only PostgreSQL (Supabase Postgres 17) query against the store's Lightspeed mirror for analytics: sales totals, top customers, buyers of a product/brand/category, purchase recency, revenue trends, inventory, stock on hand, sale/clearance items, margins. Available tenant-scoped views: genie_lightspeed_sales_report_lines (sale lines with customer_id, customer_full_name, category, sku, description, quantity, total, cost, profit, margin_pct, complete_time) and genie_lightspeed_inventory (items with name, brand_name, category_name/category_path, supplier_name, default_price, avg_cost, total_qoh, total_sellable, is_in_stock, archived, primary_image_url). Postgres syntax only — date_trunc, to_char, coalesce, FILTER, ::casts, interval '30 days'. Never MySQL functions or backticks. Single SELECT/WITH, no semicolons or comments. Use this to ground every metric you state and to cross-check audience counts.",
      parameters: z.object({
        purpose: z
          .string()
          .min(3)
          .describe('Business purpose shown to the store owner, e.g. "Count customers who bought a gravel bike in the last 2 years".'),
        sql: z.string().min(10),
        limit: z.number().int().min(1).max(1000).nullable().optional().describe("Max rows (default 200)."),
      }),
      async execute({ purpose, sql, limit }) {
        const id = activity("sql", purpose);
        status("lightspeed_sql", `Querying Lightspeed: ${purpose}`);
        const result = await runCrmLightspeedSql(userId, { purpose, sql, limit: limit ?? undefined });
        if (result.status === "ok") {
          finishActivity(id, "sql", purpose, `${(result.row_count ?? 0).toLocaleString()} row${result.row_count === 1 ? "" : "s"}`);
        } else {
          finishActivity(id, "sql", purpose, result.error, "error");
        }
        return result;
      },
    }),

    tool({
      name: "resolve_audience",
      description:
        "Resolve the campaign audience deterministically from CRM contacts + Lightspeed sales history. THIS IS THE ONLY SOURCE OF TRUTH for recipient counts — never quote an audience size from anywhere else. Returns the exact eligible count (opted-out contacts always excluded), a per-rule funnel showing how each rule narrowed the audience, and a sample of real matched contacts. Rules combine with AND. purchased_category/brand/keyword include matching buyers; not_purchased_category/brand/keyword exclude matching buyers while keeping everyone else. Pair purchase-history rules with last_purchase_within_days to bound the sales-history window (for example, not_purchased_keyword + last_purchase_within_days=28 means exclude people who bought that keyword in the last 28 days). Call again with adjusted rules if the count surprises you or the owner wants a different audience.",
      parameters: z.object({
        name: z.string().describe('Short audience name, e.g. "Lapsed Muc-Off buyers".'),
        rules: z.array(audienceRuleSchema).min(0).max(6),
        max_recipients: z
          .number()
          .int()
          .min(1)
          .nullable()
          .optional()
          .describe("ONLY when the owner explicitly asks to cap the send size. Otherwise omit."),
      }),
      async execute({ name, rules, max_recipients }) {
        const id = activity("audience", `Building audience: ${name}`);
        status("audience", `Resolving audience: ${name}`);
        try {
          const resolution = await resolveAudience(
            supabase,
            userId,
            rules as AudienceRule[],
            max_recipients ?? null,
          );
          const named: CrmNamedAudience = { ...resolution, name };
          state.audience = named;
          emit({ type: "audience", audience: named });
          finishActivity(
            id,
            "audience",
            `Audience: ${name}`,
            `${resolution.count.toLocaleString()} recipient${resolution.count === 1 ? "" : "s"} matched`,
          );
          return {
            status: "ok",
            audience_name: name,
            recipient_count: resolution.count,
            excluded_opted_out: resolution.excludedOptedOut,
            sort: resolution.sort?.label ?? null,
            funnel: resolution.funnel,
            sample: resolution.sample.slice(0, 5).map((c) => ({
              name: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email,
              total_spend: c.total_spend,
              visits: c.sale_count,
              last_purchase_at: c.last_purchase_at,
            })),
            guidance:
              resolution.count === 0
                ? "No contacts matched. Loosen the rules (wider window, drop a filter) or use run_lightspeed_sql to see what data actually exists, then resolve again."
                : "State this exact recipient_count to the owner. If it differs from a SQL estimate you ran, explain why (opt-outs, contacts without emails, rule interactions).",
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Audience resolution failed";
          finishActivity(id, "audience", `Audience: ${name}`, message, "error");
          return { status: "error", error: message };
        }
      },
    }),

    tool({
      name: "lookup_customers",
      description:
        "Look up specific CRM contacts by name, email, or Lightspeed customer ID. Returns their real spend, visit count, join date, last purchase, opt-out status, and most recent purchased items from Lightspeed sales history. Use to verify individual customers, answer questions about a named customer, or spot-check that an audience contains the right people.",
      parameters: z.object({
        query: z.string().min(2).describe("Name, email fragment, or numeric Lightspeed customer ID."),
        limit: z.number().int().min(1).max(20).nullable().optional(),
      }),
      async execute({ query, limit }) {
        const id = activity("customers", `Looking up customer: ${query}`);
        status("customers", `Customer lookup: ${query}`);
        const take = limit ?? 8;
        const term = query.replace(/[%_,]/g, " ").trim();

        let builder = supabase
          .from("crm_contacts")
          .select(
            "id, email, first_name, last_name, opted_out, lightspeed_customer_id, lightspeed_joined_at, last_purchase_at, total_spend, sale_count",
          )
          .eq("user_id", userId)
          .limit(take);

        if (/^\d+$/.test(term)) {
          builder = builder.eq("lightspeed_customer_id", term);
        } else {
          builder = builder.or(
            `email.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%`,
          );
        }
        const { data: contacts, error } = await builder;
        if (error) {
          finishActivity(id, "customers", `Customer lookup: ${query}`, error.message, "error");
          return { status: "error", error: error.message };
        }

        const matches = contacts ?? [];
        const customerIds = matches
          .map((c) => c.lightspeed_customer_id)
          .filter((v): v is string => Boolean(v));

        const recentByCustomer = new Map<string, Array<{ item: string; total: number; when: string | null }>>();
        if (customerIds.length > 0) {
          const { data: lines } = await supabase
            .from("lightspeed_sales_report_lines")
            .select("customer_id, description, total, complete_time")
            .eq("user_id", userId)
            .in("customer_id", customerIds.slice(0, 10))
            .not("complete_time", "is", null)
            .order("complete_time", { ascending: false })
            .limit(40);
          for (const line of lines ?? []) {
            const key = String(line.customer_id);
            const list = recentByCustomer.get(key) ?? [];
            if (list.length < 4) {
              list.push({
                item: String(line.description ?? ""),
                total: Number(line.total ?? 0),
                when: line.complete_time ? String(line.complete_time) : null,
              });
              recentByCustomer.set(key, list);
            }
          }
        }

        finishActivity(
          id,
          "customers",
          `Customer lookup: ${query}`,
          `${matches.length} match${matches.length === 1 ? "" : "es"}`,
        );
        return {
          status: "ok",
          match_count: matches.length,
          customers: matches.map((c) => ({
            name: [c.first_name, c.last_name].filter(Boolean).join(" ") || null,
            email: c.email,
            opted_out: c.opted_out,
            total_spend: c.total_spend,
            visits: c.sale_count,
            joined_at: c.lightspeed_joined_at,
            last_purchase_at: c.last_purchase_at,
            recent_purchases: c.lightspeed_customer_id
              ? recentByCustomer.get(String(c.lightspeed_customer_id)) ?? []
              : [],
          })),
        };
      },
    }),

    tool({
      name: "search_store_products",
      description:
        "Search the store's live product catalogue for items to feature in the email. Returns verified titles, live prices (sale pricing resolved), stock, and email-safe HTTPS image URLs. ONLY feature products returned by this tool, with these exact image URLs and prices — never invent product names, images, or prices. Products without an image_url should not get an <img> in the email.",
      parameters: z.object({
        query: z.string().min(2).describe('What to look for, e.g. "gravel bikes", "Muc-Off cleaning".'),
        brand: z.string().nullable().optional().describe("Exact brand filter when the campaign is brand-specific."),
        only_on_sale: z.boolean().nullable().optional().describe("Only currently discounted items."),
        in_stock_only: z.boolean().nullable().optional().describe("Only items with sellable stock (default true)."),
        limit: z.number().int().min(1).max(12).nullable().optional(),
      }),
      async execute({ query, brand, only_on_sale, in_stock_only, limit }) {
        const id = activity("products", `Searching catalogue: ${query}`);
        status("products", `Catalogue search: ${query}${brand ? ` (${brand})` : ""}`);
        const brief = briefForProductSearch(query, brand ?? null, Boolean(only_on_sale));
        const { rows } = await searchCatalogProducts(supabase, userId, brief, [], 48);

        const requireStock = in_stock_only !== false;
        const take = limit ?? 8;
        const results: Array<Record<string, unknown>> = [];
        let withImages = 0;

        for (const row of rows) {
          const stock = Number(row.sellable ?? row.qoh ?? 0);
          if (requireStock && stock <= 0) continue;
          const live = resolveLivePrice({
            price: row.price ?? 0,
            sale_price: row.sale_price ?? null,
            discount_percent: row.discount_percent ?? null,
            discount_active: row.discount_active ?? false,
            discount_ends_at: row.discount_ends_at ?? null,
          });
          if (only_on_sale && !live.onSale) continue;

          const pick = catalogRowToPick(row, userId, brief.promo);
          if (!pick?.productId) continue;
          state.candidateProducts.set(pick.productId, pick);
          if (pick.imageUrl) {
            state.knownImageUrls.add(pick.imageUrl);
            withImages++;
          }
          const imageUrl = resolveCrmProductImageUrl(row);
          results.push({
            product_id: pick.productId,
            title: pick.title,
            subtitle: pick.subtitle ?? null,
            price: pick.price ?? null,
            original_price: pick.originalPrice ?? null,
            badge: pick.badge ?? null,
            on_sale: Boolean(pick.onSale),
            in_stock: stock > 0,
            stock,
            image_url: imageUrl,
            product_url: pick.url ?? null,
          });
          if (results.length >= take) break;
        }

        finishActivity(
          id,
          "products",
          `Catalogue: ${query}`,
          `${results.length} product${results.length === 1 ? "" : "s"} found, ${withImages} with photos`,
        );
        return {
          status: "ok",
          result_count: results.length,
          products: results,
          guidance:
            results.length === 0
              ? "Nothing matched. Try a broader query, drop the brand filter, or check the catalogue with run_lightspeed_sql on genie_lightspeed_inventory."
              : "Feature at most 3-6 products. Pass their product_id values as featured_product_ids in set_campaign_email and use the exact image_url and price strings.",
        };
      },
    }),

    tool({
      name: "set_campaign_email",
      description:
        "Set or replace the campaign email draft. Provide the COMPLETE production HTML email document every time (never a diff). The email must already look premium, modern, and deliberate before calling this tool: strong concept, confident typography, generous spacing, one dominant CTA, restrained palette, and email-safe execution. The server sanitises it, injects the preheader, guarantees the {{UNSUBSCRIBE_URL}} link, renders it live in the owner's preview, and runs verification checks (image provenance, product rendering, subject length, size). Fix any failed checks it returns before presenting the campaign as done.",
      parameters: z.object({
        subject: z.string().min(3).max(120),
        subject_variants: z.array(z.string()).max(2).describe("Up to 2 alternative subjects for A/B choice."),
        preheader: z.string().nullable().optional().describe("Inbox preview text, 40-90 chars. Injected hidden at the top of the email."),
        layout: z.enum(["classic", "minimal", "editorial"]).nullable().optional(),
        summary_title: z.string().describe("Plain-text headline for the CRM record."),
        summary_body: z.string().describe("Plain-text summary of the email for the CRM record."),
        design_notes: z.string().describe("1-3 sentences on the design concept and why the hierarchy/CTA/audience fit the brief — shown on the specs sheet."),
        html: z.string().min(100).describe("Full polished HTML email document. Inline CSS, table layout, 600px max width, premium retail design, generous spacing, one dominant CTA, {{UNSUBSCRIBE_URL}} placeholder for the unsubscribe href."),
        featured_product_ids: z
          .array(z.string())
          .max(8)
          .describe("product_id values (from search_store_products) featured in this email. Empty array if none."),
      }),
      async execute(input) {
        const id = activity("compose", `Designing email: ${input.subject}`);
        status("compose", `Designing email: ${input.subject}`);

        const featured = input.featured_product_ids
          .map((pid) => state.candidateProducts.get(pid))
          .filter((p): p is AgentProductPick => Boolean(p));

        const normalizedHtml = normalizeMergeTags(input.html);
        const htmlWithPreheader = input.preheader
          ? injectPreheader(normalizedHtml, input.preheader)
          : normalizedHtml;

        const content: CampaignContent = buildHtmlCampaignContent({
          title: input.summary_title.trim() || input.subject,
          body: input.summary_body.trim() || input.subject,
          html: htmlWithPreheader,
          layout: input.layout ?? "classic",
          items: featured.length > 0 ? featured : undefined,
        });

        const finalHtml = content.design?.html ?? "";
        const verification = verifyCampaignEmail({
          subject: normalizeMergeTags(input.subject),
          html: finalHtml,
          knownImageUrls: state.knownImageUrls,
          featuredProducts: featured,
        });

        const subjectVariants = [
          normalizeMergeTags(input.subject.trim()),
          ...input.subject_variants.map((s) => normalizeMergeTags(s.trim())),
        ].filter(Boolean);
        const uniqueSubjects = [...new Set(subjectVariants)].slice(0, 3);

        const campaign: AgentComposeResult = {
          subject: uniqueSubjects[0] ?? input.subject,
          subjectVariants: uniqueSubjects,
          templateKey: featured.length > 0 ? "featured_bikes" : "store_announcement",
          content,
          reasoning: input.design_notes,
        };

        state.campaign = campaign;
        state.featuredProducts = featured;
        state.verification = verification;

        emit({ type: "campaign", campaign, verification });
        if (featured.length > 0) emit({ type: "products", products: featured });

        const problems = verificationProblems(verification);
        finishActivity(
          id,
          "compose",
          `Email: ${input.subject}`,
          problems.length === 0
            ? "All verification checks passed"
            : `${problems.length} check${problems.length === 1 ? "" : "s"} need attention`,
          problems.length === 0 ? "done" : "error",
        );

        return {
          status: problems.length === 0 ? "ok" : "needs_fixes",
          verification: verification.checks,
          problems,
          size_kb: Math.round(Buffer.byteLength(finalHtml, "utf8") / 1024),
          guidance:
            problems.length === 0
              ? "Draft is live in the preview. Summarise what you built with the verified audience count."
              : "Fix these problems and call set_campaign_email again with corrected HTML before telling the owner it's ready.",
        };
      },
    }),

    tool({
      name: "list_email_templates",
      description: "List the store's saved email templates (name, description, subject, usage). Use when the owner wants to reuse or browse saved designs.",
      parameters: z.object({}),
      async execute() {
        const { data, error } = await supabase
          .from("crm_email_templates")
          .select("id, name, description, subject, template_key, use_count, updated_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(30);
        if (error) return { status: "error", error: error.message };
        return { status: "ok", templates: data ?? [] };
      },
    }),

    tool({
      name: "save_email_template",
      description: "Save the CURRENT campaign draft as a named reusable template. Requires a draft built with set_campaign_email first. Same name overwrites the existing template.",
      parameters: z.object({
        name: z.string().min(2).max(80),
        description: z.string().nullable().optional().describe("One line on when to use this template."),
      }),
      async execute({ name, description }) {
        if (!state.campaign) {
          return { status: "error", error: "No campaign draft to save — build one with set_campaign_email first." };
        }
        const id = activity("template", `Saving template: ${name}`);
        const { data, error } = await supabase
          .from("crm_email_templates")
          .upsert(
            {
              user_id: userId,
              name: name.trim(),
              description: description?.trim() || null,
              subject: state.campaign.subject,
              template_key: state.campaign.templateKey,
              content: state.campaign.content,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,name" },
          )
          .select("id, name, description, subject, template_key, use_count, updated_at")
          .single();
        if (error || !data) {
          finishActivity(id, "template", `Template: ${name}`, error?.message ?? "Save failed", "error");
          return { status: "error", error: error?.message ?? "Save failed" };
        }
        const template = data as CrmEmailTemplateSummary;
        emit({ type: "template_saved", template });
        finishActivity(id, "template", `Template saved: ${name}`, undefined);
        return { status: "ok", template };
      },
    }),

    tool({
      name: "load_email_template",
      description: "Load a saved template into the campaign draft (renders in the preview immediately). Then adapt it: update copy, products, and audience for the new campaign.",
      parameters: z.object({
        name_or_id: z.string().min(1).describe("Template name (exact) or UUID."),
      }),
      async execute({ name_or_id }) {
        const id = activity("template", `Loading template: ${name_or_id}`);
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name_or_id);
        const query = supabase
          .from("crm_email_templates")
          .select("id, name, description, subject, template_key, content, use_count, updated_at")
          .eq("user_id", userId);
        const { data, error } = isUuid
          ? await query.eq("id", name_or_id).maybeSingle()
          : await query.ilike("name", name_or_id).maybeSingle();

        if (error || !data) {
          finishActivity(id, "template", `Template: ${name_or_id}`, error?.message ?? "Not found", "error");
          return {
            status: "error",
            error: error?.message ?? `No template named "${name_or_id}". Use list_email_templates to see what exists.`,
          };
        }

        const content = data.content as CampaignContent;
        const html = content.design?.html ?? "";
        for (const url of extractImageUrls(html)) state.knownImageUrls.add(url);

        const campaign: AgentComposeResult = {
          subject: String(data.subject),
          subjectVariants: [String(data.subject)],
          templateKey: String(data.template_key),
          content,
          reasoning: `Loaded from saved template "${data.name}".`,
        };
        state.campaign = campaign;
        emit({ type: "campaign", campaign });

        await supabase
          .from("crm_email_templates")
          .update({ use_count: Number(data.use_count ?? 0) + 1, last_used_at: new Date().toISOString() })
          .eq("id", data.id)
          .eq("user_id", userId);

        finishActivity(id, "template", `Template loaded: ${data.name}`, undefined);
        return {
          status: "ok",
          template: { id: data.id, name: data.name, subject: data.subject },
          current_html: html,
          guidance: "The template is now the live draft. Edit it with set_campaign_email (full HTML) to adapt copy/products, and resolve_audience for the recipients.",
        };
      },
    }),

    tool({
      name: "suggest_next_steps",
      description:
        "Offer the owner up to 3 tappable follow-up suggestions (short imperative phrases, ≤50 chars each, e.g. \"Make the hero punchier\", \"Only customers who spent $500+\", \"Save this as a template\"). Call this once at the END of every reply so the owner always has clear next moves.",
      parameters: z.object({
        suggestions: z.array(z.string().min(3).max(60)).min(1).max(3),
      }),
      async execute({ suggestions }) {
        state.suggestions = suggestions;
        emit({ type: "suggestions", suggestions });
        return { status: "ok" };
      },
    }),
  ];
}

export function describeAudienceForPrompt(audience: CrmNamedAudience | null): string {
  if (!audience) return "No audience resolved yet.";
  return `${audience.name ?? "Audience"}: ${audience.count.toLocaleString()} recipients (${formatRules(audience.rules)}); ${audience.excludedOptedOut} opted-out excluded.`;
}

function formatRules(rules: AudienceRule[]): string {
  if (rules.length === 0) return "all subscribed contacts";
  return rules.map((r) => r.label || `${r.type}=${r.value ?? ""}`).join(", ");
}

export { formatAud };
