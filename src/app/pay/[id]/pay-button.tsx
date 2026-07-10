"use client";

import * as React from "react";

export function PayButton({ requestId, label }: { requestId: string; label: string }) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function startCheckout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/pay/${requestId}/checkout`, { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Could not start the payment.");
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the payment.");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void startCheckout()}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-gray-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-60"
      >
        {loading ? (
          <span
            aria-hidden
            className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
          />
        ) : null}
        {loading ? "Opening secure checkout…" : label}
      </button>
      {error ? <p className="mt-3 text-center text-xs text-gray-500">{error}</p> : null}
    </div>
  );
}
