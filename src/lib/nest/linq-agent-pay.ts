/**
 * Linq Agent Pay (LinkPay) helpers.
 *
 * Creates hosted payment requests via POST /v3/payment_requests and helpers
 * for detecting / sending checkout_url as a rich `link` message part.
 */

import { pickServerEnv } from "@/lib/nest-portal/lib/server-env";
import { stripUrlTrailingPunctuation } from "@/lib/nest/sms-link-format";

const LINQ_BASE_URL =
  pickServerEnv(["LINQ_API_BASE_URL"]) || "https://api.linqapp.com/api/partner/v3";

/** Hosted Agent Pay checkout URLs (App Clip / web checkout). */
export const AGENT_PAY_CHECKOUT_URL_RE =
  /https?:\/\/(?:[\w.-]+\.)?linqapp\.com\/pay\/[^\s<>\[\]"']+/gi;

export type LinqPaymentRequestStatus =
  | "requested"
  | "succeeded"
  | "canceled"
  | "expired"
  | string;

export type LinqPaymentRequest = {
  id: string;
  status: LinqPaymentRequestStatus;
  amount: number | null;
  currency: string | null;
  description: string | null;
  checkout_url: string;
  expires_at: string | null;
  paid_at: string | null;
  metadata: Record<string, string>;
  stripe: {
    payment_intent_id?: string | null;
    customer_id?: string | null;
    subscription_id?: string | null;
  } | null;
};

function linqToken(): string {
  const token = pickServerEnv(["LINQ_API_TOKEN"]);
  if (!token) throw new Error("LINQ_API_TOKEN is not configured");
  return token;
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string" && entry.trim()) out[key] = entry;
    else if (typeof entry === "number" && Number.isFinite(entry)) out[key] = String(entry);
    else if (typeof entry === "boolean") out[key] = entry ? "true" : "false";
  }
  return out;
}

export function normaliseLinqPaymentRequest(raw: unknown): LinqPaymentRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;

  // Some envelopes nest under `payment_request`; accept both shapes.
  const nested =
    row.payment_request && typeof row.payment_request === "object"
      ? (row.payment_request as Record<string, unknown>)
      : row;

  const id = typeof nested.id === "string" ? nested.id.trim() : "";
  const checkoutUrl =
    typeof nested.checkout_url === "string" ? nested.checkout_url.trim() : "";
  if (!id || !checkoutUrl) return null;

  const stripeRaw =
    nested.stripe && typeof nested.stripe === "object"
      ? (nested.stripe as Record<string, unknown>)
      : null;

  return {
    id,
    status: typeof nested.status === "string" ? nested.status : "requested",
    amount: typeof nested.amount === "number" ? nested.amount : null,
    currency: typeof nested.currency === "string" ? nested.currency : null,
    description: typeof nested.description === "string" ? nested.description : null,
    checkout_url: checkoutUrl,
    expires_at: typeof nested.expires_at === "string" ? nested.expires_at : null,
    paid_at: typeof nested.paid_at === "string" ? nested.paid_at : null,
    metadata: asStringRecord(nested.metadata),
    stripe: stripeRaw
      ? {
          payment_intent_id:
            typeof stripeRaw.payment_intent_id === "string"
              ? stripeRaw.payment_intent_id
              : null,
          customer_id:
            typeof stripeRaw.customer_id === "string" ? stripeRaw.customer_id : null,
          subscription_id:
            typeof stripeRaw.subscription_id === "string"
              ? stripeRaw.subscription_id
              : null,
        }
      : null,
  };
}

export async function createLinqPaymentRequest(input: {
  amountCents: number;
  currency?: string;
  description?: string;
  metadata?: Record<string, string>;
}): Promise<LinqPaymentRequest> {
  if (!Number.isFinite(input.amountCents) || input.amountCents < 50) {
    throw new Error("Amount must be at least $0.50.");
  }

  const token = linqToken();
  const res = await fetch(`${LINQ_BASE_URL}/payment_requests`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: Math.round(input.amountCents),
      currency: (input.currency || "aud").toLowerCase(),
      ...(input.description?.trim()
        ? { description: input.description.trim().slice(0, 200) }
        : {}),
      ...(input.metadata && Object.keys(input.metadata).length > 0
        ? { metadata: input.metadata }
        : {}),
    }),
  });

  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detail =
      typeof payload.error === "string"
        ? payload.error
        : typeof payload.message === "string"
          ? payload.message
          : JSON.stringify(payload).slice(0, 240);
    if (res.status === 403) {
      throw new Error(
        "LinkPay is not ready yet. Connect Stripe in your Linq Agent Pay dashboard, then try again.",
      );
    }
    throw new Error(`Linq Agent Pay ${res.status}: ${detail}`);
  }

  const normalised = normaliseLinqPaymentRequest(payload);
  if (!normalised) {
    throw new Error("Linq Agent Pay did not return a checkout URL.");
  }
  return normalised;
}

/** First Agent Pay checkout URL found in free text, or null. */
export function extractAgentPayCheckoutUrl(text: string): string | null {
  const matches = text.match(AGENT_PAY_CHECKOUT_URL_RE);
  if (!matches?.length) return null;
  return stripUrlTrailingPunctuation(matches[0]);
}

/** Remove a specific checkout URL from message text (keeps surrounding copy). */
export function stripCheckoutUrlFromText(text: string, checkoutUrl: string): string {
  const clean = stripUrlTrailingPunctuation(checkoutUrl.trim());
  if (!clean) return text;
  return text
    .split(clean)
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isAgentPayCheckoutUrl(url: string): boolean {
  AGENT_PAY_CHECKOUT_URL_RE.lastIndex = 0;
  return AGENT_PAY_CHECKOUT_URL_RE.test(url.trim());
}
