import {
  getInternalAnalyticsUserIds,
  isExcludedAnalyticsUser,
} from "@/lib/store/analytics-exclusions";
import type { createServiceRoleClient } from "@/lib/supabase/server";

type StoreAnalyticsServiceClient = ReturnType<typeof createServiceRoleClient>;

type BehaviourEventRow = {
  event_type: string | null;
  device_type: string | null;
  user_id: string | null;
  visitor_id: string | null;
  session_id: string | null;
  product_id: string | null;
  source: string | null;
  metadata: Record<string, unknown> | null;
  occurred_at: string | null;
};

type SearchEventRow = {
  search_term: string | null;
  result_count: number | null;
  device_type: string | null;
  user_id: string | null;
  visitor_id: string | null;
  session_id: string | null;
  occurred_at: string | null;
};

type TimelineEvent = {
  eventType: string;
  occurredAt: string;
  deviceType: string | null;
  visitorKey: string;
  sessionId: string;
  productId: string | null;
  source: string | null;
  metadata: Record<string, unknown>;
};

type MutableSession = {
  sessionId: string;
  visitorKey: string;
  deviceType: string;
  startedAt: string;
  lastSeenAt: string;
  entrySource: string | null;
  exitSource: string | null;
  eventCount: number;
  pageViews: number;
  clickEvents: number;
  maxScrollDepth: number;
  events: TimelineEvent[];
};

export type BehaviourAnalyticsRow = {
  key: string;
  label: string;
  count: number;
  visitors: number;
  sessions: number;
};

export type BehaviourAnalytics = {
  days: number;
  summary: {
    totalEvents: number;
    totalSessions: number;
    distinctVisitors: number;
    engagedSessions: number;
    engagementRate: number;
    bounceRate: number;
    avgSessionDurationSeconds: number;
    avgEventsPerSession: number;
    conversionIntentRate: number;
    avgMaxScrollDepth: number;
  };
  eventsByType: BehaviourAnalyticsRow[];
  firstActions: BehaviourAnalyticsRow[];
  tabEngagement: BehaviourAnalyticsRow[];
  sectionEngagement: BehaviourAnalyticsRow[];
  ctaClicks: BehaviourAnalyticsRow[];
  serviceBookClicks: BehaviourAnalyticsRow[];
  carouselEngagement: BehaviourAnalyticsRow[];
  scrollDepth: Array<{ depth: number; sessions: number; percent: number }>;
  journeyPaths: Array<{ path: string; count: number; percent: number }>;
  recentSessions: Array<{
    sessionId: string;
    visitorKey: string;
    deviceType: string;
    startedAt: string;
    lastSeenAt: string;
    durationSeconds: number;
    eventCount: number;
    pageViews: number;
    maxScrollDepth: number;
    entrySource: string | null;
    exitSource: string | null;
    firstAction: string | null;
    journey: string[];
  }>;
};

const PAGE_VIEW_EVENTS = new Set(["store_page_view", "product_view"]);
const PASSIVE_EVENTS = new Set(["store_page_view", "product_impression", "scroll_depth", "section_view"]);
const CLICK_EVENTS = new Set([
  "tab_select",
  "cta_click",
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
  "service_book_click",
  "rental_availability_open",
  "rental_date_select",
  "rental_request_submit",
  "product_click",
  "add_to_cart_click",
  "buy_now_click",
]);
const INTENT_EVENTS = new Set([
  "product_view",
  "product_click",
  "add_to_cart_click",
  "buy_now_click",
  "contact_click",
  "message_submit",
  "service_book_click",
  "rental_request_submit",
  "search",
]);

const EVENT_LABELS: Record<string, string> = {
  store_page_view: "Opened store page",
  product_view: "Viewed a product",
  product_impression: "Saw a product",
  tab_select: "Opened a tab",
  cta_click: "Clicked a CTA",
  section_view: "Viewed a section",
  scroll_depth: "Scrolled",
  carousel_scroll: "Scrolled a carousel",
  carousel_expand: "Expanded a carousel",
  category_filter: "Used a category filter",
  sort_change: "Changed sort",
  search: "Searched products",
  search_focus: "Focused search",
  search_clear: "Cleared search",
  hours_open: "Opened hours",
  contact_click: "Clicked contact",
  message_open: "Opened message form",
  message_submit: "Submitted message route",
  collection_open: "Opened a collection",
  service_view: "Viewed services",
  service_book_click: "Clicked service booking",
  rental_view: "Viewed rentals",
  rental_availability_open: "Opened rental availability",
  rental_date_select: "Selected rental dates",
  rental_request_submit: "Submitted rental request",
  product_click: "Clicked a product",
  add_to_cart_click: "Added to cart",
  buy_now_click: "Clicked buy now",
};

function clampDays(days: number | undefined) {
  return Math.max(1, Math.min(Number(days || 30) || 30, 365));
}

function visitorKey(row: { user_id: string | null; visitor_id: string | null }) {
  return row.user_id || row.visitor_id || "unknown";
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function metadataNumber(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function eventLabel(event: TimelineEvent) {
  if (event.eventType === "tab_select") {
    const tab = metadataString(event.metadata, "tab");
    return tab ? `Opened ${tab}` : EVENT_LABELS[event.eventType];
  }
  if (event.eventType === "section_view") {
    return metadataString(event.metadata, "sectionLabel") || EVENT_LABELS[event.eventType];
  }
  if (event.eventType === "cta_click" || event.eventType === "contact_click") {
    return metadataString(event.metadata, "label") || metadataString(event.metadata, "action") || EVENT_LABELS[event.eventType];
  }
  if (event.eventType === "service_book_click") {
    const serviceName = metadataString(event.metadata, "serviceName");
    const source = metadataString(event.metadata, "source");
    if (serviceName) {
      if (source === "home_service_card") return `Book ${serviceName} (Home)`;
      if (source === "home_services_header") return "Call to book (Home services)";
      if (source === "services_banner") return "Call to book (Services tab)";
      return `Book ${serviceName}`;
    }
    return metadataString(event.metadata, "label") || EVENT_LABELS[event.eventType];
  }
  if (event.eventType === "search") {
    return metadataString(event.metadata, "term") || EVENT_LABELS.search;
  }
  return EVENT_LABELS[event.eventType] || event.eventType.replaceAll("_", " ");
}

function addToRowMap(
  map: Map<string, { label: string; count: number; visitors: Set<string>; sessions: Set<string> }>,
  key: string | null,
  label: string | null,
  event: TimelineEvent,
) {
  if (!key) return;
  const existing = map.get(key) ?? {
    label: label || key,
    count: 0,
    visitors: new Set<string>(),
    sessions: new Set<string>(),
  };
  existing.count += 1;
  existing.visitors.add(event.visitorKey);
  existing.sessions.add(event.sessionId);
  map.set(key, existing);
}

function serialiseRows(
  map: Map<string, { label: string; count: number; visitors: Set<string>; sessions: Set<string> }>,
  limit = 20,
): BehaviourAnalyticsRow[] {
  return Array.from(map.entries())
    .map(([key, row]) => ({
      key,
      label: row.label,
      count: row.count,
      visitors: row.visitors.size,
      sessions: row.sessions.size,
    }))
    .sort((a, b) => b.count - a.count || b.sessions - a.sessions || a.label.localeCompare(b.label))
    .slice(0, limit);
}

async function fetchBehaviourEvents(
  service: StoreAnalyticsServiceClient,
  userId: string,
  sinceIso: string,
) {
  const rows: BehaviourEventRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await service
      .from("store_analytics_events")
      .select("event_type, device_type, user_id, visitor_id, session_id, product_id, source, metadata, occurred_at")
      .eq("store_owner_id", userId)
      .gte("occurred_at", sinceIso)
      .order("occurred_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    rows.push(...((data ?? []) as BehaviourEventRow[]));
    if (!data || data.length < pageSize) break;
  }

  return rows;
}

async function fetchSearchEvents(
  service: StoreAnalyticsServiceClient,
  userId: string,
  sinceIso: string,
) {
  const rows: SearchEventRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await service
      .from("store_search_events")
      .select("search_term, result_count, device_type, user_id, visitor_id, session_id, occurred_at")
      .eq("store_owner_id", userId)
      .gte("occurred_at", sinceIso)
      .order("occurred_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    rows.push(...((data ?? []) as SearchEventRow[]));
    if (!data || data.length < pageSize) break;
  }

  return rows;
}

function durationSeconds(session: MutableSession) {
  return Math.max(
    0,
    Math.round((new Date(session.lastSeenAt).getTime() - new Date(session.startedAt).getTime()) / 1000),
  );
}

function isEngagedSession(session: MutableSession) {
  return durationSeconds(session) >= 10 || session.eventCount >= 4 || session.maxScrollDepth >= 50;
}

function isBounceSession(session: MutableSession) {
  return session.pageViews <= 1 && session.clickEvents === 0 && session.maxScrollDepth < 50;
}

function hasIntent(session: MutableSession) {
  return session.events.some((event) => INTENT_EVENTS.has(event.eventType));
}

export async function getCustomerBehaviourAnalytics(
  service: StoreAnalyticsServiceClient,
  userId: string,
  daysValue = 30,
): Promise<BehaviourAnalytics> {
  const days = clampDays(daysValue);
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const [behaviourRows, searchRows, internalUserIds] = await Promise.all([
    fetchBehaviourEvents(service, userId, sinceIso),
    fetchSearchEvents(service, userId, sinceIso),
    getInternalAnalyticsUserIds(service),
  ]);

  const timeline: TimelineEvent[] = [
    ...behaviourRows
      .filter(
        (row) =>
          row.occurred_at &&
          row.session_id &&
          row.visitor_id &&
          !isExcludedAnalyticsUser(row.user_id, userId, internalUserIds),
      )
      .map((row) => ({
        eventType: row.event_type || "unknown",
        occurredAt: row.occurred_at!,
        deviceType: row.device_type,
        visitorKey: visitorKey(row),
        sessionId: row.session_id!,
        productId: row.product_id,
        source: row.source,
        metadata: row.metadata ?? {},
      })),
    ...searchRows
      .filter(
        (row) =>
          row.occurred_at &&
          row.session_id &&
          row.visitor_id &&
          !isExcludedAnalyticsUser(row.user_id, userId, internalUserIds),
      )
      .map((row) => ({
        eventType: "search",
        occurredAt: row.occurred_at!,
        deviceType: row.device_type,
        visitorKey: visitorKey(row),
        sessionId: row.session_id!,
        productId: null,
        source: null,
        metadata: {
          term: row.search_term,
          resultCount: row.result_count ?? 0,
          zeroResults: (row.result_count ?? 0) === 0,
        },
      })),
  ].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

  const sessions = new Map<string, MutableSession>();
  const eventMap = new Map<string, { label: string; count: number; visitors: Set<string>; sessions: Set<string> }>();
  const tabMap = new Map<string, { label: string; count: number; visitors: Set<string>; sessions: Set<string> }>();
  const sectionMap = new Map<string, { label: string; count: number; visitors: Set<string>; sessions: Set<string> }>();
  const ctaMap = new Map<string, { label: string; count: number; visitors: Set<string>; sessions: Set<string> }>();
  const serviceBookMap = new Map<string, { label: string; count: number; visitors: Set<string>; sessions: Set<string> }>();
  const carouselMap = new Map<string, { label: string; count: number; visitors: Set<string>; sessions: Set<string> }>();

  for (const event of timeline) {
    const session = sessions.get(event.sessionId) ?? {
      sessionId: event.sessionId,
      visitorKey: event.visitorKey,
      deviceType: event.deviceType || "unknown",
      startedAt: event.occurredAt,
      lastSeenAt: event.occurredAt,
      entrySource: event.source,
      exitSource: event.source,
      eventCount: 0,
      pageViews: 0,
      clickEvents: 0,
      maxScrollDepth: 0,
      events: [],
    };

    session.lastSeenAt = event.occurredAt;
    session.exitSource = event.source || session.exitSource;
    session.eventCount += 1;
    session.pageViews += PAGE_VIEW_EVENTS.has(event.eventType) ? 1 : 0;
    session.clickEvents += CLICK_EVENTS.has(event.eventType) ? 1 : 0;
    session.maxScrollDepth = Math.max(
      session.maxScrollDepth,
      metadataNumber(event.metadata, "depthPercent") ?? 0,
    );
    session.events.push(event);
    sessions.set(event.sessionId, session);

    addToRowMap(eventMap, event.eventType, EVENT_LABELS[event.eventType] || eventLabel(event), event);
    addToRowMap(tabMap, metadataString(event.metadata, "tab"), metadataString(event.metadata, "tab"), event);
    addToRowMap(
      sectionMap,
      metadataString(event.metadata, "section"),
      metadataString(event.metadata, "sectionLabel") || metadataString(event.metadata, "section"),
      event,
    );

    if (
      event.eventType === "cta_click" ||
      event.eventType === "contact_click" ||
      event.eventType === "message_open" ||
      event.eventType === "message_submit" ||
      event.eventType === "service_book_click" ||
      event.eventType === "rental_request_submit" ||
      event.eventType === "add_to_cart_click" ||
      event.eventType === "buy_now_click"
    ) {
      const key = metadataString(event.metadata, "action") || event.eventType;
      addToRowMap(ctaMap, key, metadataString(event.metadata, "label") || EVENT_LABELS[event.eventType], event);
    }

    if (event.eventType === "service_book_click") {
      const serviceKey =
        metadataString(event.metadata, "serviceId") ||
        metadataString(event.metadata, "serviceName") ||
        metadataString(event.metadata, "source") ||
        "service_book_click";
      addToRowMap(serviceBookMap, serviceKey, eventLabel(event), event);
    }

    if (event.eventType === "carousel_scroll" || event.eventType === "carousel_expand") {
      const key = metadataString(event.metadata, "categoryId") || metadataString(event.metadata, "categoryName") || "carousel";
      addToRowMap(carouselMap, key, metadataString(event.metadata, "categoryName") || "Carousel", event);
    }
  }

  const sessionRows = Array.from(sessions.values());
  const visitors = new Set(timeline.map((event) => event.visitorKey));
  const engagedSessions = sessionRows.filter(isEngagedSession).length;
  const bounceSessions = sessionRows.filter(isBounceSession).length;
  const intentSessions = sessionRows.filter(hasIntent).length;
  const totalDuration = sessionRows.reduce((sum, session) => sum + durationSeconds(session), 0);
  const totalMaxScroll = sessionRows.reduce((sum, session) => sum + session.maxScrollDepth, 0);
  const totalSessions = sessionRows.length;

  const firstActionMap = new Map<string, { label: string; count: number; visitors: Set<string>; sessions: Set<string> }>();
  const pathMap = new Map<string, number>();

  for (const session of sessionRows) {
    const firstAction = session.events.find((event) => !PASSIVE_EVENTS.has(event.eventType));
    if (firstAction) {
      addToRowMap(firstActionMap, firstAction.eventType, eventLabel(firstAction), firstAction);
    }

    const path = session.events
      .filter((event) => event.eventType !== "product_impression")
      .slice(0, 6)
      .map(eventLabel)
      .join(" -> ");
    if (path) pathMap.set(path, (pathMap.get(path) ?? 0) + 1);
  }

  const scrollDepth = [25, 50, 75, 90, 100].map((depth) => {
    const count = sessionRows.filter((session) => session.maxScrollDepth >= depth).length;
    return {
      depth,
      sessions: count,
      percent: totalSessions > 0 ? Math.round((count / totalSessions) * 100) : 0,
    };
  });

  const journeyPaths = Array.from(pathMap.entries())
    .map(([path, count]) => ({
      path,
      count,
      percent: totalSessions > 0 ? Math.round((count / totalSessions) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
    .slice(0, 12);

  const recentSessions = sessionRows
    .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
    .slice(0, 12)
    .map((session) => {
      const firstAction = session.events.find((event) => !PASSIVE_EVENTS.has(event.eventType));
      return {
        sessionId: session.sessionId,
        visitorKey: session.visitorKey,
        deviceType: session.deviceType,
        startedAt: session.startedAt,
        lastSeenAt: session.lastSeenAt,
        durationSeconds: durationSeconds(session),
        eventCount: session.eventCount,
        pageViews: session.pageViews,
        maxScrollDepth: session.maxScrollDepth,
        entrySource: session.entrySource,
        exitSource: session.exitSource,
        firstAction: firstAction ? eventLabel(firstAction) : null,
        journey: session.events
          .filter((event) => event.eventType !== "product_impression")
          .slice(0, 8)
          .map(eventLabel),
      };
    });

  return {
    days,
    summary: {
      totalEvents: timeline.length,
      totalSessions,
      distinctVisitors: visitors.size,
      engagedSessions,
      engagementRate: totalSessions > 0 ? Math.round((engagedSessions / totalSessions) * 100) : 0,
      bounceRate: totalSessions > 0 ? Math.round((bounceSessions / totalSessions) * 100) : 0,
      avgSessionDurationSeconds: totalSessions > 0 ? Math.round(totalDuration / totalSessions) : 0,
      avgEventsPerSession: totalSessions > 0 ? Number((timeline.length / totalSessions).toFixed(1)) : 0,
      conversionIntentRate: totalSessions > 0 ? Math.round((intentSessions / totalSessions) * 100) : 0,
      avgMaxScrollDepth: totalSessions > 0 ? Math.round(totalMaxScroll / totalSessions) : 0,
    },
    eventsByType: serialiseRows(eventMap, 30),
    firstActions: serialiseRows(firstActionMap, 12),
    tabEngagement: serialiseRows(tabMap, 12),
    sectionEngagement: serialiseRows(sectionMap, 16),
    ctaClicks: serialiseRows(ctaMap, 20),
    serviceBookClicks: serialiseRows(serviceBookMap, 12),
    carouselEngagement: serialiseRows(carouselMap, 16),
    scrollDepth,
    journeyPaths,
    recentSessions,
  };
}
