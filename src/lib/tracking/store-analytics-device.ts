import type { StoreAnalyticsDeviceType } from "@/lib/tracking/resolve-analytics-device-type";

export type { StoreAnalyticsDeviceType };

const MOBILE_MEDIA_QUERY = "(max-width: 767px)";

function uaLooksMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent ?? "";
  if (/iPad|Tablet|Kindle|Silk|PlayBook/i.test(ua)) return true;
  return /Android|iPhone|iPod|Mobile|IEMobile|Opera Mini|webOS|BlackBerry|Windows Phone/i.test(
    ua
  );
}

/**
 * Coarse mobile vs desktop bucket for storefront analytics (browser).
 * Server also classifies from request headers when this is missing.
 */
export function getStoreAnalyticsDeviceType(): StoreAnalyticsDeviceType {
  if (typeof window === "undefined") return "desktop";

  const uaData = (
    navigator as Navigator & { userAgentData?: { mobile?: boolean } }
  ).userAgentData;
  if (uaData?.mobile === true) return "mobile";
  if (uaData?.mobile === false) return "desktop";

  if (uaLooksMobile()) return "mobile";
  if (window.matchMedia(MOBILE_MEDIA_QUERY).matches) return "mobile";
  if (typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1) {
    if (window.matchMedia("(max-width: 1024px)").matches) return "mobile";
  }

  return "desktop";
}
