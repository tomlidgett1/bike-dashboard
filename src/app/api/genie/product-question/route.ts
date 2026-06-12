import { NextRequest } from "next/server";
import OpenAI from "openai";
import type { Stream } from "openai/core/streaming";
import type {
  Response as OpenAIResponse,
  ResponseInput,
  ResponseStreamEvent,
  Tool,
} from "openai/resources/responses/responses";
import { createClient } from "@/lib/supabase/server";
import { compactGenieProgressText } from "@/lib/genie/progress-text";
import { runMarketplaceSearch } from "@/lib/genie/marketplace-search";
import {
  formatProductGenieListingForModel,
  hydrateProductGenieContext,
  type ProductGenieContext,
} from "@/lib/genie/product-context";
import { createPublicSupabaseClient } from "@/lib/marketplace/public-card-feed";
import {
  getOfficialSearchDomains,
} from "@/lib/bikes/official-spec-sources";
import { resolveBrandWebsite } from "@/lib/bikes/brand-websites";
import { searchYoutubeVideos } from "@/lib/genie/youtube-video-search";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = "gpt-5.4";
const STREAM_HEARTBEAT_MS = 15_000;
const MAX_ITERATIONS = 4;

const SYSTEM_PROMPT_BASE = `You are a knowledgeable cycling and gear advisor on Yellow Jersey, Australia's bike marketplace.

The shopper is viewing ONE specific Yellow Jersey listing. Your instructions include the full listing data for that item — treat it as the source of truth for this conversation.

ANSWER QUALITY (critical):
- Default to a short, structured answer: one direct verdict line, then 1-3 labelled bullets only if needed.
- Only write a detailed explanation when the shopper asks for detail, comparison, sizing, compatibility, safety, or value judgement that genuinely needs it.
- Start with the useful answer. No throat-clearing, no "it depends" padding, no generic buying-guide filler.
- For yes/no questions, lead with "Yes", "No", "Probably", or "I'd be cautious" before explaining.
- Make the answer decision-useful: fit, value, compatibility, likely catch, next thing to verify.

RESPONSE STRUCTURE:
- For simple questions: one sentence only.
- For judgement questions, use:
  **Verdict:** ...
  **Why:** ...
  **Check:** ... (only if something needs verifying)
- For comparisons, use 2-4 bullets or a tiny table. No long paragraphs.
- Never write more than ~90 words unless the shopper asks for detail or safety/fit/compatibility requires it.

LISTING vs MANUFACTURER (critical):
- Listing questions — condition (new / used / like new), listed price, stock, seller notes, wear, what's included, store vs private listing — must be answered from the YELLOW JERSEY LISTING block in your instructions. Do NOT web search for these.
- "Is this new?" almost always means the item condition on THIS listing (e.g. condition_rating New, Like New, used). Answer from listing data first. Only discuss manufacturer model-year recency if the shopper clearly means that — and distinguish it from item condition.
- Never say the official website does not show this listing — the shopper is on Yellow Jersey, not the brand site. Manufacturer sites won't show this exact listing; that's expected.
- Manufacturer web search is for OEM specs, geometry, compatibility, and reviews when listing data is insufficient — not for overriding listing condition or price.
- Listing metadata can be wrong. If the title, brand/model, model year, category, or listed specs conflict with each other or with credible OEM info, flag it plainly and cautiously: "One thing I'd double-check: ..."
- Do not invent a correction. If you have evidence, say what looks inconsistent and what you would verify. If evidence is weak, say "might" or "worth checking" rather than declaring the listing wrong.

TOOLS (use silently — never say "let me search"):
- search_marketplace_products → Yellow Jersey's live marketplace inventory. Use for alternatives, similar listings, or other in-stock options.
- web search → official manufacturer specs, geometry, compatibility, reviews — only when listing data does not answer the question.
- search_youtube_videos → optional. Use sparingly when one short YouTube video would clearly help more than text alone — e.g. setup/install, fit or sizing walkthrough, maintenance how-to, or an official product overview for an unfamiliar model. Do NOT use for listing condition, price, stock, simple spec lookups, marketplace alternatives, or generic questions that text answers well. At most once per answer; prefer one highly relevant video.

YOUTUBE (when you use search_youtube_videos):
- Videos appear below your reply — you may briefly mention them ("I've added a quick setup video below") but never paste YouTube URLs in the text.
- Skip video search entirely if text, a table, or listing data is enough.

MARKETPLACE ALTERNATIVES:
- When they want similar or other listings on Yellow Jersey, search the marketplace with short keyword queries (brand, model, category, bike type).
- Reference real in-stock results by name and price. Product cards are shown separately — never paste marketplace URLs in your reply.

STYLE:
- Warm, direct, helpful — like a great bike shop employee.
- Concise: lead with the answer, then brief context. Most replies should fit in 1-4 lines.
- **Bold** product and component names. Use simple bullets when listing options.
- Use a Markdown pipe table only when it genuinely makes a comparison easier to read.
- Avoid paragraph blocks. Prefer labelled lines: **Verdict:**, **Why:**, **Check:**, **Options:**.
- Never paste raw URLs in the reply — sources appear separately.
- If listing details are ambiguous, say what you'd verify and still give useful guidance.
- Do not invent listing details not provided in the listing block.`;

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Citation {
  url: string;
  title: string;
}

function send(controller: ReadableStreamDefaultController, encoder: TextEncoder, data: object) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(1, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

function extractCitations(response: OpenAIResponse | null | undefined): Citation[] {
  const citations: Citation[] = [];
  for (const item of response?.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type !== "output_text") continue;
      for (const ann of content.annotations ?? []) {
        if (ann.type === "url_citation" && ann.url) {
          citations.push({ url: ann.url, title: ann.title ?? ann.url });
        }
      }
    }
  }
  return citations;
}

function buildInstructions(product: ProductGenieContext): string {
  return `${SYSTEM_PROMPT_BASE}

${formatProductGenieListingForModel(product)}`;
}

function buildOfficialSearchHints(product: ProductGenieContext): string {
  const brandWebsite = resolveBrandWebsite(product.brand ?? undefined);
  const officialDomains = getOfficialSearchDomains({
    bikeBrand: product.brand,
    specValue: [product.name, product.model, product.brand].filter(Boolean).join(" "),
  });

  const domainBlock =
    officialDomains.length > 0
      ? officialDomains
          .map(
            (domain, index) =>
              `${index + 1}. site:${domain} "${product.model || product.name}" specifications OR geometry OR tech`
          )
          .join("\n")
      : "Identify the official manufacturer website for this bike brand, then search only on that domain.";

  return [
    brandWebsite ? `Official bike brand website: ${brandWebsite}` : null,
    "",
    "Required official-domain searches (use these before general web results):",
    domainBlock,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      messages: Message[];
      product: ProductGenieContext;
    };

    if (!body.product?.id || !Array.isArray(body.messages)) {
      return new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { messages, product: clientProduct } = body;
    const supabase = await createClient();
    const publicSupabase = createPublicSupabaseClient();
    const product = await hydrateProductGenieContext(publicSupabase, clientProduct);
    const encoder = new TextEncoder();
    const requestStartedAt = Date.now();

    const stream = new ReadableStream({
      async start(controller) {
        let lastStatusKey = "";
        let streamClosed = false;

        const write = (data: object) => {
          if (streamClosed) return;
          send(controller, encoder, data);
        };

        const emit = (data: object) => {
          if ("event" in data && data.event === "status") {
            const status = data as { phase?: unknown; text?: unknown };
            const phase = String(status.phase ?? "");
            const text = compactGenieProgressText(String(status.text ?? ""), phase);
            const key = `${phase}:${text}`;
            if (key === lastStatusKey) return;
            lastStatusKey = key;
            write({ event: "status", phase, text });
            return;
          }
          write(data);
        };

        const heartbeatTimer = setInterval(() => {
          const elapsedMs = Date.now() - requestStartedAt;
          try {
            write({
              event: "heartbeat",
              elapsed_ms: elapsedMs,
              text: `Still working (${formatElapsed(elapsedMs)})`,
            });
          } catch {
            streamClosed = true;
            clearInterval(heartbeatTimer);
          }
        }, STREAM_HEARTBEAT_MS);

        try {
          emit({ event: "status", phase: "planning", text: "Thinking" });

          const inputMessages = messages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }));

          const latestUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

          const userTurn = [
            latestUserMessage,
            "",
            "Reminder: answer using the Yellow Jersey listing in your instructions first.",
            "Use web search only for manufacturer specs not covered by the listing.",
            "Keep the final reply short unless the question genuinely needs detail.",
            "If listing title/specs/year/category look inconsistent, flag the specific inconsistency and what to verify.",
            "",
            buildOfficialSearchHints(product),
          ].join("\n");

          const tools: Tool[] = [
            {
              type: "web_search_preview" as const,
              search_context_size: "high" as const,
              user_location: { type: "approximate" as const, country: "AU" },
            },
            {
              type: "function" as const,
              name: "search_marketplace_products",
              description:
                "Search Yellow Jersey's live marketplace inventory for alternatives, similar listings, or other options. Use when the shopper asks about other products on the marketplace, similar bikes/gear, or what's available besides the current listing.",
              strict: null,
              parameters: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description:
                      'Short keyword(s): brand, model, category, or bike type — e.g. "gravel bike", "Trek Fuel", "road helmet".',
                  },
                },
                required: ["query"],
              },
            },
            {
              type: "function" as const,
              name: "search_youtube_videos",
              description:
                "Find 1–2 relevant YouTube videos when a visual walkthrough would genuinely help — setup/install, fit/sizing, maintenance how-to, or official product overview. Do NOT use for listing condition, price, stock, simple specs, or questions text answers well.",
              strict: null,
              parameters: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description:
                      'Focused YouTube search, e.g. "Trek Fuel EX setup guide", "Shimano Di2 battery install", "gravel bike tyre pressure guide".',
                  },
                },
                required: ["query"],
              },
            },
          ];

          let previousResponseId: string | null = null;
          let nextInput: ResponseInput = [
            ...inputMessages.slice(0, -1),
            { role: "user" as const, content: userTurn },
          ];
          const citations: Citation[] = [];

          for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
            const isLastIteration = iteration === MAX_ITERATIONS - 1;

            const response: Stream<ResponseStreamEvent> = await openai.responses.create({
              model: MODEL,
              instructions: buildInstructions(product),
              ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
              ...(isLastIteration ? {} : { tools }),
              input: nextInput,
              stream: true,
            });

            const pendingFunctionCalls = new Map<
              string,
              { name: string; arguments: string; callId: string }
            >();
            let responseId: string | null = null;

            for await (const event of response) {
              const type = event.type;

              if (type === "response.created") {
                responseId = event.response?.id ?? null;
              }

              if (type === "response.web_search_call.in_progress") {
                emit({ event: "status", phase: "web_search", text: "Searching official sources" });
              }
              if (type === "response.web_search_call.searching") {
                emit({ event: "status", phase: "web_search", text: "Searching official sources" });
              }
              if (type === "response.web_search_call.completed") {
                emit({ event: "status", phase: "web_search_done", text: "Sources ready" });
              }

              if (type === "response.output_item.added") {
                const item = event.item;
                if (item?.type === "function_call" && item.id && item.call_id) {
                  pendingFunctionCalls.set(item.id, {
                    name: item.name,
                    arguments: "",
                    callId: item.call_id,
                  });
                  if (item.name === "search_marketplace_products") {
                    emit({ event: "status", phase: "product_search", text: "Searching marketplace" });
                  }
                  if (item.name === "search_youtube_videos") {
                    emit({ event: "status", phase: "video_search", text: "Finding a helpful video" });
                  }
                }
              }

              if (type === "response.function_call_arguments.delta") {
                const fc = pendingFunctionCalls.get(event.item_id);
                if (fc) fc.arguments += event.delta ?? "";
              }

              if (type === "response.output_text.delta") {
                emit({ event: "text_delta", text: event.delta ?? "" });
              }

              if (type === "response.completed") {
                citations.push(...extractCitations(event.response));
              }
            }

            previousResponseId = responseId;

            if (pendingFunctionCalls.size === 0) break;

            const toolOutputs: ResponseInput = [];
            for (const fc of pendingFunctionCalls.values()) {
              if (fc.name === "search_marketplace_products") {
                try {
                  const args = JSON.parse(fc.arguments || "{}") as { query?: unknown };
                  const query = typeof args.query === "string" ? args.query.trim() : "";
                  const { products, output } = await runMarketplaceSearch(supabase, query, {
                    excludeProductId: product.id,
                  });
                  if (products.length > 0) {
                    emit({ event: "products", products });
                  }
                  toolOutputs.push({
                    type: "function_call_output",
                    call_id: fc.callId,
                    output: JSON.stringify(output),
                  });
                } catch {
                  toolOutputs.push({
                    type: "function_call_output",
                    call_id: fc.callId,
                    output: JSON.stringify({ error: "Search temporarily unavailable" }),
                  });
                }
              }
              if (fc.name === "search_youtube_videos") {
                try {
                  const args = JSON.parse(fc.arguments || "{}") as { query?: unknown };
                  const query = typeof args.query === "string" ? args.query.trim() : "";
                  const result = await searchYoutubeVideos(query, { limit: 2 });
                  if (result.videos.length > 0) {
                    emit({ event: "videos", videos: result.videos, query: result.query });
                  }
                  emit({ event: "status", phase: "video_search_done", text: "Video ready" });
                  toolOutputs.push({
                    type: "function_call_output",
                    call_id: fc.callId,
                    output: JSON.stringify({
                      query: result.query,
                      found: result.videos.length,
                      videos: result.videos.map((video) => ({
                        title: video.title,
                        channel: video.channel,
                        duration: video.duration,
                      })),
                      message: result.message,
                    }),
                  });
                } catch {
                  toolOutputs.push({
                    type: "function_call_output",
                    call_id: fc.callId,
                    output: JSON.stringify({ error: "Video search temporarily unavailable" }),
                  });
                }
              }
            }

            if (toolOutputs.length === 0) break;
            nextInput = toolOutputs;
          }

          if (citations.length > 0) {
            const seen = new Set<string>();
            const unique = citations.filter((c) => {
              if (seen.has(c.url)) return false;
              seen.add(c.url);
              return true;
            });
            emit({ event: "sources", sources: unique });
          }

          emit({ event: "done" });
        } catch (err) {
          try {
            emit({
              event: "error",
              message: err instanceof Error ? err.message : "Unknown error",
            });
          } catch {
            streamClosed = true;
          }
        } finally {
          clearInterval(heartbeatTimer);
          if (!streamClosed) {
            streamClosed = true;
            try {
              controller.close();
            } catch {
              // Client disconnected.
            }
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
