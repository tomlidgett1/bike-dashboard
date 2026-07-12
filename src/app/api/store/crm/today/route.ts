import { NextResponse } from "next/server";
import {
  crmRouteError,
  requireCrmContext,
} from "@/lib/crm/customer-graph/http";
import { loadTodayQueue } from "@/lib/crm/customer-graph/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  const resolved = await requireCrmContext();
  if ("error" in resolved) return resolved.error;

  try {
    const today = await loadTodayQueue(
      resolved.context.supabase,
      resolved.context.storeId,
      resolved.context.ownerUserId,
    );
    const groups = today.groups.map((group) => ({
      ...group,
      actions: group.items,
    }));
    return NextResponse.json({
      today: { ...today, groups },
      groups,
      summary: Object.fromEntries(groups.map((group) => [group.key, group.count])),
    });
  } catch (error) {
    return crmRouteError(error, "today");
  }
}
