// ============================================================
// Retry Lightspeed sync for a paid Nest payment request
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncPaymentRequestToLightspeed } from "@/lib/store-payments/lightspeed-sync";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return json({ error: "Invalid payment request id." }, 400);
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return json({ error: "Unauthorised" }, 401);
  }

  const { data: paymentRequest } = await supabase
    .from("store_payment_requests")
    .select("id, store_user_id, status")
    .eq("id", id)
    .eq("store_user_id", user.id)
    .maybeSingle();

  if (!paymentRequest) {
    return json({ error: "Payment request not found." }, 404);
  }

  if (paymentRequest.status !== "paid") {
    return json({ error: "Only paid requests can sync to Lightspeed." }, 400);
  }

  const result = await syncPaymentRequestToLightspeed(id, {
    force: true,
    actor: "store",
  });

  if (!result.ok) {
    return json(
      {
        error: result.error || "Lightspeed sync failed.",
        status: result.status,
      },
      result.status === "skipped" ? 400 : 500,
    );
  }

    return json({
      ok: true,
      status: result.status,
      lightspeedSaleId: result.saleId,
      lightspeedCreditAccountId: result.creditAccountId,
      lightspeedCustomerId: result.customerId,
      balanceAfter: result.balanceAfter,
    });
  }
