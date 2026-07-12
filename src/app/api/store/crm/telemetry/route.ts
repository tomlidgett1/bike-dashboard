import { NextRequest, NextResponse } from "next/server";
import {
  crmApiError,
  crmRouteError,
  requireCrmContext,
} from "@/lib/crm/customer-graph/http";
import {
  crmPerformanceRating,
  validateCrmPerformanceEvent,
  type CrmPerformanceEvent,
} from "@/lib/crm/performance";
import { CrmRepositoryError } from "@/lib/crm/customer-graph/repository";

export const dynamic = "force-dynamic";

function databaseMetric(metric: CrmPerformanceEvent["metric"]): string {
  if (metric === "lcp") return "LCP";
  if (metric === "inp") return "INP";
  if (metric === "cls") return "CLS";
  return metric;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return crmApiError("INVALID_REQUEST", "Telemetry body must be valid JSON.", 400);
  }
  const rawEvents =
    body && typeof body === "object" && !Array.isArray(body) && "events" in body
      ? (body as { events?: unknown }).events
      : [body];
  if (!Array.isArray(rawEvents) || rawEvents.length === 0 || rawEvents.length > 50) {
    return crmApiError(
      "INVALID_REQUEST",
      "Telemetry must contain between 1 and 50 events.",
      400,
    );
  }
  const events: CrmPerformanceEvent[] = [];
  for (let index = 0; index < rawEvents.length; index += 1) {
    const result = validateCrmPerformanceEvent(rawEvents[index]);
    if (!result.valid) {
      return crmApiError(
        "INVALID_REQUEST",
        `Telemetry event ${index + 1}: ${result.message}`,
        400,
      );
    }
    events.push(result.event);
  }

  const resolved = await requireCrmContext();
  if ("error" in resolved) return resolved.error;

  try {
    const insert = await resolved.context.supabase
      .from("store_crm_performance_events")
      .insert(
        events.map((event) => ({
          store_id: resolved.context.storeId,
          user_id: resolved.context.userId,
          metric: databaseMetric(event.metric),
          value_ms: event.value,
          rating: crmPerformanceRating(event.metric, event.value),
          route: event.route,
          operation:
            typeof event.metadata.operation === "string"
              ? event.metadata.operation.slice(0, 120)
              : null,
          navigation_type:
            typeof event.metadata.navigationType === "string"
              ? event.metadata.navigationType.slice(0, 80)
              : null,
          context: {
            customer_id: event.customerId,
            request_id: event.requestId,
            measured_at: event.measuredAt,
            ...event.metadata,
          },
          recorded_at: event.measuredAt,
        })),
      )
      .select("id");
    if (
      insert.error
      && (
        insert.error.code === "42P01"
        || insert.error.code === "PGRST205"
        || /schema cache|does not exist/i.test(insert.error.message)
      )
    ) {
      return NextResponse.json(
        { accepted: 0, legacy: true },
        { status: 202 },
      );
    }
    if (insert.error) {
      throw new CrmRepositoryError(insert.error.message, "persist_telemetry");
    }
    return NextResponse.json({ accepted: insert.data?.length ?? events.length }, { status: 201 });
  } catch (error) {
    return crmRouteError(error, "telemetry");
  }
}
