"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { DeputyLogo } from "@/components/genie/deputy-logo";

interface DeputyStatus {
  configured: boolean;
  connected: boolean;
  account_name?: string | null;
  last_error?: string | null;
}

/**
 * Small pill prompting the store to connect Deputy (staff scheduling) so the
 * Genie can answer who worked, who is rostered, and hours-worked questions.
 * Hidden while loading and when Deputy isn't configured on the environment;
 * renders a subtle connected state once linked.
 */
export function DeputyConnectPill({ className }: { className?: string }) {
  const [status, setStatus] = React.useState<DeputyStatus | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/deputy/status")
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
      href="/api/deputy/auth/initiate"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-rose-300 bg-white px-2.5 py-1 text-xs font-medium text-rose-700 shadow-sm transition-colors hover:border-rose-400 hover:bg-rose-50",
        className,
      )}
      title="Connect Deputy so the Genie can answer rostering, timesheet, and hours-worked questions"
    >
      <DeputyLogo className="h-3.5 w-3.5 rounded-[3px]" />
      Connect Deputy
    </a>
  );
}
