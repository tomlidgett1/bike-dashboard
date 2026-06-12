"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";
import { MarketplaceLayout } from "@/components/layout/marketplace-layout";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import { ProductCardSkeleton } from "@/components/marketplace/product-card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";
import { getOrCreateAnonymousId } from "@/lib/tracking/interaction-tracker";
import { ForYouCarouselRow } from "@/components/marketplace/for-you/for-you-carousel-row";
import type { ForYouFeedPayload } from "@/lib/for-you/types";
import { cn } from "@/lib/utils";

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

  // Background LLM enhancement — never blocks, never degrades.
  React.useEffect(() => {
    if (!feed.enhanceable || enhanceRequestedRef.current) return;
    enhanceRequestedRef.current = true;

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
          setFeed(data.feed);
        }
      })
      .catch(() => {});
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

  return (
    <div className={embedded ? "space-y-3" : "px-3 sm:px-6 py-4 sm:py-6 max-w-[1800px] mx-auto"}>
      {/* Carousels */}
      {feed.carousels.length > 0 ? (
        <AnimatePresence initial={false} mode="popLayout">
          {feed.carousels.map((carousel) => (
            <motion.div
              key={carousel.key}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <ForYouCarouselRow
                carousel={carousel}
                userId={user?.id}
                onDismissProduct={handleDismissProduct}
                onHideCarousel={handleHideCarousel}
                embedded={embedded}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      ) : (
        <EmptyState embedded={embedded} />
      )}
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
    <div className={embedded ? "space-y-3" : "px-3 sm:px-6 py-4 sm:py-6 max-w-[1800px] mx-auto"}>
      {Array.from({ length: 3 }).map((_, section) => (
        <div key={section} className={embedded ? "space-y-2.5 sm:space-y-3" : "py-3"}>
          <div className="h-4 sm:h-5 w-40 sm:w-56 bg-gray-200 rounded-md animate-pulse px-0.5" />
          <div
            className={cn(
              "flex overflow-hidden",
              embedded ? "gap-2.5 sm:gap-3" : "gap-3",
            )}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex-shrink-0 w-[145px] sm:w-[180px] md:w-[200px] lg:w-[220px]">
                <ProductCardSkeleton />
              </div>
            ))}
          </div>
        </div>
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
