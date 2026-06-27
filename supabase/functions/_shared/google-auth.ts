// ============================================================================
// Google API auth — service-account JWT -> OAuth2 access token (Web Crypto).
//
// Powers the Search Console, URL Inspection and Merchant API handlers. Provide a
// service-account key JSON in the GOOGLE_SERVICE_ACCOUNT_JSON secret (the SA must
// be added as an owner/full user on the GSC property / Merchant account).
//
// Optional: returns null when no SA is configured, so the Google-dependent
// handlers no-op cleanly instead of failing the whole run.
// ============================================================================

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

function loadServiceAccount(): ServiceAccount | null {
  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as ServiceAccount;
    if (!sa.client_email || !sa.private_key) return null;
    return sa;
  } catch {
    console.warn('[google-auth] GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
    return null;
  }
}

export function googleConfigured(): boolean {
  return loadServiceAccount() !== null;
}

// Precise reason the Google integration is/ isn't usable — surfaced in task
// results so the dashboard can say exactly what's wrong (vs a vague "no creds").
export function googleConfigStatus(): { ok: boolean; reason: string } {
  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!raw) return { ok: false, reason: 'GOOGLE_SERVICE_ACCOUNT_JSON not set' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, reason: 'GOOGLE_SERVICE_ACCOUNT_JSON is a string, not the service-account object — paste the FULL key file' };
  }
  const sa = parsed as Record<string, unknown>;
  if (!sa.client_email || !sa.private_key) {
    return {
      ok: false,
      reason: 'service-account JSON is missing client_email/private_key — looks like only the private key was pasted; set the WHOLE downloaded key file',
    };
  }
  return { ok: true, reason: 'ok' };
}

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlJson(obj: unknown): string {
  return base64url(new TextEncoder().encode(JSON.stringify(obj)));
}

// PEM (PKCS#8) -> ArrayBuffer of the DER body.
function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const der = atob(body);
  const buf = new Uint8Array(der.length);
  for (let i = 0; i < der.length; i++) buf[i] = der.charCodeAt(i);
  return buf.buffer;
}

async function signRS256(input: string, privateKeyPem: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input));
  return base64url(new Uint8Array(sig));
}

// Cache tokens per scope-set for their lifetime (~1h) to avoid re-minting.
const tokenCache = new Map<string, { token: string; exp: number }>();

/**
 * Mint (or reuse) a Google OAuth2 access token for the given scopes.
 * Returns null if no service account is configured.
 */
export async function getGoogleAccessToken(scopes: string[]): Promise<string | null> {
  const sa = loadServiceAccount();
  if (!sa) return null;

  const cacheKey = scopes.slice().sort().join(' ');
  const cached = tokenCache.get(cacheKey);
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;

  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.client_email,
    scope: scopes.join(' '),
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  };

  try {
    const unsigned = `${base64urlJson(header)}.${base64urlJson(claims)}`;
    const signature = await signRS256(unsigned, sa.private_key);
    const assertion = `${unsigned}.${signature}`;

    const res = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });

    if (!res.ok) {
      console.warn(`[google-auth] token exchange HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const data = await res.json();
    const token: string | undefined = data?.access_token;
    if (!token) return null;
    tokenCache.set(cacheKey, { token, exp: now + (data.expires_in ?? 3600) });
    return token;
  } catch (err) {
    console.warn('[google-auth] failed to mint token:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

// The GSC property id (e.g. "sc-domain:yellowjersey.store"), tolerant of stray
// surrounding quotes — a quoted value mangles encodeURIComponent and the GSC API
// rejects it with 400 INVALID_ARGUMENT.
export function gscSiteProperty(): string | null {
  const v = Deno.env.get('GSC_SITE_URL');
  if (!v) return null;
  const cleaned = v.trim().replace(/^['"]+|['"]+$/g, '').trim();
  return cleaned || null;
}

// Common scopes.
export const GSC_SCOPE_READONLY = 'https://www.googleapis.com/auth/webmasters.readonly';
export const GSC_SCOPE_FULL = 'https://www.googleapis.com/auth/webmasters';
export const MERCHANT_SCOPE = 'https://www.googleapis.com/auth/content';
export const BUSINESS_SCOPE = 'https://www.googleapis.com/auth/business.manage';
