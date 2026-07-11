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
    const customerIdParam = request.nextUrl.searchParams.get("customerId")?.trim() ?? "";
    const customerNameParam = request.nextUrl.searchParams.get("customerName")?.trim() ?? "";

    if (!chatId && !customerIdParam) {
      return json({ error: "chatId or customerId is required." }, 400);
    }

    let customerId = customerIdParam;
    let customerName: string | null = customerNameParam || null;

    if (!customerId) {
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
      customerId = customer.customerId;
      customerName = customer.customerName;
    }

    const workorders = await listWorkorderReceiptOptions(auth.user.id, customerId);

    return json({
      customer_id: customerId,
      customer_name: customerName,
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
