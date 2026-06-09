import type { SupabaseClient } from "@supabase/supabase-js";

function conversationTitle(messages: Record<string, unknown>[], prompt: string): string {
  const firstUser = messages.find((message) => message.role === "user");
  const raw = String(firstUser?.content ?? prompt).trim();
  if (!raw) return "Conversation";
  return raw.slice(0, 60) + (raw.length > 60 ? "…" : "");
}

/**
 * Ensures a genie_conversations row exists before linking a background job.
 * Home v2 assigns client-side UUIDs before the conversation is saved elsewhere.
 */
export async function ensureGenieConversation(
  supabase: SupabaseClient,
  params: {
    userId: string;
    conversationId: string | null;
    messages: Record<string, unknown>[];
    prompt: string;
  },
): Promise<string | null> {
  if (!params.conversationId) return null;

  const { error } = await supabase.from("genie_conversations").upsert(
    {
      id: params.conversationId,
      user_id: params.userId,
      title: conversationTitle(params.messages, params.prompt),
      messages: params.messages,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) {
    console.error("[ensureGenieConversation]", error);
    return null;
  }

  return params.conversationId;
}
