import { NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import { countStoreInboxNeedsAction } from "@/lib/customer-inquiries/needs-action-count";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    const count = await countStoreInboxNeedsAction(auth);

    return NextResponse.json(
      { count },
      {
        headers: {
          "Cache-Control": "private, max-age=15, stale-while-revalidate=30",
        },
      },
    );
  } catch (error) {
    console.error("[customer-inquiries/needs-action-count] GET failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not load needs-action count.",
      },
      { status: 500 },
    );
  }
}
