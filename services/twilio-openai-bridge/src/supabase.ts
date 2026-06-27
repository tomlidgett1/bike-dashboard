import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getConfig } from "./config.js";

export type PhoneAiNumberConfig = {
  id: string;
  twilio_phone_number_e164: string;
  openai_model: string;
  voice: string;
  instructions: string;
  enabled: boolean;
};

export type TranscriptTurn = {
  role: "user" | "assistant";
  text: string;
  at: string;
};

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (client) return client;
  const { supabaseUrl, supabaseServiceKey } = getConfig();
  if (!supabaseUrl || !supabaseServiceKey) return null;
  client = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export async function loadNumberConfig(
  toE164: string,
): Promise<PhoneAiNumberConfig | null> {
  const supabase = getClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("phone_ai_numbers")
    .select("id, twilio_phone_number_e164, openai_model, voice, instructions, enabled")
    .eq("twilio_phone_number_e164", toE164)
    .maybeSingle();

  if (error || !data || !data.enabled) return null;
  return data as PhoneAiNumberConfig;
}

export async function upsertCallSession(input: {
  callSid: string;
  streamSid?: string;
  fromE164?: string;
  toE164?: string;
  status: "ringing" | "active" | "completed" | "failed";
  phoneAiNumberId?: string;
  transcript?: TranscriptTurn[];
  latencyMetrics?: Record<string, unknown>;
  errorMessage?: string;
  durationSeconds?: number;
}): Promise<void> {
  const supabase = getClient();
  if (!supabase) return;

  const row: Record<string, unknown> = {
    call_sid: input.callSid,
    status: input.status,
    updated_at: new Date().toISOString(),
  };

  if (input.streamSid) row.stream_sid = input.streamSid;
  if (input.fromE164) row.from_e164 = input.fromE164;
  if (input.toE164) row.to_e164 = input.toE164;
  if (input.phoneAiNumberId) row.phone_ai_number_id = input.phoneAiNumberId;
  if (input.transcript) row.transcript = input.transcript;
  if (input.latencyMetrics) row.latency_metrics = input.latencyMetrics;
  if (input.errorMessage) row.error_message = input.errorMessage;
  if (input.durationSeconds != null) row.duration_seconds = input.durationSeconds;
  if (input.status === "completed" || input.status === "failed") {
    row.ended_at = new Date().toISOString();
  }

  const { error } = await supabase.from("phone_ai_call_sessions").upsert(row, {
    onConflict: "call_sid",
  });

  if (error) {
    console.error("[supabase] upsertCallSession failed:", error.message);
  }
}

export async function markCallStarted(callSid: string): Promise<void> {
  const supabase = getClient();
  if (!supabase) return;

  await supabase
    .from("phone_ai_call_sessions")
    .update({ status: "active", started_at: new Date().toISOString() })
    .eq("call_sid", callSid);
}
