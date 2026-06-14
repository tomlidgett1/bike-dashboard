"use client";

import * as React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface XeroStatus {
  configured: boolean;
  connected: boolean;
  organisation_name?: string | null;
  last_error?: string | null;
}

/**
 * Small pill prompting the store to connect Xero (accounting) so the Genie
 * can answer P&L, balance sheet, bills, and purchase-order questions.
 * Hidden while loading, when Xero isn't configured on the environment,
 * and renders a subtle connected state once linked.
 */
export function XeroConnectPill({ className }: { className?: string }) {
  const [status, setStatus] = React.useState<XeroStatus | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/xero/status")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.connected === "boolean") {
          setStatus(data);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status || !status.configured) return null;

  if (status.connected) {
    return null;
  }

  return (
    <a
      href="/api/xero/auth/initiate"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-white px-2.5 py-1 text-xs font-medium text-sky-700 shadow-sm transition-colors hover:border-sky-400 hover:bg-sky-50",
        className,
      )}
      title="Connect Xero so the Genie can answer P&L, balance sheet, bills, and purchase order questions"
    >
      <XeroMark className="h-3.5 w-3.5" />
      Connect Xero
    </a>
  );
}

function XeroMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 overflow-hidden rounded-full", className)} aria-hidden>
      <Image src="/xero.png" alt="" width={14} height={14} className="h-full w-full object-cover" />
    </span>
  );
}
