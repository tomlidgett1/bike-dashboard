// ============================================================
// Store LinkPay (Linq Agent Pay) Requests API
// ============================================================
// POST: creates a Linq Agent Pay payment request for a Nest conversation and
//       returns the hosted checkout_url to draft into the message box.
// GET:  lists recent LinkPay requests for a chat (optional) plus credit balance.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createLinqPaymentRequest } from "@/lib/nest/linq-agent-pay";
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
      // Linq Agent Pay currently only supports USD (error 1005 for other currencies).
      currency: "usd",
      description: description || null,
      provider: "linkpay",
      lightspeed_sync_status: "pending",
    })
    .select("id, amount_cents, description, customer_name")
    .single();

  if (insertError || !paymentRequest) {
    console.error("[linkpay-requests] insert failed:", insertError);
    return json({ error: "Could not create the LinkPay request." }, 500);
  }

  let linqRequest;
  try {
    linqRequest = await createLinqPaymentRequest({
      amountCents,
      currency: "usd",
      description: description || `Store credit · ${customerName || customerHandle || "customer"}`,
      metadata: {
        payment_request_id: paymentRequest.id,
        nest_chat_id: chatId,
        store_user_id: auth.userId,
        provider: "linkpay",
      },
    });
  } catch (error) {
    console.error("[linkpay-requests] Linq create failed:", error);
    await auth.supabase
      .from("store_payment_requests")
      .update({
        status: "canceled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentRequest.id)
      .eq("status", "pending");

    await logStorePaymentRequestEvent({
      paymentRequestId: paymentRequest.id,
      storeUserId: auth.userId,
      eventType: "linkpay_create_failed",
      actor: "store",
      message:
        error instanceof Error
          ? error.message
          : "Could not create the Linq Agent Pay request.",
      metadata: { amountCents, nestChatId: chatId },
    });

    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create the LinkPay checkout link.",
      },
      502,
    );
  }

  const { error: updateError } = await auth.supabase
    .from("store_payment_requests")
    .update({
      linq_payment_request_id: linqRequest.id,
      checkout_url: linqRequest.checkout_url,
      updated_at: new Date().toISOString(),
    })
    .eq("id", paymentRequest.id);

  if (updateError) {
    console.error("[linkpay-requests] update checkout_url failed:", updateError);
    return json({ error: "LinkPay link was created but could not be saved." }, 500);
  }

  await logStorePaymentRequestEvent({
    paymentRequestId: paymentRequest.id,
    storeUserId: auth.userId,
    eventType: "created",
    actor: "store",
    message: `LinkPay request created for ${customerName || customerHandle || "customer"}: $${(amountCents / 100).toFixed(2)}.`,
    metadata: {
      amountCents,
      description: description || null,
      nestChatId: chatId,
      customerName,
      customerHandle,
      provider: "linkpay",
      linqPaymentRequestId: linqRequest.id,
      checkoutUrl: linqRequest.checkout_url,
    },
  });

  await logStorePaymentRequestEvent({
    paymentRequestId: paymentRequest.id,
    storeUserId: auth.userId,
    eventType: "link_sent",
    actor: "store",
    message: "Linq Agent Pay checkout link ready to send in Nest.",
    metadata: {
      provider: "linkpay",
      checkoutUrl: linqRequest.checkout_url,
      linqPaymentRequestId: linqRequest.id,
    },
  });

  return json({
    id: paymentRequest.id,
    url: linqRequest.checkout_url,
    linqPaymentRequestId: linqRequest.id,
    amount: amountCents / 100,
    description: paymentRequest.description,
    customerName: paymentRequest.customer_name,
    provider: "linkpay",
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireStoreUser();
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const chatId = url.searchParams.get("chatId")?.trim();
  if (!chatId) {
    return json({ error: "chatId is required." }, 400);
  }

  const { data: requests, error: requestsError } = await auth.supabase
    .from("store_payment_requests")
    .select(
      "id, amount_cents, description, status, created_at, paid_at, customer_handle, checkout_url, provider, lightspeed_sale_id, lightspeed_credit_account_id, lightspeed_customer_id, lightspeed_synced_at, lightspeed_sync_status, lightspeed_sync_error",
    )
    .eq("store_user_id", auth.userId)
    .eq("nest_chat_id", chatId)
    .eq("provider", "linkpay")
    .order("created_at", { ascending: false })
    .limit(10);

  if (requestsError) {
    console.error("[linkpay-requests] list failed:", requestsError);
    return json({ error: "Could not load LinkPay requests." }, 500);
  }

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
      url: row.checkout_url,
      provider: row.provider ?? "linkpay",
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
