import { getOptionalEnv } from './env.ts';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function getInternalEdgeSharedSecret(): string | undefined {
  return (
    getOptionalEnv('INTERNAL_EDGE_SHARED_SECRET') ??
    getOptionalEnv('NEST_INTERNAL_EDGE_SHARED_SECRET')
  );
}

export function readInternalAuthToken(req: Request): string {
  const headerSecret = req.headers.get('x-internal-secret')?.trim();
  if (headerSecret) return headerSecret;

  const authHeader = req.headers.get('Authorization') ?? '';
  return authHeader.replace(/^Bearer\s+/i, '').trim();
}

export function authorizeInternalRequest(req: Request): boolean {
  const received = readInternalAuthToken(req);
  if (!received) return false;
  const candidates = [
    getInternalEdgeSharedSecret(),
    getOptionalEnv('SUPABASE_SECRET_KEY'),
    getOptionalEnv('NEW_SUPABASE_SECRET_KEY'),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);
  if (candidates.length === 0) return false;
  return candidates.some((candidate) => timingSafeEqual(received, candidate));
}

/**
 * Authorise OpenAI-style `Bearer` to our `/v1/audio/speech` bridge.
 * Set `VOICEMODE_OPENAI_API_KEY` or project `OPENAI_API_KEY` to the same value as Cursor MCP
 * `OPENAI_API_KEY` (your real OpenAI key for STT, sent as Bearer on TTS to custom URL).
 * Alternatively `OPENAI_TTS_BRIDGE_SECRET` or NEST internal secrets.
 */
export function authorizeVoiceModeTtsRequest(req: Request): boolean {
  if (authorizeInternalRequest(req)) return true;
  const received = readInternalAuthToken(req);
  if (!received) return false;
  const voicemodeKey = getOptionalEnv('VOICEMODE_OPENAI_API_KEY') ?? getOptionalEnv('OPENAI_API_KEY');
  if (voicemodeKey && timingSafeEqual(received, voicemodeKey)) return true;
  const bridge = getOptionalEnv('OPENAI_TTS_BRIDGE_SECRET');
  return Boolean(bridge && timingSafeEqual(received, bridge));
}

export function internalJsonHeaders(secret = getInternalEdgeSharedSecret() ?? ''): Record<string, string> {
  return {
    'x-internal-secret': secret,
    'Content-Type': 'application/json',
  };
}
