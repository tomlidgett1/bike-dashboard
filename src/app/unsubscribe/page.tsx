// Public unsubscribe confirmation page — no login required.
// The signed-equivalent token in the query string identifies the contact;
// opting out is idempotent, so revisiting the link is always safe.

import type { Metadata } from "next";
import { optOutContactByToken } from "@/lib/crm/unsubscribe";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unsubscribe — Yellow Jersey",
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const outcome = await optOutContactByToken(token, "unsubscribe_link");
  const success = outcome === "unsubscribed" || outcome === "already_unsubscribed";

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-6 py-24">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-8 flex h-14 w-14 items-center justify-center rounded-full bg-primary">
          {success ? (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6 text-primary-foreground"
              aria-hidden
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="h-6 w-6 text-primary-foreground"
              aria-hidden
            >
              <path d="M12 8v5" />
              <circle cx="12" cy="16.5" r="0.5" fill="currentColor" />
            </svg>
          )}
        </div>

        <p className="text-xs font-bold uppercase tracking-[0.3em] text-muted-foreground">
          Yellow Jersey
        </p>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
          {success ? "You're unsubscribed" : "This link isn't valid"}
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {success
            ? "You have been unsubscribed from Yellow Jersey emails. You won't receive marketing emails from us again."
            : "This unsubscribe link is invalid or has expired. If you'd like to stop receiving emails, reply to any of our emails and we'll take care of it."}
        </p>
      </div>
    </main>
  );
}
