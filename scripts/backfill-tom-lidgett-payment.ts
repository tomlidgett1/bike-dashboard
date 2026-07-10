/**
 * One-off: backfill audit events + Lightspeed sync for Tom Lidgett's $1 Nest payment.
 *
 * Usage: npx tsx scripts/backfill-tom-lidgett-payment.ts
 */

import { createClient } from "@supabase/supabase-js";
import { syncPaymentRequestToLightspeed } from "../src/lib/store-payments/lightspeed-sync";

const PAYMENT_REQUEST_ID = "c0a2e283-7791-49e5-9165-afb9c244bb01";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(url, key);

  const { data: payment, error } = await supabase
    .from("store_payment_requests")
    .select("*")
    .eq("id", PAYMENT_REQUEST_ID)
    .maybeSingle();

  if (error || !payment) {
    throw new Error(`Payment request not found: ${error?.message || PAYMENT_REQUEST_ID}`);
  }

  console.log("Found payment:", {
    id: payment.id,
    customer: payment.customer_name,
    amount: payment.amount_cents,
    status: payment.status,
    lightspeed: payment.lightspeed_sync_status,
  });

  const { count } = await supabase
    .from("store_payment_request_events")
    .select("id", { count: "exact", head: true })
    .eq("payment_request_id", PAYMENT_REQUEST_ID);

  if ((count ?? 0) === 0) {
    const events = [
      {
        event_type: "created",
        actor: "store",
        message: `Payment request created for ${payment.customer_name} — $1.00.`,
        created_at: payment.created_at,
        metadata: {
          amountCents: payment.amount_cents,
          description: payment.description,
          backfilled: true,
        },
      },
      {
        event_type: "link_sent",
        actor: "store",
        message: "Secure payment link sent in Nest.",
        created_at: payment.created_at,
        metadata: { backfilled: true },
      },
      {
        event_type: "checkout_session_created",
        actor: "stripe",
        message: "Stripe Checkout session created.",
        created_at: payment.created_at,
        metadata: { stripeSessionId: payment.stripe_session_id, backfilled: true },
      },
      {
        event_type: "stripe_webhook_received",
        actor: "stripe",
        message: "Stripe checkout.session.completed received for store credit payment.",
        created_at: payment.paid_at,
        metadata: {
          stripePaymentIntentId: payment.stripe_payment_intent_id,
          backfilled: true,
        },
      },
      {
        event_type: "credit_recorded",
        actor: "stripe",
        message: "Recorded $1.00 store credit for +61414187820.",
        created_at: payment.paid_at,
        metadata: { amountCents: 100, backfilled: true },
      },
      {
        event_type: "marked_paid",
        actor: "stripe",
        message: "Payment request marked paid.",
        created_at: payment.paid_at,
        metadata: { paidAt: payment.paid_at, backfilled: true },
      },
      {
        event_type: "note",
        actor: "system",
        message:
          "Root cause: payment was recorded in Yellow Jersey only. Lightspeed sync did not exist yet — now backfilling.",
        created_at: new Date().toISOString(),
        metadata: { backfilled: true },
      },
    ];

    const { error: insertError } = await supabase.from("store_payment_request_events").insert(
      events.map((event) => ({
        payment_request_id: payment.id,
        store_user_id: payment.store_user_id,
        event_type: event.event_type,
        message: event.message,
        actor: event.actor,
        metadata: event.metadata,
        created_at: event.created_at,
      })),
    );

    if (insertError) throw insertError;
    console.log(`Inserted ${events.length} backfilled audit events.`);
  } else {
    console.log(`Audit events already present (${count}).`);
  }

  console.log("Syncing to Lightspeed…");
  const result = await syncPaymentRequestToLightspeed(PAYMENT_REQUEST_ID, {
    force: true,
    actor: "system",
  });
  console.log("Lightspeed sync result:", result);

  if (!result.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
