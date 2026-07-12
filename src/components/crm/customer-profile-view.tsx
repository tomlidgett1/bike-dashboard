"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bike,
  CalendarPlus,
  ClipboardList,
  ClipboardPlus,
  Copy,
  FileText,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  ReceiptText,
  Wrench,
  X,
} from "lucide-react";
import {
  ConsentChip,
  CrmSkeleton,
  FreshnessBadge,
  LifecycleBadge,
  TimelineEvent,
} from "@/components/crm/primitives";
import {
  errorMessage,
  formatAud,
  formatCrmDate,
  type CrmCustomerEvent,
  type CrmCustomerProfile,
  type CustomerTimelineResponse,
} from "@/components/crm/types";
import { cn } from "@/lib/utils";

type CustomerProfileResponse = { customer: CrmCustomerProfile };

export function CustomerProfileView({
  customerId,
  backHref = "/settings/store/crm/customers",
  variant = "page",
  onClose,
}: {
  customerId: string;
  backHref?: string;
  variant?: "page" | "drawer";
  onClose?: () => void;
}) {
  const isDrawer = variant === "drawer";
  const [customer, setCustomer] = React.useState<CrmCustomerProfile | null>(null);
  const [events, setEvents] = React.useState<CrmCustomerEvent[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dialog, setDialog] = React.useState<"task" | "note" | "garage" | null>(null);
  const [taskTitle, setTaskTitle] = React.useState("");
  const [note, setNote] = React.useState("");
  const [garageUrl, setGarageUrl] = React.useState<string | null>(null);
  const [actionBusy, setActionBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);

  const load = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const [profileResponse, timelineResponse] = await Promise.all([
        fetch(`/api/store/crm/customers/${customerId}`, {
          cache: "no-store",
          signal,
        }),
        fetch(`/api/store/crm/customers/${customerId}/timeline?limit=30`, {
          cache: "no-store",
          signal,
        }),
      ]);
      const profilePayload = (await profileResponse.json().catch(() => ({}))) as
        | CustomerProfileResponse
        | Record<string, unknown>;
      const timelinePayload = (await timelineResponse.json().catch(() => ({}))) as
        | CustomerTimelineResponse
        | Record<string, unknown>;

      if (!profileResponse.ok) {
        throw new Error(errorMessage(profilePayload, "Customer could not be loaded."));
      }
      if (!timelineResponse.ok) {
        throw new Error(errorMessage(timelinePayload, "Customer timeline could not be loaded."));
      }

      const typedProfile = profilePayload as CustomerProfileResponse;
      const typedTimeline = timelinePayload as CustomerTimelineResponse;
      setCustomer(typedProfile.customer);
      setEvents(typedTimeline.events ?? typedTimeline.items ?? []);
      setNextCursor(
        typedTimeline.nextCursor ?? typedTimeline.page?.nextCursor ?? null,
      );
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "Customer could not be loaded.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [customerId]);

  React.useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ cursor: nextCursor, limit: "30" });
      const response = await fetch(
        `/api/store/crm/customers/${customerId}/timeline?${params.toString()}`,
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => ({}))) as CustomerTimelineResponse;
      if (!response.ok) {
        throw new Error(errorMessage(payload, "More activity could not be loaded."));
      }
      setEvents((current) => [...current, ...(payload.events ?? payload.items ?? [])]);
      setNextCursor(payload.nextCursor ?? payload.page?.nextCursor ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "More activity could not be loaded.");
    } finally {
      setLoadingMore(false);
    }
  };

  const createTask = async () => {
    if (!taskTitle.trim()) return;
    setActionBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/store/crm/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          title: taskTitle.trim(),
          priority: 60,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errorMessage(payload, "Task could not be created."));
      setTaskTitle("");
      setDialog(null);
      setNotice("Task created.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Task could not be created.");
    } finally {
      setActionBusy(false);
    }
  };

  const createNote = async () => {
    if (!note.trim()) return;
    setActionBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/store/crm/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, note: note.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errorMessage(payload, "Note could not be saved."));
      setNote("");
      setDialog(null);
      setNotice("Note saved.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Note could not be saved.");
    } finally {
      setActionBusy(false);
    }
  };

  const createGarageLink = async () => {
    setActionBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/store/my-garage-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId }),
      });
      const payload = await response.json().catch(() => ({})) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(errorMessage(payload, "My Garage link could not be created."));
      }
      setGarageUrl(payload.url);
      setDialog("garage");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "My Garage link could not be created.");
    } finally {
      setActionBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {isDrawer && onClose ? (
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Customer details
            </p>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
              aria-label="Close customer details"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : null}
        <CrmSkeleton variant="profile" className="min-h-0 flex-1 overflow-y-auto" />
      </div>
    );
  }

  if (error && !customer) {
    return (
      <div className="flex h-full flex-col">
        {isDrawer && onClose ? (
          <div className="flex shrink-0 items-center justify-end border-b border-gray-200 px-4 py-3">
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
              aria-label="Close customer details"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : null}
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-sm rounded-md bg-white p-6 text-center ring-1 ring-inset ring-gray-200">
            <p className="text-sm font-medium text-gray-900">Customer unavailable</p>
            <p className="mt-1 text-sm text-gray-600">{error}</p>
            <div className="mt-4 flex justify-center gap-2">
              {isDrawer && onClose ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-9 items-center rounded-md bg-white px-3 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                >
                  Close
                </button>
              ) : (
                <Link
                  href={backHref}
                  className="inline-flex h-9 items-center rounded-md bg-white px-3 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                >
                  Back
                </Link>
              )}
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-gray-900 px-3 text-sm font-medium text-white hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!customer) return null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-gray-200 bg-white px-4 py-4 md:px-5">
        {isDrawer ? (
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Customer details
            </p>
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                aria-label="Close customer details"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
        ) : (
          <Link
            href={backHref}
            className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 md:hidden"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Customers
          </Link>
        )}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold text-gray-900">
              {customer.displayName}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-gray-600">
              {customer.primaryEmail ? (
                <a
                  href={`mailto:${customer.primaryEmail}`}
                  className="inline-flex items-center gap-1.5 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                >
                  <Mail className="h-3.5 w-3.5 text-gray-400" aria-hidden />
                  {customer.primaryEmail}
                </a>
              ) : null}
              {customer.primaryPhone ? (
                <a
                  href={`tel:${customer.primaryPhone}`}
                  className="inline-flex items-center gap-1.5 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                >
                  <Phone className="h-3.5 w-3.5 text-gray-400" aria-hidden />
                  {customer.primaryPhone}
                </a>
              ) : null}
            </div>
          </div>
          <div className="flex max-w-xl flex-col items-end gap-2">
            <div className="flex flex-wrap justify-end gap-2">
              <Link
                href={`/settings/store/crm/inbox?compose=1${
                  customer.primaryPhone ? `&phone=${encodeURIComponent(customer.primaryPhone)}` : ""
                }`}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-gray-900 px-3 text-xs font-medium text-white hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
              >
                <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                Message
              </Link>
              <button
                type="button"
                onClick={() => {
                  setTaskTitle(`Book service for ${customer.displayName}`);
                  setDialog("task");
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-white px-3 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
              >
                <CalendarPlus className="h-3.5 w-3.5" aria-hidden />
                Book service
              </button>
              <button
                type="button"
                onClick={() => setDialog("task")}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-white px-3 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
              >
                <ClipboardPlus className="h-3.5 w-3.5" aria-hidden />
                New task
              </button>
              <button
                type="button"
                onClick={() => setDialog("note")}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-white px-3 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden />
                Add note
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void createGarageLink()}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-white px-3 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:opacity-50"
              >
                <Bike className="h-3.5 w-3.5" aria-hidden />
                My Garage
              </button>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <LifecycleBadge
                stage={customer.lifecycleStage}
                label={customer.lifecycleLabel}
              />
              <FreshnessBadge value={customer.dataFreshnessAt} />
            </div>
          </div>
        </div>
        {notice ? (
          <p role="status" className="mt-3 text-xs font-medium text-gray-600">{notice}</p>
        ) : null}
        {customer.consents.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2" aria-label="Customer consent">
            {customer.consents.map((consent) => (
              <ConsentChip
                key={consent.id}
                channel={consent.channel}
                status={consent.status}
                purpose={consent.purpose}
              />
            ))}
          </div>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className={cn(
            "grid gap-6 p-4 md:p-5",
            isDrawer ? "grid-cols-1" : "lg:grid-cols-[minmax(0,1fr)_18rem]",
          )}
        >
          <aside className="space-y-4" aria-label="Customer details">
            <section className="rounded-md bg-white p-4 ring-1 ring-inset ring-gray-200">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Customer value
              </h3>
              <dl className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-xs text-gray-500">Lifetime spend</dt>
                  <dd className="mt-1 text-lg font-semibold text-gray-900">
                    {formatAud(customer.totalSpend)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Sales</dt>
                  <dd className="mt-1 text-lg font-semibold text-gray-900">
                    {customer.saleCount.toLocaleString("en-AU")}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-gray-500">Last purchase</dt>
                  <dd className="mt-1 text-sm font-medium text-gray-800">
                    {formatCrmDate(customer.lastPurchaseAt)}
                  </dd>
                </div>
              </dl>
            </section>

            <DetailList
              title="Bikes"
              icon={Bike}
              empty="No bikes recorded"
              items={customer.bikes.map((bike) => ({
                id: bike.id,
                title: [bike.brand, bike.model].filter(Boolean).join(" ") || "Bike",
                detail: [
                  bike.modelYear,
                  bike.frameSize,
                  bike.isEBike ? "E-bike" : null,
                ]
                  .filter(Boolean)
                  .join(" · "),
              }))}
            />
            <DetailList
              title="Workorders"
              icon={Wrench}
              empty="No workorders recorded"
              items={customer.workorders.map((workorder) => ({
                id: workorder.id,
                title: workorder.title,
                detail: `${workorder.status.replaceAll("_", " ")}${
                  workorder.total != null ? ` · ${formatAud(workorder.total)}` : ""
                }`,
              }))}
            />
            <DetailList
              title="Open tasks"
              icon={ClipboardList}
              empty="No open tasks"
              items={customer.openTasks.map((task) => ({
                id: task.id,
                title: task.title,
                detail: task.dueAt
                  ? `${task.priority} · due ${formatCrmDate(task.dueAt)}`
                  : task.priority,
              }))}
            />
          </aside>

          <section aria-labelledby="customer-timeline-heading">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <div>
                <h3 id="customer-timeline-heading" className="text-sm font-semibold text-gray-900">
                  Timeline
                </h3>
                <p className="mt-0.5 text-xs text-gray-500">All known customer activity</p>
              </div>
            </div>
            {events.length > 0 ? (
              <div className="rounded-md bg-white p-4 ring-1 ring-inset ring-gray-200">
                {events.map((event) => (
                  <TimelineEvent key={event.id} event={event} />
                ))}
                {nextCursor ? (
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                    className="mt-4 h-9 w-full rounded-md bg-white text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:opacity-50"
                  >
                    {loadingMore ? "Loading…" : "Load older activity"}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="rounded-md bg-white px-5 py-10 text-center text-sm text-gray-500 ring-1 ring-inset ring-gray-200">
                No customer activity has been recorded yet.
              </div>
            )}
          </section>
        </div>
      </div>
      {dialog ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-4 animate-in fade-in duration-200 sm:items-center"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setDialog(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="crm-customer-dialog-title"
            className="w-full max-w-md rounded-md bg-white p-5 shadow-xl animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="crm-customer-dialog-title" className="text-sm font-semibold text-gray-900">
                  {dialog === "task"
                    ? "Create task"
                    : dialog === "note"
                      ? "Add customer note"
                      : "Share My Garage"}
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                  {dialog === "garage"
                    ? "This private link expires in 30 days."
                    : `Add this to ${customer.displayName}'s relationship history.`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDialog(null)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {dialog === "task" ? (
              <div className="mt-4">
                <label htmlFor="crm-task-title" className="text-xs font-medium text-gray-700">
                  Task
                </label>
                <input
                  id="crm-task-title"
                  autoFocus
                  value={taskTitle}
                  onChange={(event) => setTaskTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void createTask();
                  }}
                  className="mt-1.5 h-10 w-full rounded-md border border-gray-300 px-3 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                />
                <button
                  type="button"
                  disabled={actionBusy || !taskTitle.trim()}
                  onClick={() => void createTask()}
                  className="mt-4 h-10 w-full rounded-md bg-gray-900 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {actionBusy ? "Creating…" : "Create task"}
                </button>
              </div>
            ) : dialog === "note" ? (
              <div className="mt-4">
                <label htmlFor="crm-customer-note" className="text-xs font-medium text-gray-700">
                  Note
                </label>
                <textarea
                  id="crm-customer-note"
                  autoFocus
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={5}
                  className="mt-1.5 w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                />
                <button
                  type="button"
                  disabled={actionBusy || !note.trim()}
                  onClick={() => void createNote()}
                  className="mt-4 h-10 w-full rounded-md bg-gray-900 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {actionBusy ? "Saving…" : "Save note"}
                </button>
              </div>
            ) : (
              <div className="mt-4">
                <div className="break-all rounded-md bg-gray-50 p-3 text-xs leading-relaxed text-gray-700 ring-1 ring-inset ring-gray-200">
                  {garageUrl}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (garageUrl) {
                      void navigator.clipboard.writeText(garageUrl);
                      setNotice("My Garage link copied.");
                    }
                  }}
                  className="mt-4 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md bg-gray-900 text-sm font-medium text-white hover:bg-gray-800"
                >
                  <Copy className="h-4 w-4" aria-hidden />
                  Copy private link
                </button>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}

function DetailList({
  title,
  icon: Icon,
  items,
  empty,
}: {
  title: string;
  icon: typeof ReceiptText;
  items: Array<{ id: string; title: string; detail: string }>;
  empty: string;
}) {
  return (
    <section className="rounded-md bg-white p-4 ring-1 ring-inset ring-gray-200">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {title}
      </h3>
      {items.length > 0 ? (
        <ul className="mt-3 divide-y divide-gray-100">
          {items.slice(0, 5).map((item) => (
            <li key={item.id} className="py-2 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-gray-800">{item.title}</p>
              {item.detail ? (
                <p className="mt-0.5 text-xs capitalize text-gray-500">{item.detail}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-gray-500">{empty}</p>
      )}
    </section>
  );
}
