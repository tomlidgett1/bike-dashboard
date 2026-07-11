import { NextRequest, NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import {
  listWorkorderReceiptOptions,
  resolveCustomerIdForChat,
} from "@/lib/store/workorder-receipt";

export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    const chatId = request.nextUrl.searchParams.get("chatId")?.trim() ?? "";
    if (!chatId) {
      return json({ error: "chatId is required." }, 400);
    }

    const customer = await resolveCustomerIdForChat(auth.supabase, auth.user.id, chatId);
    if (!customer) {
      return json(
        {
          error: "Could not match this conversation to a Lightspeed customer.",
          workorders: [],
        },
        404,
      );
    }

    const workorders = await listWorkorderReceiptOptions(auth.user.id, customer.customerId);

    return json({
      customer_id: customer.customerId,
      customer_name: customer.customerName,
      workorders,
    });
  } catch (error) {
    console.error("[workorders/receipt-options] GET failed:", error);
    return json(
      {
        error: error instanceof Error ? error.message : "Could not load workorder receipts.",
      },
      500,
    );
  }
}
