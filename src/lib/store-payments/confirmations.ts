/**
 * Post-payment confirmations for Nest payment requests.
 *
 * After Stripe confirms a payment, the customer gets:
 *  1. An automated Nest text in the same conversation (amount + reference).
 *  2. A Yellow Jersey email receipt (via the shared Resend provider).
 *
 * Both are idempotent: a confirmation_*_sent_at timestamp is claimed with a
 * conditional UPDATE before sending, so Stripe webhook retries can never
 * message the customer twice. Failures release the claim and are recorded in
 * the audit trail; they never fail the webhook.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/seo/site";
import { proxyNestBrandPortalRequest } from "@/lib/nest/brand-portal-client";
import { resolveStoreNestBrandKey } from "@/lib/nest/resolve-store-brand-key";
import { getCrmEmailProvider } from "@/lib/crm/email-provider";
import { logStorePaymentRequestEvent } from "@/lib/store-payments/audit";

type PaymentRequestRow = {
  id: string;
  store_user_id: string;
  nest_chat_id: string | null;
  customer_name: string | null;
  customer_handle: string | null;
  customer_email: string | null;
  amount_cents: number;
  currency: string;
  description: string | null;
  status: string;
  paid_at: string | null;
  confirmation_sms_sent_at: string | null;
  confirmation_email_sent_at: string | null;
};

/** Stable, human-friendly payment reference derived from the request id. */
export function paymentReferenceNumber(paymentRequestId: string): string {
  return `YJ-${paymentRequestId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function formatAmount(amountCents: number, currency: string) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: (currency || "aud").toUpperCase(),
  }).format(amountCents / 100);
}

function firstName(fullName: string | null | undefined): string | null {
  const first = fullName?.trim().split(/\s+/)[0];
  return first || null;
}

function formatPaidDate(paidAt: string | null): string {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Australia/Melbourne",
  }).format(paidAt ? new Date(paidAt) : new Date());
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ============================================================
// Message content
// ============================================================

function buildConfirmationSms(input: {
  request: PaymentRequestRow;
  storeName: string;
  reference: string;
  emailedTo: string | null;
}): string {
  const { request, storeName, reference, emailedTo } = input;
  const name = firstName(request.customer_name);
  const amount = formatAmount(request.amount_cents, request.currency);
  const description = request.description?.trim();

  const lines = [
    `${name ? `Hi ${name} — your` : "Your"} payment of ${amount} was successful and has been added to your account at ${storeName} as store credit.`,
    ``,
    ...(description ? [`For: ${description}`] : []),
    `Reference: ${reference}`,
  ];
  if (emailedTo) {
    lines.push(`A receipt has been emailed to ${emailedTo}.`);
  }
  lines.push(``, `Thanks — ${storeName}`);
  return lines.join("\n");
}

export function buildReceiptEmail(input: {
  request: PaymentRequestRow;
  storeName: string;
  reference: string;
}): { subject: string; html: string; text: string } {
  const { request, storeName, reference } = input;
  const amount = formatAmount(request.amount_cents, request.currency);
  const paidOn = formatPaidDate(request.paid_at);
  const description = request.description?.trim() || null;
  const name = firstName(request.customer_name);

  const subject = `Payment receipt — ${amount} to ${storeName} (${reference})`;

  const rows: Array<[string, string]> = [
    ["Amount", amount],
    ["Paid to", storeName],
    ...(description ? ([["For", description]] as Array<[string, string]>) : []),
    ["Date", paidOn],
    ["Reference", reference],
    ["Payment method", "Card, processed securely by Stripe"],
  ];

  const rowsHtml = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#6b7280;font-size:14px;vertical-align:top;white-space:nowrap;padding-right:24px;">${escapeHtml(label)}</td>
          <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#111827;font-size:14px;font-weight:500;">${escapeHtml(value)}</td>
        </tr>`,
    )
    .join("");

  const html = `
<div style="background:#f6f6f7;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;">
    <div style="text-align:center;padding-bottom:20px;">
      <img src="${SITE_URL}/yjsmall.png" alt="Yellow Jersey" width="44" height="44" style="display:inline-block;width:44px;height:44px;border-radius:10px;vertical-align:middle;" />
      <div style="padding-top:8px;font-size:14px;font-weight:700;letter-spacing:0.06em;color:#111827;">YELLOW JERSEY</div>
    </div>
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;">
      <h1 style="margin:0;font-size:20px;font-weight:600;color:#111827;">Payment received</h1>
      <p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:#4b5563;">
        ${name ? `Hi ${escapeHtml(name)}, thanks` : "Thanks"} for your payment. ${escapeHtml(amount)} has been
        added to your account at ${escapeHtml(storeName)} as store credit — you can put it
        towards anything in store.
      </p>
      <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:24px;">
        ${rowsHtml}
      </table>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#9ca3af;">
        Keep this email as your receipt. If anything doesn't look right, just reply to
        this email or contact ${escapeHtml(storeName)} directly.
      </p>
      <div style="margin-top:20px;padding-top:16px;border-top:1px solid #f0f0f0;text-align:center;">
        <span style="font-size:12px;color:#9ca3af;vertical-align:middle;">Processed securely by</span>
        <img src="${SITE_URL}/stripe-badge.png" alt="Stripe" width="38" height="18" style="display:inline-block;vertical-align:middle;margin-left:6px;width:38px;height:18px;" />
      </div>
    </div>
    <p style="text-align:center;margin:20px 0 0;font-size:12px;color:#9ca3af;">
      Sent by Yellow Jersey on behalf of ${escapeHtml(storeName)}
    </p>
  </div>
</div>`.trim();

  const text = [
    `Payment received`,
    ``,
    `${name ? `Hi ${name}, thanks` : "Thanks"} for your payment. ${amount} has been added to your account at ${storeName} as store credit.`,
    ``,
    ...rows.map(([label, value]) => `${label}: ${value}`),
    ``,
    `Keep this email as your receipt. If anything doesn't look right, reply to this email or contact ${storeName} directly.`,
    ``,
    `Sent by Yellow Jersey on behalf of ${storeName}`,
  ].join("\n");

  return { subject, html, text };
}

// ============================================================
// Idempotency claims
// ============================================================

/**
 * Claim a confirmation slot by stamping its timestamp only when still NULL.
 * Returns true when this caller won the claim (safe to send).
 */
async function claimConfirmation(
  supabase: ReturnType<typeof createServiceRoleClient>,
  paymentRequestId: string,
  column: "confirmation_sms_sent_at" | "confirmation_email_sent_at",
): Promise<boolean> {
  const { data, error } = await supabase
    .from("store_payment_requests")
    .update({ [column]: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", paymentRequestId)
    .is(column, null)
    .select("id");
  if (error) {
    console.error(`[store-payments] Failed to claim ${column}:`, error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/** Release a claim after a failed send so a later retry can try again. */
async function releaseConfirmation(
  supabase: ReturnType<typeof createServiceRoleClient>,
  paymentRequestId: string,
  column: "confirmation_sms_sent_at" | "confirmation_email_sent_at",
): Promise<void> {
  await supabase
    .from("store_payment_requests")
    .update({ [column]: null, updated_at: new Date().toISOString() })
    .eq("id", paymentRequestId);
}

// ============================================================
// Public API
// ============================================================

export type PaymentConfirmationResult = {
  smsSent: boolean;
  emailSent: boolean;
};

/**
 * Send the post-payment Nest text + Yellow Jersey email receipt for a paid
 * request. Safe to call repeatedly (webhook retries, manual re-runs) — each
 * channel goes out at most once. Never throws.
 */
export async function sendPaymentConfirmations(
  paymentRequestId: string,
  options?: {
    /** Email captured at Stripe Checkout; persisted if the row has none yet. */
    fallbackEmail?: string | null;
  },
): Promise<PaymentConfirmationResult> {
  const result: PaymentConfirmationResult = { smsSent: false, emailSent: false };

  try {
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from("store_payment_requests")
      .select(
        "id, store_user_id, nest_chat_id, customer_name, customer_handle, customer_email, amount_cents, currency, description, status, paid_at, confirmation_sms_sent_at, confirmation_email_sent_at",
      )
      .eq("id", paymentRequestId)
      .maybeSingle();

    if (error || !data) {
      console.error("[store-payments] Confirmations: request not found:", paymentRequestId, error);
      return result;
    }

    const request = data as PaymentRequestRow;
    if (request.status !== "paid") {
      return result;
    }

    // Persist the checkout email if the row doesn't have one yet.
    const fallbackEmail = options?.fallbackEmail?.trim().toLowerCase() || null;
    if (!request.customer_email && fallbackEmail) {
      await supabase
        .from("store_payment_requests")
        .update({ customer_email: fallbackEmail, updated_at: new Date().toISOString() })
        .eq("id", paymentRequestId)
        .is("customer_email", null);
      request.customer_email = fallbackEmail;
    }

    const { data: profile } = await supabase
      .from("users")
      .select("nest_brand_key, business_name")
      .eq("user_id", request.store_user_id)
      .maybeSingle();

    const storeName = profile?.business_name?.trim() || "your bike store";
    const reference = paymentReferenceNumber(request.id);

    // ---- Email first: the text can then honestly say a receipt was emailed.
    if (request.customer_email && !request.confirmation_email_sent_at) {
      const claimed = await claimConfirmation(supabase, request.id, "confirmation_email_sent_at");
      if (claimed) {
        try {
          const provider = await getCrmEmailProvider();
          if (!provider) {
            throw new Error("Email sending is not configured.");
          }
          const { subject, html, text } = buildReceiptEmail({ request, storeName, reference });
          const [sendResult] = await provider.sendBatch([
            {
              to: request.customer_email,
              subject,
              html,
              text,
              tags: [
                { name: "type", value: "payment-receipt" },
                { name: "payment_request_id", value: request.id },
              ],
            },
          ]);
          if (!sendResult?.success) {
            throw new Error(sendResult?.error || "Email provider rejected the receipt.");
          }
          result.emailSent = true;
          await logStorePaymentRequestEvent({
            paymentRequestId: request.id,
            storeUserId: request.store_user_id,
            eventType: "confirmation_email_sent",
            actor: "system",
            message: `Emailed a Yellow Jersey receipt (${reference}) to ${request.customer_email}.`,
            metadata: { to: request.customer_email, reference, emailId: sendResult.emailId },
          });
        } catch (emailError) {
          const message =
            emailError instanceof Error ? emailError.message : "Receipt email failed.";
          await releaseConfirmation(supabase, request.id, "confirmation_email_sent_at");
          await logStorePaymentRequestEvent({
            paymentRequestId: request.id,
            storeUserId: request.store_user_id,
            eventType: "confirmation_email_failed",
            actor: "system",
            message: `Could not email the receipt to ${request.customer_email}: ${message}`,
            metadata: { to: request.customer_email, error: message },
          });
          console.error("[store-payments] Receipt email failed:", emailError);
        }
      }
    }

    // ---- Nest text into the same conversation.
    if (request.nest_chat_id && !request.confirmation_sms_sent_at) {
      const claimed = await claimConfirmation(supabase, request.id, "confirmation_sms_sent_at");
      if (claimed) {
        try {
          const brandKey = resolveStoreNestBrandKey(profile);
          const content = buildConfirmationSms({
            request,
            storeName,
            reference,
            emailedTo: result.emailSent ? request.customer_email : null,
          });
          await proxyNestBrandPortalRequest(brandKey, {
            method: "POST",
            body: {
              action: "send_message",
              chatId: request.nest_chat_id,
              content,
            },
          });
          result.smsSent = true;
          await logStorePaymentRequestEvent({
            paymentRequestId: request.id,
            storeUserId: request.store_user_id,
            eventType: "confirmation_sms_sent",
            actor: "system",
            message: `Sent the payment confirmation text (${reference}) in the Nest conversation.`,
            metadata: { chatId: request.nest_chat_id, reference },
          });
        } catch (smsError) {
          const message = smsError instanceof Error ? smsError.message : "Nest send failed.";
          await releaseConfirmation(supabase, request.id, "confirmation_sms_sent_at");
          await logStorePaymentRequestEvent({
            paymentRequestId: request.id,
            storeUserId: request.store_user_id,
            eventType: "confirmation_sms_failed",
            actor: "system",
            message: `Could not send the confirmation text: ${message}`,
            metadata: { chatId: request.nest_chat_id, error: message },
          });
          console.error("[store-payments] Confirmation SMS failed:", smsError);
        }
      }
    }
  } catch (error) {
    console.error("[store-payments] sendPaymentConfirmations failed:", error);
  }

  return result;
}
