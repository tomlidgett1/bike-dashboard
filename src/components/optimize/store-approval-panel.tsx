"use client";

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
  ShieldCheck,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  SettingsSection,
  SettingsRow,
  SettingsDivider,
  StatCard,
  StatusBadge,
} from "@/components/dashboard";

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
      const cats = new Set(
        list.map(
          (p) =>
            p.lightspeed_category_id ??
            (p.category_name ? `name:${p.category_name}` : "other")
        )
      );
      setExpandedCats(cats);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const groups = React.useMemo<CategoryGroup[]>(() => {
    const map = new Map<string, CategoryGroup>();
    for (const p of products) {
      if (approved.has(p.id)) continue;
      const key =
        p.lightspeed_category_id ??
        (p.category_name ? `name:${p.category_name}` : "other");
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
      <div className="flex items-center justify-center rounded-md border bg-card py-20">
        <Loader2 className="size-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (remaining === 0 && approved.size === 0) {
    return (
      <SettingsSection
        title="All products live"
        description="Every Lightspeed product with an image is already approved for the marketplace."
        icon={CheckCircle2}
      >
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <StatusBadge label="Storefront up to date" tone="success" />
          <p className="max-w-sm text-sm text-muted-foreground">
            Nothing is waiting for approval. New products with Lightspeed photos will appear here.
          </p>
        </div>
      </SettingsSection>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Pending approval"
          value={remaining}
          icon={ShieldCheck}
          hint="Hidden from the marketplace until approved"
        />
        {approved.size > 0 ? (
          <StatCard
            label="Approved this session"
            value={approved.size}
            icon={CheckCircle2}
            hint="Now visible on your store"
          />
        ) : null}
      </div>

      <SettingsSection
        title="Approve for store"
        description="These products have Lightspeed images. Approving marks them as store-quality and makes them visible on the marketplace."
        icon={ShieldCheck}
        headerAction={
          <Button
            variant="outline"
            size="sm"
            disabled={loading || approving}
            onClick={() => void load()}
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            Refresh
          </Button>
        }
        footer={
          selected.size > 0 ? (
            <Button size="sm" disabled={approving} onClick={() => void doApprove(Array.from(selected))}>
              {approving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Approve {selected.size} selected
            </Button>
          ) : undefined
        }
      >
        {remaining > 0 ? (
          <>
            <SettingsRow
              label="Select all"
              description={`${remaining} product${remaining === 1 ? "" : "s"} in queue`}
              control={
                <Checkbox
                  checked={selected.size === remaining && remaining > 0}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      const all = products
                        .filter((p) => !approved.has(p.id))
                        .map((p) => p.id);
                      setSelected(new Set(all));
                    } else {
                      setSelected(new Set());
                    }
                  }}
                  aria-label="Select all pending products"
                />
              }
            />
            <SettingsDivider />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            All pending products were approved this session.
          </p>
        )}
      </SettingsSection>

      {groups.map((group) => {
        const expanded = expandedCats.has(group.key);
        const groupIds = group.products.map((p) => p.id);
        const allGroupSelected =
          groupIds.length > 0 && groupIds.every((id) => selected.has(id));
        const someGroupSelected = groupIds.some((id) => selected.has(id));

        return (
          <SettingsSection
            key={group.key}
            title={group.name}
            description={`${group.products.length} product${group.products.length === 1 ? "" : "s"}`}
            icon={Layers}
            headerAction={
              <Button
                size="sm"
                variant="outline"
                disabled={approving || group.products.length === 0}
                onClick={() => void doApprove(groupIds)}
              >
                <Check className="size-4" />
                Approve all
              </Button>
            }
            contentClassName="p-0"
          >
            <div className="flex items-center gap-3 border-b border-border/60 px-6 py-3">
              <Checkbox
                checked={allGroupSelected}
                data-state={
                  someGroupSelected && !allGroupSelected ? "indeterminate" : undefined
                }
                onCheckedChange={() => toggleCategory(group)}
                aria-label={`Select all in ${group.name}`}
              />
              <button
                type="button"
                className="flex flex-1 items-center gap-2 text-left text-sm font-medium text-foreground"
                onClick={() => toggleExpand(group.key)}
              >
                {expanded ? (
                  <ChevronDown className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-4 text-muted-foreground" />
                )}
                {expanded ? "Collapse" : "Expand"} category
              </button>
            </div>

            {expanded && (
              <div className="divide-y divide-border/60">
                {group.products.map((p) => {
                  const name = p.display_name || p.description;
                  const isSelected = selected.has(p.id);

                  return (
                    <div
                      key={p.id}
                      className={cn(
                        "flex items-center gap-3 px-6 py-3",
                        isSelected && "bg-muted/30"
                      )}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleProduct(p.id)}
                        aria-label={`Select ${name}`}
                      />

                      <div
                        className="relative size-14 shrink-0 cursor-zoom-in overflow-hidden rounded-md bg-muted"
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
                            <Package className="size-5 text-muted-foreground/40" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                          {p.brand ? `${p.brand} · ` : ""}$
                          {Number(p.price).toFixed(2)} · {p.qoh} in stock
                        </p>
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        disabled={approving}
                        onClick={() => void doApprove([p.id])}
                        className="shrink-0"
                      >
                        <Check className="size-4" />
                        Approve
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </SettingsSection>
        );
      })}

      {lightbox ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/85 p-6 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt=""
            className="max-h-[90vh] max-w-[90vw] rounded-md object-contain shadow-2xl animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}
