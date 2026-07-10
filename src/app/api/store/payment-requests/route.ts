// ============================================================
// Store Payment Requests API
// ============================================================
// POST: creates a payment request for a Nest conversation and returns the
//       public /pay/<id> link the store can text to the customer.
// GET:  lists recent requests for a chat (with paid/pending status) plus the
//       customer's current credit balance.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    })
    .select("id, amount_cents, description, customer_name")
    .single();

  if (insertError || !paymentRequest) {
    console.error("[payment-requests] insert failed:", insertError);
    return json({ error: "Could not create the payment request." }, 500);
  }

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

  const chatId = new URL(request.url).searchParams.get("chatId")?.trim();
  if (!chatId) {
    return json({ error: "chatId is required." }, 400);
  }

  const { data: requests, error: requestsError } = await auth.supabase
    .from("store_payment_requests")
    .select("id, amount_cents, description, status, created_at, paid_at, customer_handle")
    .eq("store_user_id", auth.userId)
    .eq("nest_chat_id", chatId)
    .order("created_at", { ascending: false })
    .limit(5);

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
    })),
    creditBalance: creditBalanceCents / 100,
  });
}
