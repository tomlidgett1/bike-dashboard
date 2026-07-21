"use client";

import * as React from "react";
import { v4 as uuidv4 } from "uuid";
import { getStoreAnalyticsDeviceType } from "@/lib/tracking/store-analytics-device";

export type StoreAnalyticsEventType =
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

interface StoreAnalyticsEvent {
  eventType: StoreAnalyticsEventType;
  storeOwnerId: string;
  productId?: string | null;
  metadata?: Record<string, unknown>;
}

const VISITOR_KEY = "yj_store_visitor_id";
const SESSION_KEY = "yj_store_analytics_session_id";
const LAST_ACTIVITY_KEY = "yj_store_analytics_last_activity";
const SESSION_DURATION_MS = 30 * 60 * 1000;
const SCROLL_DEPTH_MARKERS = [25, 50, 75, 90, 100] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validUuid(value: string | null | undefined): value is string {
  return !!value && UUID_RE.test(value);
}

function getStoredUuid(key: string): string {
  const existing = window.localStorage.getItem(key);
  if (validUuid(existing)) return existing;

  const next = uuidv4();
  window.localStorage.setItem(key, next);
  return next;
}

function getSessionId(): string {
  const now = Date.now();
  const lastActivity = Number(window.localStorage.getItem(LAST_ACTIVITY_KEY) || 0);
  const expired = !lastActivity || now - lastActivity > SESSION_DURATION_MS;

  if (expired) {
    const next = uuidv4();
    window.localStorage.setItem(SESSION_KEY, next);
    window.localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
    return next;
  }

  window.localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
  return getStoredUuid(SESSION_KEY);
}

export function trackStoreAnalyticsEvent(event: StoreAnalyticsEvent) {
  if (typeof window === "undefined") return;
  if (!validUuid(event.storeOwnerId)) return;
  if (event.productId && !validUuid(event.productId)) return;

  const body = JSON.stringify({
    eventType: event.eventType,
    storeOwnerId: event.storeOwnerId,
    productId: event.productId || null,
    visitorId: getStoredUuid(VISITOR_KEY),
    sessionId: getSessionId(),
    deviceType: getStoreAnalyticsDeviceType(),
    source: window.location.pathname,
    metadata: event.metadata || {},
    occurredAt: new Date().toISOString(),
  });

  fetch("/api/store/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // Analytics must never interrupt storefront browsing.
  });
}

export function trackStoreBehaviourEvent(
  storeOwnerId: string | null | undefined,
  eventType: StoreAnalyticsEventType,
  metadata: Record<string, unknown> = {},
  productId?: string | null,
) {
  if (!validUuid(storeOwnerId)) return;
  if (productId && !validUuid(productId)) return;

  trackStoreAnalyticsEvent({
    eventType,
    storeOwnerId,
    productId: productId || null,
    metadata,
  });
}

export function useStorePageView(storeOwnerId: string | null | undefined) {
  const trackedRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!validUuid(storeOwnerId) || trackedRef.current === storeOwnerId) return;
    trackedRef.current = storeOwnerId;
    trackStoreAnalyticsEvent({
      eventType: "store_page_view",
      storeOwnerId,
    });
    // Also feed the personalisation layer (store affinity signal).
    import("@/lib/tracking/interaction-tracker")
      .then(({ trackStoreView }) => trackStoreView(storeOwnerId))
      .catch(() => {});
  }, [storeOwnerId]);
}

export function useStoreProductView(
  storeOwnerId: string | null | undefined,
  productId: string | null | undefined,
) {
  const trackedRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!validUuid(storeOwnerId) || !validUuid(productId)) return;
    const key = `${storeOwnerId}:${productId}`;
    if (trackedRef.current === key) return;
    trackedRef.current = key;
    trackStoreAnalyticsEvent({
      eventType: "product_view",
      storeOwnerId,
      productId,
    });
  }, [storeOwnerId, productId]);
}

export function trackStoreSearchEvent(
  storeOwnerId: string,
  searchTerm: string,
  resultCount: number,
) {
  if (typeof window === "undefined") return;
  if (!validUuid(storeOwnerId)) return;

  const trimmed = searchTerm.trim();
  if (trimmed.length < 2 || trimmed.length > 120) return;

  void import("@/lib/nest/storefront-browse-context")
    .then(({ recordBrowseSearch }) => recordBrowseSearch(storeOwnerId, trimmed))
    .catch(() => {});

  const body = JSON.stringify({
    storeOwnerId,
    searchTerm: trimmed,
    resultCount: Math.max(0, Math.floor(resultCount)),
    visitorId: getStoredUuid(VISITOR_KEY),
    sessionId: getSessionId(),
    deviceType: getStoreAnalyticsDeviceType(),
    occurredAt: new Date().toISOString(),
  });

  fetch("/api/store/analytics/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // Analytics must never interrupt storefront browsing.
  });
}

export function useStoreSearchTracking(
  storeOwnerId: string | null | undefined,
  searchTerm: string,
  resultCount: number,
  enabled = true,
) {
  const lastTrackedRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!enabled || !validUuid(storeOwnerId)) return;

    const trimmed = searchTerm.trim();
    if (trimmed.length < 2) {
      lastTrackedRef.current = null;
      return;
    }

    const timer = window.setTimeout(() => {
      const key = `${storeOwnerId}:${trimmed.toLowerCase()}:${resultCount}`;
      if (lastTrackedRef.current === key) return;
      lastTrackedRef.current = key;
      trackStoreSearchEvent(storeOwnerId, trimmed, resultCount);
    }, 800);

    return () => window.clearTimeout(timer);
  }, [enabled, resultCount, searchTerm, storeOwnerId]);
}

export function useStoreTabTracking(
  storeOwnerId: string | null | undefined,
  tab: string,
  enabled = true,
) {
  const previousTabRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!enabled || !validUuid(storeOwnerId)) return;
    if (!tab || previousTabRef.current === tab) return;

    trackStoreBehaviourEvent(storeOwnerId, "tab_select", {
      tab,
      previousTab: previousTabRef.current,
      source: "store_profile_tabs",
    });
    previousTabRef.current = tab;
  }, [enabled, storeOwnerId, tab]);
}

export function useStoreScrollDepthTracking(
  storeOwnerId: string | null | undefined,
  context: Record<string, unknown> = {},
  enabled = true,
) {
  const trackedDepthsRef = React.useRef<Set<number>>(new Set());
  const contextKey = JSON.stringify(context);

  React.useEffect(() => {
    trackedDepthsRef.current = new Set();
  }, [contextKey, storeOwnerId]);

  React.useEffect(() => {
    if (!enabled || !validUuid(storeOwnerId)) return;

    let frame = 0;
    const evaluateDepth = () => {
      frame = 0;
      const documentHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
      );
      const viewportHeight = window.innerHeight;
      const scrollableHeight = Math.max(documentHeight - viewportHeight, 1);
      const currentDepth = Math.min(
        100,
        Math.round(((window.scrollY + viewportHeight) / documentHeight) * 100),
      );

      for (const marker of SCROLL_DEPTH_MARKERS) {
        if (currentDepth < marker || trackedDepthsRef.current.has(marker)) continue;
        trackedDepthsRef.current.add(marker);
        trackStoreBehaviourEvent(storeOwnerId, "scroll_depth", {
          ...context,
          depthPercent: marker,
          currentDepth,
          scrollY: Math.round(window.scrollY),
          viewportHeight,
          documentHeight,
          scrollableHeight,
        });
      }
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(evaluateDepth);
    };

    evaluateDepth();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [context, contextKey, enabled, storeOwnerId]);
}

export function useStoreSectionViewTracking(
  storeOwnerId: string | null | undefined,
  rootRef: React.RefObject<HTMLElement | null>,
  context: Record<string, unknown> = {},
  enabled = true,
) {
  const trackedSectionsRef = React.useRef<Set<string>>(new Set());
  const contextKey = JSON.stringify(context);

  React.useEffect(() => {
    trackedSectionsRef.current = new Set();
  }, [contextKey, storeOwnerId]);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root || !validUuid(storeOwnerId) || !("IntersectionObserver" in window)) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.35) continue;
          const node = entry.target as HTMLElement;
          const section = node.dataset.storeAnalyticsSection;
          if (!section || trackedSectionsRef.current.has(section)) continue;

          trackedSectionsRef.current.add(section);
          trackStoreBehaviourEvent(storeOwnerId, "section_view", {
            ...context,
            section,
            sectionLabel: node.dataset.storeAnalyticsLabel || section,
          });
          observer.unobserve(node);
        }
      },
      { threshold: [0.35] },
    );

    const nodes = root.querySelectorAll<HTMLElement>("[data-store-analytics-section]");
    nodes.forEach((node) => observer.observe(node));

    return () => observer.disconnect();
  }, [context, contextKey, enabled, rootRef, storeOwnerId]);
}

export function useProductImpressions(
  storeOwnerId: string | null | undefined,
  products: Array<{ id: string }> | null | undefined,
  context?: Record<string, unknown>,
) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const trackedIdsRef = React.useRef<Set<string>>(new Set());
  const productIds = React.useMemo(
    () => (products || []).map((product) => product.id).filter(validUuid),
    [products],
  );

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || !validUuid(storeOwnerId) || productIds.length === 0) return;
    if (!("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.5) continue;
          const productId = (entry.target as HTMLElement).dataset.analyticsProductId;
          if (!validUuid(productId) || trackedIdsRef.current.has(productId)) continue;

          trackedIdsRef.current.add(productId);
          trackStoreAnalyticsEvent({
            eventType: "product_impression",
            storeOwnerId,
            productId,
            metadata: context,
          });
          observer.unobserve(entry.target);
        }
      },
      { threshold: [0.5] },
    );

    const nodes = container.querySelectorAll<HTMLElement>("[data-analytics-product-id]");
    nodes.forEach((node) => {
      const productId = node.dataset.analyticsProductId;
      if (validUuid(productId) && !trackedIdsRef.current.has(productId)) {
        observer.observe(node);
      }
    });

    return () => observer.disconnect();
  }, [context, productIds, storeOwnerId]);

  return containerRef;
}

