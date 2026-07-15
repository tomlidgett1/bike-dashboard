import { NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import { syncCrmMirrorsForUser } from "@/lib/services/lightspeed/crm-customer-mirror";

export const maxDuration = 300;

export async function POST() {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;
    // Manual sync always does a full customer pull so missing Lightspeed
    // customers (skipped by the old 500-per-run cursor) are recovered.
    const mirrors = await syncCrmMirrorsForUser({
      userId: auth.user.id,
      fullCustomerSync: true,
    });
    return NextResponse.json({ success: true, mirrors });
  } catch (error) {
    const message = error instanceof Error ? error.message : "CRM sync failed";
    console.error("[store/crm/sync] POST failed:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
