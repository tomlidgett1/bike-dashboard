import { STORE_ANALYTICS_TIMEZONE } from "@/lib/constants/store-analytics";
import type { createServiceRoleClient } from "@/lib/supabase/server";
import type {
  StoreAnalyticsByDevice,
  StoreAnalyticsDeviceBucket,
} from "@/lib/types/store-analytics";

type StoreAnalyticsEventRow = {
  event_type: string | null;
  device_type: string | null;
  user_id: string | null;
  visitor_id: string | null;
  occurred_at: string | null;
};

type MutableTrackingSummary = {
  startDate: string;
  endDate: string;
  storeViews: number;
  productViews: number;
  productImpressions: number;
  distinctViewers: Set<string>;
  byDevice: {
    [Bucket in StoreAnalyticsDeviceBucket]: {
      totalViews: number;
      distinctViewers: Set<string>;
    };
  };
};

type StoreAnalyticsServiceClient = ReturnType<typeof createServiceRoleClient>;

export type WebTrackingAnalyticsOptions = {
  dailyDays?: number;
  weekCount?: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAILY_DAYS = 30;
const DEFAULT_WEEK_COUNT = 12;

const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: STORE_ANALYTICS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function clampPositiveInteger(value: number | undefined, fallback: number, max: number) {
  return Math.max(1, Math.min(Number(value || fallback) || fallback, max));
}

function getStoreAnalyticsDateKey(date: Date) {
  const parts = dateKeyFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("Failed to resolve store analytics date");
  }
  return `${year}-${month}-${day}`;
}

function parseDateKeyAsUtc(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toDateKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysToDateKey(dateKey: string, days: number) {
  const date = parseDateKeyAsUtc(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateKey(date);
}

function getEarliestDateKey(...dateKeys: string[]) {
  return dateKeys.reduce((earliest, dateKey) => (dateKey < earliest ? dateKey : earliest));
}

function getWeekStartDateKey(dateKey: string) {
  const date = parseDateKeyAsUtc(dateKey);
  const day = date.getUTCDay();
  const mondayOffset = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return toDateKey(date);
}

function isPageViewEvent(eventType: string | null) {
  return eventType === "store_page_view" || eventType === "product_view";
}

function normaliseAnalyticsDeviceType(
  deviceType: string | null
): StoreAnalyticsDeviceBucket {
  if (deviceType === "mobile" || deviceType === "desktop") return deviceType;
  return "unknown";
}

function getVisitorKey(row: StoreAnalyticsEventRow) {
  return row.user_id || row.visitor_id || null;
}

function createMutableTrackingSummary(
  startDate: string,
  endDate: string
): MutableTrackingSummary {
  return {
    startDate,
    endDate,
    storeViews: 0,
    productViews: 0,
    productImpressions: 0,
    distinctViewers: new Set<string>(),
    byDevice: {
      mobile: { totalViews: 0, distinctViewers: new Set<string>() },
      desktop: { totalViews: 0, distinctViewers: new Set<string>() },
      unknown: { totalViews: 0, distinctViewers: new Set<string>() },
    },
  };
}

function addEventToTrackingSummary(
  summary: MutableTrackingSummary,
  row: StoreAnalyticsEventRow
) {
  const visitorKey = getVisitorKey(row);

  if (row.event_type === "store_page_view") {
    summary.storeViews += 1;
  } else if (row.event_type === "product_view") {
    summary.productViews += 1;
  } else if (row.event_type === "product_impression") {
    summary.productImpressions += 1;
  }

  if (isPageViewEvent(row.event_type)) {
    const bucket = normaliseAnalyticsDeviceType(row.device_type);
    summary.byDevice[bucket].totalViews += 1;
    if (visitorKey) {
      summary.distinctViewers.add(visitorKey);
      summary.byDevice[bucket].distinctViewers.add(visitorKey);
    }
  }
}

function serialiseTrackingSummary(summary: MutableTrackingSummary) {
  const byDevice: StoreAnalyticsByDevice = {
    mobile: {
      totalViews: summary.byDevice.mobile.totalViews,
      distinctUsers: summary.byDevice.mobile.distinctViewers.size,
    },
    desktop: {
      totalViews: summary.byDevice.desktop.totalViews,
      distinctUsers: summary.byDevice.desktop.distinctViewers.size,
    },
    unknown: {
      totalViews: summary.byDevice.unknown.totalViews,
      distinctUsers: summary.byDevice.unknown.distinctViewers.size,
    },
  };

  return {
    startDate: summary.startDate,
    endDate: summary.endDate,
    storeViews: summary.storeViews,
    productViews: summary.productViews,
    productImpressions: summary.productImpressions,
    totalViews: summary.storeViews + summary.productViews,
    totalDistinctViewers: summary.distinctViewers.size,
    byDevice,
  };
}

async function fetchStoreAnalyticsEvents(
  service: StoreAnalyticsServiceClient,
  userId: string,
  sinceIso: string
) {
  const rows: StoreAnalyticsEventRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await service
      .from("store_analytics_events")
      .select("event_type, device_type, user_id, visitor_id, occurred_at")
      .eq("store_owner_id", userId)
      .gte("occurred_at", sinceIso)
      .order("occurred_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    rows.push(...((data ?? []) as StoreAnalyticsEventRow[]));
    if (!data || data.length < pageSize) break;
  }

  return rows;
}

export async function getWebTrackingAnalytics(
  service: StoreAnalyticsServiceClient,
  userId: string,
  options: WebTrackingAnalyticsOptions = {}
) {
  const dailyDays = clampPositiveInteger(options.dailyDays, DEFAULT_DAILY_DAYS, 365);
  const weekCount = clampPositiveInteger(options.weekCount, DEFAULT_WEEK_COUNT, 53);
  const today = getStoreAnalyticsDateKey(new Date());
  const currentWeekStart = getWeekStartDateKey(today);
  const currentWeekEnd = today;
  const selectedPeriodStart = addDaysToDateKey(today, -(dailyDays - 1));
  const last30Start = addDaysToDateKey(today, -(DEFAULT_DAILY_DAYS - 1));
  const rolling7Start = addDaysToDateKey(today, -6);
  const firstWeekStart = addDaysToDateKey(currentWeekStart, -(weekCount - 1) * 7);
  const firstDate = getEarliestDateKey(selectedPeriodStart, last30Start, rolling7Start, firstWeekStart);
  // Melbourne midnight can be earlier than UTC midnight. Fetch a small buffer
  // and then filter by Melbourne calendar day below.
  const fetchSince = new Date(
    parseDateKeyAsUtc(firstDate).getTime() - 2 * DAY_MS
  ).toISOString();
  const rows = await fetchStoreAnalyticsEvents(service, userId, fetchSince);

  const todaySummary = createMutableTrackingSummary(today, today);
  const weekSummary = createMutableTrackingSummary(currentWeekStart, currentWeekEnd);
  const selectedPeriodSummary = createMutableTrackingSummary(selectedPeriodStart, today);
  const last30Summary = createMutableTrackingSummary(last30Start, today);
  const rolling7Summary = createMutableTrackingSummary(rolling7Start, today);
  const dailySummaries = new Map<string, MutableTrackingSummary>();
  const weeklySummaries = new Map<string, MutableTrackingSummary>();

  for (let index = 0; index < dailyDays; index += 1) {
    const dateKey = addDaysToDateKey(selectedPeriodStart, index);
    dailySummaries.set(dateKey, createMutableTrackingSummary(dateKey, dateKey));
  }

  for (let index = 0; index < weekCount; index += 1) {
    const weekStart = addDaysToDateKey(firstWeekStart, index * 7);
    const weekEnd = weekStart === currentWeekStart ? today : addDaysToDateKey(weekStart, 6);
    weeklySummaries.set(weekStart, createMutableTrackingSummary(weekStart, weekEnd));
  }

  for (const row of rows) {
    if (!row.occurred_at || row.user_id === userId) continue;

    const dateKey = getStoreAnalyticsDateKey(new Date(row.occurred_at));
    if (dateKey > today) continue;

    if (dateKey === today) {
      addEventToTrackingSummary(todaySummary, row);
    }
    if (dateKey >= currentWeekStart) {
      addEventToTrackingSummary(weekSummary, row);
    }
    if (dateKey >= selectedPeriodStart) {
      addEventToTrackingSummary(selectedPeriodSummary, row);
      const daySummary = dailySummaries.get(dateKey);
      if (daySummary) addEventToTrackingSummary(daySummary, row);
    }
    if (dateKey >= last30Start) {
      addEventToTrackingSummary(last30Summary, row);
    }
    if (dateKey >= rolling7Start) {
      addEventToTrackingSummary(rolling7Summary, row);
    }
    if (dateKey >= firstWeekStart) {
      const weekStart = getWeekStartDateKey(dateKey);
      const weekSummaryForRow = weeklySummaries.get(weekStart);
      if (weekSummaryForRow) addEventToTrackingSummary(weekSummaryForRow, row);
    }
  }

  return {
    timezone: STORE_ANALYTICS_TIMEZONE,
    today: serialiseTrackingSummary(todaySummary),
    currentWeek: serialiseTrackingSummary(weekSummary),
    rolling7Days: serialiseTrackingSummary(rolling7Summary),
    selectedPeriod: serialiseTrackingSummary(selectedPeriodSummary),
    last30Days: serialiseTrackingSummary(last30Summary),
    daily: Array.from(dailySummaries.values()).map(serialiseTrackingSummary),
    weekly: Array.from(weeklySummaries.values()).map(serialiseTrackingSummary),
  };
}
