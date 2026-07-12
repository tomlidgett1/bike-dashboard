import { NextResponse } from "next/server";
import {
  crmRouteError,
  requireCrmContext,
} from "@/lib/crm/customer-graph/http";
import { loadAutomationSummaries } from "@/lib/crm/customer-graph/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  const resolved = await requireCrmContext();
  if ("error" in resolved) return resolved.error;

  try {
    const data = await loadAutomationSummaries(
      resolved.context.supabase,
      resolved.context.storeId,
      resolved.context.ownerUserId,
    );
    return NextResponse.json(data);
  } catch (error) {
    return crmRouteError(error, "automations");
  }
}
