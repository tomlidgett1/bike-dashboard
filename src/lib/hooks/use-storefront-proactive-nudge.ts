"use client";

import * as React from "react";
import {
  browseContextHasSignal,
  markProactiveNudgeDismissed,
  readBrowseContext,
  recordBrowseScroll,
  refreshBrowseContextFromDom,
  startStorefrontBrowseVisibilityTracking,
  summariseBrowseContext,
  wasProactiveNudgeDismissed,
  type StorefrontBrowseContext,
  type StorefrontBrowseSummary,
} from "@/lib/nest/storefront-browse-context";

/** Engaged browsing time after the shopper starts scrolling / interacting. */
const ENGAGED_TRIGGER_MS = 30_000;
const MIN_SCROLL_DEPTH_PCT = 8;
const POLL_MS = 700;

export type ProactiveNudgeState = {
  status: "idle" | "loading" | "ready" | "dismissed" | "error";
  question: string | null;
  assistantLabel: string | null;
  storeName: string | null;
};

function buildFallbackQuestion(summary: StorefrontBrowseSummary): string {
  const focus = summary.focusProduct;
  const visible = summary.currentlyVisible[0];
  const product = focus?.name?.trim() || visible?.name?.trim();
  const brand = focus?.brand?.trim() || visible?.brand?.trim() || summary.brands[0];
  const category =
    summary.activeCategory?.trim() ||
    focus?.category?.trim() ||
    summary.categories[0]?.trim();
  const search = summary.searches[0]?.trim();

  if (product && brand) {
    return `Is the ${brand} ${product} for racing, or more weekend rides?`;
  }
  if (product) {
    return `Still looking at the ${product} — want help choosing a size?`;
  }
  if (brand && category) {
    return `Comparing ${brand} options in ${category}? I can narrow it down.`;
  }
  if (brand) {
    return `Interested in ${brand}? Want the best match for how you ride?`;
  }
  if (category) {
    return `Shopping ${category} — commuting, fitness, or something faster?`;
  }
  if (search) {
    return `Still after “${search}”? Want me to shortlist a couple?`;
  }
  return "Need a hand finding the right bike or gear?";
}

/**
 * After ~30s of engaged browsing (once the shopper has started scrolling),
 * fetches a contextual Nest shopping question for the corner popup.
 */
export function useStorefrontProactiveNudge(args: {
  storeId: string | null;
  enabled: boolean;
}): {
  nudge: ProactiveNudgeState;
  dismissNudge: () => void;
  browseContext: StorefrontBrowseContext | null;
} {
  const { storeId, enabled } = args;
  const [nudge, setNudge] = React.useState<ProactiveNudgeState>({
    status: "idle",
    question: null,
    assistantLabel: null,
    storeName: null,
  });
  const [browseContext, setBrowseContext] = React.useState<StorefrontBrowseContext | null>(
    null,
  );
  const fetchingRef = React.useRef(false);
  const firstEngageAtRef = React.useRef<number | null>(null);
  const lastTickRef = React.useRef(Date.now());

  const dismissNudge = React.useCallback(() => {
    if (storeId) markProactiveNudgeDismissed(storeId);
    setNudge({
      status: "dismissed",
      question: null,
      assistantLabel: null,
      storeName: null,
    });
  }, [storeId]);

  // Track which product cards are actually on screen.
  React.useEffect(() => {
    if (!enabled || !storeId) return;
    return startStorefrontBrowseVisibilityTracking(storeId);
  }, [enabled, storeId]);

  // Start the engagement clock on scroll / wheel / touch and keep depth fresh.
  React.useEffect(() => {
    if (!enabled || !storeId) return;
    if (wasProactiveNudgeDismissed(storeId)) {
      setNudge((current) =>
        current.status === "dismissed"
          ? current
          : { status: "dismissed", question: null, assistantLabel: null, storeName: null },
      );
      return;
    }

    firstEngageAtRef.current = null;
    lastTickRef.current = Date.now();

    const markEngagement = () => {
      const now = Date.now();
      if (firstEngageAtRef.current == null) {
        firstEngageAtRef.current = now;
      }
      const elapsed = now - lastTickRef.current;
      lastTickRef.current = now;
      const doc = document.documentElement;
      const maxScroll = Math.max(doc.scrollHeight - window.innerHeight, 1);
      const depth = Math.round((window.scrollY / maxScroll) * 100);
      const effectiveDepth = Math.max(depth, 10);
      if (elapsed > 0 && elapsed < 2000) {
        recordBrowseScroll(storeId, elapsed, effectiveDepth);
      } else {
        recordBrowseScroll(storeId, 50, effectiveDepth);
      }
    };

    window.addEventListener("scroll", markEngagement, { passive: true, capture: true });
    window.addEventListener("wheel", markEngagement, { passive: true, capture: true });
    window.addEventListener("touchmove", markEngagement, { passive: true, capture: true });
    return () => {
      window.removeEventListener("scroll", markEngagement, true);
      window.removeEventListener("wheel", markEngagement, true);
      window.removeEventListener("touchmove", markEngagement, true);
    };
  }, [enabled, storeId]);

  // Poll engagement and fire the proactive nudge once ready.
  React.useEffect(() => {
    if (!enabled || !storeId) return;
    if (wasProactiveNudgeDismissed(storeId)) return;

    const tick = () => {
      // Refresh from whatever cards are currently on screen before deciding.
      const context = refreshBrowseContextFromDom(storeId);
      setBrowseContext(context);

      if (fetchingRef.current) return;
      if (nudge.status === "ready" || nudge.status === "loading" || nudge.status === "dismissed") {
        return;
      }

      const firstEngageAt = firstEngageAtRef.current;
      if (firstEngageAt == null) return;

      const engagedLongEnough = Date.now() - firstEngageAt >= ENGAGED_TRIGGER_MS;
      const scrolledEnough = context.maxScrollDepthPct >= MIN_SCROLL_DEPTH_PCT;
      const hasSignal = browseContextHasSignal(context);
      // Prefer waiting until we actually know what they're looking at.
      const hasProductSignal =
        context.products.length > 0 ||
        context.brands.length > 0 ||
        context.categories.length > 0 ||
        context.searches.length > 0;
      if (!engagedLongEnough || !scrolledEnough) return;
      if (!hasSignal) return;
      // Give product impressions a moment to land; if still none after 45s, allow generic.
      const waitedForProducts = Date.now() - firstEngageAt >= 45_000;
      if (!hasProductSignal && !waitedForProducts) return;

      fetchingRef.current = true;
      setNudge({
        status: "loading",
        question: null,
        assistantLabel: null,
        storeName: null,
      });

      const summary = summariseBrowseContext(context);
      void fetch(`/api/marketplace/store/${storeId}/nest-proactive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ browseContext: summary }),
      })
        .then(async (response) => {
          const data = (await response.json().catch(() => ({}))) as {
            question?: string;
            assistantLabel?: string;
            storeName?: string;
            error?: string;
          };
          if (!response.ok || !data.question?.trim()) {
            throw new Error(data.error || "Could not load nudge.");
          }
          setNudge({
            status: "ready",
            question: data.question.trim(),
            assistantLabel: data.assistantLabel?.trim() || null,
            storeName: data.storeName?.trim() || null,
          });
        })
        .catch((error) => {
          console.warn("[nest-proactive] nudge failed, using fallback", error);
          setNudge({
            status: "ready",
            question: buildFallbackQuestion(summary),
            assistantLabel: null,
            storeName: null,
          });
        })
        .finally(() => {
          fetchingRef.current = false;
        });
    };

    const interval = window.setInterval(tick, POLL_MS);
    tick();
    return () => window.clearInterval(interval);
  }, [enabled, storeId, nudge.status]);

  // Keep a lightweight live context object available even before the nudge fires.
  React.useEffect(() => {
    if (!enabled || !storeId) return;
    const interval = window.setInterval(() => {
      setBrowseContext(readBrowseContext(storeId));
    }, 2000);
    return () => window.clearInterval(interval);
  }, [enabled, storeId]);

  return { nudge, dismissNudge, browseContext };
}
