"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Star,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GoogleBusinessConnectionPublic } from "@/lib/customer-inquiries/google-review-types";

type LocationOption = {
  accountId: string;
  locationId: string;
  title: string;
  reviewUrl: string | null;
};

/** Flip to `true` to re-enable Connect Google Business UI (header, empty states, Nest settings). */
export const SHOW_GOOGLE_BUSINESS_CONNECT = false;

type GoogleBusinessConnectCardProps = {
  className?: string;
  /** When true, render a compact banner suitable for the enquiries empty/list area. */
  compact?: boolean;
  onConnected?: () => void;
};

export function GoogleBusinessConnectCard(props: GoogleBusinessConnectCardProps) {
  if (!SHOW_GOOGLE_BUSINESS_CONNECT) return null;
  return <GoogleBusinessConnectCardInner {...props} />;
}

function GoogleBusinessConnectCardInner({
  className,
  compact = false,
  onConnected,
}: GoogleBusinessConnectCardProps) {
  const [status, setStatus] = React.useState<GoogleBusinessConnectionPublic | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [actionLoading, setActionLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [locations, setLocations] = React.useState<LocationOption[]>([]);
  const [picking, setPicking] = React.useState(false);

  const fetchStatus = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/store/google-business/status", { cache: "no-store" });
      const data = (await res.json()) as GoogleBusinessConnectionPublic & { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not load Google Business status.");
      setStatus(data);
      if (data.needsLocation) {
        setPicking(true);
        await loadLocations();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Google Business status.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLocations = React.useCallback(async () => {
    try {
      const res = await fetch("/api/store/google-business/locations", { cache: "no-store" });
      const data = (await res.json()) as { locations?: LocationOption[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Could not load locations.");
      setLocations(data.locations ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load locations.");
    }
  }, []);

  React.useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("google_business");
    if (!flag) return;
    const reason = params.get("reason");
    if (flag === "error" && reason) setError(reason);
    if (flag === "pick_location") {
      setPicking(true);
      void loadLocations();
    }
    if (flag === "connected") {
      void fetchStatus().then(() => onConnected?.());
    }
    // Clear query params so refresh doesn't re-show the banner.
    const url = new URL(window.location.href);
    url.searchParams.delete("google_business");
    url.searchParams.delete("reason");
    window.history.replaceState({}, "", url.pathname + url.search);
  }, [fetchStatus, loadLocations, onConnected]);

  const handleConnect = () => {
    setActionLoading(true);
    window.location.href = "/api/store/google-business/auth/initiate";
  };

  const handleDisconnect = async () => {
    try {
      setActionLoading(true);
      setError(null);
      const res = await fetch("/api/store/google-business/disconnect", { method: "POST" });
      const data = (await res.json()) as GoogleBusinessConnectionPublic & { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not disconnect.");
      setStatus(data);
      setPicking(false);
      setLocations([]);
      onConnected?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSelectLocation = async (location: LocationOption) => {
    try {
      setActionLoading(true);
      setError(null);
      const res = await fetch("/api/store/google-business/select-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: location.accountId,
          locationId: location.locationId,
        }),
      });
      const data = (await res.json()) as GoogleBusinessConnectionPublic & { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not save location.");
      setStatus(data);
      setPicking(false);
      onConnected?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save location.");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={cn("rounded-xl border border-gray-200 bg-white p-4", className)}>
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  const connected = status?.connected === true;
  const needsLocation = status?.needsLocation === true || picking;
  const oauthConfigured = status?.oauthConfigured !== false;

  return (
    <div className={cn("rounded-xl border border-gray-200 bg-white p-4", className)}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white">
          <Star className="h-4 w-4 text-gray-700" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-gray-900">Google Business</p>
            {connected ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                <CheckCircle2 className="h-3 w-3" />
                Connected
              </span>
            ) : needsLocation ? (
              <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                Choose location
              </span>
            ) : (
              <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                Not connected
              </span>
            )}
          </div>

          {!compact ? (
            <p className="mt-1 text-xs text-gray-500">
              Connect your Google Business Profile to show reviews in Customer Enquiries,
              reply publicly, and power Nest&rsquo;s Request review link.
            </p>
          ) : null}

          {connected && status?.locationName ? (
            <p className="mt-1.5 truncate text-xs text-gray-600">
              {status.locationName}
              {status.googleEmail ? ` · ${status.googleEmail}` : ""}
            </p>
          ) : null}

          {error ? (
            <div
              className="mt-2 flex items-start gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-500" />
              <span>{error}</span>
            </div>
          ) : null}

          {!oauthConfigured && !connected ? (
            <p className="mt-2 text-xs text-gray-500">
              Ask an admin to set{" "}
              <span className="font-medium text-gray-700">GOOGLE_BUSINESS_CLIENT_ID</span> and{" "}
              <span className="font-medium text-gray-700">GOOGLE_BUSINESS_CLIENT_SECRET</span>,
              then try again.
            </p>
          ) : null}

          <AnimatePresence>
            {needsLocation && locations.length > 0 ? (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
                className="overflow-hidden"
              >
                <div className="mt-3 space-y-1.5">
                  <p className="text-xs font-medium text-gray-700">Choose a location</p>
                  {locations.map((location) => (
                    <button
                      key={`${location.accountId}:${location.locationId}`}
                      type="button"
                      disabled={actionLoading}
                      onClick={() => void handleSelectLocation(location)}
                      className="flex w-full items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-60"
                    >
                      <span className="truncate">{location.title}</span>
                      {actionLoading ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-gray-400" />
                      ) : null}
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!connected && !needsLocation ? (
              <Button
                type="button"
                size="sm"
                className="rounded-md"
                disabled={actionLoading || !oauthConfigured}
                onClick={handleConnect}
              >
                {actionLoading ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Star className="mr-1.5 h-3.5 w-3.5" />
                )}
                Connect Google Business
              </Button>
            ) : null}

            {needsLocation && locations.length === 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-md"
                disabled={actionLoading}
                onClick={() => void loadLocations()}
              >
                Load locations
              </Button>
            ) : null}

            {connected || needsLocation ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-md"
                disabled={actionLoading}
                onClick={() => void handleDisconnect()}
              >
                Disconnect
              </Button>
            ) : null}

            {connected ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="rounded-md"
                disabled={actionLoading}
                onClick={handleConnect}
              >
                Reconnect
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
