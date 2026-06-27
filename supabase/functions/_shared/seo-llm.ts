// ============================================================================
// LLM client for the agent — GLM-5.2 via OpenRouter (OpenAI-compatible API).
//
// GLM is used ONLY for reasoning/drafting (keyword classification, page briefs,
// title/meta options, FAQ candidates, internal-link suggestions). It never
// writes to production directly — every output passes through deterministic
// validators (see page-validator).
//
// Fully optional: if no API key is configured, callLLMJson returns null and the
// callers fall back to deterministic templates, so the agent still runs.
// ============================================================================

const DEFAULT_MODEL = 'z-ai/glm-4.6'; // override with SEO_LLM_MODEL (e.g. a GLM-5.2 id)
const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

function apiKey(): string | null {
  return Deno.env.get('SEO_LLM_API_KEY') || Deno.env.get('OPENROUTER_API_KEY') || null;
}

export function llmConfigured(): boolean {
  return !!apiKey();
}

function stripFences(text: string): string {
  return text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/i, '').trim();
}

export interface LLMRequest {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Call the model and parse a strict-JSON response. Returns null on any failure
 * (missing key, network, non-JSON) so callers degrade to templates rather than
 * throwing. T is the caller's expected JSON shape.
 */
export async function callLLMJson<T>(req: LLMRequest): Promise<T | null> {
  const key = apiKey();
  if (!key) return null;

  const model = Deno.env.get('SEO_LLM_MODEL') || DEFAULT_MODEL;
  const baseUrl = (Deno.env.get('SEO_LLM_BASE_URL') || DEFAULT_BASE_URL).replace(/\/+$/, '');

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        // OpenRouter attribution headers (harmless on other providers).
        'HTTP-Referer': Deno.env.get('SITE_URL') || 'https://yellowjersey.store',
        'X-Title': 'Yellow Jersey SEO Agent',
      },
      body: JSON.stringify({
        model,
        temperature: req.temperature ?? 0.4,
        max_tokens: req.maxTokens ?? 1500,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: `${req.system}\n\nRespond ONLY with a single valid JSON object. No prose, no markdown.` },
          { role: 'user', content: req.user },
        ],
      }),
    });

    if (!res.ok) {
      console.warn(`[seo-llm] ${model} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }

    const data = await res.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(stripFences(content)) as T;
  } catch (err) {
    console.warn('[seo-llm] call failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}
