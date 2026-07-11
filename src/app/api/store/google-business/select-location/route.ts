import { NextRequest, NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import {
  getGoogleBusinessConnection,
  getPendingGoogleBusinessAccessToken,
  selectGoogleBusinessLocation,
  toPublicGoogleBusinessStatus,
} from "@/lib/google/business-oauth-connection";
import { listAllGoogleBusinessLocations } from "@/lib/google/business-profile-accounts";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    const body = (await request.json()) as {
      accountId?: string;
      locationId?: string;
    };

    const accountId = body.accountId?.trim() ?? "";
    const locationId = body.locationId?.trim() ?? "";
    if (!accountId || !locationId) {
      return NextResponse.json(
        { error: "accountId and locationId are required." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const token = await getPendingGoogleBusinessAccessToken(auth.user.id);
    if (!token) {
      return NextResponse.json(
        { error: "Connect Google Business first." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const locations = await listAllGoogleBusinessLocations(token);
    const match = locations.find(
      (item) => item.accountId === accountId && item.locationId === locationId,
    );
    if (!match) {
      return NextResponse.json(
        { error: "That location was not found on the connected Google account." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    await selectGoogleBusinessLocation({
      userId: auth.user.id,
      accountId: match.accountId,
      locationId: match.locationId,
      locationName: match.title,
      reviewUrl: match.reviewUrl,
      mapsUri: match.mapsUri,
      placeId: match.placeId,
    });

    const row = await getGoogleBusinessConnection(auth.user.id);
    return NextResponse.json(
      {
        ok: true,
        ...toPublicGoogleBusinessStatus(row),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[gbp-oauth] select-location failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not save Google Business location.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
