"use client";

import * as React from "react";
import {
  GMAIL_INQUIRY_READ_STATE_EVENT,
  readGmailInquiryLastReadMap,
} from "@/lib/customer-inquiries/inquiry-read-state";
import { INBOX_NEEDS_ACTION_CHANGED_EVENT } from "@/lib/customer-inquiries/inbox-needs-action-events";
import { loadUnifiedInboxFromStorage } from "@/lib/customer-inquiries/unified-inbox-cache";
import {
  countUnifiedInboxUnread,
  mergeGmailAndNestReadMaps,
} from "@/lib/customer-inquiries/unified-inbox-unread";
import {
  NEST_CLOSE_STATE_EVENT,
  readNestCloseMap,
} from "@/lib/nest/conversation-close-state";
import {
  NEST_READ_STATE_EVENT,
  readNestLastReadMap,
} from "@/lib/nest/conversation-read-state";

function formatBadgeCount(count: number): string | undefined {
  if (count <= 0) return undefined;
  return String(count);
}

/** Same unread total as the Customer enquiries "Unread" tab once cache is hydrated. */
function countFromClientCache(): number | null {
  const cached = loadUnifiedInboxFromStorage();
  if (!cached) return null;

  const { gmailReadMap, nestReadMap } = mergeGmailAndNestReadMaps({
    gmailReadMap: cached.gmailReadMap,
    nestReadMap: cached.nestReadMap,
    localGmailReadMap: readGmailInquiryLastReadMap(),
    localNestReadMap: readNestLastReadMap(),
  });

  return countUnifiedInboxUnread({
    inquiries: cached.inquiries,
    nestChats: cached.nestChats,
    gmailReadMap,
    nestReadMap,
    nestCloseMap: readNestCloseMap(),
    nestConfigured: cached.nestConfigured ?? true,
  });
}

async function fetchUnreadCountFromApi(): Promise<number | null> {
  const res = await fetch("/api/store/customer-inquiries/unread-count", {
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) return 0;
  if (!res.ok) return null;
  const data = (await res.json()) as { count?: number };
  return typeof data.count === "number" ? data.count : 0;
}

export function useCustomerInquiriesUnreadCount(refreshInterval = 60_000) {
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
      const apiCount = await fetchUnreadCountFromApi();
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
    window.addEventListener(NEST_READ_STATE_EVENT, onRefresh);

    const interval =
      refreshInterval > 0 ? window.setInterval(onRefresh, refreshInterval) : null;

    return () => {
      window.removeEventListener(INBOX_NEEDS_ACTION_CHANGED_EVENT, onRefresh);
      window.removeEventListener(NEST_CLOSE_STATE_EVENT, onRefresh);
      window.removeEventListener(GMAIL_INQUIRY_READ_STATE_EVENT, onRefresh);
      window.removeEventListener(NEST_READ_STATE_EVENT, onRefresh);
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
