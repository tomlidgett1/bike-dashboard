import { getOptionalEnv } from './env.ts';
import { sanitiseElevenLabsDynamicVariables } from './elevenlabs-dynamic-vars.ts';
import { getInternalEdgeSharedSecret } from './internal-auth.ts';

const encoder = new TextEncoder();

function formatElevenLabsDialError(
  status: number,
  payload: Record<string, unknown>,
): string {
  const detail = payload.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object') {
          const row = entry as Record<string, unknown>;
          const msg = typeof row.msg === 'string' ? row.msg : '';
          const loc = Array.isArray(row.loc) ? row.loc.join('.') : '';
          return [loc, msg].filter(Boolean).join(': ');
        }
        return '';
      })
      .filter(Boolean);
    if (parts.length > 0) return parts.join('; ');
  }
  if (typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message;
  }
  return `ElevenLabs call failed: ${status}`;
}

export type ElevenLabsOutboundResult = {
  conversationId: string | null;
  callSid: string | null;
  sipCallId: string | null;
  telephonyProvider: 'twilio_native' | 'sip_trunk';
  raw: Record<string, unknown>;
};

export async function resolvePhoneNumberId(
  agentId: string,
  opts?: { preferAgentAssignment?: boolean },
): Promise<string> {
  if (!opts?.preferAgentAssignment) {
    const explicit = getOptionalEnv('ELEVENLABS_AGENT_PHONE_NUMBER_ID');
    if (explicit) return explicit;
  }
  const apiKey = getOptionalEnv('ELEVENLABS_API_KEY');
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not configured');
  const response = await fetch('https://api.elevenlabs.io/v1/convai/phone-numbers/', {
    headers: { 'xi-api-key': apiKey },
  });
  if (!response.ok) throw new Error(`ElevenLabs phone lookup failed: ${response.status}`);
  const payload = await response.json();
  const numbers = Array.isArray(payload) ? payload : (payload.phone_numbers || payload.phoneNumbers || []);
  const match = numbers.find((n: Record<string, unknown>) =>
    (n.assigned_agent as Record<string, unknown> | undefined)?.agent_id === agentId
  );
  const id = match?.phone_number_id || match?.id;
  if (!id || typeof id !== 'string') {
    throw new Error(`No ElevenLabs phone number assigned to agent ${agentId}`);
  }
  return id;
}

export async function startElevenLabsOutboundCall(input: {
  agentId: string;
  phoneNumberId: string;
  toNumber: string;
  /** Requires ELEVENLABS_ALLOW_CONVERSATION_CONFIG_OVERRIDE=true and agent security override access. */
  firstMessage?: string;
  /** Requires ELEVENLABS_ALLOW_CONVERSATION_CONFIG_OVERRIDE=true and agent security override access. */
  agentPromptOverride?: string;
  /** Requires ELEVENLABS_ALLOW_CONVERSATION_CONFIG_OVERRIDE=true and agent security override access. */
  waitForCalleeFirst?: boolean;
  dynamicVariables: Record<string, unknown>;
  sipPhoneNumberId?: string | null;
}): Promise<ElevenLabsOutboundResult> {
  const apiKey = getOptionalEnv('ELEVENLABS_API_KEY');
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not configured');

  const sipPhoneNumberId = input.sipPhoneNumberId ?? getOptionalEnv('ELEVENLABS_SIP_AGENT_PHONE_NUMBER_ID');
  const outboundEndpoint = sipPhoneNumberId
    ? 'https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call'
    : 'https://api.elevenlabs.io/v1/convai/twilio/outbound-call';

  const agentOverride: Record<string, unknown> = {};
  const allowConversationConfigOverride =
    (getOptionalEnv('ELEVENLABS_ALLOW_CONVERSATION_CONFIG_OVERRIDE') || 'false') === 'true';
  if (allowConversationConfigOverride) {
    const promptOverride = input.agentPromptOverride?.trim();
    if (promptOverride) {
      agentOverride.prompt = { prompt: promptOverride };
    }
    if (input.waitForCalleeFirst) {
      agentOverride.first_message = '';
    } else if (typeof input.firstMessage === 'string' && input.firstMessage.trim().length > 0) {
      agentOverride.first_message = input.firstMessage.trim();
    }
  }

  const initiationClientData: Record<string, unknown> = {
    dynamic_variables: sanitiseElevenLabsDynamicVariables(input.dynamicVariables),
  };
  if (Object.keys(agentOverride).length > 0) {
    initiationClientData.conversation_config_override = { agent: agentOverride };
  }

  const response = await fetch(outboundEndpoint, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent_id: input.agentId,
      agent_phone_number_id: sipPhoneNumberId || input.phoneNumberId,
      to_number: input.toNumber,
      call_recording_enabled: true,
      conversation_initiation_client_data: initiationClientData,
    }),
  });

  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || payload.success === false) {
    const reason = formatElevenLabsDialError(response.status, payload);
    console.error('[elevenlabs-outbound] dial rejected:', { status: response.status, payload });
    throw new Error(reason);
  }

  return {
    conversationId: typeof payload.conversation_id === 'string' ? payload.conversation_id : null,
    callSid: typeof payload.callSid === 'string'
      ? payload.callSid
      : typeof payload.call_sid === 'string'
      ? payload.call_sid
      : null,
    sipCallId: typeof payload.sip_call_id === 'string' ? payload.sip_call_id : null,
    telephonyProvider: sipPhoneNumberId ? 'sip_trunk' : 'twilio_native',
    raw: payload,
  };
}

export async function fetchElevenLabsConversation(conversationId: string): Promise<Record<string, unknown>> {
  const apiKey = getOptionalEnv('ELEVENLABS_API_KEY');
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not configured');
  const response = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(conversationId)}`,
    { headers: { 'xi-api-key': apiKey } },
  );
  if (!response.ok) throw new Error(`ElevenLabs conversation fetch failed: ${response.status}`);
  return await response.json() as Record<string, unknown>;
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

export async function buildConversationRecordingProxyUrl(
  conversationId: string,
  proxyFunctionName: 'buzz-recording-audio' | 'nest-outbound-recording-audio',
): Promise<string | null> {
  const baseUrl = getOptionalEnv('SUPABASE_URL')?.replace(/\/$/, '');
  const secret =
    getInternalEdgeSharedSecret() ||
    getOptionalEnv('SUPABASE_SECRET_KEY') ||
    getOptionalEnv('NEW_SUPABASE_SECRET_KEY');
  if (!baseUrl || !secret || !conversationId) return null;
  const expires = String(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const token = await hmacHex(secret, `${conversationId}.${expires}`);
  const params = new URLSearchParams({ conversation_id: conversationId, expires, token });
  return `${baseUrl}/functions/v1/${proxyFunctionName}?${params.toString()}`;
}

export async function buildJobRecordingProxyUrl(
  jobId: string,
  proxyFunctionName: 'nest-outbound-recording-audio',
): Promise<string | null> {
  const baseUrl = getOptionalEnv('SUPABASE_URL')?.replace(/\/$/, '');
  const secret =
    getInternalEdgeSharedSecret() ||
    getOptionalEnv('SUPABASE_SECRET_KEY') ||
    getOptionalEnv('NEW_SUPABASE_SECRET_KEY');
  if (!baseUrl || !secret || !jobId) return null;
  const expires = String(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const sig = await hmacHex(secret, `${jobId}.${expires}`);
  const params = new URLSearchParams({ jobId, expires, sig });
  return `${baseUrl}/functions/v1/${proxyFunctionName}?${params.toString()}`;
}

export function extractTwilioCallSidFromSummary(summary: Record<string, unknown>): string | null {
  const metadata = summary.metadata as Record<string, unknown> | undefined;
  const phoneCall = metadata?.phone_call as Record<string, unknown> | undefined;
  return typeof phoneCall?.call_sid === 'string' && phoneCall.call_sid.trim()
    ? phoneCall.call_sid.trim()
    : null;
}

export function parseConversationOutcome(data: Record<string, unknown>): {
  terminalStatus: 'completed' | 'failed' | 'no_answer' | 'calling';
  answered: boolean | null;
  durationSeconds: number | null;
  summary: Record<string, unknown>;
  recordingAvailable: boolean;
} {
  const analysis = (data.analysis || {}) as Record<string, unknown>;
  const metadata = (data.metadata || {}) as Record<string, unknown>;
  const transcript = Array.isArray(data.transcript)
    ? data.transcript as Array<Record<string, unknown>>
    : [];
  const hasAudio = Boolean(data.has_audio);
  const callSuccessful = analysis.call_successful;
  const durationSeconds = typeof metadata.call_duration_secs === 'number'
    ? Math.round(metadata.call_duration_secs)
    : typeof analysis.call_duration_secs === 'number'
    ? Math.round(analysis.call_duration_secs)
    : null;

  let terminalStatus: 'completed' | 'failed' | 'no_answer' | 'calling' = 'calling';
  if (data.status === 'failed') {
    terminalStatus = 'failed';
  } else if (data.status === 'done') {
    terminalStatus = callSuccessful === false || (durationSeconds != null && durationSeconds < 3)
      ? 'no_answer'
      : 'completed';
  }

  const answered = terminalStatus === 'completed'
    ? true
    : terminalStatus === 'no_answer'
    ? false
    : null;

  return {
    terminalStatus,
    answered,
    durationSeconds,
    recordingAvailable: hasAudio,
    summary: {
      outcome_summary: String(
        analysis.transcript_summary || 'Call finished, but ElevenLabs did not return a transcript summary.',
      ),
      call_successful: callSuccessful ?? null,
      transcript: transcript.map((t) => ({
        role: t.role,
        message: t.message,
        time_in_call_secs: t.time_in_call_secs,
      })),
      metadata,
    },
  };
}

export async function fetchTwilioCallStatus(callSid: string): Promise<string | null> {
  const sid = getOptionalEnv('TWILIO_ACCOUNT_SID');
  const token = getOptionalEnv('TWILIO_AUTH_TOKEN');
  if (!sid || !token) return null;
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Calls/${encodeURIComponent(callSid)}.json`,
    { headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}` } },
  );
  if (!response.ok) return null;
  const data = await response.json() as { status?: string };
  return data.status ?? null;
}
