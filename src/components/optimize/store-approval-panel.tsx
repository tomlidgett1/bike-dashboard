"use client";

// ============================================================
// Store Approval Panel
// ============================================================
// Shows Lightspeed products that have an image but haven't been
// approved for the marketplace (no serper_workbench image).
// One click approves them so they go live on the store.

import * as React from "react";
import Image from "next/image";
import {
  Loader2,
  CheckCircle2,
  Package,
  ChevronDown,
  ChevronRight,
  Check,
  RefreshCw,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface ApprovalProduct {
  id: string;
  description: string;
  display_name: string | null;
  brand: string | null;
  price: number;
  qoh: number;
  lightspeed_category_id: string | null;
  category_name: string | null;
  thumbnail_url: string | null;
  best_image_id: string | null;
}

interface CategoryGroup {
  key: string;
  name: string;
  products: ApprovalProduct[];
}

export function StoreApprovalPanel() {
  const [products, setProducts] = React.useState<ApprovalProduct[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [approving, setApproving] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [approved, setApproved] = React.useState<Set<string>>(new Set());
  const [expandedCats, setExpandedCats] = React.useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/products/needs-approval");
      const data = await res.json();
      const list: ApprovalProduct[] = data.products ?? [];
      setProducts(list);
      // Auto-expand all categories on first load
      const cats = new Set(list.map((p) => p.lightspeed_category_id ?? (p.category_name ? `name:${p.category_name}` : "other")));
      setExpandedCats(cats);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  // Group by category
  const groups = React.useMemo<CategoryGroup[]>(() => {
    const map = new Map<string, CategoryGroup>();
    for (const p of products) {
      if (approved.has(p.id)) continue;
      const key = p.lightspeed_category_id ?? (p.category_name ? `name:${p.category_name}` : "other");
      const name = p.category_name ?? "Uncategorised";
      if (!map.has(key)) map.set(key, { key, name, products: [] });
      map.get(key)!.products.push(p);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [products, approved]);

  const remaining = products.filter((p) => !approved.has(p.id)).length;

  const toggleProduct = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleCategory = (group: CategoryGroup) => {
    const ids = group.products.map((p) => p.id);
    const allSelected = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const toggleExpand = (key: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const doApprove = async (ids: string[]) => {
    if (!ids.length) return;
    setApproving(true);
    try {
      const res = await fetch("/api/products/approve-for-store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_ids: ids }),
      });
      const data = await res.json();
      if (res.ok && data.approved > 0) {
        setApproved((prev) => new Set([...prev, ...ids]));
        setSelected((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.delete(id));
          return next;
        });
      }
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (remaining === 0 && approved.size === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card py-20 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-500/70" />
        <p className="text-sm font-medium text-foreground">All products live</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Every Lightspeed product with an image is already approved for the marketplace.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              {remaining > 0 ? (
                <>{remaining} product{remaining !== 1 ? "s" : ""} hidden from the marketplace</>
              ) : (
                <>All done — products are going live</>
              )}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              These have Lightspeed images. Approving them marks the image as store-quality and makes the product visible.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <Button
                size="sm"
                disabled={approving}
                onClick={() => void doApprove(Array.from(selected))}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {approving ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                )}
                Approve {selected.size} selected
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={loading || approving}
              onClick={() => void load()}
            >
              <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Select all */}
        {remaining > 0 && (
          <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
            <Checkbox
              checked={selected.size === remaining && remaining > 0}
              onCheckedChange={(checked) => {
                if (checked) {
                  const all = products.filter((p) => !approved.has(p.id)).map((p) => p.id);
                  setSelected(new Set(all));
                } else {
                  setSelected(new Set());
                }
              }}
              id="select-all"
            />
            <label htmlFor="select-all" className="text-xs text-muted-foreground cursor-pointer select-none">
              Select all ({remaining})
            </label>
          </div>
        )}
      </div>

      {/* Category groups */}
      {groups.map((group) => {
        const expanded = expandedCats.has(group.key);
        const groupIds = group.products.map((p) => p.id);
        const allGroupSelected = groupIds.length > 0 && groupIds.every((id) => selected.has(id));
        const someGroupSelected = groupIds.some((id) => selected.has(id));

        return (
          <div key={group.key} className="rounded-xl border border-border bg-card overflow-hidden">
            {/* Category header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-muted/30 border-b border-border">
              <Checkbox
                checked={allGroupSelected}
                data-state={someGroupSelected && !allGroupSelected ? "indeterminate" : undefined}
                onCheckedChange={() => toggleCategory(group)}
              />
              <button
                type="button"
                className="flex flex-1 items-center gap-2 text-left"
                onClick={() => toggleExpand(group.key)}
              >
                <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm font-semibold text-foreground">{group.name}</span>
                <span className="text-xs text-muted-foreground">
                  {group.products.length} product{group.products.length !== 1 ? "s" : ""}
                </span>
                {expanded ? (
                  <ChevronDown className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>
              <Button
                size="sm"
                variant="outline"
                disabled={approving}
                onClick={() => void doApprove(groupIds)}
                className="shrink-0 h-7 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300"
              >
                <Check className="mr-1 h-3 w-3" />
                Approve all
              </Button>
            </div>

            {/* Product rows */}
            {expanded && (
              <div className="divide-y divide-border">
                {group.products.map((p) => {
                  const name = p.display_name || p.description;
                  const isSelected = selected.has(p.id);

                  return (
                    <div
                      key={p.id}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 transition-colors",
                        isSelected && "bg-emerald-50/40 dark:bg-emerald-950/10",
                      )}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleProduct(p.id)}
                      />

                      {/* Thumbnail */}
                      <div
                        className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted cursor-zoom-in"
                        onClick={() => p.thumbnail_url && setLightbox(p.thumbnail_url)}
                      >
                        {p.thumbnail_url ? (
                          <Image
                            src={p.thumbnail_url}
                            alt=""
                            fill
                            unoptimized
                            className="object-cover"
                            sizes="56px"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Package className="h-5 w-5 text-muted-foreground/40" />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground leading-snug truncate">{name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {p.brand || "—"} · ${Number(p.price).toFixed(2)} · {p.qoh} in stock
                        </p>
                      </div>

                      {/* Approve button */}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={approving}
                        onClick={() => void doApprove([p.id])}
                        className="shrink-0 h-7 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300"
                      >
                        <Check className="mr-1 h-3 w-3" />
                        Approve
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Approved count */}
      {approved.size > 0 && (
        <p className="text-center text-xs text-emerald-600 font-medium">
          <CheckCircle2 className="inline-block mr-1 h-3.5 w-3.5" />
          {approved.size} product{approved.size !== 1 ? "s" : ""} approved this session — now live on the store
        </p>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt=""
            className="max-h-[80vh] max-w-[80vw] rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
