import { Composio } from "npm:@composio/core@0.8.1";
import { OpenAIResponsesProvider } from "npm:@composio/openai@0.8.1";
import { getOptionalEnv, requireEnv } from "./env.ts";

let composioSingleton: Composio<OpenAIResponsesProvider> | null = null;

let composioAuthConfigMapCache: Record<string, string> | null = null;

/**
 * Toolkit slug → Composio auth config id (`ac_…` / nanoid from dashboard).
 * Required for toolkits that cannot use Composio-managed OAuth (e.g. Xero).
 *
 * Set either:
 * - `COMPOSIO_AUTH_CONFIGS` — JSON object, e.g. `{"xero":"ac_xxxxx"}`
 * - Or per-toolkit: `COMPOSIO_AUTH_CONFIG_XERO`, `COMPOSIO_AUTH_CONFIG_GOOGLECALENDAR`, …
 *   (suffix is the toolkit slug in UPPER_SNAKE, underscores stripped when matching slugs)
 */
function loadComposioAuthConfigMap(): Record<string, string> {
  if (composioAuthConfigMapCache) return composioAuthConfigMapCache;

  const merged: Record<string, string> = {};

  const rawJson = getOptionalEnv("COMPOSIO_AUTH_CONFIGS");
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof v !== "string" || !v.trim()) continue;
          merged[k.trim().toLowerCase().replace(/_/g, "")] = v.trim();
        }
      }
    } catch {
      console.warn("[composio-client] COMPOSIO_AUTH_CONFIGS must be a JSON object; ignoring");
    }
  }

  const prefix = "COMPOSIO_AUTH_CONFIG_";
  try {
    for (const [key, value] of Object.entries(Deno.env.toObject())) {
      if (!value?.trim() || !key.startsWith(prefix)) continue;
      if (key === "COMPOSIO_AUTH_CONFIGS") continue;
      const slug = key.slice(prefix.length).toLowerCase().replace(/_/g, "");
      if (slug.length > 0) merged[slug] = value.trim();
    }
  } catch {
    /* Deno.env.toObject unavailable — JSON map only */
  }

  composioAuthConfigMapCache = merged;
  return merged;
}

/** Sub-map of auth config ids for the given toolkit slugs (for `composio.create` → `authConfigs`). */
export function authConfigsForComposioToolkits(
  toolkits: string[],
): Record<string, string> | undefined {
  const map = loadComposioAuthConfigMap();
  if (toolkits.length === 0) {
    return Object.keys(map).length > 0 ? { ...map } : undefined;
  }
  const out: Record<string, string> = {};
  for (const t of toolkits) {
    const slug = t.trim().toLowerCase().replace(/_/g, "");
    const id = map[slug];
    if (id) out[slug] = id;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function getComposioApiKey(): string {
  const apiKey = requireEnv("COMPOSIO_API_KEY").trim();
  const lower = apiKey.toLowerCase();

  if (lower.startsWith("sk-") || lower.startsWith("sk_")) {
    throw new Error(
      "COMPOSIO_API_KEY looks like an OpenAI key. Use your Composio project API key from the Composio dashboard instead.",
    );
  }

  return apiKey;
}

export function formatComposioAuthErrorMessage(message: string): string {
  const m = message.toLowerCase();
  const looksLikeAuthFailure =
    m.includes("10401") ||
    m.includes("invalid api key") ||
    m.includes("unauthorized") ||
    m.includes("http_unauthorized");

  if (looksLikeAuthFailure) {
    return [
      message,
      "",
      "Composio auth hint: project API keys are usually `ak_…` and are sent as `x-api-key`.",
      "If the running runtime is using the wrong key, check the deployed Supabase Edge Function environment variables rather than localhost `.env.local`.",
    ].join("\n");
  }

  if (
    m.includes("auth_configs") ||
    m.includes("auth config") ||
    m.includes("toolrouterv2_badrequest") ||
    m.includes('"code":4300') ||
    m.includes("4300")
  ) {
    return [
      message,
      "",
      "Composio: this toolkit needs an Auth Config in your Composio project (dashboard → Auth configurations), then set Supabase secrets:",
      '  COMPOSIO_AUTH_CONFIGS={"xero":"<auth_config_id>"}  or  COMPOSIO_AUTH_CONFIG_XERO=<auth_config_id>',
      "See: https://docs.composio.dev/docs/using-custom-auth-configuration",
    ].join("\n");
  }

  return message;
}

export function getComposioClient(): Composio<OpenAIResponsesProvider> {
  if (composioSingleton) {
    return composioSingleton;
  }

  composioSingleton = new Composio({
    apiKey: getComposioApiKey(),
    baseURL: getOptionalEnv("COMPOSIO_BASE_URL"),
    provider: new OpenAIResponsesProvider(),
  });

  return composioSingleton!;
}
