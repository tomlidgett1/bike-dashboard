"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  CheckCircle2,
  Loader2,
  Search,
  Package,
  Tag,
  Wand2,
  X,
  PenLine,
  Zap,
  ListChecks,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { BULK_OPTIMISE_STORAGE_KEY } from "@/lib/optimize/bulk-optimise-session";
import {
  StoreProductContentTable,
  type DescriptionProduct,
  type GenerateMode,
  type GenState,
} from "@/components/settings/store-product-content-table";

const MODE_CONFIG: Record<GenerateMode, { label: string; icon: React.ReactNode }> = {
  both: { label: "Description & Specs", icon: <Sparkles className="h-3 w-3" /> },
  description: { label: "Description only", icon: <PenLine className="h-3 w-3" /> },
  specs: { label: "Specs only", icon: <ListChecks className="h-3 w-3" /> },
}

// ── Main component ────────────────────────────────────────────────────────
export function StoreProductDescriptionsManager() {
  const router = useRouter();
  const [products, setProducts] = React.useState<DescriptionProduct[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [brandFilter, setBrandFilter] = React.useState('all');
  const [mode, setMode] = React.useState<GenerateMode>('both');
  const [filter, setFilter] = React.useState<'all' | 'needs' | 'has'>('all');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [genStates, setGenStates] = React.useState<Record<string, GenState>>({});
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());
  const abortRef = React.useRef<AbortController | null>(null);
  const backfillRan = React.useRef(false);

  const fetchProducts = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/products?pageSize=500&status=active');
      if (res.ok) {
        const data = await res.json();
        return (data.products ?? []).filter((p: DescriptionProduct) => p.is_active) as DescriptionProduct[];
      }
    } catch (err) {
      console.error('Failed to fetch products:', err);
    } finally {
      setLoading(false);
    }
    return [];
  }, []);

  React.useEffect(() => {
    (async () => {
      const loaded = await fetchProducts();
      setProducts(loaded);

      // Auto-backfill manufacturer names if any products are missing brands
      if (!backfillRan.current && loaded.some(p => !p.brand)) {
        backfillRan.current = true;
        try {
          await fetch('/api/lightspeed/backfill-manufacturer-names', { method: 'POST' });
          // Reload after backfill to show updated brands
          const refreshed = await fetchProducts();
          setProducts(refreshed);
        } catch (e) {
          console.error('Backfill failed:', e);
        }
      }
    })();
  }, [fetchProducts]);

  const stats = React.useMemo(() => {
    const total = products.length;
    const withBoth = products.filter(p => p.product_description && p.product_specs).length;
    const missingDesc = products.filter(p => !p.product_description).length;
    const missingSpecs = products.filter(p => !p.product_specs).length;
    const needsAny = products.filter(p => !p.product_description || !p.product_specs).length;
    return { total, withBoth, missingDesc, missingSpecs, needsAny };
  }, [products]);

  const brands = React.useMemo(() => {
    const unique = new Set<string>();
    for (const product of products) {
      const brand = product.brand?.trim();
      if (brand) unique.add(brand);
    }
    return [...unique].sort((a, b) => a.localeCompare(b));
  }, [products]);

  const filtered = React.useMemo(() => {
    let list = products;
    if (brandFilter !== 'all') {
      list = brandFilter === '__none__'
        ? list.filter(p => !p.brand?.trim())
        : list.filter(p => p.brand?.trim() === brandFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        (p.display_name || p.description).toLowerCase().includes(q) ||
        p.brand?.toLowerCase().includes(q) ||
        p.marketplace_category?.toLowerCase().includes(q) ||
        p.marketplace_subcategory?.toLowerCase().includes(q) ||
        p.category_name?.toLowerCase().includes(q) ||
        p.full_category_path?.toLowerCase().includes(q) ||
        p.custom_sku?.toLowerCase().includes(q) ||
        p.system_sku?.toLowerCase().includes(q)
      );
    }
    if (filter === 'needs') list = list.filter(p => !p.product_description || !p.product_specs);
    if (filter === 'has') list = list.filter(p => !!p.product_description && !!p.product_specs);
    return list;
  }, [products, search, brandFilter, filter]);

  // Products that need content based on the current mode
  const needsContentIds = React.useMemo(() => {
    return products.filter(p => {
      if (mode === 'description') return !p.product_description
      if (mode === 'specs')       return !p.product_specs
      return !p.product_description || !p.product_specs
    }).map(p => p.id)
  }, [products, mode]);

  const toggleSelect = (id: string) => {
    if (isGenerating) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleVisibleSelection = (ids: string[], shouldSelect: boolean) => {
    if (isGenerating) return;
    setSelected(prev => {
      const next = new Set(prev);
      for (const id of ids) {
        if (shouldSelect) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const generateDescriptions = async (ids: string[], overrideMode?: GenerateMode) => {
    if (!ids.length || isGenerating) return;
    const activeMode = overrideMode ?? mode;
    setIsGenerating(true);
    setSelected(new Set());
    abortRef.current = new AbortController();

    setGenStates(prev => {
      const next = { ...prev };
      for (const id of ids) {
        next[id] = { status: 'searching', description: null, specs: null, error: null };
      }
      return next;
    });

    try {
      const res = await fetch('/api/products/generate-product-descriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: ids, mode: activeMode }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) throw new Error('Failed to start generation');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            handleEvent(event);
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Generation error:', err);
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
      const refreshed = await fetchProducts();
      setProducts(refreshed);
    }
  };

  const handleEvent = (event: Record<string, unknown>) => {
    const id = event.productId as string;

    if (event.event === 'product_start') {
      setGenStates(prev => ({
        ...prev,
        [id]: { status: 'searching', description: null, specs: null, error: null },
      }));
    }

    if (event.event === 'product_phase') {
      const phase = event.phase as string;
      setGenStates(prev => ({
        ...prev,
        [id]: {
          ...(prev[id] ?? { description: null, specs: null, error: null }),
          status: phase === 'specs' ? 'writing_specs' : 'writing_desc',
        },
      }));
    }

    if (event.event === 'product_complete') {
      const description = event.description as string | null;
      const specs = event.specs as string | null;
      setGenStates(prev => ({
        ...prev,
        [id]: {
          status: event.success ? 'done' : 'error',
          description,
          specs,
          error: event.error as string | null,
        },
      }));
      if (event.success) {
        setExpandedIds(prev => new Set([...prev, id]));
        setProducts(prev =>
          prev.map(p => p.id === id
            ? {
                ...p,
                ...(description ? { product_description: description } : {}),
                ...(specs ? { product_specs: specs } : {}),
              }
            : p
          )
        );
      }
    }
  };

  const stopGeneration = () => { abortRef.current?.abort(); };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="py-16 text-center">
        <Package className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm font-medium text-muted-foreground">No active products found</p>
        <p className="text-xs text-muted-foreground mt-1">Sync your inventory to get started</p>
      </div>
    );
  }

  const coveragePct = stats.total > 0
    ? Math.round((stats.withBoth / stats.total) * 100)
    : 0;

  const summaryItems = [
    { label: "Total products", value: stats.total.toLocaleString(), detail: `${filtered.length.toLocaleString()} shown` },
    { label: "Content complete", value: stats.withBoth.toLocaleString(), detail: `${coveragePct}% AI coverage` },
    { label: "Needs content", value: stats.needsAny.toLocaleString(), detail: `${stats.missingDesc} descriptions, ${stats.missingSpecs} specs` },
  ];

  const filterTabs: Array<{ id: typeof filter; label: string; count: number; icon: React.ReactNode }> = [
    { id: "all", label: "All", count: stats.total, icon: <Package className="h-3 w-3" /> },
    { id: "needs", label: "Needs content", count: stats.needsAny, icon: <Zap className="h-3 w-3" /> },
    { id: "has", label: "Complete", count: stats.withBoth, icon: <CheckCircle2 className="h-3 w-3" /> },
  ];

  return (
    <div className="space-y-0">
      <div className="space-y-4 px-6 py-5">
        <div className="grid gap-2 md:grid-cols-3">
          {summaryItems.map((item) => (
            <div key={item.label} className="rounded-md border border-border bg-background px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-xl font-semibold tracking-tight text-foreground">{item.value}</p>
                </div>
                <Badge variant="outline" className="rounded-md border-border bg-background text-[10px] text-muted-foreground">
                  {item.detail}
                </Badge>
              </div>
            </div>
          ))}
        </div>

        {stats.total > 0 ? (
          <div>
            <div className="mb-1 flex justify-between">
              <span className="text-xs text-muted-foreground">Full AI content coverage</span>
              <span className="text-xs font-medium text-foreground">{coveragePct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-md bg-muted">
              <motion.div
                className="h-full rounded-md bg-foreground"
                initial={{ width: 0 }}
                animate={{ width: `${coveragePct}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Generate</p>
            <div className="flex w-fit items-center rounded-md bg-gray-100 p-0.5">
              {(Object.keys(MODE_CONFIG) as GenerateMode[]).map((nextMode) => (
                <button
                  key={nextMode}
                  type="button"
                  onClick={() => setMode(nextMode)}
                  disabled={isGenerating}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    mode === nextMode
                      ? "bg-white text-gray-800 shadow-sm"
                      : "text-gray-600 hover:bg-gray-200/70 disabled:opacity-50"
                  )}
                >
                  {MODE_CONFIG[nextMode].icon}
                  {MODE_CONFIG[nextMode].label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-2 lg:flex-row lg:items-center xl:max-w-3xl">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name, SKU, brand or category..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-8 rounded-md pl-8 text-xs"
              />
            </div>
            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger size="sm" className="h-8 w-full rounded-md text-xs lg:w-44">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Tag className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <SelectValue placeholder="All brands" />
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All brands</SelectItem>
                <SelectItem value="__none__">No brand</SelectItem>
                {brands.map((brand) => (
                  <SelectItem key={brand} value={brand}>
                    {brand}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {needsContentIds.length > 0 && !isGenerating ? (
              <Button onClick={() => generateDescriptions(needsContentIds)} size="sm" className="rounded-md whitespace-nowrap">
                <Zap className="size-4" />
                Generate Missing ({needsContentIds.length})
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex w-fit items-center rounded-md bg-gray-100 p-0.5">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={cn(
                "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                filter === tab.id ? "bg-white text-gray-800 shadow-sm" : "text-gray-600 hover:bg-gray-200/70"
              )}
            >
              {tab.icon}
              {tab.label}
              <span className="font-mono text-[10px] text-muted-foreground">{tab.count.toLocaleString()}</span>
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {selected.size > 0 && !isGenerating ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="overflow-hidden border-t border-border/60"
          >
            <div className="mx-6 my-3 flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2">
              <span className="text-xs font-medium text-foreground">{selected.size} selected</span>
              <Button
                size="xs"
                onClick={() => {
                  const ids = Array.from(selected);
                  try {
                    sessionStorage.setItem(BULK_OPTIMISE_STORAGE_KEY, JSON.stringify(ids));
                  } catch { /* storage unavailable */ }
                  router.push('/settings/store/products/optimise');
                }}
                className="rounded-md"
              >
                <Wand2 className="size-3.5" />
                Optimise ({selected.size})
              </Button>
              <Button size="xs" variant="outline" onClick={() => generateDescriptions(Array.from(selected))} className="rounded-md">
                <Sparkles className="size-3.5" />
                Generate selected ({MODE_CONFIG[mode].label.toLowerCase()})
              </Button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="ml-auto rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Clear selected products"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isGenerating ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="overflow-hidden border-t border-border/60"
          >
            <div className="mx-6 my-3 flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Generating {MODE_CONFIG[mode].label.toLowerCase()} with AI...
              </div>
              <button
                type="button"
                onClick={stopGeneration}
                className="rounded-md px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                Stop
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <StoreProductContentTable
        products={filtered}
        selected={selected}
        genStates={genStates}
        expandedIds={expandedIds}
        mode={mode}
        isGenerating={isGenerating}
        onToggleSelect={toggleSelect}
        onToggleVisibleSelection={toggleVisibleSelection}
        onToggleExpand={toggleExpand}
        onGenerate={(ids) => generateDescriptions(ids)}
      />
    </div>
  );
}
