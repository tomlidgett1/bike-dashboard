/**
 * CRM 2.0 agent — iterate on an existing campaign (SSE).
 *
 * POST /api/store/crm/agent/refine
 * Body: { message: string, result: CrmAgentRunResult }
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refineCrmCampaign } from "@/lib/crm/agent/refine-campaign";
import type { CrmAgentProgressEvent, CrmAgentRunResult } from "@/lib/crm/agent/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function sseLine(event: CrmAgentProgressEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorised" }), { status: 401 });
  }

  const body = (await request.json()) as {
    message?: string;
    result?: CrmAgentRunResult;
    conversation?: Array<{ role?: string; content?: string }>;
  };
  const message = String(body.message ?? "").trim();
  if (!message) {
    return new Response(JSON.stringify({ error: "Message is required" }), { status: 400 });
  }
  if (!body.result?.runId) {
    return new Response(JSON.stringify({ error: "Current campaign state is required" }), { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: CrmAgentProgressEvent) => {
        controller.enqueue(encoder.encode(sseLine(event)));
      };

      try {
        await refineCrmCampaign(supabase, user.id, {
          message,
          current: body.result as CrmAgentRunResult,
          conversation: Array.isArray(body.conversation)
            ? body.conversation
                .filter(
                  (entry): entry is { role: "user" | "assistant"; content: string } =>
                    (entry.role === "user" || entry.role === "assistant") &&
                    typeof entry.content === "string",
                )
                .slice(-8)
            : [],
          onProgress: send,
        });
      } catch (error) {
        const errMessage = error instanceof Error ? error.message : "Refine failed";
        send({ type: "error", message: errMessage });
      } finally {
        controller.close();
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
