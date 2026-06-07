"use client";

import * as React from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  ChevronDown,
  Clock,
  Mail,
  Package,
  Phone,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GenieWorkorderCard, GenieWorkorderCardsPayload } from "@/lib/types/genie-agent";

const CARD_EASE = [0.04, 0.62, 0.23, 0.98] as const;
const SCROLL_MAX_ITEMS = 4;
const ROW_HEIGHT_ESTIMATE = 72;
const SCROLL_MAX_HEIGHT = SCROLL_MAX_ITEMS * ROW_HEIGHT_ESTIMATE;

function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDateTime(value: string): string {
  if (!value?.trim()) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDate(value: string): string {
  if (!value?.trim()) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function workSummary(workorder: GenieWorkorderCard): string {
  const lineNotes = workorder.lines
    .map((line) => line.note.trim())
    .filter((note) => note && note.toLowerCase() !== "labor");
  if (lineNotes.length > 0) return lineNotes.slice(0, 2).join(" · ");
  if (workorder.note.trim()) {
    const note = workorder.note.trim();
    return note.length > 72 ? `${note.slice(0, 69)}…` : note;
  }
  const itemNames = workorder.items
    .map((item) => item.description || item.note)
    .filter(Boolean)
    .slice(0, 2);
  if (itemNames.length > 0) return itemNames.join(" · ");
  return workorder.status_name;
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-xs text-gray-800">{value}</p>
    </div>
  );
}

function WorkorderDetailPanel({ workorder }: { workorder: GenieWorkorderCard }) {
  const labourLines = workorder.lines.filter((line) => line.note.trim().toLowerCase() !== "labor");
  const hasParts = workorder.items.length > 0;

  return (
    <div className="space-y-3 border-t border-gray-200/70 px-3 py-3">
      <div className="grid grid-cols-2 gap-3">
        <DetailField label="Checked in" value={fmtDateTime(workorder.time_in)} />
        <DetailField label="ETA out" value={fmtDateTime(workorder.eta_out)} />
        <DetailField label="Last updated" value={fmtDateTime(workorder.updated_at)} />
        <DetailField label="Work order ID" value={`#${workorder.workorder_id}`} />
      </div>

      {(workorder.customer_phone || workorder.customer_email) ? (
        <div className="rounded-md bg-white px-2.5 py-2 ring-1 ring-black/[0.04]">
          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Contact</p>
          <div className="mt-1.5 space-y-1">
            {workorder.customer_phone ? (
              <div className="flex items-center gap-1.5 text-xs text-gray-800">
                <Phone className="h-3 w-3 text-gray-400" />
                <span>{workorder.customer_phone}</span>
              </div>
            ) : null}
            {workorder.customer_email ? (
              <div className="flex items-center gap-1.5 text-xs text-gray-800">
                <Mail className="h-3 w-3 text-gray-400" />
                <span className="truncate">{workorder.customer_email}</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {workorder.note.trim() ? (
        <div className="rounded-md bg-white px-2.5 py-2 ring-1 ring-black/[0.04]">
          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Work note</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-800">{workorder.note}</p>
        </div>
      ) : null}

      {workorder.internal_note.trim() ? (
        <div className="rounded-md bg-white px-2.5 py-2 ring-1 ring-black/[0.04]">
          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Internal note</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-600">{workorder.internal_note}</p>
        </div>
      ) : null}

      {labourLines.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">Labour lines</p>
          <div className="space-y-1">
            {labourLines.map((line) => (
              <div
                key={line.line_id}
                className="flex items-start gap-2 rounded-md bg-white px-2.5 py-2 text-xs text-gray-800 ring-1 ring-black/[0.04]"
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-md border",
                    line.done
                      ? "border-gray-300 bg-gray-100 text-gray-600"
                      : "border-gray-200 bg-white text-transparent",
                  )}
                >
                  {line.done ? <Check className="h-2.5 w-2.5" /> : null}
                </span>
                <span className="min-w-0 flex-1 leading-relaxed">{line.note || "Labour line"}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {hasParts ? (
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">Parts & items</p>
          <div className="overflow-hidden rounded-md bg-white ring-1 ring-black/[0.04]">
            {workorder.items.map((item, index) => (
              <div
                key={`${item.item_id}-${index}`}
                className={cn(
                  "flex items-start gap-2 px-2.5 py-2 text-xs",
                  index > 0 && "border-t border-gray-100",
                )}
              >
                <Package className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900">
                    {item.description || item.note || "Item"}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
                    {item.sku ? <span>SKU {item.sku}</span> : null}
                    {item.quantity != null ? <span>Qty {item.quantity}</span> : null}
                    {item.unit_price != null ? <span>{money(item.unit_price)} each</span> : null}
                  </div>
                  {item.note && item.description ? (
                    <p className="mt-0.5 text-[11px] text-gray-500">{item.note}</p>
                  ) : null}
                </div>
                <span className="shrink-0 font-medium tabular-nums text-gray-800">
                  {money(item.line_total)}
                </span>
              </div>
            ))}
            {workorder.items_subtotal != null ? (
              <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-2.5 py-2 text-xs">
                <span className="font-medium text-gray-600">Parts subtotal</span>
                <span className="font-semibold tabular-nums text-gray-900">
                  {money(workorder.items_subtotal)}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {(workorder.warranty.trim() || workorder.sale_id) ? (
        <div className="flex flex-wrap gap-2 text-[11px] text-gray-500">
          {workorder.warranty.trim() ? <span>Warranty: {workorder.warranty}</span> : null}
          {workorder.sale_id ? <span>Sale #{workorder.sale_id}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function WorkorderRow({
  workorder,
  defaultOpen,
}: {
  workorder: GenieWorkorderCard;
  defaultOpen: boolean;
}) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-md bg-white ring-1 ring-black/[0.04]">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-start gap-2.5 px-2.5 py-2.5 text-left"
      >
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-600">
          <Wrench className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-medium text-gray-900">{workorder.customer_name}</p>
            <Badge variant="secondary" className="rounded-md bg-gray-100 px-1.5 py-0 text-[10px] text-gray-700">
              {workorder.status_name}
            </Badge>
            <span className="text-[10px] text-gray-400">#{workorder.workorder_id}</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-gray-500">
            {workSummary(workorder)}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-gray-400">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              In {fmtDate(workorder.time_in)}
            </span>
            {workorder.eta_out ? <span>ETA {fmtDate(workorder.eta_out)}</span> : null}
            {workorder.items.length > 0 ? (
              <span>
                {workorder.items.length} part{workorder.items.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
        </div>
        <ChevronDown
          className={cn(
            "mt-1 h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              duration: 0.4,
              ease: CARD_EASE,
            }}
            className="overflow-hidden"
          >
            <WorkorderDetailPanel workorder={workorder} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function LightspeedWorkorderCards({
  payload,
  fullWidth = false,
}: {
  payload: GenieWorkorderCardsPayload;
  fullWidth?: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const count = payload.workorders.length;
  const isScrollable = count > SCROLL_MAX_ITEMS;

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setExpanded(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: CARD_EASE }}
      className={cn("w-full", fullWidth ? "max-w-none" : "max-w-md")}
    >
      <div className="overflow-hidden rounded-xl bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.04]">
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
            <p className="truncate text-[11px] text-gray-500">
              {payload.title}
              {count > 0 ? ` · ${count} job${count === 1 ? "" : "s"}` : ""}
              {payload.truncated ? " · showing latest matches" : ""}
            </p>
          </div>
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
          <div className="space-y-2 px-3.5 pb-3.5">
            <div
              className={cn(
                "space-y-2 rounded-md bg-gray-50 p-2",
                isScrollable && "overflow-y-auto overscroll-contain [scrollbar-width:thin]",
              )}
              style={isScrollable ? { maxHeight: SCROLL_MAX_HEIGHT } : undefined}
            >
              {payload.workorders.map((workorder, index) => (
                <WorkorderRow
                  key={workorder.workorder_id}
                  workorder={workorder}
                  defaultOpen={count === 1 || index === 0}
                />
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
