"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Check,
  ChevronDown,
  Mail,
  MailCheck,
  MailX,
  Search,
  UserRoundSearch,
  Users,
} from "lucide-react";
import { NestLogo } from "@/components/genie/nest-logo";
import {
  CrmSkeleton,
  LifecycleBadge,
} from "@/components/crm/primitives";
import { CustomerProfileView } from "@/components/crm/customer-profile-view";
import {
  errorMessage,
  formatAud,
  formatCrmDate,
  type CrmCustomerSummary,
  type CustomerListResponse,
} from "@/components/crm/types";
import { cn } from "@/lib/utils";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "active", label: "Active" },
  { id: "vip", label: "High value" },
  { id: "reactivated", label: "Reactivated" },
  { id: "at_risk", label: "At risk" },
  { id: "dormant", label: "Dormant" },
  { id: "churned", label: "Churned" },
  { id: "prospect", label: "Prospects" },
  { id: "opted_in", label: "Opted in", icon: MailCheck },
  { id: "no_email", label: "No email", icon: MailX },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

const ROW_HEIGHT = 52;

const AVATAR_PALETTE = [
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
  "bg-teal-100 text-teal-700",
  "bg-indigo-100 text-indigo-700",
  "bg-orange-100 text-orange-700",
] as const;

function avatarPalette(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function customerInitials(customer: CrmCustomerSummary): string {
  const fromName = customer.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  if (fromName) return fromName;
  return (customer.primaryEmail ?? "?").slice(0, 2).toUpperCase();
}

export function CustomersView() {
  const params = useParams<{ id?: string | string[] }>();
  const selectedId = Array.isArray(params.id) ? params.id[0] : params.id;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlQuery = searchParams.get("query") ?? "";
  const urlFilter = (searchParams.get("filter") ?? "all") as FilterId;
  const [search, setSearch] = React.useState(urlQuery);
  const [customers, setCustomers] = React.useState<CrmCustomerSummary[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [total, setTotal] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [portalReady, setPortalReady] = React.useState(false);
  const [cohortOpen, setCohortOpen] = React.useState(false);
  const tableScrollRef = React.useRef<HTMLDivElement>(null);
  const cohortRef = React.useRef<HTMLDivElement>(null);
  const activeFilter = FILTERS.find((filter) => filter.id === urlFilter) ?? FILTERS[0];

  React.useEffect(() => {
    setPortalReady(true);
  }, []);

  React.useEffect(() => {
    if (!cohortOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!cohortRef.current?.contains(event.target as Node)) {
        setCohortOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCohortOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [cohortOpen]);

  const listPath = `/settings/store/crm/customers${
    searchParams.size ? `?${searchParams.toString()}` : ""
  }`;

  const rowVirtualizer = useVirtualizer({
    count: customers.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  React.useEffect(() => {
    setSearch(urlQuery);
  }, [urlQuery]);

  React.useEffect(() => {
    if (search === urlQuery) return;
    const timeout = window.setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      if (search.trim()) next.set("query", search.trim());
      else next.delete("query");
      next.delete("cursor");
      const base = pathname.startsWith("/settings/store/crm/customers/")
        ? "/settings/store/crm/customers"
        : pathname;
      router.replace(`${base}?${next.toString()}`, { scroll: false });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [pathname, router, search, searchParams, urlQuery]);

  const load = React.useCallback(
    async ({ append = false, cursor }: { append?: boolean; cursor?: string } = {}) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      const query = new URLSearchParams({ limit: "50" });
      if (urlQuery) query.set("query", urlQuery);
      if (urlFilter !== "all") query.set("filter", urlFilter);
      if (cursor) query.set("cursor", cursor);

      try {
        const response = await fetch(`/api/store/crm/customers?${query.toString()}`, {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as CustomerListResponse;
        if (!response.ok) {
          throw new Error(errorMessage(payload, "Customers could not be loaded."));
        }
        const nextCustomers = payload.customers ?? payload.items ?? [];
        setCustomers((current) => (append ? [...current, ...nextCustomers] : nextCustomers));
        setNextCursor(payload.nextCursor ?? payload.page?.nextCursor ?? null);
        setTotal(payload.total ?? (append ? null : nextCustomers.length));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Customers could not be loaded.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [urlFilter, urlQuery],
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!selectedId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        router.push(listPath, { scroll: false });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [listPath, router, selectedId]);

  const setFilter = (filter: FilterId) => {
    const next = new URLSearchParams(searchParams.toString());
    if (filter === "all") next.delete("filter");
    else next.set("filter", filter);
    next.delete("cursor");
    setCohortOpen(false);
    router.replace(`/settings/store/crm/customers?${next.toString()}`, { scroll: false });
  };

  const openCustomer = (customerId: string) => {
    const qs = searchParams.size ? `?${searchParams.toString()}` : "";
    router.push(`/settings/store/crm/customers/${customerId}${qs}`, { scroll: false });
  };

  const closeCustomer = () => {
    router.push(listPath, { scroll: false });
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-white">
      <div className="shrink-0 border-b border-gray-200 px-4 py-3 md:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 w-full sm:max-w-sm">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                aria-hidden
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search customers"
                aria-label="Search customers"
                className="h-10 w-full rounded-full border border-gray-300 bg-white pl-9 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
              />
            </div>
            <div ref={cohortRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setCohortOpen((open) => !open)}
                aria-haspopup="listbox"
                aria-expanded={cohortOpen}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-gray-300 bg-white px-3.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
              >
                <Users className="h-3.5 w-3.5 text-gray-500" aria-hidden />
                <span>{activeFilter.label}</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-gray-400 transition-transform duration-200",
                    cohortOpen && "rotate-180",
                  )}
                />
              </button>
              <AnimatePresence>
                {cohortOpen ? (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{
                      duration: 0.4,
                      ease: [0.04, 0.62, 0.23, 0.98],
                    }}
                    className="absolute left-0 top-[calc(100%+0.35rem)] z-20 w-56 overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-inset ring-gray-200"
                  >
                    <div
                      role="listbox"
                      aria-label="Customer cohorts"
                      className="max-h-72 overflow-y-auto p-1"
                    >
                      {FILTERS.map((filter) => {
                        const active = urlFilter === filter.id;
                        const Icon = "icon" in filter ? filter.icon : null;
                        return (
                          <button
                            key={filter.id}
                            type="button"
                            role="option"
                            aria-selected={active}
                            onClick={() => setFilter(filter.id)}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                              active
                                ? "bg-gray-100 text-gray-900"
                                : "text-gray-700 hover:bg-gray-50",
                            )}
                          >
                            {Icon ? (
                              <Icon className="h-3.5 w-3.5 text-gray-500" aria-hidden />
                            ) : (
                              <Users className="h-3.5 w-3.5 text-gray-500" aria-hidden />
                            )}
                            <span className="flex-1">{filter.label}</span>
                            {active ? (
                              <Check className="h-3.5 w-3.5 text-gray-700" aria-hidden />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
          <p className="shrink-0 text-xs text-gray-500 lg:text-right">
            {total == null
              ? `${customers.length.toLocaleString("en-AU")} loaded`
              : `${total.toLocaleString("en-AU")} customers`}
          </p>
        </div>
      </div>

      <div ref={tableScrollRef} className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <CrmSkeleton variant="rows" count={10} className="p-4" />
        ) : error && customers.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-600">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-3 h-9 rounded-md bg-gray-900 px-3 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
            >
              Try again
            </button>
          </div>
        ) : customers.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center p-6 text-center">
            <UserRoundSearch className="h-8 w-8 text-gray-400" aria-hidden />
            <p className="mt-3 text-sm font-medium text-gray-900">No customers found</p>
            <p className="mt-1 text-xs text-gray-500">Try another name, email, or cohort.</p>
          </div>
        ) : (
          <div className="min-w-[960px]">
            <div className="sticky top-0 z-10 grid grid-cols-[minmax(14rem,1.4fr)_minmax(12rem,1.2fr)_7.5rem_6.5rem_4.5rem_7.5rem_9.5rem] gap-3 border-b border-gray-200 bg-gray-50/95 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 backdrop-blur md:px-5">
              <span>Customer</span>
              <span>Contact</span>
              <span>Cohort</span>
              <span className="text-right">Spend</span>
              <span className="text-right">Sales</span>
              <span>Last purchase</span>
              <span className="text-right">Actions</span>
            </div>

            <div
              className="relative"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const customer = customers[virtualRow.index];
                if (!customer) return null;
                const selected = selectedId === customer.id;
                const messageHref = `/settings/store/crm/inbox?compose=1${
                  customer.primaryPhone
                    ? `&phone=${encodeURIComponent(customer.primaryPhone)}`
                    : ""
                }`;
                return (
                  <div
                    key={customer.id}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    className="absolute left-0 top-0 w-full"
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => openCustomer(customer.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openCustomer(customer.id);
                        }
                      }}
                      onPointerEnter={() => {
                        router.prefetch(
                          `/settings/store/crm/customers/${customer.id}${
                            searchParams.size ? `?${searchParams.toString()}` : ""
                          }`,
                        );
                      }}
                      aria-pressed={selected}
                      className={cn(
                        "grid h-full w-full cursor-pointer grid-cols-[minmax(14rem,1.4fr)_minmax(12rem,1.2fr)_7.5rem_6.5rem_4.5rem_7.5rem_9.5rem] gap-3 border-b border-gray-100 px-4 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-400 md:px-5",
                        selected && "bg-gray-50",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                            avatarPalette(customer.primaryEmail || customer.id),
                          )}
                        >
                          {customerInitials(customer)}
                        </span>
                        <span className="truncate text-sm font-medium text-gray-900">
                          {customer.displayName}
                        </span>
                      </span>
                      <span className="flex min-w-0 flex-col justify-center">
                        <span className="truncate text-sm text-gray-700">
                          {customer.primaryEmail || "—"}
                        </span>
                        {customer.primaryPhone ? (
                          <span className="truncate text-xs text-gray-500">
                            {customer.primaryPhone}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex items-center">
                        <LifecycleBadge
                          stage={customer.lifecycleStage}
                          label={customer.lifecycleLabel}
                        />
                      </span>
                      <span className="flex items-center justify-end text-sm font-medium tabular-nums text-gray-800">
                        {formatAud(customer.totalSpend)}
                      </span>
                      <span className="flex items-center justify-end text-sm tabular-nums text-gray-700">
                        {customer.saleCount.toLocaleString("en-AU")}
                      </span>
                      <span className="flex items-center text-sm text-gray-600">
                        {formatCrmDate(customer.lastPurchaseAt)}
                      </span>
                      <span
                        className="flex items-center justify-end gap-1.5"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        {customer.primaryEmail ? (
                          <a
                            href={`mailto:${customer.primaryEmail}`}
                            title={`Email ${customer.displayName}`}
                            aria-label={`Send email to ${customer.displayName}`}
                            className="inline-flex h-8 items-center gap-1 rounded-md bg-white px-2 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                          >
                            <Mail className="h-3.5 w-3.5" aria-hidden />
                            Email
                          </a>
                        ) : (
                          <span
                            title="No email on file"
                            className="inline-flex h-8 cursor-not-allowed items-center gap-1 rounded-md bg-white px-2 text-xs font-medium text-gray-400 ring-1 ring-inset ring-gray-200"
                          >
                            <Mail className="h-3.5 w-3.5" aria-hidden />
                            Email
                          </span>
                        )}
                        <a
                          href={messageHref}
                          title={`Message ${customer.displayName}`}
                          aria-label={`Send Nest message to ${customer.displayName}`}
                          className="inline-flex h-8 items-center gap-1 rounded-md bg-white px-2 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                        >
                          <NestLogo className="h-3.5 w-3.5" />
                          Message
                        </a>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {nextCursor ? (
              <div className="border-t border-gray-100 p-3">
                <button
                  type="button"
                  onClick={() => void load({ append: true, cursor: nextCursor })}
                  disabled={loadingMore}
                  className="h-9 w-full rounded-md bg-white text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:opacity-50"
                >
                  {loadingMore ? "Loading…" : "Load more customers"}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {portalReady
        ? createPortal(
            <AnimatePresence>
              {selectedId ? (
                <>
                  <motion.button
                    key="customer-drawer-overlay"
                    type="button"
                    aria-label="Close customer details"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 z-[80] bg-black/35 animate-in fade-in duration-200"
                    onClick={closeCustomer}
                  />
                  <motion.aside
                    key="customer-drawer-panel"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Customer details"
                    initial={{ x: "100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "100%" }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="fixed inset-y-0 right-0 z-[90] flex h-dvh w-full max-w-xl flex-col bg-white shadow-xl ring-1 ring-inset ring-gray-200 animate-in slide-in-from-right duration-300 ease-out sm:max-w-2xl"
                  >
                    <CustomerProfileView
                      customerId={selectedId}
                      backHref={listPath}
                      variant="drawer"
                      onClose={closeCustomer}
                    />
                  </motion.aside>
                </>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </div>
  );
}
