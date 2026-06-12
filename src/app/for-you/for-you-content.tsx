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
import { ForYouTabBar } from "@/components/marketplace/for-you/for-you-tab-bar";
import type { ForYouFeedPayload } from "@/lib/for-you/types";

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
}

export function ForYouContent({ initialFeed, hadIdentity }: ForYouContentProps) {
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
    <>
      <MarketplaceHeader />
      <MarketplaceLayout showFooter={false}>
        <ForYouTabBar />
        <div className="px-3 sm:px-6 py-4 sm:py-6 max-w-[1800px] mx-auto">
          {/* Page header */}
          <div className="mb-3 sm:mb-5">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">For You</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {feed.personalised
                ? "Picked from your recent browsing — it gets sharper as you shop"
                : "A feel for what's good on Yellow Jersey right now"}
            </p>
          </div>

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
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          ) : (
            <EmptyState />
          )}
        </div>
      </MarketplaceLayout>
    </>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-md border border-gray-200 p-12 text-center">
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

export function ForYouSkeleton() {
  return (
    <>
      <MarketplaceHeader />
      <MarketplaceLayout showFooter={false}>
        <ForYouTabBar />
        <div className="px-3 sm:px-6 py-4 sm:py-6 max-w-[1800px] mx-auto">
          <div className="mb-5">
            <div className="h-7 w-32 bg-gray-200 rounded-md animate-pulse" />
            <div className="h-4 w-72 bg-gray-100 rounded-md animate-pulse mt-2" />
          </div>
          {Array.from({ length: 3 }).map((_, section) => (
            <div key={section} className="py-3">
              <div className="h-5 w-56 bg-gray-200 rounded-md animate-pulse mb-3" />
              <div className="flex gap-3 overflow-hidden">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex-shrink-0 w-[145px] sm:w-[200px] lg:w-[220px]">
                    <ProductCardSkeleton />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </MarketplaceLayout>
    </>
  );
}
