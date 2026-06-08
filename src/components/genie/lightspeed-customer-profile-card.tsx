"use client";

import * as React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Bike,
  DollarSign,
  Mail,
  MapPin,
  Phone,
  ReceiptText,
  ShoppingBag,
  User,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  GenieCustomerBikeProfile,
  GenieCustomerProfilePayload,
  GenieCustomerSaleProfile,
  GenieCustomerTopItemProfile,
  GenieWorkorderCard,
} from "@/lib/types/genie-agent";

const CARD_EASE = [0.04, 0.62, 0.23, 0.98] as const;

function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "$0.00";
  return `$${value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function number(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "0";
  return value.toLocaleString("en-AU", { maximumFractionDigits: 2 });
}

function fmtDate(value: string | null | undefined): string {
  if (!value?.trim()) return "No date";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function compactText(value: string | null | undefined, fallback = "Not recorded"): string {
  const text = value?.trim();
  if (!text) return fallback;
  return text.length > 96 ? `${text.slice(0, 93)}...` : text;
}

function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function addressLine(profile: GenieCustomerProfilePayload): string | null {
  const address = profile.customer?.addresses[0];
  if (!address) return null;
  return [address.address1, address.city, address.state, address.zip, address.country]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
}

function workorderSummary(workorder: GenieWorkorderCard): string {
  const publicNote = workorder.note.trim();
  if (publicNote) return compactText(publicNote);

  const internalNote = workorder.internal_note.trim();
  if (internalNote) return compactText(internalNote);

  const lineNote = workorder.lines
    .map((line) => line.note.trim())
    .find((note) => note && note.toLowerCase() !== "labor");
  if (lineNote) return compactText(lineNote);

  const item = workorder.items.find((entry) => entry.description || entry.note);
  return compactText(item?.description || item?.note, workorder.status_name || "Work order");
}

function sourceLabel(source: GenieCustomerBikeProfile["source"]): string {
  if (source === "customer_serialized") return "Customer bike";
  if (source === "workorder_serialized") return "Work order bike";
  return "Inferred bike";
}

function StatusBadge({ status }: { status: GenieCustomerProfilePayload["status"] }) {
  if (status === "resolved") {
    return (
      <Badge className="w-fit shrink-0 rounded-md border-transparent bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
        Resolved
      </Badge>
    );
  }
  return (
    <Badge
      variant="secondary"
      className="w-fit shrink-0 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-100"
    >
      {status === "ambiguous" ? "Needs match" : "No match"}
    </Badge>
  );
}

function ContactChip({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-xs text-gray-700 ring-1 ring-black/[0.06]">
      <span className="shrink-0 text-gray-400">{icon}</span>
      <span className="truncate">{value}</span>
    </span>
  );
}

function StatTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-md bg-white px-3 py-2.5 ring-1 ring-black/[0.04]">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-1 truncate text-sm font-semibold tabular-nums text-gray-900">{value}</p>
    </div>
  );
}

function Section({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gray-100 text-gray-500">
          {icon}
        </span>
        <h4 className="text-[13px] font-semibold text-gray-900">{title}</h4>
        {typeof count === "number" ? (
          <Badge
            variant="secondary"
            className="h-5 rounded-md bg-gray-100 px-1.5 text-[10px] text-gray-600 hover:bg-gray-100"
          >
            {count}
          </Badge>
        ) : null}
      </div>
      <div className="rounded-md bg-gray-50 p-2">{children}</div>
    </section>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="px-1.5 py-2.5 text-xs leading-relaxed text-gray-500">{children}</p>;
}

function BikeRows({ bikes }: { bikes: GenieCustomerBikeProfile[] }) {
  if (bikes.length === 0) {
    return <EmptyRow>No customer-owned bikes found in Serialized records or work orders.</EmptyRow>;
  }

  return (
    <div className="space-y-1.5">
      {bikes.slice(0, 8).map((bike) => (
        <div
          key={`${bike.source}-${bike.serialized_id}`}
          className="rounded-md bg-white px-3 py-2.5 ring-1 ring-black/[0.04]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">
                {bike.label || bike.serial || `Serialized #${bike.serialized_id}`}
              </p>
              <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
                {bike.serial ? <span>Serial {bike.serial}</span> : null}
                {bike.item_id ? <span>Item {bike.item_id}</span> : null}
                {bike.linked_workorder_ids.length > 0 ? (
                  <span>{bike.linked_workorder_ids.length} linked work orders</span>
                ) : null}
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 rounded-md text-[10px] text-gray-500">
              {sourceLabel(bike.source)}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

function WorkorderRows({ workorders }: { workorders: GenieWorkorderCard[] }) {
  if (workorders.length === 0) {
    return <EmptyRow>No work orders found for this customer.</EmptyRow>;
  }

  return (
    <div className="space-y-1.5">
      {workorders.slice(0, 8).map((workorder) => (
        <div
          key={workorder.workorder_id}
          className="rounded-md bg-white px-3 py-2.5 ring-1 ring-black/[0.04]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-sm font-medium text-gray-900">
                  #{workorder.workorder_id} · {workorder.status_name || "Work order"}
                </p>
                {workorder.is_finished ? (
                  <Badge
                    variant="secondary"
                    className="rounded-md bg-gray-100 text-[10px] text-gray-600 hover:bg-gray-100"
                  >
                    Finished
                  </Badge>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-gray-600">{workorderSummary(workorder)}</p>
              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
                <span>In {fmtDate(workorder.time_in)}</span>
                {workorder.eta_out ? <span>ETA {fmtDate(workorder.eta_out)}</span> : null}
                {workorder.serialized_id ? <span>Bike {workorder.serialized_id}</span> : null}
                {workorder.sale_id ? <span>Sale {workorder.sale_id}</span> : null}
              </div>
            </div>
            {workorder.items_subtotal != null ? (
              <span className="shrink-0 text-xs font-semibold tabular-nums text-gray-900">
                {money(workorder.items_subtotal)}
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function SaleRows({ sales }: { sales: GenieCustomerSaleProfile[] }) {
  if (sales.length === 0) {
    return <EmptyRow>No sales history found in the sales report warehouse.</EmptyRow>;
  }

  return (
    <div className="space-y-1.5">
      {sales.slice(0, 8).map((sale) => (
        <div key={sale.sale_id} className="rounded-md bg-white px-3 py-2.5 ring-1 ring-black/[0.04]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">
                {sale.ticket_number ? `Ticket ${sale.ticket_number}` : `Sale #${sale.sale_id}`}
              </p>
              <p className="mt-0.5 truncate text-xs text-gray-600">
                {sale.items || sale.lines.map((line) => line.description).filter(Boolean).slice(0, 3).join(", ") || "Sale"}
              </p>
              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
                <span>{fmtDate(sale.completed_at || sale.completed_at_utc)}</span>
                <span>{number(sale.units)} units</span>
                {sale.discounts ? <span>{money(sale.discounts)} discounts</span> : null}
              </div>
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">{money(sale.total)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function TopItemRows({ items }: { items: GenieCustomerTopItemProfile[] }) {
  if (items.length === 0) {
    return <EmptyRow>No repeat item history found yet.</EmptyRow>;
  }

  return (
    <div className="space-y-1.5">
      {items.slice(0, 8).map((item, index) => (
        <div
          key={`${item.item_id || item.sku || item.description}-${index}`}
          className="rounded-md bg-white px-3 py-2.5 ring-1 ring-black/[0.04]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">{item.description}</p>
              <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
                {item.sku ? <span>SKU {item.sku}</span> : null}
                {item.category ? <span>{item.category}</span> : null}
                <span>Last {fmtDate(item.last_purchase_at)}</span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs font-semibold tabular-nums text-gray-900">{money(item.gross_sales)}</p>
              <p className="text-[11px] tabular-nums text-gray-500">Qty {number(item.quantity)}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CandidateList({ profile }: { profile: GenieCustomerProfilePayload }) {
  const candidates = profile.candidates.slice(0, 6);

  return (
    <div className="rounded-md bg-white px-3 py-3 text-sm text-gray-700 ring-1 ring-amber-200">
      <div className="flex items-center gap-2 font-semibold text-gray-900">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <span>{profile.status === "ambiguous" ? "Multiple matching customers" : "Customer not found"}</span>
      </div>
      {candidates.length > 0 ? (
        <div className="mt-2.5 space-y-1.5">
          {candidates.map((candidate) => (
            <div
              key={candidate.customer_id}
              className="flex items-center justify-between gap-3 rounded-md bg-gray-50 px-2.5 py-1.5 text-xs ring-1 ring-black/[0.04]"
            >
              <span className="min-w-0 truncate text-gray-800">
                {candidate.name}
                {candidate.company ? ` · ${candidate.company}` : ""}
              </span>
              <span className="shrink-0 tabular-nums text-gray-400">#{candidate.customer_id}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs leading-relaxed text-gray-500">
          Try a phone number, email address, or exact Lightspeed customer ID.
        </p>
      )}
    </div>
  );
}

export function LightspeedCustomerProfileCard({
  profile,
  className,
}: {
  profile: GenieCustomerProfilePayload;
  className?: string;
}) {
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setExpanded(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const customer = profile.customer;
  const summary = profile.sales_summary;
  const phone = customer?.phones[0]?.number ?? null;
  const email = customer?.emails[0]?.address ?? null;
  const address = addressLine(profile);
  const isResolved = profile.status === "resolved";
  const displayName = customer?.name || profile.query || "Customer profile";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: CARD_EASE }}
      className={cn("w-full", className)}
    >
      <div className="overflow-hidden rounded-xl bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.04]">
        {/* Lightspeed brand header */}
        <div className="flex items-center gap-2.5 px-3.5 py-3">
          <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full ring-1 ring-black/[0.06]">
            <Image
              src="/ls.png"
              alt="Lightspeed"
              width={32}
              height={32}
              className="h-full w-full object-cover"
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold tracking-tight text-gray-900">Lightspeed</p>
            <p className="truncate text-[11px] text-gray-500">Customer profile</p>
          </div>
          <StatusBadge status={profile.status} />
        </div>

        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={expanded ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
          transition={{
            height: { delay: 0.1, duration: 0.4, ease: CARD_EASE },
            opacity: { delay: 0.14, duration: 0.3, ease: CARD_EASE },
          }}
          className="overflow-hidden"
        >
          <div className="space-y-3 px-3.5 pb-3.5">
            {/* Identity hero */}
            <div className="flex items-start gap-3 border-t border-gray-100 pt-3">
              <span
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-sm font-semibold ring-1 ring-black/[0.06]",
                  isResolved ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500",
                )}
              >
                {isResolved ? initials(displayName) : <User className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-semibold tracking-tight text-gray-900">
                  {displayName}
                </h3>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
                  {customer?.customer_id ? <span>ID #{customer.customer_id}</span> : null}
                  {customer?.company ? <span>{customer.company}</span> : null}
                  {customer?.archived ? <span className="text-amber-600">Archived</span> : null}
                  {customer?.updated_at ? <span>Updated {fmtDate(customer.updated_at)}</span> : null}
                </div>

                {(phone || email || address) ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {phone ? <ContactChip icon={<Phone className="h-3.5 w-3.5" />} value={phone} /> : null}
                    {email ? <ContactChip icon={<Mail className="h-3.5 w-3.5" />} value={email} /> : null}
                    {address ? <ContactChip icon={<MapPin className="h-3.5 w-3.5" />} value={address} /> : null}
                  </div>
                ) : null}
              </div>
            </div>

            {!isResolved ? <CandidateList profile={profile} /> : null}

            {summary ? (
              <div className="rounded-md bg-gray-50 p-2">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <StatTile label="Lifetime spend" value={money(summary.total_spend)} icon={<DollarSign className="h-3.5 w-3.5" />} />
                  <StatTile label="Sales" value={number(summary.sale_count)} icon={<ReceiptText className="h-3.5 w-3.5" />} />
                  <StatTile label="Average sale" value={money(summary.average_sale)} icon={<ShoppingBag className="h-3.5 w-3.5" />} />
                  <StatTile label="Last purchase" value={fmtDate(summary.last_purchase_at)} icon={<ReceiptText className="h-3.5 w-3.5" />} />
                </div>
              </div>
            ) : null}

            {isResolved ? (
              <div className="grid gap-x-4 gap-y-4 xl:grid-cols-2">
                <Section title="Bikes" icon={<Bike className="h-3.5 w-3.5" />} count={profile.bikes.length}>
                  <BikeRows bikes={profile.bikes} />
                </Section>

                <Section title="Work orders" icon={<Wrench className="h-3.5 w-3.5" />} count={profile.workorders.length}>
                  <WorkorderRows workorders={profile.workorders} />
                </Section>

                <Section title="Recent sales" icon={<ReceiptText className="h-3.5 w-3.5" />} count={profile.recent_sales.length}>
                  <SaleRows sales={profile.recent_sales} />
                </Section>

                <Section title="Top items" icon={<ShoppingBag className="h-3.5 w-3.5" />} count={profile.top_items.length}>
                  <TopItemRows items={profile.top_items} />
                </Section>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-100 pt-3 text-[11px] text-gray-400">
              <span>{profile.data_quality.sales_rows_checked.toLocaleString("en-AU")} sales rows checked</span>
              {profile.data_quality.sales_row_limit_reached ? <span>Sales history may be truncated</span> : null}
              {profile.data_quality.workorders_truncated ? <span>Work orders truncated</span> : null}
              {profile.data_quality.serialized_status === "error" ? (
                <span>Bike lookup error: {profile.data_quality.serialized_error || "unknown error"}</span>
              ) : null}
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
