"use client";

import * as React from "react";
import { useUserProfile } from "@/components/providers/profile-provider";
import { GMAIL_INQUIRY_READ_STATE_EVENT } from "@/lib/customer-inquiries/inquiry-read-state";
import { INBOX_NEEDS_ACTION_CHANGED_EVENT } from "@/lib/customer-inquiries/inbox-needs-action-events";
import { readNestCloseMap, NEST_CLOSE_STATE_EVENT } from "@/lib/nest/conversation-close-state";
import {
  fetchOpenActionsSnapshot,
  readOpenActionsSnapshot,
  type OpenActionsSnapshot,
} from "@/lib/store/open-actions-client";
import { OPEN_ACTIONS_CHANGED_EVENT } from "@/lib/store/open-actions-events";
import {
  countOpenStoreActions,
  formatOpenActionsBadgeCount,
} from "@/lib/store/open-store-actions";

function countSnapshot(snapshot: OpenActionsSnapshot): number {
  return countOpenStoreActions({
    enquiries: snapshot.enquiries,
    nestChats: snapshot.nestChats,
    brandProducts: snapshot.brandProducts,
    categoryProducts: snapshot.categoryProducts,
    nestCloseMap: readNestCloseMap(),
  });
}

export function useStoreOpenActionsCount(refreshInterval = 60_000) {
  const { profile } = useUserProfile();
  const scope = profile?.user_id || null;
  const [count, setCount] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  const applyCount = React.useCallback((next: number) => {
    setCount(next);
    setLoading(false);
  }, []);

  const refreshCount = React.useCallback(async () => {
    if (!scope) return;
    try {
      const snapshot = await fetchOpenActionsSnapshot(scope);
      applyCount(countSnapshot(snapshot));
    } catch {
      // Keep the last known count on transient failures.
    } finally {
      setLoading(false);
    }
  }, [applyCount, scope]);

  React.useEffect(() => {
    if (!scope) return;
    const cached = readOpenActionsSnapshot(scope);
    if (cached) applyCount(countSnapshot(cached));
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
  }, [applyCount, refreshCount, refreshInterval, scope]);

  return {
    count,
    badge: formatOpenActionsBadgeCount(count),
    loading,
    refresh: refreshCount,
  };
}
