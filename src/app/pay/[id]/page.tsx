// ============================================================
// Public Payment Request Page
// ============================================================
// Landing page for /pay/<id> links texted to customers from Nest.
// Shows who is asking, how much, and a button that opens Stripe Checkout.
// Deliberately does not auto-redirect: iMessage link previews prefetch GETs,
// so checkout sessions are only created on an explicit button click.

import type { Metadata } from "next";
import Image from "next/image";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { PayButton } from "./pay-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Payment request",
  robots: { index: false, follow: false },
};

type PaymentRequestRow = {
  id: string;
  store_user_id: string;
  amount_cents: number;
  currency: string;
  description: string | null;
  status: string;
  customer_name: string | null;
  paid_at: string | null;
};

function formatAmount(amountCents: number, currency: string) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: (currency || "aud").toUpperCase(),
  }).format(amountCents / 100);
}

// White edge-to-edge on mobile; centred card on a grey canvas from sm up.
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-white sm:bg-gray-50">
      <main className="flex w-full flex-1 items-center justify-center px-5 pt-[max(2.5rem,env(safe-area-inset-top))] pb-6 sm:px-4 sm:py-10">
        <div className="w-full max-w-sm text-center sm:rounded-md sm:border sm:border-gray-200 sm:bg-white sm:p-8 sm:shadow-sm">
          <Image
            src="/yjsmall.png"
            alt="Yellow Jersey"
            width={40}
            height={40}
            className="mx-auto h-10 w-10 rounded-md"
            priority
          />
          <div className="mt-6">{children}</div>
        </div>
      </main>

      <footer className="flex shrink-0 items-center justify-center gap-1.5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <span className="text-xs text-gray-400">Secured by</span>
        <Image
          src="/stripe.svg"
          alt="Stripe"
          width={40}
          height={17}
          className="h-[17px] w-auto opacity-50"
        />
      </footer>
    </div>
  );
}

function PaidIcon() {
  return (
    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-gray-50">
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="h-5 w-5 text-gray-700"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
}

export default async function PayRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { id } = await params;
  const { paid } = await searchParams;

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return (
      <PageShell>
        <p className="text-base font-medium text-gray-900">Payment link not found</p>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          This link looks incomplete. Please ask the store to send it again.
        </p>
      </PageShell>
    );
  }

  const supabase = createServiceRoleClient();

  const { data } = await supabase
    .from("store_payment_requests")
    .select(
      "id, store_user_id, amount_cents, currency, description, status, customer_name, paid_at",
    )
    .eq("id", id)
    .maybeSingle();

  const paymentRequest = data as PaymentRequestRow | null;

  if (!paymentRequest) {
    return (
      <PageShell>
        <p className="text-base font-medium text-gray-900">Payment link not found</p>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          This payment link doesn&apos;t exist or has been removed.
        </p>
      </PageShell>
    );
  }

  const { data: store } = await supabase
    .from("users")
    .select("business_name")
    .eq("user_id", paymentRequest.store_user_id)
    .maybeSingle();

  const storeName = store?.business_name?.trim() || "Your bike store";
  const amount = formatAmount(paymentRequest.amount_cents, paymentRequest.currency);
  const isPaid = paymentRequest.status === "paid";
  const justPaid = paid === "1" && !isPaid;

  if (isPaid || justPaid) {
    return (
      <PageShell>
        <PaidIcon />
        <p className="mt-4 text-base font-medium text-gray-900">
          {isPaid ? "Payment received" : "Payment processing"}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          {isPaid
            ? `Thanks! ${amount} has been added to your account as store credit at ${storeName}.`
            : `Thanks! Your payment of ${amount} is being confirmed — it will appear as store credit at ${storeName} shortly.`}
        </p>
        <p className="mt-4 text-xs text-gray-400">You can close this page.</p>
      </PageShell>
    );
  }

  if (paymentRequest.status !== "pending") {
    return (
      <PageShell>
        <p className="text-base font-medium text-gray-900">Payment link no longer active</p>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          This request was cancelled by {storeName}. Please ask them to send a new link.
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <p className="text-sm text-gray-500">{storeName} has requested</p>
      <p className="mt-2 text-4xl font-semibold tracking-tight text-gray-900 tabular-nums">
        {amount}
      </p>
      {paymentRequest.description ? (
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          {paymentRequest.description}
        </p>
      ) : null}

      <div className="mt-7">
        <PayButton requestId={paymentRequest.id} label={`Pay ${amount}`} />
      </div>

      <p className="mt-5 text-xs leading-relaxed text-gray-400">
        Once paid, {amount} is added to
        {paymentRequest.customer_name ? ` ${paymentRequest.customer_name}'s` : " your"} account
        as store credit at {storeName}.
      </p>
    </PageShell>
  );
}
