export const DEFAULT_OPENAI_MODEL = "gpt-realtime-2";
export const DEFAULT_OPENAI_VOICE = "marin";
export const DEFAULT_INSTRUCTIONS =
  "You are Tom on a live phone call. Speak naturally — warm, relaxed, human. Use contractions and plain Australian English. Keep answers to one or two short sentences unless the caller asks for more. Never mention bikes, shops, or any business unless the caller does.";

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function getConfig() {
  return {
    port: Number(process.env.PORT ?? 8080),
    publicUrl: requireEnv("PUBLIC_BRIDGE_URL"),
    openaiApiKey: requireEnv("OPENAI_API_KEY"),
    twilioAuthToken: requireEnv("TWILIO_AUTH_TOKEN"),
    twilioAccountSid: optionalEnv("TWILIO_ACCOUNT_SID"),
    supabaseUrl: optionalEnv("SUPABASE_URL") ?? optionalEnv("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseServiceKey:
      optionalEnv("SUPABASE_SECRET_KEY") ?? optionalEnv("SUPABASE_SERVICE_ROLE_KEY"),
    internalSecret: optionalEnv("PHONE_AI_BRIDGE_INTERNAL_SECRET"),
    defaultModel: optionalEnv("PHONE_AI_DEFAULT_MODEL") ?? DEFAULT_OPENAI_MODEL,
    defaultVoice: optionalEnv("PHONE_AI_DEFAULT_VOICE") ?? DEFAULT_OPENAI_VOICE,
    defaultInstructions: optionalEnv("PHONE_AI_DEFAULT_INSTRUCTIONS") ?? DEFAULT_INSTRUCTIONS,
    transcribeInput: optionalEnv("PHONE_AI_TRANSCRIBE_INPUT") === "true",
    reasoningEffort: optionalEnv("PHONE_AI_REASONING_EFFORT") ?? "minimal",
  };
}
