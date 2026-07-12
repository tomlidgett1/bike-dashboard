import type { JsonValue } from "./customer-graph/types";

export const CRM_SLO = {
  lcpMs: 1_500,
  inpMs: 150,
  cls: 0.05,
  routeMs: 1_000,
  apiMs: 500,
  searchMs: 150,
  customerSummaryMs: 300,
  timelineMs: 300,
  todayMs: 500,
} as const;

export const CRM_PERFORMANCE_METRICS = [
  "lcp",
  "inp",
  "cls",
  "route",
  "api",
  "search",
  "customer_summary",
  "timeline",
  "today",
] as const;

export type CrmPerformanceMetric = (typeof CRM_PERFORMANCE_METRICS)[number];

export type CrmPerformanceEvent = {
  metric: CrmPerformanceMetric;
  value: number;
  route: string;
  customerId: string | null;
  requestId: string | null;
  measuredAt: string;
  metadata: Record<string, JsonValue>;
};

export type PerformanceValidationResult =
  | { valid: true; event: CrmPerformanceEvent }
  | { valid: false; message: string };

export type CrmPerformanceRating = "good" | "needs-improvement" | "poor";

const METRICS = new Set<string>(CRM_PERFORMANCE_METRICS);
const ALLOWED_ROUTE = /^\/[a-zA-Z0-9/_\-.[\]]*$/;

function cleanOptionalId(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned && cleaned.length <= 128 ? cleaned : null;
}

function isJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > 4) return false;
  if (value === null || ["string", "boolean"].includes(typeof value)) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 50 && value.every((item) => isJsonValue(item, depth + 1));
  if (typeof value !== "object") return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return (
    entries.length <= 30 &&
    entries.every(([key, item]) => key.length <= 80 && isJsonValue(item, depth + 1))
  );
}

export function validateCrmPerformanceEvent(input: unknown): PerformanceValidationResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, message: "Telemetry event must be an object." };
  }
  const value = input as Record<string, unknown>;
  if (typeof value.metric !== "string" || !METRICS.has(value.metric)) {
    return { valid: false, message: "Unsupported CRM performance metric." };
  }
  if (typeof value.value !== "number" || !Number.isFinite(value.value) || value.value < 0) {
    return { valid: false, message: "Telemetry value must be a non-negative finite number." };
  }
  const maxValue = value.metric === "cls" ? 10 : 3_600_000;
  if (value.value > maxValue) {
    return { valid: false, message: "Telemetry value is outside the accepted range." };
  }
  if (
    typeof value.route !== "string" ||
    value.route.length > 200 ||
    !ALLOWED_ROUTE.test(value.route)
  ) {
    return { valid: false, message: "Telemetry route is invalid." };
  }
  const measuredAt =
    typeof value.measuredAt === "string" && Number.isFinite(Date.parse(value.measuredAt))
      ? new Date(value.measuredAt).toISOString()
      : new Date().toISOString();
  const metadata = value.metadata ?? {};
  if (!isJsonValue(metadata) || Array.isArray(metadata) || metadata === null) {
    return { valid: false, message: "Telemetry metadata must be a small JSON object." };
  }

  return {
    valid: true,
    event: {
      metric: value.metric as CrmPerformanceMetric,
      value: value.value,
      route: value.route,
      customerId: cleanOptionalId(value.customerId),
      requestId: cleanOptionalId(value.requestId),
      measuredAt,
      metadata: metadata as Record<string, JsonValue>,
    },
  };
}

export function crmPerformanceRating(
  metric: CrmPerformanceMetric,
  value: number,
): CrmPerformanceRating {
  const goodThreshold: Record<CrmPerformanceMetric, number> = {
    lcp: CRM_SLO.lcpMs,
    inp: CRM_SLO.inpMs,
    cls: CRM_SLO.cls,
    route: CRM_SLO.routeMs,
    api: CRM_SLO.apiMs,
    search: CRM_SLO.searchMs,
    customer_summary: CRM_SLO.customerSummaryMs,
    timeline: CRM_SLO.timelineMs,
    today: CRM_SLO.todayMs,
  };
  const good = goodThreshold[metric];
  if (value <= good) return "good";
  return value <= good * 2 ? "needs-improvement" : "poor";
}
