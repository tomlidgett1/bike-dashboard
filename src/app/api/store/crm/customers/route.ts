import { NextRequest, NextResponse } from "next/server";
import {
  crmApiError,
  crmRouteError,
  parseLimit,
  requireCrmContext,
} from "@/lib/crm/customer-graph/http";
import { searchCustomers } from "@/lib/crm/customer-graph/repository";
import {
  CUSTOMER_LIFECYCLE_STAGES,
  type CustomerLifecycleStage,
  type CustomerSearchSort,
} from "@/lib/crm/customer-graph/types";

export const dynamic = "force-dynamic";

const SORTS: CustomerSearchSort[] = [
  "name_asc",
  "updated_desc",
  "last_purchase_desc",
  "spend_desc",
];

export async function GET(request: NextRequest) {
  const resolved = await requireCrmContext();
  if ("error" in resolved) return resolved.error;

  const params = request.nextUrl.searchParams;
  const limit = parseLimit(params.get("limit"), { fallback: 50, maximum: 100 });
  if (limit === null) {
    return crmApiError("INVALID_REQUEST", "limit must be a positive integer.", 400);
  }
  const query = (params.get("query") ?? params.get("q") ?? "").trim();
  if (query.length > 100) {
    return crmApiError("INVALID_REQUEST", "Customer search is limited to 100 characters.", 400);
  }
  const cursor = params.get("cursor");
  if (cursor && cursor.length > 1_024) {
    return crmApiError("INVALID_REQUEST", "Customer cursor is too long.", 400);
  }

  const filter = (params.get("filter") ?? params.get("lifecycle_stage") ?? "all").trim();
  let lifecycleStage: CustomerLifecycleStage | undefined;
  let specialFilter: "opted_in" | "no_email" | undefined;
  if (filter === "opted_in" || filter === "no_email") {
    specialFilter = filter;
  } else if (filter !== "all") {
    if (!CUSTOMER_LIFECYCLE_STAGES.includes(filter as CustomerLifecycleStage) || filter === "unknown") {
      return crmApiError("INVALID_REQUEST", "Unsupported customer filter.", 400);
    }
    lifecycleStage = filter as CustomerLifecycleStage;
  }

  const sortValue = params.get("sort") ?? "updated_desc";
  if (!SORTS.includes(sortValue as CustomerSearchSort)) {
    return crmApiError("INVALID_REQUEST", "Unsupported customer sort.", 400);
  }

  try {
    const result = await searchCustomers(resolved.context.supabase, resolved.context.storeId, {
      query,
      lifecycleStage,
      specialFilter,
      sort: sortValue as CustomerSearchSort,
      limit,
      cursor,
    });
    return NextResponse.json({
      customers: result.items,
      items: result.items,
      nextCursor: result.page.nextCursor,
      total: result.total,
      page: result.page,
    });
  } catch (error) {
    return crmRouteError(error, "customers");
  }
}
