/**
 * Sync a paid Nest payment request into Lightspeed as a Credit Account deposit.
 * Every step is recorded in the store-visible audit trail.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { createLightspeedClient } from "@/lib/services/lightspeed/lightspeed-client";
import { findCustomerByPhone } from "@/lib/services/lightspeed/customer-search";
import { logStorePaymentRequestEvent } from "@/lib/store-payments/audit";

export type LightspeedPaymentSyncResult = {
  ok: boolean;
  status: "synced" | "failed" | "skipped";
  saleId?: string | null;
  creditAccountId?: string | null;
  customerId?: string | null;
  balanceAfter?: number | null;
  error?: string | null;
};

function customerDisplayName(customer: {
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
}): string {
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim();
  return name || customer.company?.trim() || "Lightspeed customer";
}

function formatAud(cents: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(cents / 100);
}

export async function syncPaymentRequestToLightspeed(
  paymentRequestId: string,
  options?: { force?: boolean; actor?: "system" | "store" },
): Promise<LightspeedPaymentSyncResult> {
  const supabase = createServiceRoleClient();
  const actor = options?.actor ?? "system";

  const { data: paymentRequest, error: fetchError } = await supabase
    .from("store_payment_requests")
    .select(
      "id, store_user_id, customer_name, customer_handle, amount_cents, currency, description, status, stripe_session_id, stripe_payment_intent_id, paid_at, lightspeed_sale_id, lightspeed_credit_account_id, lightspeed_customer_id, lightspeed_sync_status",
    )
    .eq("id", paymentRequestId)
    .maybeSingle();

  if (fetchError || !paymentRequest) {
    return { ok: false, status: "failed", error: "Payment request not found." };
  }

  if (paymentRequest.status !== "paid") {
    await logStorePaymentRequestEvent({
      paymentRequestId,
      storeUserId: paymentRequest.store_user_id,
      eventType: "lightspeed_sync_skipped",
      actor: "system",
      message: "Lightspeed sync skipped — payment is not marked paid yet.",
      metadata: { status: paymentRequest.status },
    });
    return { ok: false, status: "skipped", error: "Payment is not paid yet." };
  }

  if (paymentRequest.lightspeed_sale_id) {
    return {
      ok: true,
      status: "synced",
      saleId: paymentRequest.lightspeed_sale_id,
      creditAccountId: paymentRequest.lightspeed_credit_account_id,
      customerId: paymentRequest.lightspeed_customer_id,
    };
  }

  if (options?.force) {
    await logStorePaymentRequestEvent({
      paymentRequestId,
      storeUserId: paymentRequest.store_user_id,
      eventType: "lightspeed_sync_retried",
      actor,
      message: "Retrying Lightspeed credit deposit for this payment.",
    });
  }

  await logStorePaymentRequestEvent({
    paymentRequestId,
    storeUserId: paymentRequest.store_user_id,
    eventType: "lightspeed_sync_started",
    actor: "lightspeed",
    message: "Starting Lightspeed sync — depositing onto customer credit account.",
    metadata: {
      amountCents: paymentRequest.amount_cents,
      customerHandle: paymentRequest.customer_handle,
    },
  });

  try {
    const { data: connection } = await supabase
      .from("lightspeed_connections")
      .select("id, status")
      .eq("user_id", paymentRequest.store_user_id)
      .maybeSingle();

    if (!connection || connection.status !== "connected") {
      const error = "Lightspeed is not connected for this store.";
      await supabase
        .from("store_payment_requests")
        .update({
          lightspeed_sync_status: "skipped",
          lightspeed_sync_error: error,
          updated_at: new Date().toISOString(),
        })
        .eq("id", paymentRequestId);

      await logStorePaymentRequestEvent({
        paymentRequestId,
        storeUserId: paymentRequest.store_user_id,
        eventType: "lightspeed_sync_skipped",
        actor: "system",
        message: error,
      });

      return { ok: false, status: "skipped", error };
    }

    const handle = paymentRequest.customer_handle?.trim() || "";
    if (!handle) {
      const error = "Payment has no customer mobile — cannot match a Lightspeed customer.";
      await supabase
        .from("store_payment_requests")
        .update({
          lightspeed_sync_status: "failed",
          lightspeed_sync_error: error,
          updated_at: new Date().toISOString(),
        })
        .eq("id", paymentRequestId);

      await logStorePaymentRequestEvent({
        paymentRequestId,
        storeUserId: paymentRequest.store_user_id,
        eventType: "lightspeed_customer_missing",
        actor: "lightspeed",
        message: error,
      });

      return { ok: false, status: "failed", error };
    }

    const matched = await findCustomerByPhone(paymentRequest.store_user_id, handle, {
      allowScan: true,
      maxScanPages: 8,
    });

    if (!matched?.customerID) {
      const error = `No Lightspeed customer matched mobile ${handle}.`;
      await supabase
        .from("store_payment_requests")
        .update({
          lightspeed_sync_status: "failed",
          lightspeed_sync_error: error,
          updated_at: new Date().toISOString(),
        })
        .eq("id", paymentRequestId);

      await logStorePaymentRequestEvent({
        paymentRequestId,
        storeUserId: paymentRequest.store_user_id,
        eventType: "lightspeed_customer_missing",
        actor: "lightspeed",
        message: error,
        metadata: { customerHandle: handle },
      });

      return { ok: false, status: "failed", error };
    }

    await logStorePaymentRequestEvent({
      paymentRequestId,
      storeUserId: paymentRequest.store_user_id,
      eventType: "lightspeed_customer_matched",
      actor: "lightspeed",
      message: `Matched Lightspeed customer ${customerDisplayName(matched)} (#${matched.customerID}).`,
      metadata: {
        lightspeedCustomerId: matched.customerID,
        customerName: customerDisplayName(matched),
      },
    });

    const client = createLightspeedClient(paymentRequest.store_user_id);
    const creditAccount = await client.findOrCreateCustomerCreditAccount(matched.customerID);

    await logStorePaymentRequestEvent({
      paymentRequestId,
      storeUserId: paymentRequest.store_user_id,
      eventType: "lightspeed_credit_account_ready",
      actor: "lightspeed",
      message: creditAccount.creditAccountID
        ? `Using Lightspeed credit account #${creditAccount.creditAccountID}.`
        : "Customer has no primary Lightspeed credit account yet — the deposit sale will create one.",
      metadata: {
        lightspeedCreditAccountId: creditAccount.creditAccountID,
        balanceBefore: creditAccount.balance,
        willAutoCreate: !creditAccount.creditAccountID,
      },
    });

    const deposit = await client.createCustomerCreditDeposit({
      customerID: matched.customerID,
      creditAccountID: creditAccount.creditAccountID,
      amountCents: paymentRequest.amount_cents,
      paymentRequestId: paymentRequest.id,
      description: paymentRequest.description,
      stripePaymentIntentId: paymentRequest.stripe_payment_intent_id,
    });

    await supabase
      .from("store_payment_requests")
      .update({
        lightspeed_sale_id: deposit.saleID,
        lightspeed_credit_account_id: deposit.creditAccountID,
        lightspeed_customer_id: matched.customerID,
        lightspeed_synced_at: new Date().toISOString(),
        lightspeed_sync_status: "synced",
        lightspeed_sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentRequestId);

    const balanceNote =
      deposit.balanceAfter == null
        ? ""
        : ` Credit balance is now ${deposit.balanceAfter < 0 ? formatAud(Math.round(Math.abs(deposit.balanceAfter) * 100)) + " available" : formatAud(Math.round(deposit.balanceAfter * 100)) + " owed"}.`;

    await logStorePaymentRequestEvent({
      paymentRequestId,
      storeUserId: paymentRequest.store_user_id,
      eventType: "lightspeed_credit_deposited",
      actor: "lightspeed",
      message: `${deposit.creditAccountCreated ? "Created credit account and deposited" : "Deposited"} ${formatAud(paymentRequest.amount_cents)} onto Lightspeed credit account #${deposit.creditAccountID} via sale #${deposit.saleID}.${balanceNote}`,
      metadata: {
        lightspeedSaleId: deposit.saleID,
        lightspeedCreditAccountId: deposit.creditAccountID,
        lightspeedCustomerId: matched.customerID,
        amountCents: paymentRequest.amount_cents,
        balanceAfter: deposit.balanceAfter,
        creditAccountCreated: deposit.creditAccountCreated,
      },
    });

    return {
      ok: true,
      status: "synced",
      saleId: deposit.saleID,
      creditAccountId: deposit.creditAccountID,
      customerId: matched.customerID,
      balanceAfter: deposit.balanceAfter,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Lightspeed sync failed unexpectedly.";

    await supabase
      .from("store_payment_requests")
      .update({
        lightspeed_sync_status: "failed",
        lightspeed_sync_error: message.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentRequestId);

    await logStorePaymentRequestEvent({
      paymentRequestId,
      storeUserId: paymentRequest.store_user_id,
      eventType: "lightspeed_sync_failed",
      actor: "lightspeed",
      message,
      metadata: { error: message },
    });

    console.error("[store-payments] Lightspeed credit deposit failed:", error);
    return { ok: false, status: "failed", error: message };
  }
}
