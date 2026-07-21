// ============================================================
// Linq Agent Pay webhook
// ============================================================
// Subscribes to payment.succeeded / payment.canceled / payment.expired and
// completes Nest store-credit requests created via LinkPay.

import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  normaliseLinqPaymentRequest,
  type LinqPaymentRequest,
} from "@/lib/nest/linq-agent-pay";
import { completeStoreCreditPaymentRequest } from "@/lib/store-payments/complete-store-payment";
import { logStorePaymentRequestEvent } from "@/lib/store-payments/audit";

export const runtime = "nodejs";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

function verifyLinqWebhookSignature(input: {
  secret: string;
  rawBody: string;
  msgId: string | null;
  timestamp: string | null;
  signatureHeader: string | null;
}): boolean {
  const { secret, rawBody, msgId, timestamp, signatureHeader } = input;
  if (!msgId || !timestamp || !signatureHeader) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  // Replay protection: 5 minutes
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > 5 * 60) return false;

  const secretStr = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let keyBytes: Buffer;
  try {
    keyBytes = Buffer.from(secretStr, "base64");
  } catch {
    return false;
  }

  const signedContent = `${msgId}.${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", keyBytes).update(signedContent).digest("base64");

  return signatureHeader.split(" ").some((sig) => {
    if (!sig.startsWith("v1,")) return false;
    try {
      const provided = Buffer.from(sig.slice(3), "base64");
      const expectedBuf = Buffer.from(expected, "base64");
      if (provided.length !== expectedBuf.length) return false;
      return timingSafeEqual(provided, expectedBuf);
    } catch {
      return false;
    }
  });
}

function paymentRequestFromEventData(data: unknown): LinqPaymentRequest | null {
  return normaliseLinqPaymentRequest(data);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const secret = process.env.LINQ_WEBHOOK_SECRET?.trim() || "";

  if (secret) {
    const ok = verifyLinqWebhookSignature({
      secret,
      rawBody,
      msgId: request.headers.get("webhook-id"),
      timestamp: request.headers.get("webhook-timestamp"),
      signatureHeader: request.headers.get("webhook-signature"),
    });
    if (!ok) {
      console.error("[linq-payments-webhook] Invalid signature");
      return json({ error: "Invalid signature" }, 401);
    }
  } else {
    console.warn(
      "[linq-payments-webhook] LINQ_WEBHOOK_SECRET is not set; accepting unsigned events.",
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const eventType =
    typeof payload.event_type === "string"
      ? payload.event_type
      : typeof payload.type === "string"
        ? payload.type
        : "";
  const eventId =
    typeof payload.event_id === "string"
      ? payload.event_id
      : request.headers.get("webhook-id") || null;

  if (
    eventType !== "payment.succeeded" &&
    eventType !== "payment.canceled" &&
    eventType !== "payment.expired"
  ) {
    return json({ received: true, ignored: true, eventType });
  }

  const linqPayment = paymentRequestFromEventData(payload.data);
  if (!linqPayment) {
    console.error("[linq-payments-webhook] Missing payment request payload", {
      eventType,
      eventId,
    });
    return json({ received: true, error: "missing_payment_request" }, 200);
  }

  const ourRequestId = linqPayment.metadata.payment_request_id?.trim() || "";
  const supabase = createServiceRoleClient();

  // Prefer metadata join key; fall back to linq_payment_request_id.
  let paymentRequestId = ourRequestId;
  if (!paymentRequestId) {
    const { data: byLinqId } = await supabase
      .from("store_payment_requests")
      .select("id")
      .eq("linq_payment_request_id", linqPayment.id)
      .maybeSingle();
    paymentRequestId = byLinqId?.id ?? "";
  }

  if (!paymentRequestId) {
    console.warn("[linq-payments-webhook] No matching store payment request", {
      linqId: linqPayment.id,
      eventType,
    });
    return json({ received: true, unmatched: true });
  }

  if (eventType === "payment.succeeded") {
    try {
      const result = await completeStoreCreditPaymentRequest({
        paymentRequestId,
        actor: "linkpay",
        stripePaymentIntentId: linqPayment.stripe?.payment_intent_id ?? null,
        webhookEventType: eventType,
        webhookMetadata: {
          eventId,
          linqPaymentRequestId: linqPayment.id,
          amount: linqPayment.amount,
          currency: linqPayment.currency,
          metadata: linqPayment.metadata,
        },
        supabase,
      });
      return json({ received: true, ok: result.ok, newlyPaid: result.newlyPaid });
    } catch (error) {
      console.error("[linq-payments-webhook] complete failed:", error);
      return json({ error: "Processing failed" }, 500);
    }
  }

  // canceled / expired: mark pending requests canceled (idempotent).
  const { data: row } = await supabase
    .from("store_payment_requests")
    .select("id, store_user_id, status")
    .eq("id", paymentRequestId)
    .maybeSingle();

  if (row && row.status === "pending") {
    await supabase
      .from("store_payment_requests")
      .update({
        status: "canceled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentRequestId)
      .eq("status", "pending");

    await logStorePaymentRequestEvent({
      paymentRequestId,
      storeUserId: row.store_user_id,
      eventType: eventType === "payment.expired" ? "linkpay_expired" : "linkpay_canceled",
      actor: "system",
      message:
        eventType === "payment.expired"
          ? "Linq Agent Pay request expired unpaid."
          : "Linq Agent Pay request was cancelled.",
      metadata: {
        eventId,
        linqPaymentRequestId: linqPayment.id,
        eventType,
      },
    });
  }

  return json({ received: true, eventType });
}
