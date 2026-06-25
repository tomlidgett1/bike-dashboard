"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Box, Magnifer } from "@/components/layout/app-sidebar/dashboard-icons";
import type { SpecialsCandidate } from "@/lib/types/specials";
import {
  formatMoney,
  formatMargin,
  formatLastSold,
} from "@/components/settings/specials/format";

export function SpecialsAddProductDialog({
  open,
  cycleId,
  onClose,
  onAdd,
}: {
  open: boolean;
  cycleId: string | null;
  onClose: () => void;
  onAdd: (cycleId: string, productId: string) => Promise<void>;
}) {
  const [query, setQuery] = React.useState("");
  const [candidates, setCandidates] = React.useState<SpecialsCandidate[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [addingId, setAddingId] = React.useState<string | null>(null);

  // Reset when (re)opened.
  React.useEffect(() => {
    if (open) {
      setQuery("");
      setCandidates([]);
    }
  }, [open]);

  // Debounced search (also runs once on open with empty query → recent products).
  React.useEffect(() => {
    if (!open || !cycleId) return;
    let active = true;
    const handle = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/store/specials/candidates?cycleId=${encodeURIComponent(cycleId)}&q=${encodeURIComponent(query)}`,
          { cache: "no-store" },
        );
        if (!active) return;
        const data = await res.json().catch(() => ({}));
        setCandidates((data.candidates ?? []) as SpecialsCandidate[]);
      } catch {
        if (active) setCandidates([]);
      } finally {
        if (active) setLoading(false);
      }
    }, query ? 300 : 0);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [open, cycleId, query]);

  const handleAdd = async (productId: string) => {
    if (!cycleId) return;
    setAddingId(productId);
    try {
      await onAdd(cycleId, productId);
      setCandidates((prev) => prev.filter((c) => c.product_id !== productId));
    } finally {
      setAddingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a product</DialogTitle>
          <DialogDescription>
            Search your in-stock inventory. The suggested discount is margin-safe — you can
            change it after adding.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Magnifer
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products…"
            className="pl-9"
          />
        </div>

        <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Searching…</p>
          ) : candidates.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {query.length >= 2 ? "No matching in-stock products." : "Start typing to search."}
            </p>
          ) : (
            candidates.map((c) => (
              <div
                key={c.product_id}
                className="flex items-center gap-3 rounded-lg border border-border p-2.5"
              >
                <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-md bg-gray-100">
                  {c.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Box size={16} className="text-muted-foreground/40" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{c.display_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[c.brand, c.category_name].filter(Boolean).join(" · ") || "—"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatMoney(c.retail)} · {formatMargin(c.margin_percent)} margin ·{" "}
                    {formatLastSold(c.days_since_sold, c.last_sold_at)} · {Math.round(c.soh)} in stock
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                    -{Math.round(c.proposal.discount_percent)}%
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-md"
                    disabled={addingId === c.product_id}
                    onClick={() => handleAdd(c.product_id)}
                  >
                    <Plus className="size-3.5" />
                    {addingId === c.product_id ? "Adding…" : "Add"}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
