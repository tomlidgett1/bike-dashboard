import { NextRequest, NextResponse } from "next/server";
import { isInternalAnalyticsEmail } from "@/lib/store/analytics-exclusions";
import { getCustomerBehaviourAnalytics } from "@/lib/store/customer-behaviour-analytics";
import { getWebTrackingAnalytics } from "@/lib/store/web-tracking-analytics";
import { resolveAnalyticsDeviceType } from "@/lib/tracking/resolve-analytics-device-type";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

type StoreAnalyticsEventType =
  | "store_page_view"
  | "product_view"
  | "product_impression"
  | "tab_select"
  | "cta_click"
  | "section_view"
  | "scroll_depth"
  | "carousel_scroll"
  | "carousel_expand"
  | "category_filter"
  | "sort_change"
  | "search_focus"
  | "search_clear"
  | "hours_open"
  | "contact_click"
  | "message_open"
  | "message_submit"
  | "collection_open"
  | "service_view"
  | "service_book_click"
  | "rental_view"
  | "rental_availability_open"
  | "rental_date_select"
  | "rental_request_submit"
  | "product_click"
  | "add_to_cart_click"
  | "buy_now_click";

const VALID_EVENT_TYPES = new Set<StoreAnalyticsEventType>([
  "store_page_view",
  "product_view",
  "product_impression",
  "tab_select",
  "cta_click",
  "section_view",
  "scroll_depth",
  "carousel_scroll",
  "carousel_expand",
  "category_filter",
  "sort_change",
  "search_focus",
  "search_clear",
  "hours_open",
  "contact_click",
  "message_open",
  "message_submit",
  "collection_open",
  "service_view",
  "service_book_click",
  "rental_view",
  "rental_availability_open",
  "rental_date_select",
  "rental_request_submit",
  "product_click",
  "add_to_cart_click",
  "buy_now_click",
]);
const PRODUCT_EVENT_TYPES = new Set<StoreAnalyticsEventType>([
  "product_view",
  "product_impression",
  "product_click",
  "add_to_cart_click",
  "buy_now_click",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const rateLimit = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 240;

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
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

function normalizeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  try {
    const json = JSON.stringify(value);
    if (json.length > 6000) return {};
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
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

  const eventType = body.eventType;
  const storeOwnerId = body.storeOwnerId;
  const productId = body.productId;
  const visitorId = body.visitorId;
  const sessionId = body.sessionId;
  const deviceType = resolveAnalyticsDeviceType(request, body.deviceType);
  const occurredAt = typeof body.occurredAt === "string" ? body.occurredAt : new Date().toISOString();
  const source = typeof body.source === "string" ? body.source.slice(0, 240) : null;
  const metadata = normalizeMetadata(body.metadata);

  if (!VALID_EVENT_TYPES.has(eventType as StoreAnalyticsEventType)) {
    return NextResponse.json({ error: "Invalid event type" }, { status: 400 });
  }
  if (!validUuid(storeOwnerId) || !validUuid(visitorId) || !validUuid(sessionId)) {
    return NextResponse.json({ error: "Invalid analytics identifiers" }, { status: 400 });
  }
  if (productId !== null && productId !== undefined && !validUuid(productId)) {
    return NextResponse.json({ error: "Invalid product id" }, { status: 400 });
  }
  if (PRODUCT_EVENT_TYPES.has(eventType as StoreAnalyticsEventType) && !validUuid(productId)) {
    return NextResponse.json({ error: "Product event requires product id" }, { status: 400 });
  }

  const supabase = await createClient();
  const service = createServiceRoleClient();
  const { data: { user } } = await supabase.auth.getUser();

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
  if (isInternalAnalyticsEmail(user?.email)) {
    return NextResponse.json({ success: true, ignored: "internal_user" }, { status: 202 });
  }

  if (validUuid(productId)) {
    const { data: product, error: productError } = await service
      .from("products")
      .select("id, user_id")
      .eq("id", productId)
      .maybeSingle();

    if (productError || !product || product.user_id !== storeOwnerId) {
      return NextResponse.json({ error: "Product does not belong to store" }, { status: 400 });
    }
  }

  const { error } = await service.from("store_analytics_events").insert({
    store_owner_id: storeOwnerId,
    product_id: validUuid(productId) ? productId : null,
    user_id: user?.id || null,
    visitor_id: visitorId,
    session_id: sessionId,
    device_type: deviceType,
    event_type: eventType,
    source,
    metadata,
    occurred_at: occurredAt,
  });

  if (error) {
    console.error("[store analytics] insert failed", error);
    return NextResponse.json({ error: "Failed to record analytics event" }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 202 });
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceRoleClient();
  const { data: profile, error: profileError } = await service
    .from("users")
    .select("user_id, account_type, bicycle_store")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError || !profile || profile.account_type !== "bicycle_store" || profile.bicycle_store !== true) {
    return NextResponse.json({ error: "Store analytics are only available to verified bike stores" }, { status: 403 });
  }

  const daysParam = request.nextUrl.searchParams.get("days");
  const days = Math.max(1, Math.min(Number(daysParam || 30) || 30, 365));

  const [summaryResult, searchTermsResult, webAnalytics, behaviourAnalytics] = await Promise.all([
    service.rpc("get_store_analytics_summary", {
      p_store_owner_id: user.id,
      p_days: days,
    }),
    service.rpc("get_store_search_terms_summary", {
      p_store_owner_id: user.id,
      p_days: days,
    }),
    getWebTrackingAnalytics(service, user.id, {
      dailyDays: days,
      weekCount: Math.ceil(days / 7),
    }),
    getCustomerBehaviourAnalytics(service, user.id, days),
  ]);

  if (summaryResult.error) {
    console.error("[store analytics] summary failed", summaryResult.error);
    return NextResponse.json({ error: "Failed to load analytics" }, { status: 500 });
  }

  if (searchTermsResult.error) {
    console.error("[store analytics] search terms failed", searchTermsResult.error);
    return NextResponse.json({ error: "Failed to load analytics" }, { status: 500 });
  }

  return NextResponse.json({
    ...((summaryResult.data ?? {}) as Record<string, unknown>),
    searchAnalytics: searchTermsResult.data ?? {
      days,
      summary: { totalSearches: 0, distinctSearchers: 0, zeroResultSearches: 0 },
      searchTerms: [],
    },
    webAnalytics,
    behaviourAnalytics,
  });
}
