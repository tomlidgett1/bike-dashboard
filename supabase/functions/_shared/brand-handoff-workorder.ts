import type { BrandApiDebugCollector } from './brand-api-debug.ts';
import { getOptionalEnv } from './env.ts';
import { normaliseToE164 } from './phone-normalise.ts';

const HANDOFF_DEFAULT_NOTE = 'Callback requested over Nest';
const HANDOFF_STATUS_LABEL = 'Nest';

function truncateForLog(text: string, max = 8000): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function compact(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function buildHandoffWorkorderComments(
  latestUserMessage: string,
  threadSummary?: string | null,
): string {
  const latest = compact(latestUserMessage);
  const summary = compact(threadSummary ?? '');
  const parts = ['Callback requested.'];

  if (latest) {
    parts.push(`Latest message: ${latest}`);
  }
  if (summary && summary !== latest) {
    parts.push(`Context: ${summary}`);
  }

  return parts.join(' ').slice(0, 400);
}

export async function createBrandHandoffWorkorder(
  params: {
    brandKey: string;
    customerPhone: string;
    latestUserMessage: string;
    threadSummary?: string | null;
  },
  brandApiDebug?: BrandApiDebugCollector,
): Promise<{ ok: true; workorder_id: number } | { ok: false; error: string }> {
  const supabaseUrl = getOptionalEnv('SUPABASE_URL') ?? getOptionalEnv('PROJECT_URL');
  const sharedSecret = getOptionalEnv('INTERNAL_EDGE_SHARED_SECRET') ?? getOptionalEnv('NEST_INTERNAL_EDGE_SHARED_SECRET');
  if (!supabaseUrl || !sharedSecret) {
    return { ok: false, error: 'edge function URL or shared secret not configured' };
  }

  const customerPhoneE164 = normaliseToE164(params.customerPhone);
  if (!customerPhoneE164) {
    return { ok: false, error: 'customer phone is not a valid E.164 number' };
  }

  const comments = buildHandoffWorkorderComments(params.latestUserMessage, params.threadSummary);
  const url = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/lightspeed-create-workorder`;
  const t0 = Date.now();

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': sharedSecret,
      },
      body: JSON.stringify({
        brand_key: params.brandKey,
        customer_phone_e164: customerPhoneE164,
        comments,
        default_note: HANDOFF_DEFAULT_NOTE,
        source_type: 'handoff',
        workorder_status_label: HANDOFF_STATUS_LABEL,
      }),
    });

    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      /* fall through */
    }

    if (!res.ok || data.ok === false) {
      const err = typeof data.error === 'string' ? data.error : `http ${res.status}`;
      brandApiDebug?.record({
        service: 'edge_function',
        operation: 'POST functions/v1/lightspeed-create-workorder (handoff)',
        duration_ms: Date.now() - t0,
        http_status: res.status,
        request: {
          brand_key: params.brandKey,
          customer_phone_e164: customerPhoneE164,
          source_type: 'handoff',
        },
        response: truncateForLog(text),
        error: err,
      });
      return { ok: false, error: err };
    }

    const wid = Number(data.workorder_id);
    if (!Number.isFinite(wid) || wid <= 0) {
      brandApiDebug?.record({
        service: 'edge_function',
        operation: 'POST functions/v1/lightspeed-create-workorder (handoff)',
        duration_ms: Date.now() - t0,
        http_status: res.status,
        request: {
          brand_key: params.brandKey,
          customer_phone_e164: customerPhoneE164,
          source_type: 'handoff',
        },
        response: truncateForLog(text),
        error: 'missing workorder_id',
      });
      return { ok: false, error: 'create-workorder did not return a workorder_id' };
    }

    brandApiDebug?.record({
      service: 'edge_function',
      operation: 'POST functions/v1/lightspeed-create-workorder (handoff)',
      duration_ms: Date.now() - t0,
      http_status: res.status,
      request: {
        brand_key: params.brandKey,
        customer_phone_e164: customerPhoneE164,
        source_type: 'handoff',
      },
      response: { workorder_id: Math.trunc(wid) },
    });

    return { ok: true, workorder_id: Math.trunc(wid) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
