// ============================================================
// Store Payment Requests API
// ============================================================
// POST: creates a payment request for a Nest conversation and returns the
//       public /pay/<id> link the store can text to the customer.
// GET:  lists recent requests for a chat (with paid/pending status) plus the
//       customer's current credit balance. Without chatId, returns the store's
//       full payment audit list.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logStorePaymentRequestEvent } from "@/lib/store-payments/audit";

const MIN_AMOUNT = 1;
const MAX_AMOUNT = 10000;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function requireStoreUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: json({ error: "Unauthorised" }, 401) } as const;
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("account_type, bicycle_store")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    return { error: json({ error: "Could not load store profile." }, 500) } as const;
  }

  if (profile?.account_type !== "bicycle_store" || profile?.bicycle_store !== true) {
    return { error: json({ error: "Store access required." }, 403) } as const;
  }

  return { supabase, userId: user.id } as const;
}

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export async function POST(request: NextRequest) {
  const auth = await requireStoreUser();
  if ("error" in auth) return auth.error;

  let body: { chatId?: unknown; amount?: unknown; description?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const chatId = typeof body.chatId === "string" ? body.chatId.trim() : "";
  const amount = typeof body.amount === "number" ? body.amount : NaN;
  const description =
    typeof body.description === "string" ? body.description.trim().slice(0, 200) : "";

  if (!chatId) {
    return json({ error: "chatId is required." }, 400);
  }
  if (!Number.isFinite(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
    return json(
      { error: `Amount must be between $${MIN_AMOUNT} and $${MAX_AMOUNT.toLocaleString()}.` },
      400,
    );
  }

  // Resolve the customer from the cached Nest conversation so the credit can
  // be tied back to them once the payment lands.
  const { data: conversation, error: conversationError } = await auth.supabase
    .from("store_nest_conversations")
    .select("chat_id, title, display_name, participant_handle")
    .eq("user_id", auth.userId)
    .eq("chat_id", chatId)
    .maybeSingle();

  if (conversationError || !conversation) {
    return json({ error: "Conversation not found." }, 404);
  }

  const customerName =
    conversation.display_name?.trim() || conversation.title?.trim() || null;
  const customerHandle = conversation.participant_handle?.trim() || null;

  const amountCents = Math.round(amount * 100);

  const { data: paymentRequest, error: insertError } = await auth.supabase
    .from("store_payment_requests")
    .insert({
      store_user_id: auth.userId,
      nest_chat_id: chatId,
      customer_name: customerName,
      customer_handle: customerHandle,
      amount_cents: amountCents,
      currency: "aud",
      description: description || null,
      lightspeed_sync_status: "pending",
    })
    .select("id, amount_cents, description, customer_name")
    .single();

  if (insertError || !paymentRequest) {
    console.error("[payment-requests] insert failed:", insertError);
    return json({ error: "Could not create the payment request." }, 500);
  }

  await logStorePaymentRequestEvent({
    paymentRequestId: paymentRequest.id,
    storeUserId: auth.userId,
    eventType: "created",
    actor: "store",
    message: `Payment request created for ${customerName || customerHandle || "customer"} — $${(amountCents / 100).toFixed(2)}.`,
    metadata: {
      amountCents,
      description: description || null,
      nestChatId: chatId,
      customerName,
      customerHandle,
      payUrl: `${appUrl()}/pay/${paymentRequest.id}`,
    },
  });

  await logStorePaymentRequestEvent({
    paymentRequestId: paymentRequest.id,
    storeUserId: auth.userId,
    eventType: "link_sent",
    actor: "store",
    message: "Secure payment link ready to send in Nest.",
    metadata: { payUrl: `${appUrl()}/pay/${paymentRequest.id}` },
  });

  return json({
    id: paymentRequest.id,
    url: `${appUrl()}/pay/${paymentRequest.id}`,
    amount: amountCents / 100,
    description: paymentRequest.description,
    customerName: paymentRequest.customer_name,
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireStoreUser();
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const chatId = url.searchParams.get("chatId")?.trim();
  const includeEvents = url.searchParams.get("includeEvents") === "1";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200);

  // Full store audit list (Payments page).
  if (!chatId) {
    const { data: requests, error: requestsError } = await auth.supabase
      .from("store_payment_requests")
      .select(
        "id, amount_cents, description, status, created_at, paid_at, customer_name, customer_handle, nest_chat_id, stripe_session_id, stripe_payment_intent_id, lightspeed_sale_id, lightspeed_credit_account_id, lightspeed_customer_id, lightspeed_workorder_id, lightspeed_synced_at, lightspeed_sync_status, lightspeed_sync_error",
      )
      .eq("store_user_id", auth.userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (requestsError) {
      console.error("[payment-requests] list-all failed:", requestsError);
      return json({ error: "Could not load payment requests." }, 500);
    }

    let eventsByRequest: Record<string, Array<Record<string, unknown>>> = {};
    if (includeEvents && (requests?.length ?? 0) > 0) {
      const ids = (requests ?? []).map((row) => row.id);
      const { data: events } = await auth.supabase
        .from("store_payment_request_events")
        .select("id, payment_request_id, event_type, message, actor, metadata, created_at")
        .eq("store_user_id", auth.userId)
        .in("payment_request_id", ids)
        .order("created_at", { ascending: true });

      eventsByRequest = {};
      for (const event of events ?? []) {
        const key = event.payment_request_id as string;
        if (!eventsByRequest[key]) eventsByRequest[key] = [];
        eventsByRequest[key].push({
          id: event.id,
          type: event.event_type,
          message: event.message,
          actor: event.actor,
          metadata: event.metadata,
          createdAt: event.created_at,
        });
      }
    }

    return json({
      requests: (requests ?? []).map((row) => ({
        id: row.id,
        amount: row.amount_cents / 100,
        description: row.description,
        status: row.status,
        createdAt: row.created_at,
        paidAt: row.paid_at,
        customerName: row.customer_name,
        customerHandle: row.customer_handle,
        nestChatId: row.nest_chat_id,
        stripeSessionId: row.stripe_session_id,
        stripePaymentIntentId: row.stripe_payment_intent_id,
        lightspeedSaleId: row.lightspeed_sale_id,
        lightspeedCreditAccountId: row.lightspeed_credit_account_id,
        lightspeedCustomerId: row.lightspeed_customer_id,
        lightspeedWorkorderId: row.lightspeed_workorder_id,
        lightspeedSyncedAt: row.lightspeed_synced_at,
        lightspeedSyncStatus: row.lightspeed_sync_status,
        lightspeedSyncError: row.lightspeed_sync_error,
        url: `${appUrl()}/pay/${row.id}`,
        events: includeEvents ? eventsByRequest[row.id] ?? [] : undefined,
      })),
    });
  }

  const { data: requests, error: requestsError } = await auth.supabase
    .from("store_payment_requests")
    .select(
      "id, amount_cents, description, status, created_at, paid_at, customer_handle, lightspeed_sale_id, lightspeed_credit_account_id, lightspeed_customer_id, lightspeed_synced_at, lightspeed_sync_status, lightspeed_sync_error",
    )
    .eq("store_user_id", auth.userId)
    .eq("nest_chat_id", chatId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (requestsError) {
    console.error("[payment-requests] list failed:", requestsError);
    return json({ error: "Could not load payment requests." }, 500);
  }

  // Credit balance for this customer (keyed by their phone handle).
  let creditBalanceCents = 0;
  const { data: conversation } = await auth.supabase
    .from("store_nest_conversations")
    .select("participant_handle")
    .eq("user_id", auth.userId)
    .eq("chat_id", chatId)
    .maybeSingle();
  const handle = conversation?.participant_handle?.trim() || requests?.[0]?.customer_handle;
  if (handle) {
    const { data: credits } = await auth.supabase
      .from("store_customer_credits")
      .select("amount_cents")
      .eq("store_user_id", auth.userId)
      .eq("customer_handle", handle);
    creditBalanceCents = (credits ?? []).reduce(
      (sum, row) => sum + (row.amount_cents ?? 0),
      0,
    );
  }

  return json({
    requests: (requests ?? []).map((row) => ({
      id: row.id,
      amount: row.amount_cents / 100,
      description: row.description,
      status: row.status,
      createdAt: row.created_at,
      paidAt: row.paid_at,
      url: `${appUrl()}/pay/${row.id}`,
      lightspeedSaleId: row.lightspeed_sale_id,
      lightspeedCreditAccountId: row.lightspeed_credit_account_id,
      lightspeedCustomerId: row.lightspeed_customer_id,
      lightspeedSyncedAt: row.lightspeed_synced_at,
      lightspeedSyncStatus: row.lightspeed_sync_status ?? "pending",
      lightspeedSyncError: row.lightspeed_sync_error,
    })),
    creditBalance: creditBalanceCents / 100,
  });
}
