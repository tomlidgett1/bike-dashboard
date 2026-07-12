import { NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import { runBikeStoreProgrammesForUser } from "@/lib/crm/bike-programme-runner";

export const maxDuration = 300;

export async function POST() {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;
    const result = await runBikeStoreProgrammesForUser({ userId: auth.user.id });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bike programme run failed";
    console.error("[store/crm/programmes/run] POST failed:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
