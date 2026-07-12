import { NextRequest, NextResponse } from "next/server";
import {
  UUID_PATTERN,
  crmApiError,
  crmRouteError,
  parseLimit,
  requireCrmContext,
} from "@/lib/crm/customer-graph/http";
import {
  customerExists,
  loadCustomerTimeline,
} from "@/lib/crm/customer-graph/repository";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return crmApiError("INVALID_REQUEST", "Customer id is invalid.", 400);
  }
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"), {
    fallback: 30,
    maximum: 100,
  });
  if (limit === null) {
    return crmApiError("INVALID_REQUEST", "limit must be a positive integer.", 400);
  }
  const cursor = request.nextUrl.searchParams.get("cursor");
  if (cursor && cursor.length > 1_024) {
    return crmApiError("INVALID_REQUEST", "Timeline cursor is too long.", 400);
  }

  const resolved = await requireCrmContext();
  if ("error" in resolved) return resolved.error;

  try {
    const exists = await customerExists(
      resolved.context.supabase,
      resolved.context.storeId,
      id,
    );
    if (!exists) return crmApiError("NOT_FOUND", "Customer was not found.", 404);
    const timeline = await loadCustomerTimeline(
      resolved.context.supabase,
      resolved.context.storeId,
      id,
      { limit, cursor },
    );
    return NextResponse.json({
      events: timeline.items,
      items: timeline.items,
      nextCursor: timeline.page.nextCursor,
      page: timeline.page,
    });
  } catch (error) {
    return crmRouteError(error, "customers/timeline");
  }
}
