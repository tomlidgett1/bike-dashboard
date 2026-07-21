/**
 * Shared completion path for Nest store-credit payment requests.
 * Used by the Stripe Checkout webhook and the Linq Agent Pay webhook.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { logStorePaymentRequestEvent } from "@/lib/store-payments/audit";
import { sendPaymentConfirmations } from "@/lib/store-payments/confirmations";
import { syncPaymentRequestToLightspeed } from "@/lib/store-payments/lightspeed-sync";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

export async function completeStoreCreditPaymentRequest(input: {
  paymentRequestId: string;
  actor: "stripe" | "linkpay";
  stripeSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  customerEmail?: string | null;
  webhookEventType?: string;
  webhookMetadata?: Record<string, unknown>;
  supabase?: ServiceClient;
}): Promise<{ ok: boolean; newlyPaid: boolean }> {
  const supabase = input.supabase ?? createServiceRoleClient();
  const requestId = input.paymentRequestId.trim();
  if (!requestId) return { ok: false, newlyPaid: false };

  const { data: paymentRequest, error: fetchError } = await supabase
    .from("store_payment_requests")
    .select(
      "id, store_user_id, customer_handle, customer_name, amount_cents, description, status, provider",
    )
    .eq("id", requestId)
    .maybeSingle();

  if (fetchError) {
    console.error("[store-payments] Failed to load payment request:", fetchError);
    throw new Error(`Failed to load payment request ${requestId}`);
  }

  if (!paymentRequest) {
    console.error("[store-payments] Payment request not found:", requestId);
    return { ok: false, newlyPaid: false };
  }

  await logStorePaymentRequestEvent({
    paymentRequestId: requestId,
    storeUserId: paymentRequest.store_user_id,
    eventType:
      input.actor === "linkpay" ? "linkpay_webhook_received" : "stripe_webhook_received",
    actor: input.actor === "linkpay" ? "system" : "stripe",
    message:
      input.actor === "linkpay"
        ? "Linq Agent Pay payment.succeeded received for store credit payment."
        : "Stripe checkout.session.completed received for store credit payment.",
    metadata: {
      ...(input.webhookMetadata ?? {}),
      webhookEventType: input.webhookEventType ?? null,
      stripeSessionId: input.stripeSessionId ?? null,
      stripePaymentIntentId: input.stripePaymentIntentId ?? null,
    },
  });

  const { error: creditError } = await supabase.from("store_customer_credits").upsert(
    {
      store_user_id: paymentRequest.store_user_id,
      customer_handle: paymentRequest.customer_handle || "unknown",
      customer_name: paymentRequest.customer_name,
      amount_cents: paymentRequest.amount_cents,
      entry_type: "payment",
      note: paymentRequest.description,
      payment_request_id: paymentRequest.id,
      stripe_payment_intent_id: input.stripePaymentIntentId ?? null,
    },
    { onConflict: "payment_request_id", ignoreDuplicates: true },
  );

  if (creditError) {
    console.error("[store-payments] Failed to record customer credit:", creditError);
    throw new Error(`Failed to record credit for payment request ${requestId}`);
  }

  const checkoutEmail = input.customerEmail?.trim().toLowerCase() || null;

  const { data: updatedRows, error: updateError } = await supabase
    .from("store_payment_requests")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      ...(input.stripeSessionId
        ? { stripe_session_id: input.stripeSessionId }
        : {}),
      ...(input.stripePaymentIntentId
        ? { stripe_payment_intent_id: input.stripePaymentIntentId }
        : {}),
      ...(checkoutEmail ? { customer_email: checkoutEmail } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("id");

  if (updateError) {
    console.error("[store-payments] Failed to mark payment request paid:", updateError);
    throw new Error(`Failed to mark payment request ${requestId} paid`);
  }

  const newlyPaid = (updatedRows?.length ?? 0) > 0;

  if (newlyPaid) {
    await logStorePaymentRequestEvent({
      paymentRequestId: requestId,
      storeUserId: paymentRequest.store_user_id,
      eventType: "credit_recorded",
      actor: input.actor === "linkpay" ? "system" : "stripe",
      message: `Recorded $${(paymentRequest.amount_cents / 100).toFixed(2)} store credit for ${paymentRequest.customer_handle || paymentRequest.customer_name || "customer"}.`,
      metadata: {
        amountCents: paymentRequest.amount_cents,
        stripePaymentIntentId: input.stripePaymentIntentId ?? null,
        stripeSessionId: input.stripeSessionId ?? null,
        provider: paymentRequest.provider ?? input.actor,
      },
    });

    await logStorePaymentRequestEvent({
      paymentRequestId: requestId,
      storeUserId: paymentRequest.store_user_id,
      eventType: "marked_paid",
      actor: input.actor === "linkpay" ? "system" : "stripe",
      message: "Payment request marked paid.",
      metadata: { paidAt: new Date().toISOString() },
    });
  }

  const syncResult = await syncPaymentRequestToLightspeed(requestId);
  if (!syncResult.ok) {
    console.warn(
      "[store-payments] Lightspeed payment sync did not complete:",
      syncResult.status,
      syncResult.error,
    );
  }

  const confirmations = await sendPaymentConfirmations(requestId, {
    fallbackEmail: checkoutEmail,
  });
  console.log(
    "[store-payments] Payment confirmations:",
    `sms=${confirmations.smsSent}`,
    `email=${confirmations.emailSent}`,
  );

  return { ok: true, newlyPaid };
}
