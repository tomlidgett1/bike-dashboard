"use client";

import type { ReactNode } from "react";
import { LightspeedLogo } from "@/components/genie/lightspeed-logo";
import { ExternalLink } from "@/components/layout/app-sidebar/dashboard-icons";
import { lightspeedCustomerUrl, lightspeedWorkorderUrl } from "@/lib/services/lightspeed/web-urls";
import { cn } from "@/lib/utils";
import type { LightspeedContext } from "./use-inquiries-controller";

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "$0.00";
  return value.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function MetricCell({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-[7.5rem] flex-col justify-between p-4", className)}>
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
        {label}
      </p>
      <div>
        <p className="text-[1.65rem] font-semibold leading-none tracking-tight text-gray-950 tabular-nums">
          {value}
        </p>
        {hint ? (
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-500">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}

function BikesCell({
  bikes,
  className,
}: {
  bikes: Array<{ label: string | null; serial: string | null }>;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-[7.5rem] flex-col p-4", className)}>
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
        Bikes on file
      </p>
      {bikes.length === 0 ? (
        <p className="mt-auto text-sm text-gray-400">None on file</p>
      ) : (
        <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
          {bikes.map((bike, idx) => (
            <li key={`${bike.serial ?? bike.label ?? idx}`} className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">
                {bike.label || "Bike"}
              </p>
              {bike.serial ? (
                <p className="mt-0.5 truncate text-xs tabular-nums text-gray-400">
                  {bike.serial}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h4 className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
          {title}
        </h4>
        <div className="h-px flex-1 bg-gray-100" />
      </div>
      {children}
    </section>
  );
}

function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="py-2 text-sm text-gray-400">{children}</p>;
}

function workorderPreview(wo: {
  title: string | null;
  items?: Array<{ description: string | null; note: string | null }>;
  lines?: Array<{ note: string }>;
}): string | null {
  if (wo.title?.trim()) return wo.title.trim();
  const item = wo.items?.find((entry) => entry.description?.trim() || entry.note?.trim());
  if (item?.description?.trim()) return item.description.trim();
  if (item?.note?.trim()) return item.note.trim();
  const line = wo.lines?.find((entry) => entry.note.trim());
  return line?.note.trim() || null;
}

export function LightspeedBentoPanel({
  context,
  lookupHint,
}: {
  context: LightspeedContext;
  lookupHint?: string | null;
}) {
  if (!context.matched) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center rounded-xl border border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
        <LightspeedLogo className="h-8 w-8 rounded-full object-cover" />
        <p className="mt-4 text-sm font-medium text-gray-900">No Lightspeed match</p>
        <p className="mt-1 text-sm leading-relaxed text-gray-500">
          {context.summary || "No matching Lightspeed customer found for this sender."}
        </p>
      </div>
    );
  }

  const sales = context.sales_summary;
  const purchases = (sales?.recent_purchases ?? []).slice(0, 6);
  const workorders = (context.recent_workorders ?? []).slice(0, 5);
  const bikes = context.bikes ?? [];
  const contactLine = [context.customer_phone, context.customer_email].filter(Boolean).join(" · ");

  return (
    <div className="relative mx-auto w-full max-w-2xl">
      <div
        className="pointer-events-none absolute inset-x-0 -top-6 h-40 rounded-xl bg-[radial-gradient(ellipse_at_top,_rgba(15,23,42,0.045),_transparent_70%)]"
        aria-hidden
      />

      <div className="relative space-y-6">
        <header className="flex items-start gap-3">
          <LightspeedLogo className="mt-0.5 h-9 w-9 shrink-0 rounded-full object-cover shadow-sm ring-1 ring-black/5" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {context.customer_id ? (
                <a
                  href={lightspeedCustomerUrl(context.customer_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex min-w-0 max-w-full items-center gap-1.5 truncate text-xl font-semibold tracking-tight text-gray-950 underline decoration-gray-300 underline-offset-4 hover:decoration-gray-700"
                >
                  <span className="truncate">
                    {context.customer_name || "Lightspeed customer"}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-gray-400 group-hover:text-gray-700" />
                </a>
              ) : (
                <h3 className="truncate text-xl font-semibold tracking-tight text-gray-950">
                  {context.customer_name || "Lightspeed customer"}
                </h3>
              )}
              <span className="rounded-md bg-gray-900 px-1.5 py-0.5 text-[10px] font-medium text-white">
                Matched
              </span>
            </div>
            {contactLine ? (
              <p className="mt-1 truncate text-sm text-gray-500">{contactLine}</p>
            ) : null}
            {lookupHint ? (
              <p className="mt-0.5 text-xs text-gray-400">Matched via {lookupHint}</p>
            ) : null}
            {context.customer_id ? (
              <a
                href={lightspeedCustomerUrl(context.customer_id)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900"
              >
                <LightspeedLogo className="h-3.5 w-3.5 rounded-full object-cover" />
                Open in Lightspeed
                <ExternalLink className="h-3 w-3 text-gray-400" />
              </a>
            ) : null}
          </div>
        </header>

        <div className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCell
              label="Last visit"
              value={formatDate(sales?.last_purchase_at)}
              className="border-b border-gray-100 sm:border-r lg:border-b-0"
            />
            <MetricCell
              label="Total spend"
              value={money(sales?.total_spend)}
              hint="Lifetime completed sales"
              className="border-b border-gray-100 lg:border-b-0 lg:border-r"
            />
            <MetricCell
              label="Total visits"
              value={String(sales?.sale_count ?? 0)}
              hint={
                sales?.sale_count === 1 ? "1 completed sale" : "Completed sales on record"
              }
              className="border-b border-gray-100 sm:border-r sm:border-b-0 lg:border-r"
            />
            <BikesCell bikes={bikes} />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="space-y-6 p-5">
            <Section title="Recent purchases">
              {purchases.length === 0 ? (
                <EmptyLine>No purchases on record.</EmptyLine>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {purchases.map((purchase, idx) => (
                    <li
                      key={`${purchase.purchased_at}-${purchase.description}-${idx}`}
                      className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {purchase.description}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-400">
                          {formatDate(purchase.purchased_at)}
                          {purchase.quantity != null && purchase.quantity !== 1
                            ? ` · Qty ${purchase.quantity}`
                            : ""}
                        </p>
                      </div>
                      {purchase.total != null ? (
                        <p className="shrink-0 text-sm font-medium tabular-nums text-gray-900">
                          {money(purchase.total)}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Recent workorders">
              {workorders.length === 0 ? (
                <EmptyLine>No recent workorders.</EmptyLine>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {workorders.map((wo) => {
                    const preview = workorderPreview(wo);
                    const href = lightspeedWorkorderUrl(wo.id);
                    return (
                      <li key={wo.id} className="first:pt-0 last:pb-0">
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-start justify-between gap-4 py-3 transition-colors hover:bg-gray-50/80"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-900 underline-offset-2 group-hover:underline">
                              <span className="tabular-nums text-gray-400">#{wo.id}</span>
                              {preview ? (
                                <span className="text-gray-900">{` · ${preview}`}</span>
                              ) : null}
                              <ExternalLink className="ml-1.5 inline h-3 w-3 align-middle text-gray-300 group-hover:text-gray-500" />
                            </p>
                            {wo.updated_at ? (
                              <p className="mt-0.5 text-xs text-gray-400">
                                {formatDate(wo.updated_at)}
                              </p>
                            ) : null}
                          </div>
                          {wo.status ? (
                            <span className="shrink-0 rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                              {wo.status}
                            </span>
                          ) : null}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Compact body used by design previews — delegates to the bento panel. */
export function LightspeedBody({ context }: { context: LightspeedContext }) {
  return <LightspeedBentoPanel context={context} />;
}

export function LightspeedBentoSkeleton() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 animate-pulse rounded-full bg-gray-100" />
        <div className="space-y-2 pt-1">
          <div className="h-6 w-44 animate-pulse rounded-md bg-gray-100" />
          <div className="h-4 w-56 animate-pulse rounded-md bg-gray-50" />
        </div>
      </div>
      <div className="h-[7.5rem] animate-pulse overflow-hidden rounded-xl border border-gray-100 bg-white">
        <div className="grid h-full grid-cols-4 divide-x divide-gray-100">
          {[0, 1, 2, 3].map((key) => (
            <div key={key} className="bg-gray-50/80" />
          ))}
        </div>
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-gray-100 bg-white" />
    </div>
  );
}
