"use client";

import * as React from "react";
import { v4 as uuidv4 } from "uuid";
import { getStoreAnalyticsDeviceType } from "@/lib/tracking/store-analytics-device";

type StoreAnalyticsEventType = "store_page_view" | "product_view" | "product_impression";

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

export function useStorePageView(storeOwnerId: string | null | undefined) {
  const trackedRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!validUuid(storeOwnerId) || trackedRef.current === storeOwnerId) return;
    trackedRef.current = storeOwnerId;
    trackStoreAnalyticsEvent({
      eventType: "store_page_view",
      storeOwnerId,
    });
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

