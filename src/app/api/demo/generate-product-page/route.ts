import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateWorldClassProductPage } from "@/lib/demo/generate-world-class-product-page";
import type {
  GenerateProgressEvent,
  WorldClassProductKind,
} from "@/lib/demo/world-class-product-page-types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function encodeSse(event: GenerateProgressEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function normaliseProductKind(value: unknown): WorldClassProductKind {
  return value === "non_bike" ? "non_bike" : "bike";
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorised" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { productName?: string; productKind?: WorldClassProductKind };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const productName = body.productName?.trim();
  if (!productName || productName.length < 3) {
    return new Response(
      JSON.stringify({
        error: "Enter a product name with at least 3 characters.",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const productKind = normaliseProductKind(body.productKind);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: GenerateProgressEvent) => {
        controller.enqueue(encoder.encode(encodeSse(event)));
      };

      try {
        await generateWorldClassProductPage({
          productName,
          productKind,
          onProgress: async (event) => {
            send(event);
          },
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to generate product page.";
        send({ stage: "error", message, error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
