import { NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import { getPendingGoogleBusinessAccessToken } from "@/lib/google/business-oauth-connection";
import { listAllGoogleBusinessLocations } from "@/lib/google/business-profile-accounts";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    const token = await getPendingGoogleBusinessAccessToken(auth.user.id);
    if (!token) {
      return NextResponse.json(
        {
          error: "Connect Google Business first, then choose a location.",
          locations: [],
        },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const locations = await listAllGoogleBusinessLocations(token);
    return NextResponse.json(
      { locations },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[gbp-oauth] locations failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load Google Business locations.",
        locations: [],
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
