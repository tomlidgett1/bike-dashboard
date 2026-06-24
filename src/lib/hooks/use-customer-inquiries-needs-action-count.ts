"use client";

import * as React from "react";
import { GMAIL_INQUIRY_READ_STATE_EVENT } from "@/lib/customer-inquiries/inquiry-read-state";
import { INBOX_NEEDS_ACTION_CHANGED_EVENT } from "@/lib/customer-inquiries/inbox-needs-action-events";
import { loadUnifiedInboxFromStorage } from "@/lib/customer-inquiries/unified-inbox-cache";
import { countUnifiedInboxNeedsAction } from "@/lib/customer-inquiries/unified-inbox-needs-action";
import {
  NEST_CLOSE_STATE_EVENT,
  readNestCloseMap,
} from "@/lib/nest/conversation-close-state";

function formatBadgeCount(count: number): string | undefined {
  if (count <= 0) return undefined;
  return count > 99 ? "99+" : String(count);
}

/** Same computation the Customer inquiries tab uses once its cache is hydrated. */
function countFromClientCache(): number | null {
  const cached = loadUnifiedInboxFromStorage();
  if (!cached) return null;

  return countUnifiedInboxNeedsAction({
    inquiries: cached.inquiries,
    nestChats: cached.nestChats,
    nestCloseMap: readNestCloseMap(),
    nestConfigured: cached.nestConfigured ?? true,
  });
}

async function fetchNeedsActionCountFromApi(): Promise<number | null> {
  const res = await fetch("/api/store/customer-inquiries/needs-action-count", {
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) return 0;
  if (!res.ok) return null;
  const data = (await res.json()) as { count?: number };
  return typeof data.count === "number" ? data.count : 0;
}

export function useCustomerInquiriesNeedsActionCount(refreshInterval = 60_000) {
  const [count, setCount] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  const applyCount = React.useCallback((next: number) => {
    setCount(next);
    setLoading(false);
  }, []);

  const refreshCount = React.useCallback(async () => {
    const cachedCount = countFromClientCache();
    if (cachedCount !== null) {
      applyCount(cachedCount);
      return;
    }

    try {
      const apiCount = await fetchNeedsActionCountFromApi();
      if (apiCount !== null) applyCount(apiCount);
    } catch {
      // Keep the last known count on transient failures.
    } finally {
      setLoading(false);
    }
  }, [applyCount]);

  React.useEffect(() => {
    void refreshCount();

    const onRefresh = () => {
      const cachedCount = countFromClientCache();
      if (cachedCount !== null) {
        applyCount(cachedCount);
        return;
      }
      void refreshCount();
    };

    window.addEventListener(INBOX_NEEDS_ACTION_CHANGED_EVENT, onRefresh);
    window.addEventListener(NEST_CLOSE_STATE_EVENT, onRefresh);
    window.addEventListener(GMAIL_INQUIRY_READ_STATE_EVENT, onRefresh);

    const interval =
      refreshInterval > 0 ? window.setInterval(onRefresh, refreshInterval) : null;

    return () => {
      window.removeEventListener(INBOX_NEEDS_ACTION_CHANGED_EVENT, onRefresh);
      window.removeEventListener(NEST_CLOSE_STATE_EVENT, onRefresh);
      window.removeEventListener(GMAIL_INQUIRY_READ_STATE_EVENT, onRefresh);
      if (interval) window.clearInterval(interval);
    };
  }, [applyCount, refreshCount, refreshInterval]);

  return {
    count,
    badge: formatBadgeCount(count),
    loading,
    refresh: refreshCount,
  };
}
