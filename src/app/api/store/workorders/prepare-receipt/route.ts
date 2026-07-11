import { NextRequest, NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import {
  prepareWorkorderReceiptAttachment,
  resolveCustomerIdForChat,
} from "@/lib/store/workorder-receipt";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    let body: { chatId?: unknown; workorderId?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ error: "Invalid JSON body." }, 400);
    }

    const chatId = typeof body.chatId === "string" ? body.chatId.trim() : "";
    const workorderId = typeof body.workorderId === "string" ? body.workorderId.trim() : "";

    if (!chatId || !workorderId) {
      return json({ error: "chatId and workorderId are required." }, 400);
    }

    const customer = await resolveCustomerIdForChat(auth.supabase, auth.user.id, chatId);
    if (!customer) {
      return json({ error: "Could not match this conversation to a Lightspeed customer." }, 404);
    }

    const prepared = await prepareWorkorderReceiptAttachment({
      userId: auth.user.id,
      workorderId,
      customerId: customer.customerId,
    });

    return json({
      attachmentId: prepared.attachmentId,
      filename: prepared.filename,
      draftMessage: prepared.draftMessage,
      workorder_id: prepared.workorder.workorder_id,
      sale_id: prepared.workorder.sale_id,
    });
  } catch (error) {
    console.error("[workorders/prepare-receipt] POST failed:", error);
    return json(
      {
        error: error instanceof Error ? error.message : "Could not prepare the receipt.",
      },
      500,
    );
  }
}
