"use client";

import * as React from "react";
import { fetchCustomerInquiries } from "@/lib/customer-inquiries/client";
import { GMAIL_INQUIRY_READ_STATE_EVENT } from "@/lib/customer-inquiries/inquiry-read-state";
import { INBOX_NEEDS_ACTION_CHANGED_EVENT } from "@/lib/customer-inquiries/inbox-needs-action-events";
import { fetchMissingBrandProducts } from "@/lib/missing-brands/client";
import { fetchMissingCategoryProducts } from "@/lib/missing-categories/client";
import { readNestCloseMap, NEST_CLOSE_STATE_EVENT } from "@/lib/nest/conversation-close-state";
import { fetchNestListForActions } from "@/lib/nest/fetch-nest-list";
import { OPEN_ACTIONS_CHANGED_EVENT } from "@/lib/store/open-actions-events";
import {
  countOpenStoreActions,
  formatOpenActionsBadgeCount,
  OPEN_ACTIONS_CATALOG_LIMIT,
} from "@/lib/store/open-store-actions";

async function fetchOpenActionsCount(): Promise<number> {
  const [enquiryData, nestData, brandData, categoryData] = await Promise.all([
    fetchCustomerInquiries("draft_ready"),
    fetchNestListForActions(),
    fetchMissingBrandProducts(OPEN_ACTIONS_CATALOG_LIMIT),
    fetchMissingCategoryProducts(OPEN_ACTIONS_CATALOG_LIMIT),
  ]);

  return countOpenStoreActions({
    enquiries: enquiryData.inquiries ?? [],
    nestChats: nestData,
    brandProducts: brandData.products ?? [],
    categoryProducts: categoryData.products ?? [],
    nestCloseMap: readNestCloseMap(),
  });
}

export function useStoreOpenActionsCount(refreshInterval = 60_000) {
  const [count, setCount] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  const applyCount = React.useCallback((next: number) => {
    setCount(next);
    setLoading(false);
  }, []);

  const refreshCount = React.useCallback(async () => {
    try {
      const next = await fetchOpenActionsCount();
      applyCount(next);
    } catch {
      // Keep the last known count on transient failures.
    } finally {
      setLoading(false);
    }
  }, [applyCount]);

  React.useEffect(() => {
    void refreshCount();

    const onRefresh = (event?: Event) => {
      const detail = (event as CustomEvent<{ count?: number }> | undefined)?.detail;
      if (typeof detail?.count === "number") {
        applyCount(detail.count);
        return;
      }
      void refreshCount();
    };

    window.addEventListener(OPEN_ACTIONS_CHANGED_EVENT, onRefresh);
    window.addEventListener(INBOX_NEEDS_ACTION_CHANGED_EVENT, onRefresh);
    window.addEventListener(NEST_CLOSE_STATE_EVENT, onRefresh);
    window.addEventListener(GMAIL_INQUIRY_READ_STATE_EVENT, onRefresh);

    const interval =
      refreshInterval > 0 ? window.setInterval(onRefresh, refreshInterval) : null;

    return () => {
      window.removeEventListener(OPEN_ACTIONS_CHANGED_EVENT, onRefresh);
      window.removeEventListener(INBOX_NEEDS_ACTION_CHANGED_EVENT, onRefresh);
      window.removeEventListener(NEST_CLOSE_STATE_EVENT, onRefresh);
      window.removeEventListener(GMAIL_INQUIRY_READ_STATE_EVENT, onRefresh);
      if (interval) window.clearInterval(interval);
    };
  }, [refreshCount, refreshInterval]);

  return {
    count,
    badge: formatOpenActionsBadgeCount(count),
    loading,
    refresh: refreshCount,
  };
}
