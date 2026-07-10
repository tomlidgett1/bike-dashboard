// ============================================================
// Public Payment Request Checkout
// ============================================================
// POST: creates a Stripe Checkout Session for a store payment request.
// Called from the public /pay/<id> page — no auth; the request id is the
// capability. Funds are routed to the store's connected Stripe account and
// the webhook records the amount as customer store credit.

import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { logStorePaymentRequestEvent } from "@/lib/store-payments/audit";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid payment link." }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleClient();

    const { data: paymentRequest } = await supabase
      .from("store_payment_requests")
      .select(
        "id, store_user_id, amount_cents, currency, description, status, customer_name, customer_handle",
      )
      .eq("id", id)
      .maybeSingle();

    if (!paymentRequest) {
      return NextResponse.json({ error: "Payment link not found." }, { status: 404 });
    }

    if (paymentRequest.status === "paid") {
      return NextResponse.json({ error: "This payment has already been made." }, { status: 400 });
    }

    if (paymentRequest.status !== "pending") {
      return NextResponse.json({ error: "This payment link is no longer active." }, { status: 400 });
    }

    await logStorePaymentRequestEvent({
      paymentRequestId: paymentRequest.id,
      storeUserId: paymentRequest.store_user_id,
      eventType: "checkout_started",
      actor: "customer",
      message: "Customer opened checkout for this payment link.",
      metadata: {
        amountCents: paymentRequest.amount_cents,
        customerHandle: paymentRequest.customer_handle,
      },
    });

    const { data: store } = await supabase
      .from("users")
      .select("business_name, stripe_account_id")
      .eq("user_id", paymentRequest.store_user_id)
      .maybeSingle();

    const storeName = store?.business_name?.trim() || "your bike store";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: paymentRequest.currency || "aud",
            product_data: {
              name: `Store credit at ${storeName}`,
              ...(paymentRequest.description
                ? { description: paymentRequest.description }
                : {}),
            },
            unit_amount: paymentRequest.amount_cents,
          },
          quantity: 1,
        },
      ],
      // Route the full amount straight to the store's connected Stripe account.
      // Stores without Stripe Connect yet are charged on the platform account
      // (same as marketplace sales) and settled via the existing payout flow.
      payment_intent_data: {
        ...(store?.stripe_account_id
          ? { transfer_data: { destination: store.stripe_account_id } }
          : {}),
        description: `Store credit payment to ${storeName}`,
        metadata: {
          payment_type: "store_credit_request",
          payment_request_id: paymentRequest.id,
        },
      },
      metadata: {
        payment_type: "store_credit_request",
        payment_request_id: paymentRequest.id,
        store_user_id: paymentRequest.store_user_id,
      },
      success_url: `${appUrl}/pay/${paymentRequest.id}?paid=1`,
      cancel_url: `${appUrl}/pay/${paymentRequest.id}`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 minutes
    });

    if (!session.url) {
      await logStorePaymentRequestEvent({
        paymentRequestId: paymentRequest.id,
        storeUserId: paymentRequest.store_user_id,
        eventType: "checkout_failed",
        actor: "system",
        message: "Stripe Checkout session created without a URL.",
      });
      return NextResponse.json(
        { error: "Could not start the payment. Please try again." },
        { status: 500 },
      );
    }

    // Track the latest session so the webhook match is easy to audit.
    await supabase
      .from("store_payment_requests")
      .update({ stripe_session_id: session.id, updated_at: new Date().toISOString() })
      .eq("id", paymentRequest.id);

    await logStorePaymentRequestEvent({
      paymentRequestId: paymentRequest.id,
      storeUserId: paymentRequest.store_user_id,
      eventType: "checkout_session_created",
      actor: "stripe",
      message: "Stripe Checkout session created.",
      metadata: { stripeSessionId: session.id },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[pay-checkout] failed:", error);
    try {
      const supabase = createServiceRoleClient();
      const { data: paymentRequest } = await supabase
        .from("store_payment_requests")
        .select("id, store_user_id")
        .eq("id", id)
        .maybeSingle();
      if (paymentRequest) {
        await logStorePaymentRequestEvent({
          paymentRequestId: paymentRequest.id,
          storeUserId: paymentRequest.store_user_id,
          eventType: "checkout_failed",
          actor: "system",
          message: error instanceof Error ? error.message : "Checkout failed.",
        });
      }
    } catch {
      // Best-effort audit only.
    }
    return NextResponse.json(
      { error: "Could not start the payment. Please try again." },
      { status: 500 },
    );
  }
}
