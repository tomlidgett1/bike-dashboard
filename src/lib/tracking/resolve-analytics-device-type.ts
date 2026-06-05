import type { NextRequest } from "next/server";

export type StoreAnalyticsDeviceType = "mobile" | "desktop";

const VALID_DEVICE_TYPES = new Set<StoreAnalyticsDeviceType>(["mobile", "desktop"]);

const MOBILE_UA_RE =
  /Android|iPhone|iPod|Mobile|IEMobile|Opera Mini|webOS|BlackBerry|Windows Phone/i;
const TABLET_UA_RE = /iPad|Tablet|Kindle|Silk|PlayBook/i;

/**
 * Resolve mobile vs desktop for analytics.
 * Prefer explicit client value; otherwise use Client Hints / User-Agent (not stored).
 */
export function resolveAnalyticsDeviceType(
  request: NextRequest,
  clientValue: unknown
): StoreAnalyticsDeviceType {
  if (typeof clientValue === "string" && VALID_DEVICE_TYPES.has(clientValue as StoreAnalyticsDeviceType)) {
    return clientValue as StoreAnalyticsDeviceType;
  }

  const clientHintMobile = request.headers.get("sec-ch-ua-mobile");
  if (clientHintMobile === "?1") return "mobile";
  if (clientHintMobile === "?0") return "desktop";

  const ua = request.headers.get("user-agent") ?? "";
  if (TABLET_UA_RE.test(ua)) return "mobile";
  if (MOBILE_UA_RE.test(ua)) return "mobile";

  return "desktop";
}
