/**
 * Durable audit trail for Nest "Request money" lifecycle events.
 * Store owners read these in Yellow Jersey; webhooks use the service role.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";

export type StorePaymentRequestEventType =
  | "created"
  | "link_sent"
  | "checkout_started"
  | "checkout_session_created"
  | "checkout_failed"
  | "stripe_webhook_received"
  | "credit_recorded"
  | "marked_paid"
  | "lightspeed_sync_started"
  | "lightspeed_customer_matched"
  | "lightspeed_customer_missing"
  | "lightspeed_credit_account_ready"
  | "lightspeed_credit_deposited"
  | "lightspeed_workorder_created"
  | "lightspeed_sync_failed"
  | "lightspeed_sync_skipped"
  | "lightspeed_sync_retried"
  | "confirmation_sms_sent"
  | "confirmation_sms_failed"
  | "confirmation_email_sent"
  | "confirmation_email_failed"
  | "note";

export type StorePaymentRequestEventActor =
  | "store"
  | "customer"
  | "stripe"
  | "system"
  | "lightspeed";

export async function logStorePaymentRequestEvent(input: {
  paymentRequestId: string;
  storeUserId: string;
  eventType: StorePaymentRequestEventType;
  message: string;
  actor?: StorePaymentRequestEventActor;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("store_payment_request_events").insert({
      payment_request_id: input.paymentRequestId,
      store_user_id: input.storeUserId,
      event_type: input.eventType,
      message: input.message,
      actor: input.actor ?? "system",
      metadata: input.metadata ?? {},
    });
    if (error) {
      console.error("[store-payments] Failed to log event:", error);
    }
  } catch (error) {
    console.error("[store-payments] Event logger error:", error);
  }
}
