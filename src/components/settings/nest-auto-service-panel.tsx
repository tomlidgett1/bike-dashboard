"use client";

import * as React from "react";
import { Loader2, RefreshCw } from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";
import { SettingsSection } from "@/components/dashboard/settings-primitives";
import type { NestPickupSuggestion } from "@/lib/nest/pickup-suggestions";
import { NestPickupConfirmDialog } from "@/components/settings/nest-pickup-suggestion-ui";

type NestAutoServiceCustomer = {
  id: string;
  customerId: string;
  customerName: string;
  mobile: string | null;
  lastServiceAt: string;
  lastServiceDescription: string;
  daysSinceService: number;
  messageDraft: string;
  canSend: boolean;
};

type AutoCustomersResponse = {
  customers?: NestAutoServiceCustomer[];
  lightspeedConnected?: boolean;
  nestConfigured?: boolean;
  error?: string;
};

const NEST_INBOX_ICON_BUTTON_CLASS =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50";

function formatServiceDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDaysSince(days: number): string {
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

function toPickupSuggestion(customer: NestAutoServiceCustomer): NestPickupSuggestion {
  const lastLabel = formatDaysSince(customer.daysSinceService);
  return {
    id: customer.customerId,
    workorderId: customer.customerId,
    customerId: customer.customerId,
    customerName: customer.customerName,
    mobile: customer.mobile,
    workSummary: customer.lastServiceDescription,
    label: `Message ${customer.customerName} — last serviced ${lastLabel}`,
    messageDraft: customer.messageDraft,
    finishedAt: customer.lastServiceAt,
    statusName: "Service due",
    canSend: customer.canSend,
  };
}

async function fetchAutoCustomers(): Promise<AutoCustomersResponse> {
  const res = await fetch("/api/store/nest-auto-customers", { cache: "no-store" });
  const data = (await res.json()) as AutoCustomersResponse;
  if (!res.ok) {
    throw new Error(data.error || "Could not load service reminders.");
  }
  return data;
}

export function NestAutoServicePanel() {
  const [customers, setCustomers] = React.useState<NestAutoServiceCustomer[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lightspeedConnected, setLightspeedConnected] = React.useState(true);
  const [activeSuggestion, setActiveSuggestion] = React.useState<NestPickupSuggestion | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const load = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await fetchAutoCustomers();
      setCustomers(Array.isArray(data.customers) ? data.customers : []);
      setLightspeedConnected(data.lightspeedConnected !== false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load service reminders.");
      if (!silent) setCustomers([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }

  function openCustomer(customer: NestAutoServiceCustomer) {
    setActiveSuggestion(toPickupSuggestion(customer));
    setDialogOpen(true);
  }

  return (
    <>
      <SettingsSection
        title="Service reminders"
        description="Customers who had a general or full service in the last year, but not in the last six months."
        headerAction={
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className={NEST_INBOX_ICON_BUTTON_CLASS}
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </button>
        }
        contentClassName="p-0"
      >
        {!lightspeedConnected ? (
          <div className="rounded-md border border-gray-200 bg-white px-4 py-6 text-sm text-gray-500">
            Connect Lightspeed to see customers due for a general or full service.
          </div>
        ) : loading && customers.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="rounded-md border border-gray-200 bg-white px-4 py-6 text-sm text-red-600">
            {error}
          </div>
        ) : customers.length === 0 ? (
          <div className="rounded-md border border-gray-200 bg-white px-4 py-8 text-center">
            <p className="text-[13px] font-medium text-gray-900">No customers due right now</p>
            <p className="mt-1 text-xs text-gray-500">
              Everyone with a general or full service in the last year has also had one in the last
              six months.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
            <div className="divide-y divide-gray-100">
              {customers.map((customer) => (
                <button
                  key={customer.customerId}
                  type="button"
                  onClick={() => openCustomer(customer)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {customer.customerName}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Last {customer.lastServiceDescription} · {formatServiceDate(customer.lastServiceAt)}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {formatDaysSince(customer.daysSinceService)}
                      {customer.mobile ? ` · ${customer.mobile}` : " · No mobile on file"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-md border px-2 py-1 text-[10px] font-medium",
                      customer.canSend
                        ? "border-gray-200 bg-white text-gray-600"
                        : "border-gray-200 bg-gray-50 text-gray-400",
                    )}
                  >
                    {customer.canSend ? "Message" : "No mobile"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </SettingsSection>

      <NestPickupConfirmDialog
        suggestion={activeSuggestion}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSent={() => {
          setActiveSuggestion(null);
        }}
      />
    </>
  );
}
