"use client";

import * as React from "react";
import {
  Loader2,
  Sparkles,
  Plus,
  ArrowRight,
  Package,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { AutoAssignProposal, AutoAssignReviewDraft } from "@/lib/store/auto-assign-carousels";
import {
  actionAllowsProductPick,
  createReviewDrafts,
  draftToApprovedAction,
} from "@/lib/store/auto-assign-carousels";

const AUTO_ASSIGN_DIALOG_CLASS =
  "animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out flex h-[min(90dvh,44rem)] max-h-[90dvh] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl";

interface AutoAssignCarouselsPanelProps {
  onApplied?: () => void;
}

export function AutoAssignCarouselsPanel({ onApplied }: AutoAssignCarouselsPanelProps) {
  const [loading, setLoading] = React.useState(true);
  const [scanning, setScanning] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [proposal, setProposal] = React.useState<AutoAssignProposal | null>(null);
  const [reviewDrafts, setReviewDrafts] = React.useState<AutoAssignReviewDraft[]>([]);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  const loadSummary = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/store/carousels/auto-assign");
      if (res.ok) {
        const data = await res.json();
        setProposal(data.proposal ?? null);
      }
    } catch {
      setProposal(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const handleReview = async () => {
    setScanning(true);
    try {
      const res = await fetch("/api/store/carousels/auto-assign");
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Could not build preview");
        return;
      }
      const data = await res.json();
      const nextProposal = data.proposal ?? null;
      setProposal(nextProposal);
      setReviewDrafts(createReviewDrafts(nextProposal?.actions ?? []));
      setPreviewOpen(true);
    } finally {
      setScanning(false);
    }
  };

  const approvedActions = React.useMemo(
    () => reviewDrafts.map(draftToApprovedAction).filter((a) => a !== null),
    [reviewDrafts]
  );

  const approvedProductCount = React.useMemo(() => {
    return approvedActions.reduce((sum, action) => {
      if (action.type === "update") return sum + action.add_product_ids.length;
      if (action.source === "brand") return sum + action.product_count;
      return sum + action.product_ids.length;
    }, 0);
  }, [approvedActions]);

  const handleApply = async () => {
    if (approvedActions.length === 0) return;

    setApplying(true);
    try {
      const res = await fetch("/api/store/carousels/auto-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions: approvedActions }),
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error ?? "Failed to apply changes");
        return;
      }

      const parts: string[] = [];
      if (data.created > 0) parts.push(`${data.created} carousel${data.created === 1 ? "" : "s"} created`);
      if (data.updated > 0) parts.push(`${data.updated} carousel${data.updated === 1 ? "" : "s"} updated`);
      setSuccessMessage(parts.join(" · ") || "Changes applied");
      setPreviewOpen(false);
      setReviewDrafts([]);
      await loadSummary();
      onApplied?.();
    } finally {
      setApplying(false);
    }
  };

  const updateDraft = (id: string, patch: Partial<AutoAssignReviewDraft>) => {
    setReviewDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const toggleProduct = (draftId: string, productId: string) => {
    setReviewDrafts((prev) =>
      prev.map((d) => {
        if (d.id !== draftId) return d;
        const next = new Set(d.selectedProductIds);
        if (next.has(productId)) next.delete(productId);
        else next.add(productId);
        return { ...d, selectedProductIds: Array.from(next) };
      })
    );
  };

  const setAllProducts = (draftId: string, selected: boolean) => {
    setReviewDrafts((prev) =>
      prev.map((d) => {
        if (d.id !== draftId) return d;
        return {
          ...d,
          selectedProductIds: selected ? d.products.map((p) => p.id) : [],
        };
      })
    );
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-white px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Checking marketplace-ready products…
      </div>
    );
  }

  const uncategorised = proposal?.uncategorised_count ?? 0;
  const hasActions = (proposal?.actions.length ?? 0) > 0;
  const awaitingDynamicMatch = uncategorised > 0 && !hasActions;

  if (uncategorised === 0) {
    return (
      <div className="flex items-start gap-3 rounded-md border bg-white px-4 py-3">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium text-foreground">All marketplace-ready products are in carousels</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Every product with approved photos that can appear on your store is already in a carousel.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3 rounded-md border bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-gray-100">
            <Package className="size-4 text-gray-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {uncategorised} marketplace-ready product{uncategorised === 1 ? "" : "s"} not in a
              carousel
            </p>
            <p className="mt-0.5 max-w-xl text-xs text-muted-foreground">
              Only products with approved photos are included. Review each suggested carousel, rename
              it, and deselect products before applying.
            </p>
            {successMessage ? (
              <p className="mt-2 text-xs font-medium text-foreground">{successMessage}</p>
            ) : null}
          </div>
        </div>
        {awaitingDynamicMatch ? (
          <p className="text-xs text-muted-foreground sm:max-w-xs sm:text-right">
            These products already match Lightspeed or brand carousels on your store. Refresh
            carousels from Lightspeed if counts look wrong.
          </p>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={scanning || !hasActions}
            onClick={() => void handleReview()}
            className="shrink-0"
          >
            {scanning ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Preparing…
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Review auto-assign
              </>
            )}
          </Button>
        )}
      </div>

      <Dialog
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open) setReviewDrafts([]);
        }}
      >
        <DialogContent className={AUTO_ASSIGN_DIALOG_CLASS}>
          <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-4 text-left">
            <DialogTitle>Review auto-assign</DialogTitle>
            <DialogDescription>
              Choose Yes or No for each carousel, edit names, and deselect products. Only marketplace-ready
              products are listed. {approvedActions.length} of {reviewDrafts.length} carousel
              {reviewDrafts.length === 1 ? "" : "s"} selected
              {approvedProductCount > 0
                ? ` · ${approvedProductCount} product${approvedProductCount === 1 ? "" : "s"}`
                : ""}
              .
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
            <div className="space-y-4">
              {reviewDrafts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No changes to apply. Products may already be covered by dynamic Lightspeed or brand
                  carousels.
                </p>
              ) : (
                reviewDrafts.map((draft) => (
                  <EditableActionCard
                    key={draft.id}
                    draft={draft}
                    onUpdate={(patch) => updateDraft(draft.id, patch)}
                    onToggleProduct={(productId) => toggleProduct(draft.id, productId)}
                    onSelectAll={(selected) => setAllProducts(draft.id, selected)}
                  />
                ))
              )}
            </div>
          </div>

          <DialogFooter className="shrink-0 flex-col gap-2 border-t bg-background px-6 py-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setPreviewOpen(false)} disabled={applying}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleApply()}
              disabled={applying || approvedActions.length === 0}
            >
              {applying ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Applying…
                </>
              ) : (
                <>
                  Apply {approvedActions.length} carousel
                  {approvedActions.length === 1 ? "" : "s"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface EditableActionCardProps {
  draft: AutoAssignReviewDraft;
  onUpdate: (patch: Partial<AutoAssignReviewDraft>) => void;
  onToggleProduct: (productId: string) => void;
  onSelectAll: (selected: boolean) => void;
}

function EditableActionCard({
  draft,
  onUpdate,
  onToggleProduct,
  onSelectAll,
}: EditableActionCardProps) {
  const isCreate = draft.action.type === "create";
  const canPickProducts = actionAllowsProductPick(draft.action);
  const selectedCount = draft.selectedProductIds.length;
  const allSelected = draft.products.length > 0 && selectedCount === draft.products.length;

  return (
    <div
      className={cn(
        "rounded-md border bg-white p-4 transition-opacity",
        !draft.approved && "opacity-60"
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {isCreate ? (
            <Badge variant="secondary" className="rounded-md font-normal">
              <Plus className="mr-1 size-3" />
              Create carousel
            </Badge>
          ) : (
            <Badge variant="secondary" className="rounded-md font-normal">
              <ArrowRight className="mr-1 size-3" />
              Add to existing
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {selectedCount} of {draft.products.length} product
            {draft.products.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit shrink-0">
          <button
            type="button"
            onClick={() => onUpdate({ approved: true })}
            className={cn(
              "px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
              draft.approved
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70"
            )}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => onUpdate({ approved: false })}
            className={cn(
              "px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
              !draft.approved
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70"
            )}
          >
            No
          </button>
        </div>
      </div>

      {draft.approved ? (
        <div className="mt-3 space-y-1.5">
          <Label htmlFor={`carousel-name-${draft.id}`} className="text-xs">
            Carousel name
          </Label>
          <Input
            id={`carousel-name-${draft.id}`}
            value={draft.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            className="h-9"
            disabled={!isCreate && draft.action.type === "update" && draft.action.source !== "custom"}
          />
          {!isCreate && draft.action.type === "update" && draft.action.source !== "custom" ? (
            <p className="text-xs text-muted-foreground">
              Name can only be edited for custom carousels.
            </p>
          ) : null}
        </div>
      ) : null}

      {draft.approved ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {draft.action.type === "create" ? (
            <>
              New {draft.action.source} carousel
              {draft.action.source === "brand" && draft.action.brand_name
                ? ` for ${draft.action.brand_name}`
                : ""}
            </>
          ) : (
            <>Add products to &ldquo;{draft.action.carousel_name}&rdquo;</>
          )}
          {!canPickProducts
            ? " · Products are matched automatically by category or brand"
            : null}
        </p>
      ) : null}

      {draft.approved && draft.products.length > 0 ? (
        <div className="mt-3">
          {canPickProducts ? (
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-foreground">Products</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onSelectAll(true)}
                  disabled={allSelected}
                  className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
                >
                  Select all
                </button>
                <span className="text-xs text-muted-foreground">·</span>
                <button
                  type="button"
                  onClick={() => onSelectAll(false)}
                  disabled={selectedCount === 0}
                  className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
                >
                  Deselect all
                </button>
              </div>
            </div>
          ) : null}

          <div
            className={cn(
              "max-h-40 space-y-0.5 overflow-y-auto rounded-md border border-border",
              !canPickProducts && "bg-muted/30"
            )}
          >
            {draft.products.map((product) => {
              const checked = draft.selectedProductIds.includes(product.id);
              return (
                <div
                  key={product.id}
                  className={cn(
                    "flex items-center gap-2.5 px-2 py-1.5",
                    canPickProducts && "cursor-pointer hover:bg-accent rounded-md"
                  )}
                  onClick={() => {
                    if (canPickProducts) onToggleProduct(product.id);
                  }}
                >
                  <Checkbox
                    checked={checked}
                    disabled={!canPickProducts}
                    onCheckedChange={() => onToggleProduct(product.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground">{product.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {draft.approved && canPickProducts && selectedCount === 0 ? (
        <p className="mt-2 text-xs text-amber-700">
          Select at least one product, or choose No to skip this carousel.
        </p>
      ) : null}
    </div>
  );
}
