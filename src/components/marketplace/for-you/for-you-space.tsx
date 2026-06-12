"use client";

import * as React from "react";
import {
  ForYouFeedView,
  ForYouFeedSkeletonBody,
} from "@/app/for-you/for-you-content";
import type { ForYouFeedPayload } from "@/lib/for-you/types";

// ============================================================
// For You feed panel — content only (tabs live in UnifiedFilterBar)
// ============================================================

const EMPTY_FEED: ForYouFeedPayload = {
  feedId: "",
  carousels: [],
  personalised: false,
  source: "deterministic",
  generatedAt: "",
  enhanceable: false,
};

export function ForYouFeedPanel() {
  const [feed, setFeed] = React.useState<ForYouFeedPayload | null>(null);

  React.useEffect(() => {
    let active = true;
    fetch("/api/for-you/feed")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data?.success && data.feed?.carousels) {
          setFeed(data.feed as ForYouFeedPayload);
        } else if (active) {
          setFeed(EMPTY_FEED);
        }
      })
      .catch(() => {
        if (active) setFeed(EMPTY_FEED);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!feed) {
    return <ForYouFeedSkeletonBody embedded />;
  }

  return <ForYouFeedView initialFeed={feed} hadIdentity embedded />;
}

/** @deprecated Use ForYouFeedPanel — kept for any stale imports. */
export const ForYouSpace = ForYouFeedPanel;
