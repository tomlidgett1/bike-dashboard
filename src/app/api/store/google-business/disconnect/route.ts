import { NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import {
  disconnectGoogleBusiness,
  getGoogleBusinessConnection,
  toPublicGoogleBusinessStatus,
} from "@/lib/google/business-oauth-connection";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    await disconnectGoogleBusiness(auth.user.id);
    const row = await getGoogleBusinessConnection(auth.user.id);
    return NextResponse.json(
      {
        ok: true,
        ...toPublicGoogleBusinessStatus(row),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[gbp-oauth] disconnect failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not disconnect Google Business.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
