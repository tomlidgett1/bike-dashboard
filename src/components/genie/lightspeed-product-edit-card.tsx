"use client";

import * as React from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, Package, Undo2 } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  ApplyResult,
  ProductBrandCategoryChange,
  ProductBrandCategoryUpdateProposal,
} from "@/lib/types/genie-agent";

function brandWasChanged(change: ProductBrandCategoryChange): boolean {
  return (
    change.next_brand_name != null &&
    (change.create_brand ||
      change.prev_brand_id !== change.next_brand_id ||
      (change.prev_brand_name || "").toLowerCase() !== change.next_brand_name.toLowerCase())
  );
}

function categoryWasChanged(change: ProductBrandCategoryChange): boolean {
  return (
    change.next_category_name != null &&
    (change.create_category ||
      change.prev_category_id !== change.next_category_id ||
      (change.prev_category_path || change.prev_category_name || "").toLowerCase() !==
        (change.next_category_path || change.next_category_name || "").toLowerCase())
  );
}

function buildUndoProposal(
  applied: ProductBrandCategoryChange[],
  original: ProductBrandCategoryUpdateProposal,
): ProductBrandCategoryUpdateProposal {
  const changes: ProductBrandCategoryChange[] = [];

  for (const change of applied) {
    const undoBrand = brandWasChanged(change);
    const undoCategory = categoryWasChanged(change);
    if (!undoBrand && !undoCategory) continue;

    const undoChange: ProductBrandCategoryChange = {
      lightspeed_item_id: change.lightspeed_item_id,
      product_name: change.product_name,
      sku: change.sku,
      image_url: change.image_url ?? null,
      prev_brand_id: change.next_brand_id,
      prev_brand_name: change.next_brand_name,
      next_brand_id: undoBrand ? change.prev_brand_id : null,
      next_brand_name: undoBrand ? change.prev_brand_name : null,
      prev_category_id: change.next_category_id,
      prev_category_name: change.next_category_name,
      prev_category_path: change.next_category_path,
      next_category_id: undoCategory ? change.prev_category_id : null,
      next_category_name: undoCategory ? change.prev_category_name : null,
      next_category_path: undoCategory ? change.prev_category_path : null,
    };

    if (undoBrand && !change.prev_brand_id) undoChange.clear_brand = true;
    if (undoCategory && !change.prev_category_id) undoChange.clear_category = true;

    changes.push(undoChange);
  }

  return {
    kind: "product_brand_category_update",
    summary: `Undo: ${original.summary}`,
    match_label: original.match_label,
    changes,
  };
}

function ChangeRow({
  label,
  prev,
  next,
  isNew,
}: {
  label: string;
  prev: string | null;
  next: string | null;
  isNew?: boolean;
}) {
  if (!next || prev === next) return null;

  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs leading-snug">
      <span className="w-14 shrink-0 text-gray-500">{label}</span>
      <span className="min-w-0 truncate text-gray-400 line-through decoration-gray-300">
        {prev?.trim() || "None"}
      </span>
      <ArrowRight className="h-3 w-3 shrink-0 text-gray-300" />
      <span className="min-w-0 truncate font-medium text-gray-900">{next}</span>
      {isNew ? <span className="shrink-0 text-[10px] text-gray-400">new</span> : null}
    </div>
  );
}

function ProductThumbnail({ src, alt }: { src: string | null; alt: string }) {
  return (
    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md bg-gray-50 ring-1 ring-black/[0.04]">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Package className="h-3.5 w-3.5 text-gray-300" />
        </div>
      )}
    </div>
  );
}

function ProductChangeRow({
  change,
  imageUrl,
}: {
  change: ProductBrandCategoryChange;
  imageUrl: string | null;
}) {
  const brandChanging = brandWasChanged(change);
  const categoryChanging = categoryWasChanged(change);

  return (
    <div className="flex gap-2.5 border-b border-gray-200/70 py-2 last:border-b-0">
      <ProductThumbnail src={imageUrl} alt={change.product_name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{change.product_name}</p>
        {(brandChanging || categoryChanging) ? (
          <div className="mt-1 space-y-0.5">
            {brandChanging ? (
              <ChangeRow
                label="Brand"
                prev={change.prev_brand_name}
                next={change.next_brand_name}
                isNew={change.create_brand}
              />
            ) : null}
            {categoryChanging ? (
              <ChangeRow
                label="Category"
                prev={change.prev_category_path || change.prev_category_name}
                next={change.next_category_path || change.next_category_name}
                isNew={change.create_category}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

type CardStatus = "idle" | "applying" | "applied" | "undoing" | "undone" | "error";

const CARD_EASE = [0.04, 0.62, 0.23, 0.98] as const;
const SCROLL_MAX_ITEMS = 4;
const ROW_HEIGHT_ESTIMATE = 58;
const SCROLL_MAX_HEIGHT = SCROLL_MAX_ITEMS * ROW_HEIGHT_ESTIMATE;

export function LightspeedProductEditCard({ proposal }: { proposal: ProductBrandCategoryUpdateProposal }) {
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setExpanded(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const [status, setStatus] = React.useState<CardStatus>("idle");
  const [resultMsg, setResultMsg] = React.useState("");
  const [appliedChanges, setAppliedChanges] = React.useState<ProductBrandCategoryChange[] | null>(null);
  const [hydratedImages, setHydratedImages] = React.useState<Record<string, string | null>>({});

  React.useEffect(() => {
    const itemIds = proposal.changes.map((change) => String(change.lightspeed_item_id));
    if (itemIds.length === 0) return;

    let cancelled = false;
    fetch("/api/genie/agent/inventory-images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lightspeed_item_ids: itemIds }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data?.images) return;
        setHydratedImages(data.images as Record<string, string | null>);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [proposal.changes]);

  const runProposal = async (target: ProductBrandCategoryUpdateProposal, mode: "apply" | "undo") => {
    setStatus(mode === "apply" ? "applying" : "undoing");
    setResultMsg("");
    try {
      const res = await fetch("/api/genie/agent/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal: target }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setStatus("error");
        setResultMsg(data?.error || "Could not complete the change. Please try again.");
        return;
      }

      const result = data as ApplyResult;
      if (mode === "apply") {
        setAppliedChanges(result.applied_changes ?? target.changes);
        setStatus("applied");
        setResultMsg(result.message);
        return;
      }

      setAppliedChanges(null);
      setStatus("undone");
      setResultMsg(result.message || "Changes reverted in Lightspeed.");
    } catch {
      setStatus("error");
      setResultMsg("Connection error. Please try again.");
    }
  };

  const apply = () => runProposal(proposal, "apply");

  const undo = () => {
    const snapshot = appliedChanges ?? proposal.changes;
    const undoProposal = buildUndoProposal(snapshot, proposal);
    if (undoProposal.changes.length === 0) {
      setStatus("error");
      setResultMsg("Nothing to undo for this change.");
      return;
    }
    runProposal(undoProposal, "undo");
  };

  const itemCount = proposal.changes.length;
  const isScrollable = itemCount > SCROLL_MAX_ITEMS;
  const canUndo =
    (status === "applied" || status === "undoing") &&
    (appliedChanges?.length ?? 0) > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: CARD_EASE }}
      className="w-full max-w-sm"
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
              <CheckCircle2
                className="h-4 w-4 text-emerald-500"
                aria-label="Changes saved to Lightspeed"
              />
            </motion.div>
          ) : null}
        </AnimatePresence>

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
          <div className="min-w-0 flex-1 pr-5">
            <p className="text-sm font-semibold tracking-tight text-gray-900">Lightspeed</p>
            <p className="truncate text-[11px] text-gray-500">
              {itemCount} item{itemCount === 1 ? "" : "s"}
              {proposal.summary ? ` · ${proposal.summary}` : ""}
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
            <div className="relative">
              <div
                className={cn(
                  "rounded-md bg-gray-50 px-2.5",
                  isScrollable && "overflow-y-auto overscroll-contain [scrollbar-width:thin]",
                )}
                style={isScrollable ? { maxHeight: SCROLL_MAX_HEIGHT } : undefined}
              >
                {proposal.changes.map((change) => (
                  <ProductChangeRow
                    key={change.lightspeed_item_id}
                    change={change}
                    imageUrl={
                      hydratedImages[String(change.lightspeed_item_id)]
                      ?? change.image_url
                      ?? null
                    }
                  />
                ))}
              </div>
              {isScrollable ? (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-6 rounded-b-md bg-gradient-to-t from-gray-50 to-transparent"
                />
              ) : null}
            </div>

            {canUndo ? (
              <Button
                variant="ghost"
                onClick={undo}
                disabled={status === "undoing"}
                className="h-8 w-full rounded-full text-xs font-medium text-gray-600 hover:bg-gray-100"
              >
                {status === "undoing" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Undoing…
                  </>
                ) : (
                  <>
                    <Undo2 className="h-3.5 w-3.5" />
                    Undo
                  </>
                )}
              </Button>
            ) : status === "idle" || status === "applying" || status === "error" ? (
              <div className="space-y-1.5">
                <Button
                  onClick={apply}
                  disabled={status === "applying"}
                  className={cn(
                    "h-9 w-full rounded-full bg-gray-900 text-sm font-medium text-white",
                    "transition-transform active:scale-[0.98] hover:bg-gray-800",
                  )}
                >
                  {status === "applying" ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Writing…
                    </>
                  ) : (
                    "Approve"
                  )}
                </Button>
                {status === "error" ? (
                  <div className="flex items-center justify-center gap-1 text-[11px] text-destructive">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    {resultMsg}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
