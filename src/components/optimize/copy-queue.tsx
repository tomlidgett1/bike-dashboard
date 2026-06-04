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
  Search,
  Sparkles,
  StopCircle,
  Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/dashboard";
import {
  CategoryPicker,
  EmptyCategoryPrompt,
  hasDesc,
  hasSpecs,
  hasTitle,
  type CopyField,
  type OptimizerProduct,
  type TextStep,
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

export function CopyQueue() {
  const { categories, loadingCats } = useOptimizerCategories();
  const [category, setCategory] = React.useState("");
  const { products, setProducts, loading, loadProducts } = useOptimizerProducts(category);
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

  const abortRef = React.useRef<AbortController | null>(null);

  const onCategoryChange = (cat: string) => {
    setCategory(cat);
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
      ids.forEach((id) => {
        if (doDesc) setText(id, "description", { status: "running", detail: "Writing" });
        if (doSpecs) setText(id, "specs", { status: "running", detail: "Writing" });
      });
      try {
        const res = await fetch("/api/products/generate-product-descriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productIds: ids, mode }),
          signal: abortRef.current?.signal,
        });
        if (!res.ok || !res.body) throw new Error("Failed to start generation");
        await readSSE(res.body, (event) => {
          const id = event.productId as string;
          if (!id) return;
          if (event.event === "product_complete") {
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
    [setText, setProducts],
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

    const jobs: Promise<unknown>[] = [];
    if (fields.title) jobs.push(runTitles(ids));
    if (fields.description && fields.specs) jobs.push(runDescriptions(ids, "both"));
    else if (fields.description) jobs.push(runDescriptions(ids, "description"));
    else if (fields.specs) jobs.push(runDescriptions(ids, "specs"));

    await Promise.all(jobs);
    setRunning(false);
    abortRef.current = null;
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  if (!category && !loadingCats) {
    return (
      <EmptyCategoryPrompt
        loadingCats={loadingCats}
        category={category}
        categories={categories}
        onChange={onCategoryChange}
        title="AI copy for your catalogue"
        description="Choose a category, select products, and generate titles and descriptions in one batch."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-md border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <CategoryPicker
          category={category}
          categories={categories}
          loadingCats={loadingCats}
          disabled={running}
          onChange={onCategoryChange}
          className="h-9 w-full rounded-md sm:w-[220px]"
        />
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className="rounded-md pl-9"
          />
        </div>
      </div>

      {category && !loading && (
        <>
          <div className="rounded-md border bg-white p-4">
            <p className="text-sm font-medium text-foreground">Generate</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Choose which fields to fill for selected products. Results save automatically.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
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
                <button
                  key={key}
                  type="button"
                  disabled={running}
                  onClick={() => setFields((prev) => ({ ...prev, [key]: !prev[key] }))}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                    fields[key]
                      ? "border-gray-300 bg-white text-foreground shadow-sm"
                      : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-md border",
                      fields[key] ? "border-gray-400 bg-gray-50" : "border-gray-300 bg-transparent",
                    )}
                    aria-hidden
                  >
                    {fields[key] ? <Check className="size-3 text-gray-800" /> : null}
                  </span>
                  <Icon className="size-3.5" />
                  {label}
                  <span className="text-[11px] tabular-nums opacity-70">({count} missing)</span>
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1 rounded-md bg-gray-100 p-0.5 w-fit">
              {(
                [
                  { id: "all" as const, label: "Any gap" },
                  { id: "title" as const, label: "Missing title", count: counts.title },
                  { id: "description" as const, label: "Missing description", count: counts.description },
                  { id: "specs" as const, label: "Missing specs", count: counts.specs },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setGapFilter(tab.id)}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
                    gapFilter === tab.id
                      ? "text-gray-800 bg-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-200/70",
                  )}
                >
                  {tab.label}
                  {"count" in tab && (tab.count ?? 0) > 0 && (
                    <span className="tabular-nums text-[10px] opacity-70">({tab.count})</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-white px-4 py-3">
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
                onClick={() => void loadProducts(category)}
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
          </div>
        </>
      )}

      {loading ? (
        <div className="flex items-center justify-center rounded-md border bg-white py-16">
          <Loader2 className="size-7 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border bg-white p-8 text-center">
          <StatusBadge label="Copy complete" tone="success" />
          <p className="mt-3 text-sm text-muted-foreground">
            Every product in this view already has the selected fields filled.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border bg-white">
          <div className="hidden border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[minmax(0,1fr)_80px_80px_80px_100px] sm:gap-3">
            <span>Product</span>
            <span className="text-center">Title</span>
            <span className="text-center">Desc</span>
            <span className="text-center">Specs</span>
            <span className="text-right">Status</span>
          </div>
          <div className="divide-y divide-border/60">
            {filtered.map((p) => {
              const run = runs[p.id] ?? emptyRun();
              const status = rowStatus(run);
              const name = productLabel(p);

              return (
                <div
                  key={p.id}
                  className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_80px_80px_80px_100px] sm:items-center sm:gap-3"
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
          </div>
        </div>
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
