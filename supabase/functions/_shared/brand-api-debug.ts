/**
 * Collects outbound API observability for **brand-mode** flows only.
 * Attached to `turn_traces.pending_action_debug.brand_api_calls` for /debug inspection.
 */

export type BrandApiService =
  | 'gemini'
  | 'openai'
  | 'lightspeed_oauth'
  | 'lightspeed_api'
  | 'deputy_oauth'
  | 'deputy_api'
  | 'supabase'
  | 'edge_function'
  | 'other';

export type BrandApiCallLog = {
  ts: string;
  service: BrandApiService;
  operation: string;
  duration_ms?: number;
  http_status?: number;
  request?: unknown;
  response?: unknown;
  error?: string;
};

const SENSITIVE_KEYS = new Set([
  'access_token',
  'refresh_token',
  'client_secret',
  'client_id',
  'authorization',
  'api_key',
  'password',
  'secret',
  'x-internal-secret',
  'token',
]);

/** Max JSON chars stored per request/response blob (each). */
export const BRAND_API_LOG_MAX_CHARS = 96_000;

export function truncateForLog(text: string, max = BRAND_API_LOG_MAX_CHARS): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated ${text.length - max} chars]`;
}

/** Deep-redact common secret keys (case-insensitive). */
export function redactForLog(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (value.length > BRAND_API_LOG_MAX_CHARS) return truncateForLog(value);
    return value;
  }
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redactForLog(v));
  const o = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    const low = k.toLowerCase();
    if (SENSITIVE_KEYS.has(low) || low.includes('secret') || low.includes('token') && low !== 'expires_in') {
      out[k] = typeof v === 'string' && v.length > 0 ? '[REDACTED]' : '[REDACTED]';
      continue;
    }
    out[k] = redactForLog(v);
  }
  return out;
}

export function serialiseForLog(value: unknown): unknown {
  try {
    const s = JSON.stringify(value);
    if (s.length <= BRAND_API_LOG_MAX_CHARS) return JSON.parse(s) as unknown;
    return truncateForLog(s);
  } catch {
    return String(value).slice(0, BRAND_API_LOG_MAX_CHARS);
  }
}

export class BrandApiDebugCollector {
  private readonly calls: BrandApiCallLog[] = [];

  record(partial: Omit<BrandApiCallLog, 'ts'> & { ts?: string }): void {
    this.calls.push({
      ts: partial.ts ?? new Date().toISOString(),
      service: partial.service,
      operation: partial.operation,
      duration_ms: partial.duration_ms,
      http_status: partial.http_status,
      request: partial.request !== undefined ? serialiseForLog(redactForLog(partial.request)) : undefined,
      response: partial.response !== undefined ? serialiseForLog(redactForLog(partial.response)) : undefined,
      error: partial.error,
    });
  }

  getCalls(): BrandApiCallLog[] {
    return [...this.calls];
  }
}
