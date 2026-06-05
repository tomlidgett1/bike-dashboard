import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getNestBrandPortalApiUrl,
  getNestSupabaseServiceKey,
  getNestSupabaseUrl,
  isNestMessagingConfigured,
} from "@/lib/nest/config";

const SESSION_DAYS = 7;
const MESSAGE_SEND_TIMEOUT_MS = 90_000;
const DEFAULT_TIMEOUT_MS = 25_000;

type CachedSession = {
  token: string;
  expiresAtMs: number;
};

const sessionCache = new Map<string, CachedSession>();

function getNestAdminClient(): SupabaseClient | null {
  const url = getNestSupabaseUrl();
  const key = getNestSupabaseServiceKey();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function mintPortalSession(brandKey: string): Promise<string> {
  const supabase = getNestAdminClient();
  if (!supabase) {
    throw new Error("Nest messaging is not configured yet.");
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);

  const { data, error } = await supabase
    .from("nest_brand_portal_sessions")
    .insert({ brand_key: brandKey, expires_at: expiresAt.toISOString() })
    .select("id")
    .single();

  if (error || !data?.id) {
    console.error("[nest-brand-portal] session insert failed:", error?.message ?? "no session id");
    throw new Error(
      error?.message
        ? `Could not start Nest portal session: ${error.message}`
        : "Could not start Nest portal session.",
    );
  }

  sessionCache.set(brandKey, {
    token: data.id,
    expiresAtMs: expiresAt.getTime() - 60_000,
  });

  return data.id;
}

async function getPortalToken(brandKey: string): Promise<string> {
  const cached = sessionCache.get(brandKey);
  if (cached && cached.expiresAtMs > Date.now()) {
    return cached.token;
  }
  return mintPortalSession(brandKey);
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

export async function proxyNestBrandPortalRequest(
  brandKey: string,
  options: {
    method: "GET" | "POST";
    query?: URLSearchParams;
    body?: Record<string, unknown>;
    timeoutMs?: number;
  },
): Promise<Record<string, unknown>> {
  if (!isNestMessagingConfigured()) {
    throw new Error("Nest messaging is not configured yet.");
  }

  const baseUrl = getNestBrandPortalApiUrl();
  if (!baseUrl) {
    throw new Error("Nest messaging is not configured yet.");
  }

  const token = await getPortalToken(brandKey);
  const search = options.query ? `?${options.query.toString()}` : "";
  const url = `${baseUrl}/api/brand-portal-config${search}`;
  const timeoutMs = options.timeoutMs ?? (options.method === "POST" ? MESSAGE_SEND_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);

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
      if (res.status === 401) {
        sessionCache.delete(brandKey);
      }
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
