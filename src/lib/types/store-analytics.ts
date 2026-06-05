export type StoreAnalyticsDeviceBucket = "mobile" | "desktop" | "unknown";

export type StoreAnalyticsDeviceTraffic = {
  totalViews: number;
  distinctUsers: number;
};

export type StoreAnalyticsByDevice = Record<
  StoreAnalyticsDeviceBucket,
  StoreAnalyticsDeviceTraffic
>;

export const emptyStoreAnalyticsByDevice: StoreAnalyticsByDevice = {
  mobile: { totalViews: 0, distinctUsers: 0 },
  desktop: { totalViews: 0, distinctUsers: 0 },
  unknown: { totalViews: 0, distinctUsers: 0 },
};

export function normaliseStoreAnalyticsByDevice(
  value: unknown
): StoreAnalyticsByDevice {
  if (!value || typeof value !== "object") {
    return { ...emptyStoreAnalyticsByDevice };
  }

  const record = value as Record<string, unknown>;
  const buckets: StoreAnalyticsDeviceBucket[] = ["mobile", "desktop", "unknown"];

  return buckets.reduce((acc, bucket) => {
    const row = record[bucket];
    if (!row || typeof row !== "object") {
      acc[bucket] = { totalViews: 0, distinctUsers: 0 };
      return acc;
    }
    const stats = row as Record<string, unknown>;
    acc[bucket] = {
      totalViews: Number(stats.totalViews) || 0,
      distinctUsers: Number(stats.distinctUsers) || 0,
    };
    return acc;
  }, { ...emptyStoreAnalyticsByDevice });
}
