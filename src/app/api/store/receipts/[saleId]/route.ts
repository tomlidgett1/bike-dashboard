import { NextRequest, NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import { createLightspeedClient } from "@/lib/services/lightspeed";
import { getValidAccessToken } from "@/lib/services/lightspeed/token-manager";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ saleId: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    const { saleId } = await context.params;
    if (!/^\d+$/.test(saleId)) {
      return NextResponse.json({ error: "Invalid Lightspeed sale ID." }, { status: 400 });
    }

    const token = await getValidAccessToken(auth.user.id);
    if (!token) {
      return NextResponse.json(
        { error: "No valid Lightspeed token. Reconnect Lightspeed in Settings first." },
        { status: 503 },
      );
    }

    const client = createLightspeedClient(auth.user.id);
    const html = await client.renderSaleReceiptHtml(saleId, {
      template: "SaleReceipt",
      print: true,
    });

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Security-Policy": "frame-ancestors 'self'",
      },
    });
  } catch (error) {
    console.error("[store/receipts] GET failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not generate receipt." },
      { status: 500 },
    );
  }
}
