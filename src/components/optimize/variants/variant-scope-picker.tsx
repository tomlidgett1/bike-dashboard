"use client";

import * as React from "react";
import { Loader2, Search } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { ScopeOption, ScopeResponse } from "./types";

function Chip({
  label,
  count,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
        selected
          ? "border-foreground bg-foreground text-background"
          : "border-border/70 bg-white text-foreground hover:border-foreground/30",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span>{label}</span>
      <span className={cn("text-xs", selected ? "text-background/70" : "text-muted-foreground")}>{count}</span>
    </button>
  );
}

function Section({ title, options, selected, toggle, disabled }: {
  title: string;
  options: ScopeOption[];
  selected: Set<string>;
  toggle: (name: string) => void;
  disabled: boolean;
}) {
  if (options.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-foreground">{title}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <Chip
            key={opt.name}
            label={opt.name}
            count={opt.count}
            selected={selected.has(opt.name)}
            disabled={disabled}
            onClick={() => toggle(opt.name)}
          />
        ))}
      </div>
    </div>
  );
}

export function VariantScopePicker({
  onScan,
  starting,
}: {
  onScan: (scope: { categories: string[]; brands: string[]; all_products: boolean }) => void;
  starting: boolean;
}) {
  const [scope, setScope] = React.useState<ScopeResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [allProducts, setAllProducts] = React.useState(false);
  const [categories, setCategories] = React.useState<Set<string>>(new Set());
  const [brands, setBrands] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/optimize/variants/scope");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load products");
        if (active) setScope(data);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Failed to load products");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void) => (name: string) => {
    const next = new Set(set);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setter(next);
  };

  const selectedCount = React.useMemo(() => {
    if (!scope) return 0;
    if (allProducts) return scope.totalProducts;
    const cat = scope.categories.filter((c) => categories.has(c.name)).reduce((s, c) => s + c.count, 0);
    const brand = scope.brands.filter((b) => brands.has(b.name)).reduce((s, b) => s + b.count, 0);
    return cat + brand;
  }, [scope, allProducts, categories, brands]);

  const canScan = !starting && (allProducts || categories.size > 0 || brands.size > 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-md border border-border/60 bg-white py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>;
  }

  if (scope && scope.totalProducts === 0) {
    return (
      <div className="rounded-md border border-border/60 bg-white p-6 text-sm text-muted-foreground">
        No products are available to scan yet. Sync your catalogue first, then come back to find variants.
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-md border border-border/60 bg-white p-5">
      <div className="flex items-center justify-between gap-4 rounded-md bg-gray-50 p-3">
        <div>
          <p className="text-sm font-medium text-foreground">Scan all products</p>
          <p className="text-xs text-muted-foreground">Look across your whole catalogue ({scope?.totalProducts ?? 0} products).</p>
        </div>
        <Switch checked={allProducts} onCheckedChange={setAllProducts} />
      </div>

      <Section title="Categories" options={scope?.categories ?? []} selected={categories} toggle={toggle(categories, setCategories)} disabled={allProducts} />
      <Section title="Brands" options={scope?.brands ?? []} selected={brands} toggle={toggle(brands, setBrands)} disabled={allProducts} />

      <div className="flex flex-col items-start justify-between gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{selectedCount}</span> product{selectedCount === 1 ? "" : "s"} selected for analysis
        </p>
        <Button
          onClick={() => onScan({ categories: [...categories], brands: [...brands], all_products: allProducts })}
          disabled={!canScan}
        >
          {starting ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          Find variants
        </Button>
      </div>
    </div>
  );
}
