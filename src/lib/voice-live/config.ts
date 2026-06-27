export const VOICE_LIVE_API_VERSION = "2026-06-01-preview";

export const VOICE_LIVE_MODEL = "gpt-realtime-mini";

export const VOICE_LIVE_SAMPLE_RATE = 24000;

/** Default MAI-Voice-2 voice — Australian English. */
export const DEFAULT_MAI_VOICE = "en-AU-Lisa:MAI-Voice-2";

export const MAI_VOICE_OPTIONS = [
  { id: "en-AU-Lisa:MAI-Voice-2", label: "Lisa (en-AU, female)" },
  { id: "en-US-Olivia:MAI-Voice-2", label: "Olivia (en-US, female)" },
  { id: "en-US-Ethan:MAI-Voice-2", label: "Ethan (en-US, male)" },
  { id: "en-US-Harper:MAI-Voice-2", label: "Harper (en-US, female)" },
] as const;

export const MAI_VOICE_STYLES = [
  "happy",
  "excited",
  "hopeful",
  "softvoice",
  "whispering",
  "surprised",
] as const;
