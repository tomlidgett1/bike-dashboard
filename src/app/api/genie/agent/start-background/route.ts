import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runGenieAgentJob } from "@/lib/genie/run-genie-agent-background-job";
import { ensureGenieConversation } from "@/lib/genie/ensure-genie-conversation";
import type { Message } from "@/lib/genie/agent/context";
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

/**
 * Starts a Genie agent job and streams its events live as SSE.
 *
 * The first event is `{event: 'job', job_id}`. The run itself is detached from
 * the response: job-row persistence continues (and `after()` keeps the function
 * alive) even if the client disconnects, so navigation/refresh degrades to the
 * polling path instead of killing the run.
 */
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

    const clientAssistantId =
      typeof body.client_assistant_id === "string" ? body.client_assistant_id : null;

    // Idempotency: a double-send with the same client assistant id reuses the
    // in-flight job instead of spawning a duplicate run.
    if (clientAssistantId) {
      const { data: existingJobs } = await auth.supabase
        .from("genie_background_jobs")
        .select("id, status, metadata")
        .eq("user_id", auth.user!.id)
        .in("status", ["queued", "running"])
        .order("created_at", { ascending: false })
        .limit(10);
      const duplicate = (existingJobs ?? []).find(
        (job) => (job.metadata as GenieJobMetadata | null)?.client_assistant_id === clientAssistantId,
      );
      if (duplicate) {
        return NextResponse.json({ jobId: duplicate.id, deduplicated: true }, { status: 200 });
      }
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

    const encoder = new TextEncoder();
    let liveController: ReadableStreamDefaultController | null = null;
    let liveClosed = false;
    // Events emitted before the response stream attaches (the run starts first).
    const pendingEvents: object[] = [];

    const liveEmit = (data: object) => {
      if (liveClosed) return;
      if (!liveController) {
        pendingEvents.push(data);
        return;
      }
      try {
        liveController.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      } catch {
        liveClosed = true;
      }
    };

    let closeOnAttach = false;
    const closeLive = () => {
      if (liveClosed) return;
      if (!liveController) {
        closeOnAttach = true;
        return;
      }
      liveClosed = true;
      try {
        liveController.close();
      } catch {
        // Client already disconnected.
      }
    };

    const runPromise = runGenieAgentJob({
      jobId: job.id,
      supabase: auth.supabase,
      userId: auth.user!.id,
      storeName: auth.profile!.business_name || "your store",
      conversationId,
      composioSessionIds,
      messages: messages as unknown as Message[],
      onEvent: (event) => {
        liveEmit(event);
        if (event.event === "done" || event.event === "error") {
          closeLive();
        }
      },
    }).catch((error) => {
      console.error("[genie/agent/start-background] job run failed", job.id, error);
    }).finally(() => {
      closeLive();
    });

    // Keep the function alive past a client disconnect so the run finishes and
    // the job row records the result (polling/resume path stays intact).
    after(() => runPromise);

    const stream = new ReadableStream({
      start(controller) {
        liveController = controller;
        liveEmit({ event: "job", job_id: job.id, conversation_id: conversationId });
        const buffered = pendingEvents.splice(0, pendingEvents.length);
        for (const event of buffered) liveEmit(event);
        if (closeOnAttach) closeLive();
      },
      cancel() {
        // Client went away — stop teeing, let the run continue.
        liveClosed = true;
        liveController = null;
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("[genie/agent/start-background]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
