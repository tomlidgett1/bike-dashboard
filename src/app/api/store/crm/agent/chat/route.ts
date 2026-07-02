/**
 * CRM campaign chat agent — conversational SSE stream.
 *
 * POST /api/store/crm/agent/chat
 * Body: { messages: [{role, content}], state?: { campaign, audienceRules, audienceName, audienceCount, appliedTemplateName } }
 * Streams CrmChatEvent JSON lines (`data: {...}\n\n`) with 15s heartbeats.
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runCrmChatAgent } from "@/lib/crm/agent/chat-agent";
import type { CrmChatEvent, CrmChatRequestBody } from "@/lib/crm/agent/chat-types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const HEARTBEAT_MS = 15_000;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorised" }), { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as CrmChatRequestBody | null;
  const messages = Array.isArray(body?.messages)
    ? body!.messages
        .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string")
        .map((m) => ({ role: m.role, content: m.content.slice(0, 24_000) }))
    : [];
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return new Response(JSON.stringify({ error: "A user message is required" }), { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      const send = (event: CrmChatEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          closed = true;
        }
      }, HEARTBEAT_MS);

      try {
        await runCrmChatAgent({
          supabase,
          userId: user.id,
          messages,
          clientState: body?.state ?? undefined,
          emit: send,
          signal: request.signal,
        });
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : "Agent failed" });
      } finally {
        clearInterval(heartbeat);
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
