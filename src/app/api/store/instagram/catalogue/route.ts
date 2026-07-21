import { NextRequest, NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import { searchInstagramCatalogueProducts } from "@/lib/instagram/catalogue";

export const dynamic = "force-dynamic";

/**
 * GET /api/store/instagram/catalogue?q=
 * Search marketplace-ready products with approved primary images.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    const query = (request.nextUrl.searchParams.get("q") || "").trim();
    const products = await searchInstagramCatalogueProducts({
      ownerUserId: auth.user.id,
      query,
      limit: 24,
    });

    return NextResponse.json(
      { success: true, products },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[ig-catalogue] search failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not search catalogue products.",
      },
      { status: 500 },
    );
  }
}
