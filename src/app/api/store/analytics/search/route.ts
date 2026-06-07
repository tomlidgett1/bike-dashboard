import { NextRequest, NextResponse } from "next/server";
import { resolveAnalyticsDeviceType } from "@/lib/tracking/resolve-analytics-device-type";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const rateLimit = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 60;

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function normalizeSearchTerm(value: string) {
  return value.trim().toLowerCase();
}

function rateLimitKey(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

function checkRateLimit(key: string) {
  const now = Date.now();
  const current = rateLimit.get(key);
  if (!current || now > current.resetAt) {
    rateLimit.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (current.count >= RATE_LIMIT_MAX) return false;
  current.count += 1;
  return true;
}

export async function POST(request: NextRequest) {
  const limiter = rateLimitKey(request);
  if (!checkRateLimit(limiter)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const storeOwnerId = body.storeOwnerId;
  const visitorId = body.visitorId;
  const sessionId = body.sessionId;
  const rawTerm = typeof body.searchTerm === "string" ? body.searchTerm.trim() : "";
  const resultCount =
    typeof body.resultCount === "number" && Number.isFinite(body.resultCount)
      ? Math.max(0, Math.floor(body.resultCount))
      : 0;
  const deviceType = resolveAnalyticsDeviceType(request, body.deviceType);
  const occurredAt = typeof body.occurredAt === "string" ? body.occurredAt : new Date().toISOString();

  if (!validUuid(storeOwnerId) || !validUuid(visitorId) || !validUuid(sessionId)) {
    return NextResponse.json({ error: "Invalid analytics identifiers" }, { status: 400 });
  }
  if (rawTerm.length < 2 || rawTerm.length > 120) {
    return NextResponse.json({ error: "Invalid search term" }, { status: 400 });
  }

  const supabase = await createClient();
  const service = createServiceRoleClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: store, error: storeError } = await service
    .from("users")
    .select("user_id, account_type, bicycle_store")
    .eq("user_id", storeOwnerId)
    .maybeSingle();

  if (storeError || !store || store.account_type !== "bicycle_store" || store.bicycle_store !== true) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  if (user?.id === storeOwnerId) {
    return NextResponse.json({ success: true, ignored: "store_owner" }, { status: 202 });
  }

  const { error } = await service.from("store_search_events").insert({
    store_owner_id: storeOwnerId,
    user_id: user?.id || null,
    visitor_id: visitorId,
    session_id: sessionId,
    search_term: rawTerm,
    normalized_term: normalizeSearchTerm(rawTerm),
    result_count: resultCount,
    device_type: deviceType,
    occurred_at: occurredAt,
  });

  if (error) {
    console.error("[store search analytics] insert failed", error);
    return NextResponse.json({ error: "Failed to record search event" }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 202 });
}
