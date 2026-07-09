"use client";

import type { ComponentType, ReactNode } from "react";
import {
  Bike,
  Calendar,
  DollarSign,
  Package,
  ShoppingBag,
  Wrench,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";
import type { LightspeedContext } from "./use-inquiries-controller";

function MatchBadge({ matched }: { matched?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
        matched ? "bg-gray-900 text-white" : "border border-gray-200 bg-white text-gray-400",
      )}
    >
      {matched ? "Matched" : "No match"}
    </span>
  );
}

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

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-md border border-gray-200/80 bg-white p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
          {label}
        </p>
        <span className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-100 bg-gray-50 text-gray-500">
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-2 text-xl font-semibold tracking-tight text-gray-900 tabular-nums">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  children,
  empty,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
  empty?: string;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-gray-200/80 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-50 text-gray-600">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
      </div>
      <div className="p-3.5">
        {children ?? (
          <p className="px-1 py-3 text-sm text-gray-500">{empty ?? "Nothing on record."}</p>
        )}
      </div>
    </section>
  );
}

function PurchaseRow({
  description,
  purchasedAt,
  total,
  quantity,
}: {
  description: string;
  purchasedAt: string;
  total: number | null;
  quantity: number | null;
}) {
  return (
    <div className="rounded-md border border-gray-100 bg-gray-50/70 px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium leading-snug text-gray-900">{description}</p>
        {total != null ? (
          <p className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
            {money(total)}
          </p>
        ) : null}
      </div>
      <p className="mt-1.5 text-xs text-gray-500">
        {formatDate(purchasedAt)}
        {quantity != null && quantity !== 1 ? ` · Qty ${quantity}` : ""}
      </p>
    </div>
  );
}

function WorkorderCard({
  id,
  title,
  status,
  updatedAt,
  items,
  lines,
}: {
  id: string;
  title: string | null;
  status: string | null;
  updatedAt?: string | null;
  items?: Array<{ description: string | null; quantity: number | null; note: string | null }>;
  lines?: Array<{ note: string; done: boolean }>;
}) {
  const included = [
    ...(items ?? []).map((item) => ({
      key: `item-${item.description}-${item.quantity}`,
      label:
        item.description ||
        item.note ||
        "Part",
      meta:
        item.quantity != null && item.quantity !== 1
          ? `Qty ${item.quantity}`
          : item.note && item.note !== item.description
            ? item.note
            : null,
    })),
    ...(lines ?? []).map((line) => ({
      key: `line-${line.note}`,
      label: line.note,
      meta: line.done ? "Done" : "Open",
    })),
  ];

  return (
    <div className="rounded-md border border-gray-100 bg-gray-50/70 px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-snug text-gray-900">
            {title || `Workorder #${id}`}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            #{id}
            {updatedAt ? ` · ${formatDate(updatedAt)}` : ""}
          </p>
        </div>
        {status ? (
          <span className="shrink-0 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600">
            {status}
          </span>
        ) : null}
      </div>

      {included.length > 0 ? (
        <ul className="mt-3 space-y-1.5 border-t border-gray-200/70 pt-3">
          {included.map((entry) => (
            <li key={entry.key} className="flex items-start justify-between gap-3 text-sm">
              <span className="min-w-0 leading-snug text-gray-700">{entry.label}</span>
              {entry.meta ? (
                <span className="shrink-0 text-xs text-gray-500">{entry.meta}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 border-t border-gray-200/70 pt-3 text-xs text-gray-500">
          No line items recorded on this workorder.
        </p>
      )}
    </div>
  );
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
      <div className="rounded-md border border-gray-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-medium text-gray-900">No Lightspeed match</p>
        <p className="mt-1 text-sm text-gray-500">
          {context.summary || "No matching Lightspeed customer found for this sender."}
        </p>
      </div>
    );
  }

  const sales = context.sales_summary;
  const purchases = sales?.recent_purchases ?? [];
  const workorders = context.recent_workorders ?? [];
  const bikes = context.bikes ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold tracking-tight text-gray-900">
              {context.customer_name || "Lightspeed customer"}
            </h3>
            <MatchBadge matched />
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {[context.customer_phone, context.customer_email, lookupHint ? `via ${lookupHint}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <MetricCard
          label="Last visit"
          value={formatDate(sales?.last_purchase_at)}
          hint={sales?.last_purchase_summary || "Most recent purchase"}
          icon={Calendar}
        />
        <MetricCard
          label="Total spend"
          value={money(sales?.total_spend)}
          hint="Lifetime completed sales"
          icon={DollarSign}
        />
        <MetricCard
          label="Total visits"
          value={String(sales?.sale_count ?? 0)}
          hint={sales?.sale_count === 1 ? "1 completed sale" : "Completed sales"}
          icon={ShoppingBag}
        />
      </div>

      <SectionCard title="Last products purchased" icon={Package} empty="No completed purchases on record.">
        {purchases.length > 0 ? (
          <div className="space-y-2">
            {purchases.map((purchase, idx) => (
              <PurchaseRow
                key={`${purchase.purchased_at}-${purchase.description}-${idx}`}
                description={purchase.description}
                purchasedAt={purchase.purchased_at}
                total={purchase.total}
                quantity={purchase.quantity}
              />
            ))}
          </div>
        ) : (
          <p className="px-1 py-2 text-sm text-gray-500">No completed purchases on record.</p>
        )}
      </SectionCard>

      <SectionCard title="Recent workorders" icon={Wrench} empty="No recent workorders.">
        {workorders.length > 0 ? (
          <div className="space-y-2">
            {workorders.map((wo) => (
              <WorkorderCard
                key={wo.id}
                id={wo.id}
                title={wo.title}
                status={wo.status}
                updatedAt={wo.updated_at}
                items={wo.items}
                lines={wo.lines}
              />
            ))}
          </div>
        ) : (
          <p className="px-1 py-2 text-sm text-gray-500">No recent workorders.</p>
        )}
      </SectionCard>

      {bikes.length > 0 ? (
        <SectionCard title="Bikes on file" icon={Bike}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {bikes.map((bike, idx) => (
              <div
                key={`${bike.serial ?? bike.label ?? idx}`}
                className="rounded-md border border-gray-100 bg-gray-50/70 px-3.5 py-3"
              >
                <p className="text-sm font-medium text-gray-900">{bike.label || "Bike"}</p>
                {bike.serial ? (
                  <p className="mt-1 text-xs text-gray-500">Serial {bike.serial}</p>
                ) : null}
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}

/** Compact body used by design previews — delegates to the bento panel. */
export function LightspeedBody({ context }: { context: LightspeedContext }) {
  return <LightspeedBentoPanel context={context} />;
}

export function LightspeedBentoSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-10 w-48 animate-pulse rounded-md bg-gray-100" />
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <div key={key} className="h-[92px] animate-pulse rounded-md border border-gray-100 bg-gray-50" />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-md border border-gray-100 bg-gray-50" />
      <div className="h-40 animate-pulse rounded-md border border-gray-100 bg-gray-50" />
    </div>
  );
}
