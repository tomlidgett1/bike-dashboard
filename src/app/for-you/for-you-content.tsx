"use client";

import * as React from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { Sparkles } from '@/components/layout/app-sidebar/dashboard-icons';
import { MarketplaceLayout } from "@/components/layout/marketplace-layout";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import { ProductCardSkeleton } from "@/components/marketplace/product-card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";
import { getOrCreateAnonymousId } from "@/lib/tracking/interaction-tracker";
import { ForYouCarouselRow } from "@/components/marketplace/for-you/for-you-carousel-row";
import { ForYouMoreProductsSection } from "@/components/marketplace/for-you/for-you-more-products-section";
import { FOR_YOU_CAROUSEL_CARD_WIDTH } from "@/components/marketplace/for-you/carousel-card-width";
import type { ForYouFeedPayload, ForYouCarousel } from "@/lib/for-you/types";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import {
  genieProgressShimmerClassName,
  genieProgressShimmerStyle,
} from "@/lib/genie/shimmer";
import { cn } from "@/lib/utils";

const ENHANCE_EASE = [0.04, 0.62, 0.23, 0.98] as const;
const ENHANCE_LAYOUT_TRANSITION = { duration: 0.58, ease: ENHANCE_EASE } as const;
const ENHANCE_STAGGER_S = 0.075;
const ENHANCE_REVEAL_CLEAR_MS = 900;

const ENHANCE_MESSAGES = [
  "Personalising your picks…",
  "Finding collections you'll love…",
  "Grouping bikes and gear for you…",
  "Almost ready…",
];

// Endless scroll — how far below the viewport the next page starts loading.
const ENDLESS_PREFETCH_MARGIN = "1200px";
const MAX_EXCLUDE_IDS = 300;

/** Top categories across the carousels — steers the endless feed's blend. */
function topCarouselCategories(carousels: ForYouCarousel[]): string[] {
  const counts = new Map<string, number>();
  for (const carousel of carousels) {
    for (const product of carousel.products) {
      const category = product.marketplace_category?.trim();
      if (!category) continue;
      counts.set(category, (counts.get(category) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category]) => category);
}

// ============================================================
// For You — personalised, carousel-led discovery page
// ============================================================
// The deterministic feed arrives server-rendered (instant content). After
// hydration we fire one background enhance call; if the LLM improves the
// feed, carousels morph in place. Every interaction feeds the next visit.

interface ForYouContentProps {
  initialFeed: ForYouFeedPayload;
  /** False when the server saw no cookie identity (first ever visit). */
  hadIdentity: boolean;
  /** Inside marketplace tab shell — inherits px-2/sm:px-6 from the page content area. */
  embedded?: boolean;
}

/** Personalised carousels slot in at the top; anything the LLM dropped stays below. */
function mergeEnhancedCarousels(
  baseline: ForYouCarousel[],
  enhanced: ForYouCarousel[],
): { merged: ForYouCarousel[]; enteringKeys: Set<string> } {
  const enhancedKeys = new Set(enhanced.map((c) => c.key));
  const baselineKeys = new Set(baseline.map((c) => c.key));
  const enteringKeys = new Set<string>();

  for (const carousel of enhanced) {
    if (!baselineKeys.has(carousel.key) || carousel.source === "llm") {
      enteringKeys.add(carousel.key);
    }
  }

  return {
    merged: [...enhanced, ...baseline.filter((c) => !enhancedKeys.has(c.key))],
    enteringKeys,
  };
}

/**
 * Standalone route wrapper — /for-you redirects to marketplace?space=for-you.
 * Kept for direct imports of the feed body elsewhere.
 */
export function ForYouContent({ initialFeed, hadIdentity }: ForYouContentProps) {
  return (
    <>
      <MarketplaceHeader />
      <MarketplaceLayout showFooter={false}>
        <ForYouFeedView initialFeed={initialFeed} hadIdentity={hadIdentity} />
      </MarketplaceLayout>
    </>
  );
}

/**
 * The feed body itself — page heading + carousels + all behavioural wiring
 * (anon identity, background LLM enhance, optimistic dismiss). Renders bare so
 * it can sit inside either the standalone route or the marketplace For You
 * space (which already provides its own header/layout/tab bar).
 */
export function ForYouFeedView({ initialFeed, hadIdentity, embedded = false }: ForYouContentProps) {
  const { user } = useAuth();
  const [feed, setFeed] = React.useState<ForYouFeedPayload>(initialFeed);
  const [isEnhancing, setIsEnhancing] = React.useState(() => initialFeed.enhanceable);
  const [enhanceMessageIndex, setEnhanceMessageIndex] = React.useState(0);
  const [enteringCarouselKeys, setEnteringCarouselKeys] = React.useState<Set<string>>(
    () => new Set(),
  );
  const enhanceRequestedRef = React.useRef(false);

  // Establish the persistent anonymous identity cookie. If the server built
  // this feed without any identity (very first visit), one refetch picks up
  // the new cookie so behaviour starts accruing immediately.
  React.useEffect(() => {
    try {
      getOrCreateAnonymousId();
    } catch {
      /* storage unavailable (private mode) — feed still works */
    }
    if (!hadIdentity) {
      fetch("/api/for-you/feed")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.success && data.feed?.carousels?.length) setFeed(data.feed);
        })
        .catch(() => {});
    }
  }, [hadIdentity]);

  React.useEffect(() => {
    if (!isEnhancing) {
      setEnhanceMessageIndex(0);
      return;
    }

    const interval = window.setInterval(() => {
      setEnhanceMessageIndex((current) => (current + 1) % ENHANCE_MESSAGES.length);
    }, 2500);

    return () => window.clearInterval(interval);
  }, [isEnhancing]);

  React.useEffect(() => {
    if (enteringCarouselKeys.size === 0) return;
    const timer = window.setTimeout(() => setEnteringCarouselKeys(new Set()), ENHANCE_REVEAL_CLEAR_MS);
    return () => window.clearTimeout(timer);
  }, [enteringCarouselKeys]);

  // Background LLM enhancement — never blocks, never degrades.
  React.useEffect(() => {
    if (!feed.enhanceable || enhanceRequestedRef.current) return;
    enhanceRequestedRef.current = true;
    setIsEnhancing(true);

    // No abort on unmount: this warms the shared feed cache either way, and
    // aborting under React strict mode would skip enhancement entirely.
    fetch("/api/for-you/enhance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedId: feed.feedId }),
      keepalive: true,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data.feed?.carousels?.length >= 3) {
          const enhanced = data.feed as ForYouFeedPayload;
          let keysToEnter = new Set<string>();
          setFeed((prev) => {
            const { merged, enteringKeys } = mergeEnhancedCarousels(
              prev.carousels,
              enhanced.carousels,
            );
            keysToEnter = enteringKeys;
            return {
              ...enhanced,
              carousels: merged,
              moreProducts: enhanced.moreProducts ?? prev.moreProducts,
            };
          });
          setEnteringCarouselKeys(keysToEnter);
        }
      })
      .catch(() => {})
      .finally(() => setIsEnhancing(false));
  }, [feed.enhanceable, feed.feedId]);

  const handleDismissProduct = React.useCallback((carouselKey: string, productId: string) => {
    setFeed((prev) => ({
      ...prev,
      carousels: prev.carousels
        .map((c) =>
          c.key === carouselKey
            ? { ...c, products: c.products.filter((p) => p.id !== productId) }
            : c,
        )
        .filter((c) => c.products.length > 0),
    }));
    fetch("/api/for-you/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, kind: "not_interested" }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  const handleHideCarousel = React.useCallback((carouselKey: string) => {
    setFeed((prev) => ({
      ...prev,
      carousels: prev.carousels.filter((c) => c.key !== carouselKey),
    }));
    fetch("/api/for-you/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ carouselKey, kind: "hide_carousel" }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  const handleDismissMoreProduct = React.useCallback((productId: string) => {
    setFeed((prev) => ({
      ...prev,
      moreProducts: (prev.moreProducts || []).filter((p) => p.id !== productId),
    }));
    setEndlessProducts((prev) => prev.filter((p) => p.id !== productId));
    fetch("/api/for-you/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, kind: "not_interested" }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  // ── Endless scroll ─────────────────────────────────────────
  // After the curated carousels + tail grid, the feed keeps going: pages of
  // personalised-but-varied inventory stream in as the user approaches the
  // bottom. Ordering is seeded per visit so pages never repeat products.
  const [endlessProducts, setEndlessProducts] = React.useState<MarketplaceProduct[]>([]);
  const [endlessLoading, setEndlessLoading] = React.useState(false);
  const [endlessHasMore, setEndlessHasMore] = React.useState(true);
  const endlessPageRef = React.useRef(0);
  const endlessBusyRef = React.useRef(false);
  const [endlessSeed] = React.useState(
    () => `fy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const sentinelRef = React.useRef<HTMLDivElement>(null);

  const feedRef = React.useRef(feed);
  feedRef.current = feed;
  const endlessProductsRef = React.useRef(endlessProducts);
  endlessProductsRef.current = endlessProducts;

  const loadNextEndlessPage = React.useCallback(async () => {
    if (endlessBusyRef.current) return;
    endlessBusyRef.current = true;
    setEndlessLoading(true);

    try {
      const currentFeed = feedRef.current;
      const shownIds = [
        ...currentFeed.carousels.flatMap((c) => c.products.map((p) => p.id)),
        ...(currentFeed.moreProducts || []).map((p) => p.id),
      ].slice(0, MAX_EXCLUDE_IDS);

      const params = new URLSearchParams({
        page: String(endlessPageRef.current + 1),
        seed: endlessSeed,
      });
      const categories = topCarouselCategories(currentFeed.carousels);
      if (categories.length > 0) params.set("categories", categories.join(","));
      if (shownIds.length > 0) params.set("exclude", shownIds.join(","));

      const res = await fetch(`/api/for-you/more?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        success: boolean;
        products?: MarketplaceProduct[];
        hasMore?: boolean;
      };
      if (!data.success) throw new Error("Endless feed page failed");

      const seen = new Set([
        ...shownIds,
        ...endlessProductsRef.current.map((p) => p.id),
      ]);
      const fresh = (data.products || []).filter((p) => !seen.has(p.id));

      endlessPageRef.current += 1;
      setEndlessProducts((prev) => [...prev, ...fresh]);
      // A page of pure duplicates means the pool is exhausted even if the
      // server thinks there's more — stop rather than loop.
      setEndlessHasMore(Boolean(data.hasMore) && fresh.length > 0);
    } catch {
      // Network hiccup: allow the observer to retry on the next scroll.
    } finally {
      endlessBusyRef.current = false;
      setEndlessLoading(false);
    }
  }, [endlessSeed]);

  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !endlessHasMore) return;
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadNextEndlessPage();
        }
      },
      { rootMargin: `0px 0px ${ENDLESS_PREFETCH_MARGIN} 0px`, threshold: 0 },
    );

    observer.observe(el);
    return () => observer.disconnect();
    // endlessProducts.length: reconnect after each page so the observer re-fires
    // immediately when the sentinel is still inside the prefetch margin.
  }, [endlessHasMore, loadNextEndlessPage, feed.carousels.length, endlessProducts.length]);

  const moreProducts = React.useMemo(
    () => [...(feed.moreProducts || []), ...endlessProducts],
    [feed.moreProducts, endlessProducts],
  );
  let personalisedStaggerIndex = 0;

  return (
    <div
      className={
        embedded
          ? undefined
          : "max-w-[1800px] mx-auto px-4 sm:px-4 lg:px-4 xl:px-5 pt-2 pb-5 sm:pt-3 sm:pb-7"
      }
    >
      {feed.carousels.length > 0 ? (
        <LayoutGroup id="for-you-feed">
          <motion.div layout className="space-y-1">
            <AnimatePresence initial={false} mode="popLayout">
              {isEnhancing && (
                <motion.div
                  key="for-you-enhance-loading"
                  layout
                  initial={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.38, ease: ENHANCE_EASE }}
                  className="overflow-hidden"
                >
                  <ForYouEnhanceLoadingText messageIndex={enhanceMessageIndex} />
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence initial={false} mode="popLayout">
              {feed.carousels.map((carousel) => {
                const isEntering = enteringCarouselKeys.has(carousel.key);
                const staggerDelay = isEntering
                  ? personalisedStaggerIndex++ * ENHANCE_STAGGER_S
                  : 0;

                return (
                  <motion.div
                    key={carousel.key}
                    layout
                    initial={false}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{
                      layout: ENHANCE_LAYOUT_TRANSITION,
                      opacity: { duration: 0.25 },
                      height: { duration: 0.35, ease: ENHANCE_EASE },
                    }}
                    className={isEntering ? "for-you-carousel-reveal" : undefined}
                    style={
                      isEntering
                        ? ({ animationDelay: `${staggerDelay}s` } as React.CSSProperties)
                        : undefined
                    }
                  >
                    <ForYouCarouselRow
                      carousel={carousel}
                      userId={user?.id}
                      onDismissProduct={handleDismissProduct}
                      onHideCarousel={handleHideCarousel}
                      embedded={embedded}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>

            <motion.div layout transition={{ layout: ENHANCE_LAYOUT_TRANSITION }}>
              <ForYouMoreProductsSection
                products={moreProducts}
                userId={user?.id}
                embedded={embedded}
                onDismissProduct={handleDismissMoreProduct}
                loadingMore={endlessLoading}
                reachedEnd={!endlessHasMore && endlessProducts.length > 0}
              />
              {/* Endless-scroll sentinel — triggers the next page well before the bottom */}
              <div ref={sentinelRef} aria-hidden className="h-px" />
            </motion.div>
          </motion.div>
        </LayoutGroup>
      ) : isEnhancing ? (
        <div className="space-y-1">
          <ForYouEnhanceLoadingText messageIndex={enhanceMessageIndex} />
          <ForYouEnhanceLoadingSkeletons />
        </div>
      ) : (
        <EmptyState embedded={embedded} />
      )}
    </div>
  );
}

function ForYouEnhanceLoadingText({ messageIndex }: { messageIndex: number }) {
  const message = ENHANCE_MESSAGES[messageIndex % ENHANCE_MESSAGES.length];

  return (
    <div className="mb-0.5 min-h-5" aria-live="polite" aria-busy="true">
      <AnimatePresence mode="wait">
        <motion.p
          key={message}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.35, ease: ENHANCE_EASE }}
          className={cn(
            "w-fit max-w-full whitespace-normal text-sm leading-relaxed",
            genieProgressShimmerClassName,
          )}
          style={genieProgressShimmerStyle}
        >
          {message}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

function ForYouEnhanceLoadingSkeletons() {
  return (
    <div className="flex items-start gap-1.5 sm:gap-2 overflow-hidden opacity-70">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className={cn("flex-shrink-0", FOR_YOU_CAROUSEL_CARD_WIDTH)}>
          <ProductCardSkeleton hideStoreMeta />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ embedded = false }: { embedded?: boolean }) {
  return (
    <div
      className={cn(
        "bg-white rounded-md border border-gray-200 text-center",
        embedded ? "p-8 sm:p-12" : "p-12",
      )}
    >
      <Sparkles className="h-14 w-14 text-gray-300 mx-auto mb-4" />
      <h3 className="text-xl font-semibold text-gray-900 mb-2">Nothing to show just yet</h3>
      <p className="text-gray-600 max-w-md mx-auto mb-6">
        Browse the marketplace for a minute — we&apos;ll start lining up bikes and gear that
        actually suit you.
      </p>
      <Button
        onClick={() => (window.location.href = "/marketplace")}
        className="rounded-md bg-[#ffde59] hover:bg-[#f5cf3f] text-gray-900 font-medium"
      >
        Browse Marketplace
      </Button>
    </div>
  );
}

/** Bare loading body (no page chrome) — shared by route + space skeletons. */
export function ForYouFeedSkeletonBody({ embedded = false }: { embedded?: boolean }) {
  return (
    <div
      className={
        embedded
          ? "space-y-1"
          : "max-w-[1800px] mx-auto px-4 sm:px-4 lg:px-4 xl:px-5 pt-2 pb-5 sm:pt-3 sm:pb-7 space-y-1"
      }
    >
      {Array.from({ length: 3 }).map((_, section) => (
        <section key={section}>
          <div className="h-5 w-40 sm:w-56 bg-gray-200 rounded-md animate-pulse mb-0.5" />
          <div className="flex items-start gap-1.5 sm:gap-2 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={cn("flex-shrink-0", FOR_YOU_CAROUSEL_CARD_WIDTH)}>
                <ProductCardSkeleton hideStoreMeta />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function ForYouSkeleton() {
  return (
    <>
      <MarketplaceHeader />
      <MarketplaceLayout showFooter={false}>
        <ForYouFeedSkeletonBody />
      </MarketplaceLayout>
    </>
  );
}
