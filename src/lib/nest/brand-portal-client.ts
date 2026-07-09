import { randomUUID } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getNestBrandPortalApiUrl,
  getNestSupabaseServiceKey,
  getNestSupabaseUrl,
  isNestMessagingConfigured,
} from "@/lib/nest/config";
import brandPortalConfigHandler from "@/lib/nest-portal/api/brand-portal-config";
import brandPortalKnowledgeHandler from "@/lib/nest-portal/api/brand-portal-knowledge";
import { invokeVercelHandler } from "@/lib/nest-portal/vercel-adapter";

const SESSION_DAYS = 7;
const MESSAGE_SEND_TIMEOUT_MS = 90_000;
const DEFAULT_TIMEOUT_MS = 25_000;

export type NestPortalEndpoint = "brand-portal-config" | "brand-portal-knowledge";
export type NestPortalHttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

/**
 * Staged cutover switch. While OFF (default) the portal still runs on the external Nest
 * deployment (nest.expert) so it keeps working as the fallback. Set NEST_PORTAL_INTERNAL=1
 * once the business schema + data are live in YJ's own Supabase to run the ported handler
 * in-process against YJ's DB. See docs/NEST_PORTAL_CUTOVER.md.
 */
function useInternalPortal(): boolean {
  return process.env.NEST_PORTAL_INTERNAL === "1" || process.env.NEST_PORTAL_INTERNAL === "true";
}

type CachedSession = {
  token: string;
  expiresAtMs: number;
};

const sessionCache = new Map<string, CachedSession>();
const sessionRequests = new Map<string, Promise<string>>();

const INTERNAL_HANDLERS = {
  "brand-portal-config": brandPortalConfigHandler,
  "brand-portal-knowledge": brandPortalKnowledgeHandler,
} as const;

function nestSessionErrorMessage(message: string): string {
  const trimmed = message.trim();
  if (trimmed.includes("522: Connection timed out") || trimmed.includes("Error code 522")) {
    return "Nest Supabase project timed out (Cloudflare 522).";
  }
  if (trimmed.startsWith("<!DOCTYPE html") || trimmed.startsWith("<html")) {
    return "Nest Supabase returned an HTML error page.";
  }
  return trimmed.length > 500 ? `${trimmed.slice(0, 500)}...` : trimmed;
}

function getSessionAdminClient(): SupabaseClient | null {
  // Internal: mint sessions in YJ's own project. External (fallback): mint in the Nest project.
  const url = useInternalPortal()
    ? process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    : getNestSupabaseUrl();
  const key = useInternalPortal()
    ? process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim()
    : getNestSupabaseServiceKey();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function mintPortalSession(brandKey: string): Promise<string> {
  const supabase = getSessionAdminClient();
  if (!supabase) {
    throw new Error("Nest messaging is not configured yet.");
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);
  const token = randomUUID();

  const { error } = await supabase
    .from("nest_brand_portal_sessions")
    .insert({ id: token, brand_key: brandKey, expires_at: expiresAt.toISOString() });

  if (error) {
    const message = nestSessionErrorMessage(error.message);
    console.error("[nest-brand-portal] session insert failed:", message);
    throw new Error(`Could not start Nest portal session: ${message}`);
  }

  sessionCache.set(brandKey, {
    token,
    expiresAtMs: expiresAt.getTime() - 60_000,
  });

  return token;
}

async function getPortalToken(brandKey: string): Promise<string> {
  const cached = sessionCache.get(brandKey);
  if (cached && cached.expiresAtMs > Date.now()) {
    return cached.token;
  }

  const pending = sessionRequests.get(brandKey);
  if (pending) return pending;

  const request = mintPortalSession(brandKey).finally(() => {
    sessionRequests.delete(brandKey);
  });
  sessionRequests.set(brandKey, request);
  return request;
}

function apiErrorMessage(data: Record<string, unknown>, fallback: string): string {
  const err = typeof data.error === "string" ? data.error : fallback;
  const detail = data.detail;
  if (typeof detail === "string" && detail.trim() && !err.includes(detail)) {
    return `${err} (${detail.trim()})`;
  }
  return err;
}

async function parseJsonResponse(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();
  if (contentType.includes("application/json") || text.trim().startsWith("{")) {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error("Invalid JSON from Nest server.");
    }
  }
  throw new Error(
    text.trim().startsWith("<")
      ? "Nest returned a web page instead of JSON. Check NEST_BRAND_PORTAL_API_URL."
      : `Unexpected Nest response (${res.status}).`,
  );
}

type ProxyOptions = {
  method: NestPortalHttpMethod;
  endpoint?: NestPortalEndpoint;
  query?: URLSearchParams;
  body?: Record<string, unknown>;
  timeoutMs?: number;
};

/** In-process path: run the ported handler against YJ's own DB (no external call). */
async function proxyInternal(
  token: string,
  options: ProxyOptions,
): Promise<Record<string, unknown>> {
  const endpoint = options.endpoint ?? "brand-portal-config";
  const handler = INTERNAL_HANDLERS[endpoint];
  const { status, data } = await invokeVercelHandler(handler, {
    method: options.method,
    query: options.query,
    body: options.body,
    headers: { authorization: `Bearer ${token}` },
  });
  if (status < 200 || status >= 300) {
    throw new Error(apiErrorMessage(data, "Nest request failed."));
  }
  return data;
}

/** External path (fallback): call the live Nest deployment over HTTP. */
async function proxyExternal(
  token: string,
  options: ProxyOptions,
): Promise<Record<string, unknown>> {
  if (!isNestMessagingConfigured()) {
    throw new Error("Nest messaging is not configured yet.");
  }
  const baseUrl = getNestBrandPortalApiUrl();
  if (!baseUrl) {
    throw new Error("Nest messaging is not configured yet.");
  }

  const endpoint = options.endpoint ?? "brand-portal-config";
  const search = options.query ? `?${options.query.toString()}` : "";
  const url = `${baseUrl}/api/${endpoint}${search}`;
  const timeoutMs =
    options.timeoutMs ??
    (options.method === "POST" || options.method === "PATCH" || options.method === "DELETE"
      ? MESSAGE_SEND_TIMEOUT_MS
      : DEFAULT_TIMEOUT_MS);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
      signal: controller.signal,
    });

    const data = await parseJsonResponse(res);
    if (!res.ok) {
      throw new Error(apiErrorMessage(data, "Nest request failed."));
    }
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Nest request timed out. Try again shortly.");
    }
    throw error instanceof Error ? error : new Error("Nest request failed.");
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function proxyNestBrandPortalRequest(
  brandKey: string,
  options: {
    method: NestPortalHttpMethod;
    endpoint?: NestPortalEndpoint;
    query?: URLSearchParams;
    body?: Record<string, unknown>;
    timeoutMs?: number;
  },
): Promise<Record<string, unknown>> {
  const internal = useInternalPortal();
  try {
    const token = await getPortalToken(brandKey);
    return internal ? await proxyInternal(token, options) : await proxyExternal(token, options);
  } catch (error) {
    // a 401 means the cached session was rejected; drop it so the next call re-mints
    if (error instanceof Error && /unauthor/i.test(error.message)) {
      sessionCache.delete(brandKey);
    }
    throw error;
  }
}
