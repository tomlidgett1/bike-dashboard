/** Brand Knowledge Base helpers (Deno edge runtime). Keep in sync with website/lib/brand-knowledge.ts */

export const BRAND_KNOWLEDGE_PRODUCTS = [
  "nest_chat",
  "phone_assistant",
  "nest_outbound",
] as const;

export type BrandKnowledgeProduct = (typeof BRAND_KNOWLEDGE_PRODUCTS)[number];

export type BrandKnowledgeItemRow = {
  id: string;
  brand_key: string;
  title: string;
  source_type: string;
  content_text: string;
  summary: string;
  assigned_products: string[];
  status: string;
  deleted_at: string | null;
};

export const KB_PROMPT_START = "<!-- NEST_KB_START -->";
export const KB_PROMPT_END = "<!-- NEST_KB_END -->";

export const OUTBOUND_PROMPT_START = "<!-- NEST_OUTBOUND_CALLS -->";
export const OUTBOUND_PROMPT_END = "<!-- NEST_OUTBOUND_CALLS_END -->";

/** Injected into the ElevenLabs agent system prompt; {{call_goal}} is filled per outbound call. */
export const NEST_OUTBOUND_SYSTEM_PROMPT_BLOCK = [
  OUTBOUND_PROMPT_START,
  "## Nest outbound calls (work order ready)",
  "",
  "When `{{call_goal}}` is set for this conversation, you are placing an **outbound** call to tell the customer their work order is finished — not answering a general inbound enquiry.",
  "",
  "On outbound calls you must:",
  "1. Wait until the customer answers (do not speak over ringing).",
  "2. Introduce yourself as calling from {{brand_name}}.",
  "3. Follow **every step** in `{{call_goal}}`: describe what was done in natural spoken language (never read out line-item labels), state the total to pay on collection, and offer to answer questions.",
  "4. Do **not** mention the work order number unless the customer asks for it.",
  "5. Do **not** stop after a generic greeting such as only saying you are Ash or a customer service assistant — you must deliver the collection message and total.",
  "",
  "Quick facts for this call (also in `{{call_goal}}`): customer {{customer_first_name}} ({{customer_name}}), item {{item_summary}}, total {{total_price_display}}.",
  "",
  "If `{{call_goal}}` is empty, treat this as a normal inbound phone call and use your usual assistant behaviour below.",
  OUTBOUND_PROMPT_END,
].join("\n");

/** Spoken opening on Nest outbound calls (ElevenLabs substitutes dynamic variables). */
export const NEST_OUTBOUND_FIRST_MESSAGE = [
  "Hey {{customer_first_name}}, it's {{brand_name}}.",
  "I'm calling to let you know your bike is finished and ready to pick up.",
  "We did {{completed_tasks_short}}.",
  "The total when you collect is {{total_price_display}}.",
  "You can pick it up any time during our opening hours — {{opening_hours_summary}}.",
].join(" ");

export function normaliseKnowledgeProducts(
  value: unknown,
  fallback: BrandKnowledgeProduct[] = [...BRAND_KNOWLEDGE_PRODUCTS],
): BrandKnowledgeProduct[] {
  if (!Array.isArray(value)) return fallback;
  const picked = value
    .map((entry) => String(entry).trim())
    .filter((entry): entry is BrandKnowledgeProduct =>
      (BRAND_KNOWLEDGE_PRODUCTS as readonly string[]).includes(entry as BrandKnowledgeProduct)
    );
  return picked.length > 0 ? [...new Set(picked)] : fallback;
}

function buildKnowledgePromptBlock(
  items: Array<{ title: string; content_text: string }>,
  heading: string,
): string {
  const sections = items
    .map((item) => {
      const body = String(item.content_text ?? "").trim();
      if (!body) return "";
      const title = String(item.title ?? "").trim() || "Knowledge";
      return `### ${title}\n${body}`;
    })
    .filter(Boolean);

  if (sections.length === 0) return "";

  return [
    KB_PROMPT_START,
    `## ${heading}`,
    "The following entries come from the business Knowledge Base. Treat them as authoritative for this product.",
    sections.join("\n\n"),
    KB_PROMPT_END,
  ].join("\n\n");
}

export function filterKnowledgeItemsForProduct(
  items: BrandKnowledgeItemRow[],
  product: BrandKnowledgeProduct,
): BrandKnowledgeItemRow[] {
  return items.filter(
    (item) =>
      item.status === "ready" &&
      !item.deleted_at &&
      normaliseKnowledgeProducts(item.assigned_products).includes(product),
  );
}

export function buildChatKnowledgeBlock(items: BrandKnowledgeItemRow[]): string {
  return buildKnowledgePromptBlock(
    filterKnowledgeItemsForProduct(items, "nest_chat"),
    "Knowledge Base (Nest Chat)",
  );
}

export function buildPhoneKnowledgeBlock(items: BrandKnowledgeItemRow[]): string {
  return buildKnowledgePromptBlock(
    filterKnowledgeItemsForProduct(items, "phone_assistant"),
    "Knowledge Base (Phone Assistant)",
  );
}

export function buildOutboundKnowledgeBlock(items: BrandKnowledgeItemRow[]): string {
  return buildKnowledgePromptBlock(
    filterKnowledgeItemsForProduct(items, "nest_outbound"),
    "Knowledge Base (Outbound)",
  );
}

export function stripOutboundCallBlock(prompt: string): string {
  const text = String(prompt ?? "");
  const start = text.indexOf(OUTBOUND_PROMPT_START);
  if (start === -1) return text.trim();
  const end = text.indexOf(OUTBOUND_PROMPT_END, start);
  if (end === -1) return text.slice(0, start).trim();
  const after = end + OUTBOUND_PROMPT_END.length;
  let before = text.slice(0, start).trim();
  const tail = text.slice(after).trim();
  before = before.replace(/\n*---\s*$/u, "").trim();
  return [before, tail].filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function injectOutboundCallBlock(basePrompt: string): string {
  const base = stripOutboundCallBlock(stripKnowledgeBlock(String(basePrompt ?? "")));
  if (!base) return NEST_OUTBOUND_SYSTEM_PROMPT_BLOCK;
  return `${NEST_OUTBOUND_SYSTEM_PROMPT_BLOCK}\n\n---\n\n${base}`;
}

export function promptIncludesOutboundCallBlock(prompt: string): boolean {
  return String(prompt ?? "").includes(OUTBOUND_PROMPT_START);
}

export function injectKnowledgeBlock(basePrompt: string, knowledgeBlock: string): string {
  const base = String(basePrompt ?? "").trim();
  const block = String(knowledgeBlock ?? "").trim();
  if (!block) return stripKnowledgeBlock(base);
  const withoutManaged = stripKnowledgeBlock(base);
  if (!withoutManaged) return block;
  return `${withoutManaged}\n\n---\n\n${block}`;
}

export function stripKnowledgeBlock(prompt: string): string {
  const text = String(prompt ?? "");
  const start = text.indexOf(KB_PROMPT_START);
  if (start === -1) return text.trim();
  const end = text.indexOf(KB_PROMPT_END, start);
  if (end === -1) return text.slice(0, start).trim();
  const after = end + KB_PROMPT_END.length;
  let before = text.slice(0, start).trim();
  const tail = text.slice(after).trim();
  before = before.replace(/\n*---\s*$/u, "").trim();
  return [before, tail].filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function fetchBrandKnowledgeItems(
  supabase: { from: (table: string) => unknown },
  brandKey: string,
): Promise<BrandKnowledgeItemRow[]> {
  const client = supabase as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          is: (col: string, val: null) => {
            order: (col: string, opts: { ascending: boolean }) => {
              limit: (n: number) => Promise<{ data: BrandKnowledgeItemRow[] | null; error: { message: string } | null }>;
            };
          };
        };
      };
    };
  };

  const { data, error } = await client
    .from("nest_brand_knowledge_items")
    .select("id, brand_key, title, source_type, content_text, summary, assigned_products, status, deleted_at")
    .eq("brand_key", brandKey)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[brand-knowledge] fetch failed:", error.message);
    return [];
  }

  return data ?? [];
}

export async function enrichBusinessPromptWithKnowledge(
  supabase: { from: (table: string) => unknown },
  brandKey: string,
  businessPrompt: string,
): Promise<string> {
  const items = await fetchBrandKnowledgeItems(supabase, brandKey);
  const block = buildChatKnowledgeBlock(items);
  const base = String(businessPrompt ?? "").trim();
  if (!block) return base;
  if (!base) return block;
  return `${base}\n\n---\n\n${block}`;
}

export async function enrichOutboundGoalWithKnowledge(
  supabase: { from: (table: string) => unknown },
  brandKey: string,
  goalPrompt: string,
): Promise<string> {
  const items = await fetchBrandKnowledgeItems(supabase, brandKey);
  const block = buildOutboundKnowledgeBlock(items);
  const base = String(goalPrompt ?? "").trim();
  if (!block) return base;
  return `${base}\n\n---\n\n${block}`;
}
