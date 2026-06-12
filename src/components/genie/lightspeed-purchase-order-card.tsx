"use client";

import * as React from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plus,
  Search,
  SkipForward,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  ApplyResult,
  LightspeedPurchaseOrderCreateProposal,
  PurchaseOrderItemOption,
} from "@/lib/types/genie-agent";

const CREATE_VENDOR = "__create_vendor__";
const CARD_EASE = [0.04, 0.62, 0.23, 0.98] as const;
const SEARCH_DEBOUNCE_MS = 320;

interface LineChoice {
  item_id: string | null;
  skipped: boolean;
  create: boolean;
}

interface LineSearchState {
  open: boolean;
  query: string;
  results: PurchaseOrderItemOption[];
  loading: boolean;
}

function money(value: number | null | undefined, currency: string | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const formatted = value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency && currency !== "AUD" ? `${currency} ` : "$"}${formatted}`;
}

function ChoiceChip({
  selected,
  onClick,
  children,
  title,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
        selected
          ? "border-gray-900 bg-gray-900 text-white"
          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-100",
      )}
    >
      {selected ? <Check className="h-3 w-3 shrink-0" /> : null}
      <span className="truncate">{children}</span>
    </button>
  );
}

function itemOptionLabel(option: PurchaseOrderItemOption): string {
  return option.sku ? `${option.name} · ${option.sku}` : option.name;
}

/**
 * Lightspeed-branded approval card for a purchase order staged from a supplier
 * invoice. Mirrors the brand/category change card's design language. Every
 * ambiguity (vendor, shop, per-line item) is a row of clickable chips — pick a
 * match, create a new product, or skip — then Approve writes the PO and the
 * card links straight to it in Lightspeed.
 */
export function LightspeedPurchaseOrderCard({
  proposal,
}: {
  proposal: LightspeedPurchaseOrderCreateProposal;
}) {
  const [expanded, setExpanded] = React.useState(false);
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setExpanded(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const [status, setStatus] = React.useState<"idle" | "applying" | "applied" | "error">("idle");
  const [resultMsg, setResultMsg] = React.useState("");
  const [lightspeedUrl, setLightspeedUrl] = React.useState<string | null>(null);

  const [vendorChoice, setVendorChoice] = React.useState<string | null>(
    proposal.vendor_id ?? (proposal.vendor_options.length === 0 ? CREATE_VENDOR : null),
  );
  const [shopChoice, setShopChoice] = React.useState<string | null>(proposal.shop_id);
  const [lineChoices, setLineChoices] = React.useState<LineChoice[]>(
    proposal.lines.map((line) => ({
      item_id: line.item_id,
      skipped: Boolean(line.skipped),
      create: Boolean(line.create_item),
    })),
  );

  const [lineSearches, setLineSearches] = React.useState<Record<number, LineSearchState>>(() =>
    Object.fromEntries(
      proposal.lines.map((line, index) => [
        index,
        // Auto-open search for lines that have no match at all
        { open: !line.item_id && line.item_options.length === 0, query: "", results: [], loading: false },
      ]),
    ),
  );

  const setLine = (index: number, choice: LineChoice) =>
    setLineChoices((current) => current.map((entry, entryIndex) => (entryIndex === index ? choice : entry)));

  const setLineSearch = (index: number, patch: Partial<LineSearchState>) =>
    setLineSearches((prev) => ({ ...prev, [index]: { ...prev[index], ...patch } }));

  // Debounced search — fires per-line when query changes
  React.useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const [idxStr, state] of Object.entries(lineSearches)) {
      const index = Number(idxStr);
      if (!state.open || !state.query.trim()) continue;
      const query = state.query.trim();
      const timer = setTimeout(async () => {
        setLineSearch(index, { loading: true });
        try {
          const res = await fetch(`/api/lightspeed/items/search?q=${encodeURIComponent(query)}`);
          const json = (await res.json()) as { items?: PurchaseOrderItemOption[] };
          setLineSearch(index, { results: json.items ?? [], loading: false });
        } catch {
          setLineSearch(index, { loading: false });
        }
      }, SEARCH_DEBOUNCE_MS);
      timers.push(timer);
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.entries(lineSearches).map(([i, s]) => `${i}:${s.query}`).join("|")]);

  const vendorResolved = vendorChoice !== null;
  const shopResolved = Boolean(shopChoice) || proposal.shop_options.length <= 1;
  const lineResolved = (choice: LineChoice) => choice.skipped || Boolean(choice.item_id) || choice.create;
  const unresolvedLineCount = lineChoices.filter((choice) => !lineResolved(choice)).length;
  const orderableCount = lineChoices.filter((choice) => !choice.skipped && (choice.item_id || choice.create)).length;
  const canApply = vendorResolved && shopResolved && unresolvedLineCount === 0 && orderableCount > 0;

  const orderTotal = proposal.lines.reduce((sum, line, index) => {
    const choice = lineChoices[index];
    if (!choice || choice.skipped || (!choice.item_id && !choice.create)) return sum;
    return sum + line.quantity * line.unit_cost;
  }, 0);

  const apply = async () => {
    if (!canApply) return;
    setStatus("applying");
    setResultMsg("");
    try {
      const resolved: LightspeedPurchaseOrderCreateProposal = {
        ...proposal,
        vendor_id: vendorChoice === CREATE_VENDOR ? null : vendorChoice,
        vendor_name: vendorChoice === CREATE_VENDOR
          ? null
          : proposal.vendor_id === vendorChoice
            ? proposal.vendor_name
            : proposal.vendor_options.find((option) => option.vendor_id === vendorChoice)?.name ?? proposal.vendor_name,
        shop_id: shopChoice ?? (proposal.shop_options[0]?.shop_id ?? null),
        lines: proposal.lines.map((line, index) => {
          const choice = lineChoices[index];
          const chosen = line.item_options.find((option) => option.item_id === choice?.item_id);
          return {
            ...line,
            item_id: choice?.skipped || choice?.create ? null : choice?.item_id ?? null,
            item_name: choice?.skipped || choice?.create ? null : chosen?.name ?? line.item_name,
            skipped: choice?.skipped ?? false,
            create_item: choice?.create ?? false,
          };
        }),
      };

      const response = await fetch("/api/genie/agent/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal: resolved }),
      });
      const data = (await response.json().catch(() => null)) as (ApplyResult & { error?: string }) | null;
      if (!response.ok || !data?.ok) {
        setStatus("error");
        setResultMsg(data?.error || "Could not create the purchase order. Please try again.");
        return;
      }
      setStatus("applied");
      setResultMsg(data.message);
      setLightspeedUrl(data.lightspeed_url ?? null);
    } catch {
      setStatus("error");
      setResultMsg("Connection error. Please try again.");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: CARD_EASE }}
      className="w-full max-w-xl"
    >
      <div className="relative overflow-hidden rounded-xl bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.04]">
        <AnimatePresence>
          {status === "applied" ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ duration: 0.25, ease: CARD_EASE }}
              className="absolute right-3 top-3 z-10"
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-label="Purchase order created in Lightspeed" />
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="flex items-center gap-2.5 px-3.5 py-3">
          <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full ring-1 ring-black/[0.06]">
            <Image src="/ls.png" alt="Lightspeed" width={32} height={32} className="h-full w-full object-cover" />
          </span>
          <div className="min-w-0 flex-1 pr-5">
            <p className="text-sm font-semibold tracking-tight text-gray-900">Lightspeed</p>
            <p className="truncate text-[11px] text-gray-500">
              Purchase order · {proposal.supplier_name}
              {proposal.invoice_number ? ` · ${proposal.invoice_number}` : ""}
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
          <div className="space-y-2.5 px-3.5 pb-3.5">
            <p className="truncate text-[11px] text-gray-400">{proposal.source_label}</p>

            {/* Vendor */}
            <div className="rounded-md bg-gray-50 px-2.5 py-2">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Vendor
                {!vendorResolved ? <span className="ml-1 font-medium normal-case text-amber-600">choose one</span> : null}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {proposal.vendor_id ? (
                  <ChoiceChip selected={vendorChoice === proposal.vendor_id} onClick={() => setVendorChoice(proposal.vendor_id)}>
                    {proposal.vendor_name ?? `Vendor ${proposal.vendor_id}`}
                  </ChoiceChip>
                ) : null}
                {proposal.vendor_options
                  .filter((option) => option.vendor_id !== proposal.vendor_id)
                  .map((option) => (
                    <ChoiceChip
                      key={option.vendor_id}
                      selected={vendorChoice === option.vendor_id}
                      onClick={() => setVendorChoice(option.vendor_id)}
                      title={`Match ${Math.round(option.score * 100)}%`}
                    >
                      {option.name}
                    </ChoiceChip>
                  ))}
                <ChoiceChip selected={vendorChoice === CREATE_VENDOR} onClick={() => setVendorChoice(CREATE_VENDOR)}>
                  <Plus className="h-3 w-3 shrink-0" /> New: {proposal.create_vendor_name ?? proposal.supplier_name}
                </ChoiceChip>
              </div>
            </div>

            {/* Shop */}
            {proposal.shop_options.length > 1 ? (
              <div className="rounded-md bg-gray-50 px-2.5 py-2">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Shop
                  {!shopResolved ? <span className="ml-1 font-medium normal-case text-amber-600">choose one</span> : null}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {proposal.shop_options.map((shop) => (
                    <ChoiceChip key={shop.shop_id} selected={shopChoice === shop.shop_id} onClick={() => setShopChoice(shop.shop_id)}>
                      {shop.name}
                    </ChoiceChip>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Lines */}
            <div className="rounded-md bg-gray-50 px-2.5">
              {proposal.lines.map((line, index) => {
                const choice = lineChoices[index];
                const needsChoice = !lineResolved(choice);
                const chosenOption = line.item_options.find((option) => option.item_id === choice.item_id);
                return (
                  <div key={`${line.description}-${index}`} className="border-b border-gray-200/70 py-2 last:border-b-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={cn("truncate text-sm font-medium text-gray-900", choice.skipped && "text-gray-400 line-through")}>
                          {line.description}
                        </p>
                        <p className="mt-0.5 text-[11px] text-gray-500">
                          {line.quantity} × {money(line.unit_cost, proposal.currency)}
                          {line.supplier_sku ? ` · ${line.supplier_sku}` : ""}
                        </p>
                        {!choice.skipped && choice.item_id && (chosenOption || line.item_name) ? (
                          <p className="mt-0.5 truncate text-[11px] text-gray-500">
                            → <span className="font-medium text-gray-900">{chosenOption?.name ?? line.item_name}</span>
                          </p>
                        ) : null}
                        {!choice.skipped && choice.create ? (
                          <p className="mt-0.5 text-[11px] text-gray-500">
                            → <span className="font-medium text-gray-900">New product will be created</span>
                          </p>
                        ) : null}
                      </div>
                      <span className={cn("shrink-0 text-xs font-semibold tabular-nums text-gray-900", choice.skipped && "text-gray-300 line-through")}>
                        {money(line.quantity * line.unit_cost, proposal.currency)}
                      </span>
                    </div>

                    {!choice.skipped && !choice.create ? (() => {
                      const search = lineSearches[index];
                      const searchOpen = Boolean(search?.open);
                      const searchChips = searchOpen && search.results.length > 0 ? search.results : [];
                      return (
                        <div className="mt-1.5 space-y-1.5">
                          {searchOpen ? (
                            /* Search mode: full-width input, then results + action chips on one row */
                            <>
                              <div className="relative">
                                <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
                                {search.loading ? (
                                  <Loader2 className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin text-gray-400" />
                                ) : null}
                                <input
                                  type="text"
                                  autoFocus
                                  placeholder="Search Lightspeed products…"
                                  value={search.query}
                                  onChange={(e) => setLineSearch(index, { query: e.target.value, results: [] })}
                                  className="w-full rounded-md border border-gray-200 bg-white py-1.5 pl-7 pr-6 text-[11px] text-gray-900 placeholder-gray-400 outline-none ring-0 focus:border-gray-400 focus:ring-1 focus:ring-gray-200"
                                />
                              </div>
                              {/* Search result chips */}
                              {searchChips.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {searchChips.map((option) => (
                                    <ChoiceChip
                                      key={option.item_id}
                                      selected={choice.item_id === option.item_id}
                                      onClick={() => {
                                        setLine(index, { item_id: option.item_id, skipped: false, create: false });
                                        setLineSearch(index, { open: false, query: "", results: [] });
                                      }}
                                      title={`${option.qoh != null ? `${option.qoh} on hand` : ""}${option.default_cost ? ` · cost $${option.default_cost}` : ""}`}
                                    >
                                      {itemOptionLabel(option)}
                                    </ChoiceChip>
                                  ))}
                                </div>
                              ) : search.query.length >= 2 && !search.loading ? (
                                <p className="text-[10px] text-gray-400">No products found</p>
                              ) : null}
                              {/* Action row */}
                              <div className="flex items-center gap-3">
                                <button type="button" onClick={() => setLine(index, { item_id: null, skipped: false, create: true })} className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 hover:text-gray-900">
                                  <Plus className="h-3 w-3" /> New product
                                </button>
                                <button type="button" onClick={() => setLine(index, { item_id: null, skipped: true, create: false })} className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 hover:text-gray-900">
                                  <SkipForward className="h-3 w-3" /> Skip
                                </button>
                                {line.item_options.length > 0 || choice.item_id ? (
                                  <button type="button" onClick={() => setLineSearch(index, { open: false, query: "", results: [] })} className="text-[10px] font-medium text-gray-400 hover:text-gray-700">
                                    ← Back
                                  </button>
                                ) : null}
                              </div>
                            </>
                          ) : (
                            /* Normal mode: match chips wrap freely, action row stays on one line */
                            <>
                              {line.item_options.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {line.item_options.map((option) => (
                                    <ChoiceChip
                                      key={option.item_id}
                                      selected={choice.item_id === option.item_id}
                                      onClick={() => setLine(index, { item_id: option.item_id, skipped: false, create: false })}
                                      title={`Matched on ${option.matched_on} · ${Math.round(option.confidence * 100)}%${option.qoh != null ? ` · ${option.qoh} on hand` : ""}`}
                                    >
                                      {itemOptionLabel(option)}
                                    </ChoiceChip>
                                  ))}
                                </div>
                              ) : null}
                              {/* Action row — short items, always fits one line */}
                              <div className="flex items-center gap-3">
                                <button type="button" onClick={() => setLine(index, { item_id: null, skipped: false, create: true })} className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 hover:text-gray-900">
                                  <Plus className="h-3 w-3" /> New product
                                </button>
                                <button type="button" onClick={() => setLine(index, { item_id: null, skipped: true, create: false })} className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 hover:text-gray-900">
                                  <SkipForward className="h-3 w-3" /> Skip
                                </button>
                                <button type="button" onClick={() => setLineSearch(index, { open: true, query: "", results: [] })} className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-400 hover:text-gray-700">
                                  <Search className="h-3 w-3" /> {line.item_options.length > 0 ? "Search" : "Search Lightspeed…"}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })() : null}

                    {needsChoice ? (
                      <p className="mt-1 text-[10px] font-medium text-amber-600">
                        {line.item_options.length > 0 ? "Pick a match, create a new product, or skip" : "No match found — create a new product or skip"}
                      </p>
                    ) : null}

                    {choice.skipped ? (
                      <button
                        type="button"
                        onClick={() => setLine(index, { item_id: null, skipped: false, create: false })}
                        className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-gray-400 hover:text-gray-700"
                      >
                        <Undo2 className="h-3 w-3" /> Un-skip
                      </button>
                    ) : null}
                  </div>
                );
              })}

              <div className="flex items-center justify-between gap-2 py-2 text-[11px] text-gray-500">
                <span>
                  {orderableCount} line{orderableCount === 1 ? "" : "s"}
                  {proposal.shipping_cost ? ` · ship ${money(proposal.shipping_cost, proposal.currency)}` : ""}
                  {proposal.invoice_total != null ? ` · invoice ${money(proposal.invoice_total, proposal.currency)}` : ""}
                </span>
                <span className="text-xs font-semibold tabular-nums text-gray-900">{money(orderTotal, proposal.currency)}</span>
              </div>
            </div>

            {status === "applied" ? (
              <div className="space-y-1.5">
                <p className="px-1 text-center text-[11px] text-gray-500">{resultMsg || "Purchase order created."}</p>
                {lightspeedUrl ? (
                  <Button
                    asChild
                    variant="ghost"
                    className="h-8 w-full rounded-full text-xs font-medium text-gray-600 hover:bg-gray-100"
                  >
                    <a href={lightspeedUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                      View in Lightspeed
                    </a>
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Button
                  onClick={apply}
                  disabled={!canApply || status === "applying"}
                  className={cn(
                    "h-9 w-full rounded-full bg-gray-900 text-sm font-medium text-white",
                    "transition-transform active:scale-[0.98] hover:bg-gray-800 disabled:bg-gray-300",
                  )}
                >
                  {status === "applying" ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Creating…
                    </>
                  ) : (
                    "Approve"
                  )}
                </Button>
                {!canApply && status !== "applying" ? (
                  <p className="px-1 text-center text-[11px] text-amber-600">
                    {!vendorResolved
                      ? "Choose a vendor to continue."
                      : unresolvedLineCount > 0
                        ? `Resolve ${unresolvedLineCount} highlighted line${unresolvedLineCount === 1 ? "" : "s"}.`
                        : orderableCount === 0
                          ? "All lines are skipped — nothing to order."
                          : "Choose a shop to continue."}
                  </p>
                ) : null}
                {status === "error" ? (
                  <div className="flex items-center justify-center gap-1 text-[11px] text-destructive">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    {resultMsg}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
