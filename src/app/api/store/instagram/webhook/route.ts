import { NextRequest, NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import {
  getMakeInstagramRow,
  saveMakeWebhook,
  toMakeInstagramStatus,
} from "@/lib/instagram/make-connection";

export const dynamic = "force-dynamic";

/**
 * POST /api/store/instagram/webhook
 * Body: { webhookUrl: string, webhookSecret?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    const body = await request.json().catch(() => ({}));
    const webhookUrl = typeof body.webhookUrl === "string" ? body.webhookUrl : "";
    const webhookSecret =
      typeof body.webhookSecret === "string" ? body.webhookSecret : null;

    const status = await saveMakeWebhook({
      userId: auth.user.id,
      webhookUrl,
      webhookSecret,
    });

    return NextResponse.json({ ok: true, ...status });
  } catch (error) {
    console.error("[ig-make] save webhook failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not save Make webhook.",
      },
      { status: 400 },
    );
  }
}

export async function GET() {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;
    const row = await getMakeInstagramRow(auth.user.id);
    return NextResponse.json(toMakeInstagramStatus(row), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not load webhook status.",
      },
      { status: 500 },
    );
  }
}
