"use client";

import * as React from "react";
import {
  AlertCircle,
  Ban,
  Check,
  FileText,
  ListChecks,
  Loader2,
  RefreshCw,
  Sparkles,
  StopCircle,
  Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  OptimiseBulkBar,
  OptimiseCenteredState,
  OptimiseList,
  OptimiseLoadingState,
  OptimiseSearchInput,
  OptimiseSegmentedControl,
  OptimiseSubToolbar,
  OptimiseToolbar,
} from "@/components/optimize/optimize-layout";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/dashboard";
import {
  CategoryPicker,
  DEFAULT_OPTIMIZER_PRODUCT_LIMIT,
  EmptyCategoryPrompt,
  formatOptimizerProductCount,
  hasDesc,
  hasSpecs,
  hasTitle,
  type CopyField,
  type OptimizerProduct,
  type OptimizerProductLimit,
  type OptimizerProductScope,
  type TextStep,
  OptimizerScopeTabs,
  ProductLimitPicker,
  productLabel,
  readSSE,
  useOptimizerCategories,
  useOptimizerProducts,
  useRejectedProducts,
} from "@/components/optimize/optimizer-shared";

type CopyFilter = "all" | "title" | "description" | "specs";

type RowRun = Record<CopyField, TextStep>;

const emptyText = (): TextStep => ({ status: "idle" });
const emptyRun = (): RowRun => ({
  title: emptyText(),
  description: emptyText(),
  specs: emptyText(),
});

function missingFields(p: OptimizerProduct): CopyField[] {
  const out: CopyField[] = [];
  if (!hasTitle(p)) out.push("title");
  if (!hasDesc(p)) out.push("description");
  if (!hasSpecs(p)) out.push("specs");
  return out;
}

function rowStatus(run: RowRun | undefined): "idle" | "running" | "done" | "error" {
  if (!run) return "idle";
  const steps = [run.title, run.description, run.specs];
  if (steps.some((s) => s.status === "error")) return "error";
  if (steps.some((s) => s.status === "running" || s.status === "queued")) return "running";
  if (steps.every((s) => s.status === "idle")) return "idle";
  if (steps.some((s) => s.status === "done")) return "done";
  return "idle";
}

export function CopyQueue({ fixedScope }: { fixedScope?: OptimizerProductScope }) {
  const { categories, loadingCats } = useOptimizerCategories();
  const [scope, setScope] = React.useState<OptimizerProductScope>(fixedScope ?? "catalogue");
  const [category, setCategory] = React.useState("");
  const [productLimit, setProductLimit] = React.useState<OptimizerProductLimit>(
    DEFAULT_OPTIMIZER_PRODUCT_LIMIT,
  );
  const { products, setProducts, loading, loadProducts, totalInCategory } =
    useOptimizerProducts(category, productLimit, scope);
  const { rejectedIds, rejectProduct } = useRejectedProducts();

  const [search, setSearch] = React.useState("");
  const [gapFilter, setGapFilter] = React.useState<CopyFilter>("all");
  const [fields, setFields] = React.useState<Record<CopyField, boolean>>({
    title: true,
    description: true,
    specs: false,
  });
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [runs, setRuns] = React.useState<Record<string, RowRun>>({});
  const [running, setRunning] = React.useState(false);
  const [bicycleOverrides, setBicycleOverrides] = React.useState<Record<string, boolean>>({});
  const [bicycleSaving, setBicycleSaving] = React.useState<Set<string>>(new Set());
  const [aiBicycleHints, setAiBicycleHints] = React.useState<
    Record<string, "high" | "medium" | "low">
  >({});

  const abortRef = React.useRef<AbortController | null>(null);

  const onScopeChange = (next: OptimizerProductScope) => {
    setScope(next);
    setCategory("");
    setSelected(new Set());
    setRuns({});
  };

  const onCategoryChange = (cat: string) => {
    setCategory(cat);
    setSelected(new Set());
    setRuns({});
  };

  const onProductLimitChange = (limit: OptimizerProductLimit) => {
    setProductLimit(limit);
    setSelected(new Set());
    setRuns({});
  };

  const setText = React.useCallback(
    (id: string, key: CopyField, patch: Partial<TextStep>) =>
      setRuns((prev) => {
        const cur = prev[id] ?? emptyRun();
        return { ...prev, [id]: { ...cur, [key]: { ...cur[key], ...patch } } };
      }),
    [],
  );

  const runTitles = React.useCallback(
    async (ids: string[]) => {
      ids.forEach((id) => setText(id, "title", { status: "running", detail: "Cleaning title" }));
      try {
        const res = await fetch("/api/products/generate-titles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productIds: ids }),
          signal: abortRef.current?.signal,
        });
        if (!res.ok || !res.body) throw new Error("Failed to start title generation");
        await readSSE(res.body, (event) => {
          const id = event.productId as string;
          if (!id || event.event !== "product_complete") return;
          const title = (event.title as string | null) ?? null;
          if (event.success && title) {
            setProducts((prev) =>
              prev.map((p) => (p.id === id ? { ...p, display_name: title } : p)),
            );
            setText(id, "title", { status: "done" });
          } else {
            setText(id, "title", { status: "error", detail: (event.error as string) || "Failed" });
          }
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        ids.forEach((id) => setText(id, "title", { status: "error", detail: "Generation failed" }));
      }
    },
    [setText, setProducts],
  );

  const runDescriptions = React.useCallback(
    async (ids: string[], mode: "both" | "description" | "specs") => {
      const doDesc = mode === "both" || mode === "description";
      const doSpecs = mode === "both" || mode === "specs";
      const overrides = Object.fromEntries(
        ids
          .filter((id) => id in bicycleOverrides)
          .map((id) => [id, bicycleOverrides[id]]),
      );
      ids.forEach((id) => {
        if (doDesc) setText(id, "description", { status: "running", detail: "Writing" });
        if (doSpecs) setText(id, "specs", { status: "running", detail: "Writing" });
      });
      try {
        const res = await fetch("/api/products/generate-product-descriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productIds: ids, mode, bicycleOverrides: overrides }),
          signal: abortRef.current?.signal,
        });
        if (!res.ok || !res.body) throw new Error("Failed to start generation");
        await readSSE(res.body, (event) => {
          const id = event.productId as string;
          if (!id) return;
          if (event.event === "product_complete") {
            if (event.bicycle_detected) {
              const isBicycle = event.is_bicycle as boolean | undefined;
              const bikeSpecs = event.bike_specs;
              const confidence = event.bicycle_confidence as
                | "high"
                | "medium"
                | "low"
                | undefined;

              if (typeof isBicycle === "boolean") {
                setProducts((prev) =>
                  prev.map((p) =>
                    p.id === id
                      ? {
                          ...p,
                          is_bicycle: isBicycle,
                          ...(bikeSpecs ? { bike_specs: bikeSpecs } : {}),
                        }
                      : p,
                  ),
                );
              }
              if (confidence) {
                setAiBicycleHints((prev) => ({ ...prev, [id]: confidence }));
              }
            }

            if (event.success) {
              const description = (event.description as string | null) ?? null;
              const specs = (event.specs as string | null) ?? null;
              setProducts((prev) =>
                prev.map((p) =>
                  p.id === id
                    ? {
                        ...p,
                        product_description: description ?? p.product_description,
                        product_specs: specs ?? p.product_specs,
                      }
                    : p,
                ),
              );
              if (doDesc) setText(id, "description", { status: "done" });
              if (doSpecs) setText(id, "specs", { status: "done" });
            } else {
              const detail = (event.error as string) || "Failed";
              if (doDesc) setText(id, "description", { status: "error", detail });
              if (doSpecs) setText(id, "specs", { status: "error", detail });
            }
          }
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        ids.forEach((id) => {
          if (doDesc) setText(id, "description", { status: "error", detail: "Generation failed" });
          if (doSpecs) setText(id, "specs", { status: "error", detail: "Generation failed" });
        });
      }
    },
    [setText, setProducts, bicycleOverrides],
  );

  const toggleBicycle = React.useCallback(
    async (product: OptimizerProduct, nextValue: boolean) => {
      if (bicycleSaving.has(product.id)) return;

      setBicycleSaving((prev) => new Set(prev).add(product.id));
      setBicycleOverrides((prev) => ({ ...prev, [product.id]: nextValue }));
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, is_bicycle: nextValue } : p)),
      );

      try {
        const res = await fetch(`/api/products/${product.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_bicycle: nextValue }),
        });
        if (!res.ok) throw new Error("Failed to update bicycle flag");
        const data = await res.json();
        if (data.product) {
          setProducts((prev) =>
            prev.map((p) => (p.id === product.id ? { ...p, ...data.product } : p)),
          );
        }
      } catch {
        setProducts((prev) =>
          prev.map((p) =>
            p.id === product.id ? { ...p, is_bicycle: !!product.is_bicycle } : p,
          ),
        );
        setBicycleOverrides((prev) => {
          const next = { ...prev };
          delete next[product.id];
          return next;
        });
      } finally {
        setBicycleSaving((prev) => {
          const next = new Set(prev);
          next.delete(product.id);
          return next;
        });
      }
    },
    [bicycleSaving, setProducts],
  );

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (rejectedIds.has(p.id)) return false;
      if (q) {
        const match =
          productLabel(p).toLowerCase().includes(q) ||
          (p.brand || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      if (gapFilter === "all") return missingFields(p).length > 0;
      if (gapFilter === "title") return !hasTitle(p);
      if (gapFilter === "description") return !hasDesc(p);
      if (gapFilter === "specs") return !hasSpecs(p);
      return true;
    });
  }, [products, search, rejectedIds, gapFilter]);

  const counts = React.useMemo(() => {
    const active = products.filter((p) => !rejectedIds.has(p.id));
    return {
      title: active.filter((p) => !hasTitle(p)).length,
      description: active.filter((p) => !hasDesc(p)).length,
      specs: active.filter((p) => !hasSpecs(p)).length,
    };
  }, [products, rejectedIds]);

  const activeFields = (Object.keys(fields) as CopyField[]).filter((f) => fields[f]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (filtered.every((p) => selected.has(p.id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((p) => p.id)));
    }
  };

  const handleGenerate = async () => {
    const ids = filtered.filter((p) => selected.has(p.id)).map((p) => p.id);
    if (ids.length === 0 || activeFields.length === 0) return;

    setRunning(true);
    abortRef.current = new AbortController();

    setRuns((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        const cur = next[id] ?? emptyRun();
        next[id] = {
          ...cur,
          ...(fields.title ? { title: { status: "queued" as const } } : {}),
          ...(fields.description ? { description: { status: "queued" as const } } : {}),
          ...(fields.specs ? { specs: { status: "queued" as const } } : {}),
        };
      }
      return next;
    });

    if (fields.title) {
      await runTitles(ids);
    }
    if (fields.description && fields.specs) await runDescriptions(ids, "both");
    else if (fields.description) await runDescriptions(ids, "description");
    else if (fields.specs) await runDescriptions(ids, "specs");

    setRunning(false);
    abortRef.current = null;
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  const showScopeTabs = !fixedScope;

  if (scope === "catalogue" && !category) {
    if (loadingCats) {
      return (
        <div className="space-y-6">
          {showScopeTabs && <OptimizerScopeTabs scope={scope} onChange={onScopeChange} />}
          <OptimiseLoadingState label="Loading categories…" />
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {showScopeTabs && <OptimizerScopeTabs scope={scope} onChange={onScopeChange} />}
        <EmptyCategoryPrompt
          loadingCats={loadingCats}
          category={category}
          categories={categories}
          onChange={onCategoryChange}
          title="AI copy for your catalogue"
          description="Choose a category, select products, and generate titles and descriptions in one batch."
        />
      </div>
    );
  }

  const categoryMeta = categories.find((c) => c.id === category);
  const showCataloguePicker = scope === "catalogue";

  return (
    <div>
      <OptimiseToolbar>
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          {showScopeTabs && (
            <OptimizerScopeTabs scope={scope} disabled={running} onChange={onScopeChange} />
          )}
          {showCataloguePicker ? (
            <CategoryPicker
              category={category}
              categories={categories}
              loadingCats={loadingCats}
              disabled={running}
              onChange={onCategoryChange}
              className="h-9 w-full rounded-md sm:w-[min(100%,280px)]"
            />
          ) : (
            <span className="text-sm text-muted-foreground shrink-0">
              {scope === "private_listing"
                ? "Private listings"
                : "Manual / CSV·image imports"}
            </span>
          )}
          <ProductLimitPicker
            limit={productLimit}
            disabled={running || loading}
            onChange={onProductLimitChange}
          />
          {!loading && products.length > 0 ? (
            <span className="text-sm text-muted-foreground tabular-nums shrink-0">
              {formatOptimizerProductCount(products.length, totalInCategory)}
            </span>
          ) : (scope === "csv_image" || scope === "private_listing") && totalInCategory != null ? (
            <span className="text-sm text-muted-foreground tabular-nums shrink-0">
              {totalInCategory}{" "}
              {scope === "private_listing" ? "private" : "manual"} listing
              {totalInCategory === 1 ? "" : "s"}
            </span>
          ) : categoryMeta && category !== "all" ? (
            <span className="text-sm text-muted-foreground tabular-nums shrink-0">
              {categoryMeta.count} in category
            </span>
          ) : null}
        </div>
        <OptimiseSearchInput value={search} onChange={setSearch} />
      </OptimiseToolbar>

      {(scope === "csv_image" || scope === "private_listing" || category) && !loading && (
        <>
          <OptimiseSubToolbar>
            <div className="min-w-0 space-y-2">
              <p className="text-xs text-muted-foreground">
                Choose fields to generate for selected products. Results save automatically.
              </p>
              <ToggleGroup
                type="multiple"
                variant="outline"
                size="sm"
                spacing={2}
                disabled={running}
                value={activeFields}
                onValueChange={(values) => {
                  setFields({
                    title: values.includes("title"),
                    description: values.includes("description"),
                    specs: values.includes("specs"),
                  });
                }}
                className="flex-wrap"
              >
                {(
                  [
                    { key: "title" as const, label: "Titles", icon: Type, count: counts.title },
                    {
                      key: "description" as const,
                      label: "Descriptions",
                      icon: FileText,
                      count: counts.description,
                    },
                    { key: "specs" as const, label: "Specs", icon: ListChecks, count: counts.specs },
                  ] as const
                ).map(({ key, label, icon: Icon, count }) => (
                  <ToggleGroupItem key={key} value={key} aria-label={label} className="gap-1.5 px-3">
                    <Icon />
                    {label}
                    <span className="text-xs font-normal text-muted-foreground tabular-nums">
                      ({count} missing)
                    </span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <OptimiseSegmentedControl
              value={gapFilter}
              onChange={setGapFilter}
              items={[
                { id: "all" as const, label: "Any gap" },
                { id: "title" as const, label: "Missing title", count: counts.title },
                { id: "description" as const, label: "Missing description", count: counts.description },
                { id: "specs" as const, label: "Missing specs", count: counts.specs },
              ]}
            />
          </OptimiseSubToolbar>

          <OptimiseBulkBar>
            <div className="flex items-center gap-3">
              <Checkbox
                checked={filtered.length > 0 && filtered.every((p) => selected.has(p.id))}
                onCheckedChange={toggleSelectAll}
                disabled={running || filtered.length === 0}
                aria-label="Select all"
              />
              <span className="text-sm text-muted-foreground">
                {selected.size > 0
                  ? `${selected.size} selected`
                  : `${filtered.length} products with gaps`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={loading || running}
                onClick={() => void loadProducts(category, productLimit, scope)}
              >
                <RefreshCw className={cn("size-4", loading && "animate-spin")} />
              </Button>
              {running ? (
                <Button variant="outline" size="sm" onClick={handleStop}>
                  <StopCircle className="size-4" />
                  Stop
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={selected.size === 0 || activeFields.length === 0}
                  onClick={() => void handleGenerate()}
                >
                  <Sparkles className="size-4" />
                  Generate
                  {selected.size > 0 ? ` (${selected.size})` : ""}
                </Button>
              )}
            </div>
          </OptimiseBulkBar>
        </>
      )}

      {loading ? (
        <OptimiseLoadingState />
      ) : products.length === 0 && (scope === "csv_image" || scope === "private_listing") ? (
        <OptimiseCenteredState>
          <StatusBadge
            label={
              scope === "private_listing"
                ? "No private listings yet"
                : "No CSV/Image products yet"
            }
            tone="neutral"
          />
          <p className="mt-3 max-w-md text-sm text-muted-foreground">
            {scope === "private_listing"
              ? "Create private listings in Products first, then return here to optimise titles and descriptions."
              : "Import a CSV and create listings first. They will appear here as manual products ready for titles and descriptions."}
          </p>
        </OptimiseCenteredState>
      ) : filtered.length === 0 ? (
        <OptimiseCenteredState>
          <StatusBadge label="Copy complete" tone="success" />
          <p className="mt-3 max-w-md text-sm text-muted-foreground">
            {scope === "csv_image"
              ? "Every CSV/Image import in this batch already has the selected fields filled."
              : scope === "private_listing"
                ? "Every private listing in this batch already has the selected fields filled."
                : "Every product in this view already has the selected fields filled."}
          </p>
        </OptimiseCenteredState>
      ) : (
        <OptimiseList>
          <div className="hidden border-b border-border/60 py-2 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[minmax(0,1fr)_72px_80px_80px_80px_100px] sm:gap-3">
            <span>Product</span>
            <span className="text-center">Bike</span>
            <span className="text-center">Title</span>
            <span className="text-center">Desc</span>
            <span className="text-center">Specs</span>
            <span className="text-right">Status</span>
          </div>
            {filtered.map((p) => {
              const run = runs[p.id] ?? emptyRun();
              const status = rowStatus(run);
              const name = productLabel(p);
              const bicycleChecked =
                p.id in bicycleOverrides ? bicycleOverrides[p.id] : !!p.is_bicycle;
              const aiHint = aiBicycleHints[p.id];
              const bicycleBusy = bicycleSaving.has(p.id);

              return (
                <div
                  key={p.id}
                  className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_72px_80px_80px_80px_100px] sm:items-center sm:gap-3"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <Checkbox
                      className="mt-0.5"
                      checked={selected.has(p.id)}
                      disabled={running}
                      onCheckedChange={() => toggleSelect(p.id)}
                      aria-label={`Select ${name}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{name}</p>
                      <p className="truncate text-xs text-muted-foreground">{p.brand || "—"}</p>
                    </div>
                    <button
                      type="button"
                      title="Exclude"
                      disabled={running}
                      onClick={() => void rejectProduct(p.id)}
                      className="shrink-0 rounded-md p-1 text-muted-foreground/40 hover:text-destructive"
                    >
                      <Ban className="size-4" />
                    </button>
                  </div>

                  <div className="flex flex-col items-center justify-center gap-1">
                    <Checkbox
                      checked={bicycleChecked}
                      disabled={running || bicycleBusy}
                      onCheckedChange={(checked) =>
                        void toggleBicycle(p, checked === true)
                      }
                      aria-label={bicycleChecked ? "Mark as not a bicycle" : "Mark as bicycle"}
                    />
                    {aiHint ? (
                      <span className="hidden text-[10px] text-muted-foreground sm:inline">
                        AI
                      </span>
                    ) : null}
                  </div>

                  <FieldCell done={hasTitle(p)} run={run.title} />
                  <FieldCell done={hasDesc(p)} run={run.description} />
                  <FieldCell done={hasSpecs(p)} run={run.specs} />

                  <div className="flex justify-end sm:block">
                    {status === "running" && (
                      <StatusBadge label="Generating…" tone="neutral" />
                    )}
                    {status === "done" && <StatusBadge label="Updated" tone="success" />}
                    {status === "error" && <StatusBadge label="Failed" tone="danger" />}
                    {status === "idle" && missingFields(p).length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {missingFields(p).length} gap{missingFields(p).length === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
        </OptimiseList>
      )}
    </div>
  );
}

function FieldCell({ done, run }: { done: boolean; run: TextStep }) {
  if (run.status === "running" || run.status === "queued") {
    return (
      <div className="flex justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (run.status === "error") {
    return (
      <div className="flex justify-center">
        <AlertCircle className="size-4 text-destructive" />
      </div>
    );
  }
  if (done || run.status === "done") {
    return (
      <div className="flex justify-center">
        <Check className="size-4 text-emerald-600" />
      </div>
    );
  }
  return (
    <div className="flex justify-center">
      <span className="size-1.5 rounded-full bg-muted-foreground/30" />
    </div>
  );
}
