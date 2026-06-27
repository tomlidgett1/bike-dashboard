export type PhoneAiNumberRow = {
  id: string;
  user_id: string;
  twilio_phone_number_e164: string;
  twilio_phone_number_sid: string;
  label: string;
  enabled: boolean;
  openai_model: string;
  voice: string;
  instructions: string;
  created_at: string;
  updated_at: string;
};

export type PhoneAiCallSessionRow = {
  id: string;
  phone_ai_number_id: string | null;
  call_sid: string;
  stream_sid: string | null;
  from_e164: string | null;
  to_e164: string | null;
  status: "ringing" | "active" | "completed" | "failed";
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  transcript: Array<{ role: string; text: string; at?: string }>;
  latency_metrics: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type TwilioIncomingNumber = {
  sid: string;
  phoneNumber: string;
  friendlyName: string;
};

export const OPENAI_REALTIME_MODELS = [
  { id: "gpt-realtime-mini", label: "GPT Realtime Mini (fastest)" },
  { id: "gpt-realtime-2", label: "GPT Realtime 2 (smarter, slower)" },
] as const;

export const OPENAI_REALTIME_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "marin",
  "sage",
  "shimmer",
  "verse",
  "cedar",
] as const;
