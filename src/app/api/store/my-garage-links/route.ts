import { NextRequest, NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import { createMyGarageLink } from "@/lib/crm/my-garage";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    const body = await request.json().catch(() => null) as {
      customerId?: unknown;
      expiresInDays?: unknown;
    } | null;
    const customerId = typeof body?.customerId === "string" ? body.customerId.trim() : "";
    if (!customerId) {
      return NextResponse.json({ error: "A customer is required." }, { status: 400 });
    }
    const rawDays = Number(body?.expiresInDays ?? 30);
    const expiresInDays = Number.isFinite(rawDays) ? Math.min(Math.max(Math.trunc(rawDays), 1), 90) : 30;
    const link = await createMyGarageLink({
      ownerUserId: auth.user.id,
      customerId,
      expiresInDays,
    });
    const baseUrl = request.nextUrl.origin;
    return NextResponse.json({
      url: `${baseUrl}/my-garage?token=${encodeURIComponent(link.token)}`,
      expiresAt: link.expiresAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create My Garage link.";
    console.error("[my-garage-links] POST failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
