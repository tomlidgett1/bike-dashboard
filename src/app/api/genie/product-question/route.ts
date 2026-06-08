import { NextRequest } from "next/server";
import OpenAI from "openai";
import type { Stream } from "openai/core/streaming";
import type {
  Response as OpenAIResponse,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import { compactGenieProgressText } from "@/lib/genie/progress-text";
import type { ProductGenieContext } from "@/lib/genie/product-context";
import {
  getOfficialSearchDomains,
} from "@/lib/bikes/official-spec-sources";
import { resolveBrandWebsite } from "@/lib/bikes/brand-websites";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = "gpt-5.4";
const STREAM_HEARTBEAT_MS = 15_000;

const SYSTEM_PROMPT = `You are a knowledgeable cycling and gear advisor on Yellow Jersey, Australia's bike marketplace.

The shopper is viewing ONE specific listing and wants help deciding or understanding it. Answer questions about THIS product — specs, fit, compatibility, comparisons, value, maintenance, sizing, and how it suits their needs.

RESEARCH (critical):
- Use web search with official manufacturer and brand sources FIRST.
- Prioritise the brand's official website, published spec sheets, and OEM documentation where relevant.
- Prefer advanced, high-confidence sources over blogs, forums, and retailer copy.
- Avoid third-party retailers unless official sources lack the answer.
- When citing specs, prefer manufacturer-published details for this model or model year.

STYLE:
- Warm, direct, helpful — like a great bike shop employee.
- Concise: lead with the answer, then brief context.
- **Bold** product and component names. Use simple bullets when listing options.
- Never paste raw URLs in the reply — sources appear separately.
- If listing details are ambiguous, say what you'd verify and still give useful guidance.
- You can comment on value at the listed price when relevant, but do not invent listing details not provided in context.`;

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

function buildProductContextBlock(product: ProductGenieContext): string {
  const lines = [
    `Listing: ${product.name}`,
    product.brand ? `Brand: ${product.brand}` : null,
    product.model ? `Model: ${product.model}` : null,
    product.bikeType ? `Type: ${product.bikeType}` : null,
    product.price != null ? `Listed price: $${product.price.toLocaleString("en-AU")} AUD` : null,
    product.condition ? `Condition: ${product.condition}` : null,
    product.url ? `Yellow Jersey URL: ${product.url}` : null,
    product.description ? `\nListing description:\n${product.description.slice(0, 1200)}` : null,
    product.specsSummary ? `\nListing specifications:\n${product.specsSummary}` : null,
  ].filter(Boolean);

  return lines.join("\n");
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

    const { messages, product } = body;
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

          const contextPrefix = `PRODUCT CONTEXT (the listing the shopper is viewing):
${buildProductContextBlock(product)}

${buildOfficialSearchHints(product)}

Shopper question: ${latestUserMessage}`;

          const response: Stream<ResponseStreamEvent> = await openai.responses.create({
            model: MODEL,
            instructions: SYSTEM_PROMPT,
            tools: [
              {
                type: "web_search_preview" as const,
                search_context_size: "high" as const,
                user_location: { type: "approximate" as const, country: "AU" },
              },
            ],
            input: [
              ...inputMessages.slice(0, -1),
              { role: "user" as const, content: contextPrefix },
            ],
            stream: true,
          });

          const citations: Citation[] = [];

          for await (const event of response) {
            const type = event.type;

            if (type === "response.web_search_call.in_progress") {
              emit({ event: "status", phase: "web_search", text: "Searching official sources" });
            }
            if (type === "response.web_search_call.searching") {
              emit({ event: "status", phase: "web_search", text: "Searching official sources" });
            }
            if (type === "response.web_search_call.completed") {
              emit({ event: "status", phase: "web_search_done", text: "Sources ready" });
            }

            if (type === "response.output_text.delta") {
              emit({ event: "text_delta", text: event.delta ?? "" });
            }

            if (type === "response.completed") {
              citations.push(...extractCitations(event.response));
            }
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
