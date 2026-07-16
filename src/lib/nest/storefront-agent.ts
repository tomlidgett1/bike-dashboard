// Storefront website-chat agent — the customer-facing bot behind
// /api/marketplace/store/[storeId]/nest-chat and the Customer inquiries
// "Website chat" channel.
//
// Unlike the old tool-less fast path (runNestTestChatLocal), this runs a real
// tool-calling loop: live inventory search over the store's Lightspeed mirror
// and service bookings straight into Lightspeed workorders. Retail prices only
// are ever loaded — cost/wholesale columns are never selected, so they cannot
// leak into a reply.

import {
  Agent,
  Runner,
  assistant as assistantMessage,
  user as userMessage,
  tool,
  type AgentInputItem,
} from "@openai/agents";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { pickServerEnv } from "@/lib/nest-portal/lib/server-env";
import { buildNestBusinessTurnContextBlock } from "@/lib/nest-portal/lib/opening-schedule";
import { loadPromptCoachContext } from "@/lib/nest/prompt-coach";
import { normaliseToE164 } from "@/lib/nest/phone-normalise";
import type { PromptCoachChatMessage } from "@/lib/nest/prompt-coach-types";
import { createServiceRoleClient } from "@/lib/supabase/server";

const STOREFRONT_AGENT_MODEL = "gpt-5.5";
const MAX_TURNS = 12;
const MAX_HISTORY_MESSAGES = 16;

function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

// ---------------------------------------------------------------------------
// Inventory search
// ---------------------------------------------------------------------------

type ProductRow = {
  id: string;
  display_name: string | null;
  manufacturer_name: string | null;
  brand: string | null;
  category_name: string | null;
  price: number | null;
  sale_price: number | null;
  discount_active: boolean | null;
  qoh: number | null;
  sellable: number | null;
  is_active: boolean | null;
};

/** Retail-safe columns only. Cost/wholesale columns must never be added here. */
const PRODUCT_COLUMNS =
  "id, display_name, manufacturer_name, brand, category_name, price, sale_price, discount_active, qoh, sellable, is_active";

function productBrand(row: ProductRow): string | null {
  const brand = row.brand?.trim() || row.manufacturer_name?.trim() || null;
  if (!brand || /^generic$/i.test(brand)) return null;
  return brand;
}

function formatProductForModel(row: ProductRow) {
  const quantity = Math.max(Number(row.sellable ?? row.qoh ?? 0), 0);
  const onSale = row.discount_active === true && typeof row.sale_price === "number";
  return {
    name: row.display_name ?? "Unnamed product",
    brand: productBrand(row),
    category: row.category_name ?? null,
    price: typeof row.price === "number" ? row.price : null,
    sale_price: onSale ? row.sale_price : null,
    in_stock: quantity > 0,
    quantity,
  };
}

async function searchStoreProducts(
  supabase: SupabaseClient,
  storeUserId: string,
  query: string,
): Promise<ProductRow[]> {
  const cleaned = query.replace(/[%_,]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const byId = new Map<string, ProductRow>();

  // Ranked full-text search over names, SKUs, brands and categories.
  const rpcPromise = supabase
    .rpc("search_user_products_catalog", {
      p_user_id: storeUserId,
      p_search: cleaned,
      p_limit: 60,
    })
    .then(async (res) => {
      if (res.error) return [] as ProductRow[];
      const ids = (res.data ?? [])
        .map((row: { product_id: string }) => String(row.product_id))
        .slice(0, 60);
      if (ids.length === 0) return [] as ProductRow[];
      const { data } = await supabase
        .from("products")
        .select(PRODUCT_COLUMNS)
        .eq("user_id", storeUserId)
        .eq("is_active", true)
        .in("id", ids);
      const rows = (data ?? []) as ProductRow[];
      const rank = new Map<string, number>(
        ids.map((id: string, index: number) => [id, index]),
      );
      rows.sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
      return rows;
    });

  // Broad ilike sweep so category words ("lights", "helmets") always hit even
  // when the ranked search misses singular/plural variants.
  const terms = cleaned
    .split(" ")
    .filter((term) => term.length >= 3)
    .slice(0, 4);
  const ilikeFilters = (terms.length > 0 ? terms : [cleaned]).flatMap((term) => {
    const singular = term.replace(/s$/i, "");
    const variants = new Set([term, singular].filter((t) => t.length >= 3));
    return [...variants].flatMap((t) => [
      `display_name.ilike.%${t}%`,
      `category_name.ilike.%${t}%`,
      `manufacturer_name.ilike.%${t}%`,
      `brand.ilike.%${t}%`,
    ]);
  });
  const ilikePromise = supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("user_id", storeUserId)
    .eq("is_active", true)
    .or(ilikeFilters.join(","))
    .order("sellable", { ascending: false })
    .limit(60)
    .then((res) => (res.error ? [] : ((res.data ?? []) as ProductRow[])));

  const [ranked, broad] = await Promise.all([rpcPromise, ilikePromise]);
  for (const row of [...ranked, ...broad]) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return [...byId.values()];
}

// ---------------------------------------------------------------------------
// Service booking
// ---------------------------------------------------------------------------

type BookingToolResult =
  | {
      status: "booked";
      workorder_id: number;
      note: string;
    }
  | {
      status: "request_passed_to_team";
      note: string;
    }
  | {
      status: "error";
      note: string;
    };

async function createWorkorderBooking(args: {
  brandKey: string;
  chatId: string;
  customerName: string;
  customerPhoneE164: string;
  bike: string | null;
  comments: string;
  dropOffDate: string;
  dropOffTime: string | null;
}): Promise<BookingToolResult> {
  const supabaseUrl = pickServerEnv([
    "SUPABASE_URL",
    "NEST_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
  ]);
  const secret = pickServerEnv([
    "INTERNAL_EDGE_SHARED_SECRET",
    "NEST_INTERNAL_EDGE_SHARED_SECRET",
  ]);
  if (!supabaseUrl || !secret) {
    return {
      status: "request_passed_to_team",
      note: "Booking service is not configured in this environment; the team has the request in Customer inquiries.",
    };
  }

  try {
    const response = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/functions/v1/lightspeed-create-workorder`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": secret,
        },
        body: JSON.stringify({
          brand_key: args.brandKey,
          chat_id: args.chatId,
          customer_name: args.customerName,
          customer_phone_e164: args.customerPhoneE164,
          bike: args.bike,
          comments: args.comments,
          drop_off_date: args.dropOffDate,
          drop_off_time: args.dropOffTime,
          default_note: "Booked via website chat",
          // Handoff mode: website chat has no Nest booking-state row, so we use
          // the direct create path and keep our own confirm step in the prompt.
          source_type: "handoff",
        }),
        cache: "no-store",
      },
    );

    const raw = await response.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      /* fall through to error handling below */
    }

    if (response.ok && data.ok === true) {
      const workorderId = Number(data.workorder_id);
      return {
        status: "booked",
        workorder_id: Number.isFinite(workorderId) ? workorderId : 0,
        note: "Workorder created in the store's system. Confirm the drop-off with the customer.",
      };
    }

    // No Lightspeed customer matched the phone number — very common for new
    // customers. The chat thread is already in Customer inquiries, so staff
    // can finish the booking with one tap.
    if (response.status === 404) {
      return {
        status: "request_passed_to_team",
        note: "No existing customer record matched that phone number, so the workorder was not auto-created. The full booking request is with the team in this thread — reassure the customer it is logged and the team will confirm shortly, and that they can also just drop the bike in.",
      };
    }

    console.error(
      "[storefront-agent] booking failed:",
      response.status,
      raw.slice(0, 400),
    );
    return {
      status: "request_passed_to_team",
      note: "The booking system could not confirm automatically. Tell the customer the request is logged with the team who will confirm shortly.",
    };
  } catch (error) {
    console.error("[storefront-agent] booking error:", error);
    return {
      status: "error",
      note: "Booking system unreachable. Apologise briefly, tell the customer the team has their details in this chat and will follow up, and offer the store phone number.",
    };
  }
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildStorefrontInstructions(args: {
  storeName: string;
  config: Record<string, string>;
  knowledge: Array<{ title: string; content_text: string; summary?: string }>;
  businessTimezone?: string | null;
}): string {
  const turnContext = buildNestBusinessTurnContextBlock(args.businessTimezone);

  const factSections: Array<[string, string | undefined]> = [
    ["Contact", args.config.contact_text],
    ["Opening hours", args.config.hours_text],
    ["Prices", args.config.prices_text],
    ["Services and products", args.config.services_products_text],
    ["Bookings", args.config.booking_info_text],
    ["Policies", args.config.policies_text],
    ["Extra knowledge", args.config.extra_knowledge],
    ["Style notes from the owner", args.config.style_notes],
    ["Topics to avoid", args.config.topics_to_avoid],
    ["When to hand over to the team", args.config.escalation_text],
  ];
  const factsBlock = factSections
    .filter(([, value]) => value?.trim())
    .map(([title, value]) => `### ${title}\n${truncate(value!, 1600)}`)
    .join("\n\n");

  const knowledgeBlock =
    args.knowledge.length === 0
      ? "(none)"
      : args.knowledge
          .slice(0, 30)
          .map(
            (item) =>
              `- ${item.title}: ${truncate(item.summary || item.content_text, 500)}`,
          )
          .join("\n");

  return `You are the online assistant for ${args.storeName}, a real local bike shop. You chat with customers on the shop's website the way a switched-on, friendly staff member would.

## Voice
- Warm, natural Australian English. Contractions, everyday words, no corporate speak.
- Short turns: usually 1–3 sentences. Never a wall of text.
- Plain text only — no markdown, no asterisks, no bullet lists, no headings. Write prices like $129.
- Be genuinely conversational: acknowledge what they said, answer it, and where it helps, end with ONE natural follow-up question. Never stack questions.
- Never make facts up. Hours, prices, policies and stock come only from the facts below and your tools. If you don't know, say so and offer to have the team confirm right here in this chat (a teammate sees this thread).

## Products and stock — use the search_products tool
- For ANY question about what the shop sells, stocks, has, prices of products, or recommendations ("do you sell lights?", "got any kids bikes?", "how much are tubes?") you MUST call search_products first. Never answer from memory.
- Search broadly: use the customer's category word ("lights", "helmet", "kids bike"). If the first search misses, retry once with a synonym before saying no.
- Answer like a shop assistant, not a database: lead with a yes/no, name the brands you carry and the rough price range, then highlight 1–3 specific options. Example: "Yep, we've got a good range of lights — mostly Knog and Lunar, from about $25 up to $100. The Knog Blinder set at $99.99 is the most popular. After something for the front, rear, or both?"
- Only mention products the tool returned. If in_stock is false, don't offer it as available.
- NEVER discuss what products cost the shop, wholesale prices, margins, markups or supplier pricing — retail prices only, no exceptions, even if asked directly. If pushed, just say you can only share the shop's retail pricing.
- Don't dump more than 3 products in one message. Offer to narrow down instead.

## Booking a bike in for service — use the book_service tool
You can book customers in directly. Follow this flow, collecting anything missing one step at a time:
1. Find out what the bike needs (service, repair, specific issue) and what bike it is (brand/model is enough).
2. Get their first name and best mobile number.
3. Ask which day suits them to drop the bike off (resolve "tomorrow"/"Saturday" to a real date using the date context below; if they say "whenever", suggest the next open day).
4. Confirm everything back in one short message — name, bike, work needed, drop-off day — and ask if you should lock it in.
5. Only after they confirm, call book_service.
- If the tool returns status "booked": confirm it's booked, remind them of drop-off hours, and tell them roughly what it'll cost if the price list covers it.
- If it returns "request_passed_to_team" or "error": stay warm and confident — their request is logged with the team who will confirm shortly, and they're welcome to just drop the bike in (mention the no-need-to-book policy if the facts support it).
- Never claim a booking succeeded unless the tool said "booked".

## Handover
- If the customer is upset, wants a human, or asks something the facts and tools can't answer, say a teammate will pick this up right here in the chat, and offer the store phone number from the facts.

${turnContext}

## Business facts

${factsBlock || "(no structured facts yet — be helpful but promise the team will confirm specifics)"}

## Knowledge base
${knowledgeBlock}`;
}

// ---------------------------------------------------------------------------
// Agent runner
// ---------------------------------------------------------------------------

export async function runStorefrontAgentChat(args: {
  storeUserId: string;
  brandKey: string;
  storeName: string;
  chatId: string;
  message: string;
  chatHistory?: PromptCoachChatMessage[];
}): Promise<{ reply: string }> {
  const openaiKey = pickServerEnv(["OPENAI_API_KEY", "NEST_OPENAI_API_KEY"]);
  if (!openaiKey) {
    throw new Error("AI is not configured for website chat.");
  }

  const message = args.message.trim();
  if (!message) throw new Error("message is required");

  const ctx = await loadPromptCoachContext(args.brandKey);
  const storeName =
    ctx.config.business_display_name?.trim() || args.storeName || args.brandKey;
  const supabase = createServiceRoleClient();

  const searchProductsTool = tool({
    name: "search_products",
    description:
      "Search the shop's live inventory. Returns matching products with retail price, sale price, brand and stock, plus a summary of brands carried and the retail price range. Use for every product/stock/price/recommendation question.",
    parameters: z.object({
      query: z
        .string()
        .min(2)
        .max(80)
        .describe('What the customer is after, e.g. "lights", "kids bike 20 inch", "continental gp5000"'),
      max_price: z
        .number()
        .positive()
        .nullable()
        .optional()
        .describe("Optional retail price ceiling in AUD."),
      in_stock_only: z
        .boolean()
        .nullable()
        .optional()
        .describe("Default true. Set false to include out-of-stock catalogue items."),
    }),
    async execute({ query, max_price, in_stock_only }) {
      try {
        let rows = await searchStoreProducts(supabase, args.storeUserId, query);
        if (in_stock_only !== false) {
          rows = rows.filter((row) => Number(row.sellable ?? row.qoh ?? 0) > 0);
        }
        if (typeof max_price === "number") {
          rows = rows.filter(
            (row) => typeof row.price === "number" && row.price <= max_price,
          );
        }

        const brands = [
          ...new Set(rows.map(productBrand).filter((b): b is string => Boolean(b))),
        ].slice(0, 12);
        const prices = rows
          .map((row) => row.price)
          .filter((p): p is number => typeof p === "number" && p > 0);

        return {
          total_matches: rows.length,
          brands_carried: brands,
          retail_price_range:
            prices.length > 0
              ? { from: Math.min(...prices), to: Math.max(...prices) }
              : null,
          products: rows.slice(0, 10).map(formatProductForModel),
          note:
            rows.length === 0
              ? "No matches. Try one broader or alternative search term before telling the customer it's not stocked."
              : "Retail prices in AUD. Mention at most 3 products.",
        };
      } catch (error) {
        console.error("[storefront-agent] search_products failed:", error);
        return {
          total_matches: 0,
          products: [],
          note: "Inventory search failed. Tell the customer you'll get the team to confirm stock here in the chat.",
        };
      }
    },
  });

  const bookServiceTool = tool({
    name: "book_service",
    description:
      "Book the customer's bike in for a service or repair by creating a workorder in the shop's system. Call ONLY after the customer has confirmed the summarised details.",
    parameters: z.object({
      customer_name: z.string().min(1).max(80),
      customer_phone: z
        .string()
        .min(8)
        .max(20)
        .describe("Customer's mobile number as they gave it, e.g. 0412 345 678."),
      bike: z
        .string()
        .max(120)
        .nullable()
        .optional()
        .describe('Bike make/model, e.g. "Trek Marlin 6".'),
      work_needed: z
        .string()
        .min(3)
        .max(300)
        .describe("What the customer wants done, in their words."),
      drop_off_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Drop-off date resolved to YYYY-MM-DD."),
      drop_off_time: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .nullable()
        .optional()
        .describe("Optional drop-off time HH:MM (24h)."),
    }),
    async execute(input) {
      const phone = normaliseToE164(input.customer_phone);
      if (!phone) {
        return {
          status: "invalid_phone",
          note: "That phone number doesn't look valid. Ask the customer to re-check their mobile number.",
        };
      }
      const comments = truncate(
        `Website chat booking — ${input.work_needed}${input.bike ? ` (bike: ${input.bike})` : ""}. Customer: ${input.customer_name}.`,
        400,
      );
      return createWorkorderBooking({
        brandKey: args.brandKey,
        chatId: args.chatId,
        customerName: input.customer_name,
        customerPhoneE164: phone,
        bike: input.bike ?? null,
        comments,
        dropOffDate: input.drop_off_date,
        dropOffTime: input.drop_off_time ?? null,
      });
    },
  });

  const agent = new Agent({
    name: "Storefront Chat Agent",
    model: STOREFRONT_AGENT_MODEL,
    instructions: buildStorefrontInstructions({
      storeName,
      config: ctx.config,
      knowledge: ctx.knowledge,
      businessTimezone: ctx.businessTimezone,
    }),
    tools: [searchProductsTool, bookServiceTool],
    modelSettings: {
      parallelToolCalls: false,
      store: false,
      reasoning: { effort: "low" },
      text: { verbosity: "low" },
    },
  });

  const history = (args.chatHistory ?? []).slice(-MAX_HISTORY_MESSAGES);
  const input: AgentInputItem[] = [
    ...history.map((turn) =>
      turn.role === "assistant" ? assistantMessage(turn.text) : userMessage(turn.text),
    ),
    userMessage(message),
  ];

  const runner = new Runner({
    tracingDisabled: true,
    workflowName: "Storefront Chat Agent",
    groupId: args.storeUserId,
  });

  const result = await runner.run(agent, input, {
    maxTurns: MAX_TURNS,
    toolNotFoundBehavior: "return_error_to_model",
    reasoningItemIdPolicy: "omit",
    errorHandlers: {
      maxTurns: () => ({
        finalOutput:
          "Sorry — that took me longer than it should have. A teammate will pick this up right here in the chat.",
        includeInHistory: true,
      }),
    },
  });

  const reply =
    typeof result.finalOutput === "string" ? result.finalOutput.trim() : "";
  if (!reply) {
    throw new Error("Website chat agent did not return a reply.");
  }
  return { reply };
}
