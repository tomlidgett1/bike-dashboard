/**
 * CRM 2.0 agent — SSE stream for full pipeline run.
 *
 * POST /api/store/crm/agent
 * Body: { prompt: string, presetId?: string }
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { orchestrateCrmAgent } from "@/lib/crm/agent/orchestrate";
import type { AudienceRule, CrmAgentProgressEvent } from "@/lib/crm/agent/types";

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

  const body = (await request.json()) as { prompt?: string; presetId?: string };
  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) {
    return new Response(JSON.stringify({ error: "Prompt is required" }), { status: 400 });
  }

  let presetRules: AudienceRule[] | undefined;
  if (body.presetId) {
    const { data: preset } = await supabase
      .from("crm_audience_presets")
      .select("audience_rules, prompt")
      .eq("id", body.presetId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (preset?.audience_rules) {
      presetRules = preset.audience_rules as AudienceRule[];
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: CrmAgentProgressEvent) => {
        controller.enqueue(encoder.encode(sseLine(event)));
      };

      try {
        await orchestrateCrmAgent(supabase, user.id, {
          prompt,
          presetRules,
          presetId: body.presetId,
          onProgress: send,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Agent failed";
        send({ type: "error", message });
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
