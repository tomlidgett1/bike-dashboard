export type HomeV2OverviewMetrics = {
  rolling7Days: {
    startDate: string;
    endDate: string;
    totalDistinctViewers: number;
  };
  today: {
    startDate: string;
    endDate: string;
    totalDistinctViewers: number;
  };
  inventory: {
    marketplaceLive: number;
    withoutApprovedPhotos: number;
  };
};

type CachedHomeV2Metrics = {
  storeOwnerId: string;
  metrics: HomeV2OverviewMetrics;
  savedAt: string;
};

const CACHE_KEY = "yj_homev2_metrics_v2";

function isTrackingPeriodSummary(value: unknown): value is HomeV2OverviewMetrics["rolling7Days"] {
  if (!value || typeof value !== "object") return false;
  const summary = value as HomeV2OverviewMetrics["rolling7Days"];
  return (
    typeof summary.startDate === "string" &&
    typeof summary.endDate === "string" &&
    typeof summary.totalDistinctViewers === "number"
  );
}

function isHomeV2OverviewMetrics(value: unknown): value is HomeV2OverviewMetrics {
  if (!value || typeof value !== "object") return false;
  const metrics = value as HomeV2OverviewMetrics;
  return (
    isTrackingPeriodSummary(metrics.rolling7Days) &&
    isTrackingPeriodSummary(metrics.today) &&
    typeof metrics.inventory?.marketplaceLive === "number" &&
    typeof metrics.inventory?.withoutApprovedPhotos === "number"
  );
}

export function readCachedHomeV2MetricsEntry(): CachedHomeV2Metrics | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedHomeV2Metrics;
    if (!parsed?.storeOwnerId || !isHomeV2OverviewMetrics(parsed.metrics)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function readCachedHomeV2Metrics(): HomeV2OverviewMetrics | null {
  return readCachedHomeV2MetricsEntry()?.metrics ?? null;
}

export function writeCachedHomeV2Metrics(
  storeOwnerId: string,
  metrics: HomeV2OverviewMetrics,
): void {
  if (typeof window === "undefined") return;

  const payload: CachedHomeV2Metrics = {
    storeOwnerId,
    metrics,
    savedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore quota / private mode errors.
  }
}

export function parseHomeV2OverviewMetrics(json: unknown): HomeV2OverviewMetrics | null {
  if (!json || typeof json !== "object") return null;

  const data = json as {
    webAnalytics?: {
      rolling7Days?: HomeV2OverviewMetrics["rolling7Days"];
      today?: HomeV2OverviewMetrics["today"];
    };
    inventory?: HomeV2OverviewMetrics["inventory"];
  };

  const rolling7Days = data.webAnalytics?.rolling7Days;
  const today = data.webAnalytics?.today;
  const inventory = data.inventory;
  if (!rolling7Days || !today || !inventory) return null;

  const metrics: HomeV2OverviewMetrics = {
    rolling7Days: {
      startDate: rolling7Days.startDate,
      endDate: rolling7Days.endDate,
      totalDistinctViewers: rolling7Days.totalDistinctViewers,
    },
    today: {
      startDate: today.startDate,
      endDate: today.endDate,
      totalDistinctViewers: today.totalDistinctViewers,
    },
    inventory: {
      marketplaceLive: inventory.marketplaceLive,
      withoutApprovedPhotos: inventory.withoutApprovedPhotos,
    },
  };

  return isHomeV2OverviewMetrics(metrics) ? metrics : null;
}

export function homeV2MetricsChanged(
  previous: HomeV2OverviewMetrics,
  next: HomeV2OverviewMetrics,
): boolean {
  return (
    previous.rolling7Days.totalDistinctViewers !== next.rolling7Days.totalDistinctViewers ||
    previous.today.totalDistinctViewers !== next.today.totalDistinctViewers ||
    previous.inventory.marketplaceLive !== next.inventory.marketplaceLive ||
    previous.inventory.withoutApprovedPhotos !== next.inventory.withoutApprovedPhotos
  );
}
