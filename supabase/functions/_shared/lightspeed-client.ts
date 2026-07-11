/**
 * Lightspeed Retail (R-Series) API + OAuth helpers for Edge Functions.
 * Base: https://api.lightspeedapp.com/API/V3/Account/{accountID}/…
 * Token: https://cloud.lightspeedapp.com/auth/oauth/token
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { BrandApiDebugCollector } from './brand-api-debug.ts';
import { getOptionalEnv } from './env.ts';

export const LIGHTSPEED_API_ORIGIN = 'https://api.lightspeedapp.com';
export const LIGHTSPEED_TOKEN_URL = 'https://cloud.lightspeedapp.com/auth/oauth/token';

export type LightspeedPortalConnection = {
  brand_key: string;
  access_token: string;
  refresh_token: string;
  api_endpoint: string;
  access_expires_at: string | null;
};

export type LightspeedTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

function pickClientCreds(): { clientId: string; clientSecret: string } {
  const clientId =
    getOptionalEnv('LIGHTSPEED_OAUTH_CLIENT_ID') ?? getOptionalEnv('NEST_LIGHTSPEED_OAUTH_CLIENT_ID') ?? '';
  const clientSecret =
    getOptionalEnv('LIGHTSPEED_OAUTH_CLIENT_SECRET') ??
    getOptionalEnv('NEST_LIGHTSPEED_OAUTH_CLIENT_SECRET') ??
    '';
  if (!clientId || !clientSecret) {
    throw new Error(
      'Lightspeed OAuth client is not configured (LIGHTSPEED_OAUTH_CLIENT_ID / LIGHTSPEED_OAUTH_CLIENT_SECRET)',
    );
  }
  return { clientId, clientSecret };
}

export async function exchangeRefreshToken(
  refreshToken: string,
  brandApiDebug?: BrandApiDebugCollector,
): Promise<LightspeedTokenResponse> {
  const { clientId, clientSecret } = pickClientCreds();
  const t0 = Date.now();
  const res = await fetch(LIGHTSPEED_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    brandApiDebug?.record({
      service: 'lightspeed_oauth',
      operation: 'POST cloud.lightspeedapp.com/auth/oauth/token',
      duration_ms: Date.now() - t0,
      http_status: res.status,
      request: { grant_type: 'refresh_token' },
      error: `non-JSON (${res.status})`,
    });
    throw new Error(`Lightspeed token refresh: non-JSON response (${res.status})`);
  }
  if (!res.ok) {
    const hint = typeof data.hint === 'string' ? data.hint : '';
    const err = typeof data.error === 'string' ? data.error : 'token_error';
    brandApiDebug?.record({
      service: 'lightspeed_oauth',
      operation: 'POST cloud.lightspeedapp.com/auth/oauth/token',
      duration_ms: Date.now() - t0,
      http_status: res.status,
      request: { grant_type: 'refresh_token' },
      response: data,
      error: err,
    });
    throw new Error(`Lightspeed token refresh failed: ${err}${hint ? ` — ${hint}` : ''}`);
  }
  const access_token = data.access_token;
  const refresh_token = data.refresh_token;
  const expires_in = Number(data.expires_in);
  if (typeof access_token !== 'string' || typeof refresh_token !== 'string' || !Number.isFinite(expires_in)) {
    throw new Error('Lightspeed token refresh: invalid response shape');
  }
  brandApiDebug?.record({
    service: 'lightspeed_oauth',
    operation: 'POST cloud.lightspeedapp.com/auth/oauth/token',
    duration_ms: Date.now() - t0,
    http_status: res.status,
    request: { grant_type: 'refresh_token' },
    response: { expires_in, token_type: data.token_type, scope: data.scope },
  });
  return { access_token, refresh_token, expires_in };
}

/**
 * Persist new tokens after refresh (Lightspeed rotates refresh tokens).
 *
 * If `expectedPriorRefreshToken` is supplied this becomes a Compare-And-Swap:
 * the row is only updated when its current `refresh_token` still matches the
 * value we just exchanged. This is the cross-process guard that stops two
 * Edge invocations from both POSTing the same `refresh_token` to Lightspeed
 * (which would invalidate one chain and — under OAuth 2.1 / RFC 6819 reuse
 * detection — can revoke the entire chain, killing the connection until a
 * manual reconnect).
 *
 * Returns `{ persisted: false }` when CAS lost the race so the caller can
 * reload the row and adopt the winner's tokens instead of clobbering them.
 */
export async function persistRefreshedTokens(
  supabase: SupabaseClient,
  brandKey: string,
  tokens: LightspeedTokenResponse,
  expectedPriorRefreshToken?: string,
): Promise<{ persisted: boolean }> {
  const accessExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  let q = supabase
    .from('nest_brand_portal_connections')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      access_expires_at: accessExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('brand_key', brandKey)
    .eq('provider', 'lightspeed');
  if (expectedPriorRefreshToken) {
    q = q.eq('refresh_token', expectedPriorRefreshToken);
  }
  const { data, error } = await q.select('brand_key');
  if (error) throw new Error(`Lightspeed token save failed: ${error.message}`);
  return { persisted: Array.isArray(data) && data.length > 0 };
}

const EXPIRY_SKEW_MS = 120_000;

const LIGHTSPEED_DB_PROVIDER = 'lightspeed';

function accessTokenNeedsRefresh(accessExpiresAt: string | null): boolean {
  if (!accessExpiresAt) return true;
  const t = new Date(accessExpiresAt).getTime();
  if (!Number.isFinite(t)) return true;
  return t <= Date.now() + EXPIRY_SKEW_MS;
}

/** Lightspeed rotates refresh tokens; the previous refresh token is revoked after use. Stale reads → invalid_grant. */
function isStaleOrRevokedRefreshError(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return /invalid_grant|revoked|token.*invalid/i.test(m);
}

async function loadLightspeedConnectionRow(
  supabase: SupabaseClient,
  brandKey: string,
): Promise<LightspeedPortalConnection | null> {
  const { data, error } = await supabase
    .from('nest_brand_portal_connections')
    .select('brand_key, access_token, refresh_token, api_endpoint, access_expires_at')
    .eq('brand_key', brandKey)
    .eq('provider', LIGHTSPEED_DB_PROVIDER)
    .maybeSingle();
  if (error) throw new Error(`Lightspeed connection load failed: ${error.message}`);
  return data as LightspeedPortalConnection | null;
}

/**
 * In-process single-flight cache. Within one Edge Function invocation, all
 * concurrent callers for the same brand_key share a single refresh promise so
 * we never POST the same refresh_token to Lightspeed twice (which would burn
 * the chain via OAuth 2.1 reuse detection). Lives at module scope so the
 * Promise survives across `await` points within the same isolate.
 */
const inflightRefreshes = new Map<string, Promise<{ accessToken: string; accountId: string }>>();

function accountIdFromRow(r: LightspeedPortalConnection): string {
  const id = r.api_endpoint.trim();
  if (!id) throw new Error('Lightspeed connection missing account ID (api_endpoint)');
  return id;
}

// ── Yellow Jersey dashboard token source ────────────────────────────────────
// Since the Nest → Yellow Jersey cutover these functions run in the Yellow
// Jersey Supabase project, which also holds the dashboard's own Lightspeed
// OAuth connection (`lightspeed_connections`, AES-256-GCM encrypted, kept
// fresh by the dashboard's serialized refresher + cron). The legacy
// `nest_brand_portal_connections` chain can go stale/dead after cutover, so
// we READ the dashboard token when it is valid. We must NEVER refresh the
// dashboard connection from here — Lightspeed refresh tokens are single-use
// and rotating, and exactly one refresher may own that chain.

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function decryptDashboardToken(encrypted: string): Promise<string | null> {
  const keyHex = Deno.env.get('TOKEN_ENCRYPTION_KEY') ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) return null;
  const parts = encrypted.split(':');
  if (parts.length !== 3) return null;
  const [ivHex, tagHex, dataHex] = parts;
  try {
    const key = await crypto.subtle.importKey('raw', hexToBytes(keyHex), 'AES-GCM', false, ['decrypt']);
    // WebCrypto expects ciphertext || authTag concatenated.
    const cipherWithTag = new Uint8Array(new ArrayBuffer(dataHex.length / 2 + tagHex.length / 2));
    cipherWithTag.set(hexToBytes(dataHex), 0);
    cipherWithTag.set(hexToBytes(tagHex), dataHex.length / 2);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: hexToBytes(ivHex) }, key, cipherWithTag);
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

/**
 * Valid access token from the Yellow Jersey dashboard's own Lightspeed
 * connection for the store behind `brandKey` (users.nest_brand_key →
 * lightspeed_connections). Returns null — WITHOUT attempting any refresh —
 * when the mapping, key, or a still-valid token isn't available.
 */
export async function lookupYellowJerseyLightspeedToken(
  supabase: SupabaseClient,
  brandKey: string,
): Promise<{ accessToken: string; accountId: string } | null> {
  try {
    const { data: userRows } = await supabase
      .from('users')
      .select('user_id')
      .eq('nest_brand_key', brandKey)
      .limit(1);
    const userId = userRows?.[0]?.user_id as string | undefined;
    if (!userId) return null;

    const { data: connRows } = await supabase
      .from('lightspeed_connections')
      .select('access_token_encrypted, account_id, token_expires_at, status')
      .eq('user_id', userId)
      .limit(1);
    const conn = connRows?.[0] as
      | { access_token_encrypted: string | null; account_id: string | null; token_expires_at: string | null; status: string | null }
      | undefined;
    if (!conn?.access_token_encrypted || !conn.account_id) return null;
    if (conn.status && conn.status !== 'connected') return null;
    if (accessTokenNeedsRefresh(conn.token_expires_at)) return null; // read-only: never refresh here

    const accessToken = await decryptDashboardToken(conn.access_token_encrypted);
    if (!accessToken) return null;
    return { accessToken, accountId: String(conn.account_id) };
  } catch (err) {
    console.warn('[lightspeed] YJ dashboard token lookup failed:', (err as Error).message);
    return null;
  }
}

export async function ensureValidLightspeedAccessToken(
  supabase: SupabaseClient,
  row: LightspeedPortalConnection,
  brandApiDebug?: BrandApiDebugCollector,
): Promise<{ accessToken: string; accountId: string }> {
  const brandKey = row.brand_key;

  // Fast path: caller's row already has a valid access token.
  if (!accessTokenNeedsRefresh(row.access_expires_at)) {
    return { accessToken: row.access_token, accountId: accountIdFromRow(row) };
  }

  // Cutover path: prefer the Yellow Jersey dashboard's live token before
  // attempting to refresh the legacy Nest chain (which may be long dead —
  // e.g. ash's nest connection expired 2026-06-07 and never recovered).
  const yj = await lookupYellowJerseyLightspeedToken(supabase, brandKey);
  if (yj) {
    console.log('[lightspeed] using Yellow Jersey dashboard token for brand', brandKey);
    return yj;
  }

  // Coalesce concurrent in-process refreshes for the same brand. Without this
  // a single Edge invocation could fan two callers into two POSTs against the
  // same refresh_token, and Lightspeed would revoke the chain on the loser.
  const existing = inflightRefreshes.get(brandKey);
  if (existing) return existing;

  const refreshPromise = doRefresh(supabase, brandKey, brandApiDebug);
  inflightRefreshes.set(brandKey, refreshPromise);
  try {
    return await refreshPromise;
  } finally {
    inflightRefreshes.delete(brandKey);
  }
}

async function doRefresh(
  supabase: SupabaseClient,
  brandKey: string,
  brandApiDebug?: BrandApiDebugCollector,
): Promise<{ accessToken: string; accountId: string }> {
  // Always reload immediately before touching the OAuth endpoint so we use
  // the freshest refresh_token (another invocation may have just rotated it).
  const current = await loadLightspeedConnectionRow(supabase, brandKey);
  if (!current?.refresh_token) {
    throw new Error('Lightspeed not connected');
  }

  // Another caller may have already rotated the token between the caller's
  // SELECT and our reload — if the freshly loaded access token is still
  // valid, take it and skip the OAuth round trip entirely.
  if (!accessTokenNeedsRefresh(current.access_expires_at)) {
    return { accessToken: current.access_token, accountId: accountIdFromRow(current) };
  }

  let tokens: LightspeedTokenResponse;
  try {
    tokens = await exchangeRefreshToken(current.refresh_token, brandApiDebug);
  } catch (e) {
    if (!isStaleOrRevokedRefreshError(e)) throw e;

    // invalid_grant: the refresh_token we just used was already rotated
    // (probably by a concurrent invocation that beat us to it). Reload and
    // adopt the winner's tokens. Do NOT call exchangeRefreshToken again with
    // the same value — re-using a rotated token can trip Lightspeed's
    // OAuth 2.1 reuse detection and revoke the entire chain.
    console.warn(
      '[lightspeed] exchangeRefreshToken returned invalid_grant; reloading and adopting winner tokens:',
      brandKey,
      (e as Error).message,
    );
    const winner = await loadLightspeedConnectionRow(supabase, brandKey);
    if (
      winner?.refresh_token &&
      winner.refresh_token !== current.refresh_token &&
      !accessTokenNeedsRefresh(winner.access_expires_at)
    ) {
      return { accessToken: winner.access_token, accountId: accountIdFromRow(winner) };
    }
    throw new Error(
      `${(e as Error).message} Reconnect Lightspeed in the business portal if this continues.`,
    );
  }

  // Persist with CAS — only succeed if the row still has the refresh_token
  // we just exchanged. If a concurrent process won the race, our minted
  // chain is dead; reload and adopt theirs.
  const { persisted } = await persistRefreshedTokens(
    supabase,
    brandKey,
    tokens,
    current.refresh_token,
  );
  if (persisted) {
    return { accessToken: tokens.access_token, accountId: accountIdFromRow(current) };
  }

  console.warn(
    '[lightspeed] persistRefreshedTokens CAS lost; another process refreshed first for',
    brandKey,
  );
  const winner = await loadLightspeedConnectionRow(supabase, brandKey);
  if (winner?.access_token && !accessTokenNeedsRefresh(winner.access_expires_at)) {
    return { accessToken: winner.access_token, accountId: accountIdFromRow(winner) };
  }
  // Edge case: row vanished or the winner's token is also already expired.
  // Use the freshly minted token we just got back from Lightspeed — we have
  // no other valid choice. Best-effort un-conditional persist so subsequent
  // callers don't re-exchange.
  await persistRefreshedTokens(supabase, brandKey, tokens);
  return { accessToken: tokens.access_token, accountId: accountIdFromRow(current) };
}

export type LightspeedListEnvelope = {
  attrs: Record<string, string>;
  items: unknown[];
};

export function getAttributes(root: Record<string, unknown>): Record<string, string> {
  const raw = root['@attributes'];
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v != null) out[k] = String(v);
  }
  return out;
}

export function normaliseRelationArray<T = Record<string, unknown>>(node: unknown, relationKey: string): T[] {
  if (node == null) return [];
  if (Array.isArray(node)) {
    return node.filter((x) => x && typeof x === 'object') as T[];
  }
  if (typeof node === 'object') {
    const o = node as Record<string, unknown>;
    const inner = o[relationKey];
    if (inner == null) return [];
    if (Array.isArray(inner)) return inner.filter((x) => x && typeof x === 'object') as T[];
    if (typeof inner === 'object') return [inner as T];
  }
  return [];
}

/**
 * Unwrap Lightspeed relation blobs: `{ ItemShop: {...} }`, arrays of those wrappers, or bare rows.
 * `normaliseRelationArray` alone keeps wrapper objects when the parent is an array.
 */
export function extractLightspeedRelationRows(
  node: unknown,
  relationNames: string[],
): Record<string, unknown>[] {
  if (node == null) return [];
  if (Array.isArray(node)) {
    const out: Record<string, unknown>[] = [];
    for (const el of node) {
      if (!el || typeof el !== 'object') continue;
      const o = el as Record<string, unknown>;
      let unwrapped = false;
      for (const name of relationNames) {
        const inner = o[name];
        if (inner == null) continue;
        unwrapped = true;
        if (Array.isArray(inner)) {
          for (const x of inner) {
            if (x && typeof x === 'object') out.push(x as Record<string, unknown>);
          }
        } else if (typeof inner === 'object') {
          out.push(inner as Record<string, unknown>);
        }
        break;
      }
      if (!unwrapped) out.push(o);
    }
    return out;
  }
  if (typeof node === 'object') {
    const o = node as Record<string, unknown>;
    for (const name of relationNames) {
      const inner = o[name];
      if (inner == null) continue;
      if (Array.isArray(inner)) {
        return inner.filter((x) => x && typeof x === 'object') as Record<string, unknown>[];
      }
      if (typeof inner === 'object') return [inner as Record<string, unknown>];
    }
  }
  return [];
}

/** Flat ItemShop rows from an Item payload (`ItemShops` / `itemShops`). */
export function normaliseItemShopsFromItem(item: Record<string, unknown>): unknown[] {
  const node = item.ItemShops ?? item.itemShops;
  return extractLightspeedRelationRows(node, ['ItemShop', 'itemShop']) as unknown[];
}

export function normaliseRootItems(root: Record<string, unknown>, entityKey: string): unknown[] {
  const node = root[entityKey];
  if (node == null) return [];
  if (Array.isArray(node)) return node;
  if (typeof node === 'object') return [node];
  return [];
}

export async function lightspeedGetJson(
  accessToken: string,
  url: string,
  opts?: { signal?: AbortSignal; max429Retries?: number; brandApiDebug?: BrandApiDebugCollector },
): Promise<Record<string, unknown>> {
  return lightspeedJsonRequest(accessToken, url, { method: 'GET', ...opts });
}

/**
 * Generic Lightspeed JSON request with retries on 429.
 * Used for POST/PUT workorder + customer mutations as well as GET reads.
 */
export async function lightspeedJsonRequest(
  accessToken: string,
  url: string,
  opts: {
    method: 'GET' | 'POST' | 'PUT';
    body?: Record<string, unknown>;
    signal?: AbortSignal;
    max429Retries?: number;
    brandApiDebug?: BrandApiDebugCollector;
  },
): Promise<Record<string, unknown>> {
  const max429 = opts.max429Retries ?? 8;
  let attempt429 = 0;
  const dbg = opts.brandApiDebug;
  const safeUrl = (() => {
    try {
      const u = new URL(url);
      return `${u.origin}${u.pathname}${u.search ? u.search : ''}`;
    } catch {
      return url.slice(0, 200);
    }
  })();

  while (true) {
    const t0 = Date.now();
    const res = await fetch(url, {
      method: opts.method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
    const text = await res.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      dbg?.record({
        service: 'lightspeed_api',
        operation: `${opts.method} ${safeUrl}`,
        duration_ms: Date.now() - t0,
        http_status: res.status,
        request: opts.body ?? null,
        error: `non-JSON (${res.status})`,
      });
      throw new Error(`Lightspeed API non-JSON (${res.status}) for ${url.slice(0, 120)}`);
    }

    if (res.status === 429 && attempt429 < max429) {
      dbg?.record({
        service: 'lightspeed_api',
        operation: `${opts.method} ${safeUrl} (429 retry ${attempt429 + 1})`,
        duration_ms: Date.now() - t0,
        http_status: res.status,
        request: opts.body ?? null,
        response: { message: data.message ?? 'rate limited' },
      });
      attempt429++;
      const ra = Number(res.headers.get('retry-after'));
      const waitMs = Number.isFinite(ra) && ra > 0
        ? Math.min(ra * 1000, 60_000)
        : Math.min(2000 * attempt429, 30_000);
      console.warn(`[lightspeed] 429, backing off ${waitMs}ms (attempt ${attempt429}/${max429})`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    if (res.status === 401) {
      dbg?.record({
        service: 'lightspeed_api',
        operation: `${opts.method} ${safeUrl}`,
        duration_ms: Date.now() - t0,
        http_status: 401,
        request: opts.body ?? null,
        error: 'unauthorised',
      });
      throw new Error('Lightspeed API unauthorised (access token may be expired)');
    }
    if (!res.ok) {
      const msg = typeof data.message === 'string' ? data.message : text.slice(0, 200);
      dbg?.record({
        service: 'lightspeed_api',
        operation: `${opts.method} ${safeUrl}`,
        duration_ms: Date.now() - t0,
        http_status: res.status,
        request: opts.body ?? null,
        response: data,
        error: msg,
      });
      throw new Error(`Lightspeed API ${res.status}: ${msg}`);
    }
    dbg?.record({
      service: 'lightspeed_api',
      operation: `${opts.method} ${safeUrl}`,
      duration_ms: Date.now() - t0,
      http_status: res.status,
      request: opts.body ?? null,
      response: data,
    });
    return data;
  }
}

/** Follow @attributes.next until exhausted. */
export async function fetchAllPages(
  accessToken: string,
  firstUrl: string,
  onRateLimitMs = 350,
  brandApiDebug?: BrandApiDebugCollector,
): Promise<LightspeedListEnvelope[]> {
  const pages: LightspeedListEnvelope[] = [];
  let url: string | null = firstUrl;
  while (url) {
    const data = await lightspeedGetJson(accessToken, url, { brandApiDebug });
    const attrs = getAttributes(data);
    const keys = Object.keys(data).filter((k) => k !== '@attributes');
    const entityKey = keys.find((k) => k !== 'message') ?? keys[0] ?? '';
    const items = entityKey ? normaliseRootItems(data, entityKey) : [];
    pages.push({ attrs, items });
    const next = attrs.next?.trim();
    url = next && next.length > 0 ? next : null;
    if (url && onRateLimitMs > 0) {
      await new Promise((r) => setTimeout(r, onRateLimitMs));
    }
  }
  return pages;
}

export function buildAccountResourceUrl(
  accountId: string,
  resourcePath: string,
  query: Record<string, string | undefined>,
): string {
  const path = resourcePath.replace(/^\//, '');
  const base = `${LIGHTSPEED_API_ORIGIN}/API/V3/Account/${encodeURIComponent(accountId)}/${path}`;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== '') sp.set(k, v);
  }
  const q = sp.toString();
  return q ? `${base}?${q}` : base;
}

export function parseBoolLoose(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return null;
}

export function parseBigIntLoose(v: unknown): bigint | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return BigInt(Math.trunc(v));
  const s = String(v).trim();
  if (!s || !/^-?\d+$/.test(s)) return null;
  try {
    return BigInt(s);
  } catch {
    return null;
  }
}

/** Item payloads sometimes nest the id under `@attributes` (Lightspeed JSON variants). */
export function parseLightspeedItemId(item: Record<string, unknown>): bigint | null {
  const direct = parseBigIntLoose(item.itemID);
  if (direct !== null) return direct;
  const attrs = item['@attributes'];
  if (attrs && typeof attrs === 'object') {
    const a = attrs as Record<string, unknown>;
    return parseBigIntLoose(a.itemID);
  }
  return null;
}

export function parseNumberLoose(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Default sell price from Item JSON: `Prices.ItemPrice[]` (per Retail API samples), or top-level `ItemPrice` / `ItemPrices`.
 * Prefer `useType` Default / `useTypeID` 1.
 */
export function parseLightspeedItemDefaultPrice(item: Record<string, unknown>): number | null {
  const rows: Record<string, unknown>[] = [];

  const pricesNode = item.Prices ?? item.prices;
  if (pricesNode && typeof pricesNode === 'object') {
    for (const r of normaliseRelationArray<Record<string, unknown>>(pricesNode, 'ItemPrice')) {
      rows.push(r);
    }
  }

  const ip = item.ItemPrice ?? item.itemPrice;
  if (ip != null) {
    if (Array.isArray(ip)) {
      for (const x of ip) {
        if (x && typeof x === 'object') rows.push(x as Record<string, unknown>);
      }
    } else if (typeof ip === 'object') {
      const nested = normaliseRelationArray<Record<string, unknown>>(ip, 'ItemPrice');
      if (nested.length > 0) {
        for (const r of nested) rows.push(r);
      } else if ((ip as Record<string, unknown>).amount != null || (ip as Record<string, unknown>).Amount != null) {
        rows.push(ip as Record<string, unknown>);
      }
    }
  }

  const itemPrices = item.ItemPrices ?? item.itemPrices;
  if (itemPrices && typeof itemPrices === 'object') {
    for (const r of normaliseRelationArray<Record<string, unknown>>(itemPrices, 'ItemPrice')) {
      rows.push(r);
    }
  }

  if (rows.length === 0) return null;

  const pickAmount = (r: Record<string, unknown>): number | null =>
    parseNumberLoose(r.amount ?? r.Amount);

  const defaultRow = rows.find((r) => String(r.useType ?? r.UseType ?? '').toLowerCase() === 'default');
  if (defaultRow) {
    const a = pickAmount(defaultRow);
    if (a != null) return a;
  }
  const idRow = rows.find((r) => String(r.useTypeID ?? r.UseTypeID ?? '') === '1');
  if (idRow) {
    const a = pickAmount(idRow);
    if (a != null) return a;
  }
  return pickAmount(rows[0]);
}

export function parseIsoTimestamptz(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/** Sum `qoh` for ItemShop rows matching `shopId` (Lightspeed uses string shopID, e.g. "1"). */
export function sumItemShopQohForShop(itemShops: unknown, shopId: number): number {
  if (!Array.isArray(itemShops)) return 0;
  let t = 0;
  for (const s of itemShops) {
    if (!s || typeof s !== 'object') continue;
    const o = s as Record<string, unknown>;
    const sidRaw = o.shopID ?? o.ShopID;
    const sid =
      typeof sidRaw === 'number' && Number.isFinite(sidRaw)
        ? Math.trunc(sidRaw)
        : Number(String(sidRaw ?? '').trim());
    if (!Number.isFinite(sid) || Math.trunc(sid) !== shopId) continue;
    const q = o.qoh ?? o.QOH;
    if (typeof q === 'number' && Number.isFinite(q)) {
      t += q;
      continue;
    }
    if (typeof q === 'string' && q.trim() !== '') {
      const n = Number(q.trim());
      if (Number.isFinite(n)) t += n;
    }
  }
  return Math.trunc(t);
}
