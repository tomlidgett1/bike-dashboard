import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runGenieAgentBackgroundJob } from "@/lib/genie/run-genie-agent-background-job";
import { ensureGenieConversation } from "@/lib/genie/ensure-genie-conversation";
import type { GenieJobMetadata, GenieJobSource } from "@/lib/genie/genie-job-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 600;

async function requireStoreUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      supabase,
      user: null,
      profile: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("account_type, bicycle_store, business_name")
    .eq("user_id", user.id)
    .single();

  if (!profile || profile.account_type !== "bicycle_store" || !profile.bicycle_store) {
    return {
      supabase,
      user,
      profile: null,
      error: NextResponse.json(
        { error: "Background Genie jobs are only available to verified bicycle stores." },
        { status: 403 },
      ),
    };
  }

  return { supabase, user, profile, error: null };
}

function normalizeMessages(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((message): message is Record<string, unknown> => Boolean(message) && typeof message === "object")
    .slice(-40);
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const messages = normalizeMessages(body.messages);
    const prompt = String(
      body.prompt ?? messages.filter((m) => m.role === "user").at(-1)?.content ?? "",
    ).trim();

    if (!prompt) {
      return NextResponse.json({ error: "prompt or messages are required." }, { status: 400 });
    }

    const requestedConversationId =
      typeof body.conversation_id === "string" ? body.conversation_id : null;
    const conversationId = await ensureGenieConversation(auth.supabase, {
      userId: auth.user!.id,
      conversationId: requestedConversationId,
      messages,
      prompt,
    });
    const composioSessionIds =
      body.composio_session_ids && typeof body.composio_session_ids === "object"
        ? (body.composio_session_ids as Record<string, string>)
        : {};
    const clientAssistantId =
      typeof body.client_assistant_id === "string" ? body.client_assistant_id : null;
    const source =
      body.source === "homev2" || body.source === "panel"
        ? (body.source as GenieJobSource)
        : "panel";

    const metadata: GenieJobMetadata = {
      composio_session_ids: composioSessionIds,
      client_assistant_id: clientAssistantId ?? undefined,
      source,
      step_index: 0,
    };

    const { data: job, error: insertError } = await auth.supabase
      .from("genie_background_jobs")
      .insert({
        user_id: auth.user!.id,
        conversation_id: conversationId,
        job_type: "agent",
        status: "queued",
        prompt,
        messages,
        message: "Queued…",
        progress_phase: "queued",
        metadata,
      })
      .select("id")
      .single();

    if (insertError || !job) {
      return NextResponse.json(
        { error: insertError?.message || "Failed to create Genie background job" },
        { status: 500 },
      );
    }

    const origin = request.nextUrl.origin;
    const cookieHeader = request.headers.get("cookie") ?? "";

    after(async () => {
      try {
        await runGenieAgentBackgroundJob({
          jobId: job.id,
          origin,
          cookieHeader,
          conversationId,
          composioSessionIds,
          messages,
        });
      } catch (error) {
        console.error("[genie/agent/start-background] background job failed", job.id, error);
      }
    });

    return NextResponse.json({ jobId: job.id }, { status: 202 });
  } catch (error) {
    console.error("[genie/agent/start-background]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
