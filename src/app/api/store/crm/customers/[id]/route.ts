import { NextResponse } from "next/server";
import {
  UUID_PATTERN,
  crmApiError,
  crmRouteError,
  requireCrmContext,
} from "@/lib/crm/customer-graph/http";
import { loadCustomerProfile } from "@/lib/crm/customer-graph/repository";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return crmApiError("INVALID_REQUEST", "Customer id is invalid.", 400);
  }
  const resolved = await requireCrmContext();
  if ("error" in resolved) return resolved.error;

  try {
    const customer = await loadCustomerProfile(
      resolved.context.supabase,
      resolved.context.storeId,
      id,
    );
    if (!customer) {
      return crmApiError("NOT_FOUND", "Customer was not found.", 404);
    }
    return NextResponse.json({ customer });
  } catch (error) {
    return crmRouteError(error, "customers/profile");
  }
}
