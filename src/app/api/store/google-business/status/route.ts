import { NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import {
  getGoogleBusinessConnection,
  toPublicGoogleBusinessStatus,
} from "@/lib/google/business-oauth-connection";
import { googleBusinessOAuthConfigured } from "@/lib/google/business-oauth-config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    const row = await getGoogleBusinessConnection(auth.user.id);
    const status = toPublicGoogleBusinessStatus(row);
    return NextResponse.json(
      {
        ...status,
        oauthConfigured: googleBusinessOAuthConfigured() || status.oauthConfigured,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[gbp-oauth] status failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not load Google Business status.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
