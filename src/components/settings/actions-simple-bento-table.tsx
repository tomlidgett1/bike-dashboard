"use client";

import * as React from "react";
import { useUserProfile } from "@/components/providers/profile-provider";
import { AlertCircle, CheckCircle2, ChevronDown, Loader2, Pencil, RefreshCw, Sparkles, X } from "@/components/layout/app-sidebar/dashboard-icons";
import { LightspeedLogo } from "@/components/genie/lightspeed-logo";
import { useDismissibleIds } from "@/components/settings/bento-inbox-item-actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  saveProductBrand,
  suggestProductBrand,
  suggestProductBrandsBatch,
} from "@/lib/missing-brands/client";
import type { BrandSuggestion, MissingBrandProduct } from "@/lib/missing-brands/types";
import {
  fetchMissingCategoryProducts,
  saveProductCategory,
  suggestProductCategory,
  suggestProductCategoriesBatch,
} from "@/lib/missing-categories/client";
import type {
  CategorySuggestion,
  LightspeedCategoryOption,
  MissingCategoryProduct,
} from "@/lib/missing-categories/types";
import {
  fetchOpenActionsSnapshot,
  readOpenActionsSnapshot,
  updateOpenActionsSnapshot,
  type OpenActionsSnapshot,
} from "@/lib/store/open-actions-client";
import {
  LightspeedActionRequiredPopup,
  SAMPLE_LIGHTSPEED_ACTION,
  type LightspeedActionPreview,
} from "@/components/settings/lightspeed-action-required-popup";
import { notifyOpenActionsChanged } from "@/lib/store/open-actions-events";
import { cn } from "@/lib/utils";

type ActionRowKind = "missing-brand" | "assign-category";

type SimpleActionRow = {
  key: string;
  kind: ActionRowKind;
  sortAt: number;
  title: string;
  subtitle: string;
  detail: string;
  primaryLabel: string;
  brandProduct?: MissingBrandProduct;
  categoryProduct?: MissingCategoryProduct;
  brandSuggestion?: BrandSuggestion | null;
  categorySuggestion?: CategorySuggestion | null;
};

const TYPE_LABELS: Record<ActionRowKind, string> = {
  "missing-brand": "Missing brand",
  "assign-category": "Assign category",
};

const rowPrimaryButtonClass =
  "inline-flex h-8 items-center gap-1.5 rounded-full bg-[#ffde59] px-3 text-xs font-medium text-gray-900 shadow-sm transition-colors hover:bg-[#f0cf45] disabled:cursor-not-allowed disabled:opacity-40";

const rowSecondaryButtonClass =
  "inline-flex h-8 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40";

const rowIconButtonClass =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:opacity-40";

const rowDismissButtonClass =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40";

function SourceIcon() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center">
      <LightspeedLogo className="h-7 w-7" />
    </span>
  );
}

function buildRows({
  brandProducts,
  categoryProducts,
  brandSuggestions,
  categorySuggestions,
}: {
  brandProducts: MissingBrandProduct[];
  categoryProducts: MissingCategoryProduct[];
  brandSuggestions: Record<string, BrandSuggestion | null>;
  categorySuggestions: Record<string, CategorySuggestion | null>;
}): SimpleActionRow[] {
  const rows: SimpleActionRow[] = [];

  for (const product of brandProducts) {
    const suggestion = brandSuggestions[product.id] ?? product.suggestion ?? null;
    rows.push({
      key: `missing-brand:${product.id}`,
      kind: "missing-brand",
      sortAt: 0,
      title: product.name,
      subtitle: product.sku,
      detail: product.preview,
      primaryLabel: "Add brand",
      brandProduct: product,
      brandSuggestion: suggestion,
    });
  }

  for (const product of categoryProducts) {
    const suggestion = categorySuggestions[product.id] ?? product.suggestion ?? null;
    rows.push({
      key: `assign-category:${product.id}`,
      kind: "assign-category",
      sortAt: 0,
      title: product.name,
      subtitle: [product.sku, product.brand].filter(Boolean).join(" · "),
      detail: product.preview,
      primaryLabel: "Assign category",
      categoryProduct: product,
      categorySuggestion: suggestion,
    });
  }

  return rows.sort((a, b) => {
    if (a.sortAt !== b.sortAt) return b.sortAt - a.sortAt;
    return a.title.localeCompare(b.title);
  });
}

function SuggestionChip({ value, onEdit }: { value: string; onEdit: () => void }) {
  return (
    <button
      type="button"
      onClick={onEdit}
      title={`Edit — ${value}`}
      className="group inline-flex max-w-full items-center gap-1.5 rounded-md border border-gray-200 bg-white py-1 pl-2 pr-1.5 text-left transition-colors hover:border-gray-300 hover:bg-gray-50"
    >
      <Sparkles className="h-3 w-3 shrink-0 text-gray-400" />
      <span className="truncate text-xs font-medium text-gray-900">{value}</span>
      <Pencil className="h-3 w-3 shrink-0 text-gray-300 transition-colors group-hover:text-gray-500" />
    </button>
  );
}

function SuggestionCell({ row, onEdit }: { row: SimpleActionRow; onEdit: () => void }) {
  if (row.kind === "missing-brand") {
    const brand = row.brandSuggestion?.brand?.trim();
    return brand ? (
      <SuggestionChip value={brand} onEdit={onEdit} />
    ) : (
      <span className="text-xs text-gray-400">No suggestion yet</span>
    );
  }

  if (row.kind === "assign-category") {
    const label = row.categorySuggestion?.categoryLabel?.trim();
    return label ? (
      <SuggestionChip value={label} onEdit={onEdit} />
    ) : (
      <span className="text-xs text-gray-400">No suggestion yet</span>
    );
  }

  return <p className="line-clamp-2 text-[13px] leading-relaxed text-gray-600">{row.detail}</p>;
}

function CatalogEditRow({
  row,
  categories,
  brandValue,
  categoryId,
  onBrandChange,
  onCategoryChange,
  onSuggest,
  onSave,
  onCancel,
  saving,
  suggesting,
  categoriesLoading,
  error,
}: {
  row: SimpleActionRow;
  categories: LightspeedCategoryOption[];
  brandValue: string;
  categoryId: string;
  onBrandChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onSuggest: () => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  suggesting: boolean;
  categoriesLoading: boolean;
  error: string | null;
}) {
  const isBrand = row.kind === "missing-brand";
  const selectedCategoryLabel =
    categories.find((category) => category.categoryId === categoryId)?.label ?? null;
  const canSave = isBrand ? Boolean(brandValue.trim()) : Boolean(categoryId.trim());
  const inputId = `catalog-edit-${row.key}`;

  return (
    <TableRow className="border-border/50 bg-gray-50/60 hover:bg-gray-50/60">
      <TableCell colSpan={3} className="px-4 py-3 md:px-5">
        <div className="rounded-md border border-gray-200 bg-white p-3 shadow-sm">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor={inputId} className="text-[11px] font-medium text-gray-500">
                {isBrand ? "Brand name" : "Lightspeed category"}
              </label>
              {isBrand ? (
                <input
                  id={inputId}
                  type="text"
                  value={brandValue}
                  onChange={(event) => onBrandChange(event.target.value)}
                  disabled={saving}
                  placeholder="Enter brand…"
                  className="mt-1.5 h-8 w-full rounded-full border border-input bg-white px-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-[3px] focus:ring-ring/30 disabled:opacity-60"
                />
              ) : (
                <div className="relative mt-1.5">
                  <select
                    id={inputId}
                    value={categoryId}
                    onChange={(event) => onCategoryChange(event.target.value)}
                    disabled={saving || categoriesLoading}
                    className="h-8 w-full appearance-none rounded-full border border-input bg-white py-1 pl-2.5 pr-8 text-sm outline-none transition-colors focus:border-ring focus:ring-[3px] focus:ring-ring/30 disabled:opacity-60"
                  >
                    <option value="" disabled>
                      {categoriesLoading ? "Loading categories…" : "Select a category…"}
                    </option>
                    {categories.map((category) => (
                      <option key={category.categoryId} value={category.categoryId}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>
              )}
              {!isBrand && selectedCategoryLabel ? (
                <p className="mt-1 text-[11px] text-gray-500">Selected: {selectedCategoryLabel}</p>
              ) : null}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onSuggest}
                disabled={saving || suggesting}
                className={rowSecondaryButtonClass}
              >
                {suggesting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Suggest
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={saving || !canSave}
                className={rowPrimaryButtonClass}
              >
                {saving ? "Saving…" : isBrand ? "Save brand" : "Save category"}
              </button>
              <button
                type="button"
                onClick={onCancel}
                disabled={saving}
                aria-label="Cancel"
                title="Cancel"
                className={rowDismissButtonClass}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {error ? <p className="mt-2 text-[11px] text-red-600">{error}</p> : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

export function ActionsSimpleBentoTable({ className }: { className?: string }) {
  const { isDismissed, dismiss, ignoringId } = useDismissibleIds();
  const { profile } = useUserProfile();
  const cacheScope = profile?.user_id || null;

  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [brandProducts, setBrandProducts] = React.useState<MissingBrandProduct[]>([]);
  const [categoryProducts, setCategoryProducts] = React.useState<MissingCategoryProduct[]>([]);
  const [brandSuggestions, setBrandSuggestions] = React.useState<Record<string, BrandSuggestion | null>>({});
  const [categorySuggestions, setCategorySuggestions] = React.useState<
    Record<string, CategorySuggestion | null>
  >({});
  const [approvingKey, setApprovingKey] = React.useState<string | null>(null);
  const [categoryOptions, setCategoryOptions] = React.useState<LightspeedCategoryOption[]>([]);
  const [categoryOptionsLoading, setCategoryOptionsLoading] = React.useState(false);
  const [editingKey, setEditingKey] = React.useState<string | null>(null);
  const [editBrandValue, setEditBrandValue] = React.useState("");
  const [editCategoryId, setEditCategoryId] = React.useState("");
  const [editSaving, setEditSaving] = React.useState(false);
  const [editSuggesting, setEditSuggesting] = React.useState(false);
  const [editError, setEditError] = React.useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewAction, setPreviewAction] = React.useState<LightspeedActionPreview | null>(null);

  const loadBrandSuggestions = React.useCallback(async (productIds: string[]) => {
    if (productIds.length === 0) return;
    try {
      const data = await suggestProductBrandsBatch(productIds);
      const next: Record<string, BrandSuggestion | null> = {};
      for (const entry of data.suggestions ?? []) {
        next[entry.productId] = entry.brand
          ? {
              brand: entry.brand,
              manufacturerId: entry.manufacturerId,
              confidence: entry.confidence,
              source: entry.source,
            }
          : null;
      }
      setBrandSuggestions((current) => ({ ...current, ...next }));
    } catch (error) {
      console.error("[ActionsSimpleBentoTable] brand suggest failed:", error);
    }
  }, []);

  const loadCategorySuggestions = React.useCallback(async (productIds: string[]) => {
    if (productIds.length === 0) return;
    try {
      const data = await suggestProductCategoriesBatch(productIds);
      const next: Record<string, CategorySuggestion | null> = {};
      for (const entry of data.suggestions ?? []) {
        next[entry.productId] = entry.categoryId
          ? {
              categoryId: entry.categoryId,
              categoryLabel: entry.categoryLabel,
              confidence: entry.confidence,
              source: entry.source,
            }
          : null;
      }
      setCategorySuggestions((current) => ({ ...current, ...next }));
    } catch (error) {
      console.error("[ActionsSimpleBentoTable] category suggest failed:", error);
    }
  }, []);

  const applySnapshot = React.useCallback(
    (snapshot: OpenActionsSnapshot) => {
      setBrandProducts(snapshot.brandProducts);
      setCategoryProducts(snapshot.categoryProducts);
      setCategoryOptions(snapshot.categoryOptions);

      const seededBrands: Record<string, BrandSuggestion | null> = {};
      const uncachedBrandIds: string[] = [];
      for (const item of snapshot.brandProducts) {
        if (item.suggestion !== undefined) {
          seededBrands[item.id] = item.suggestion;
        } else {
          uncachedBrandIds.push(item.id);
        }
      }
      setBrandSuggestions(seededBrands);
      void loadBrandSuggestions(uncachedBrandIds);

      const seededCategories: Record<string, CategorySuggestion | null> = {};
      const uncachedCategoryIds: string[] = [];
      for (const item of snapshot.categoryProducts) {
        if (item.suggestion !== undefined) {
          seededCategories[item.id] = item.suggestion;
        } else {
          uncachedCategoryIds.push(item.id);
        }
      }
      setCategorySuggestions(seededCategories);
      void loadCategorySuggestions(uncachedCategoryIds);
    },
    [loadBrandSuggestions, loadCategorySuggestions],
  );

  const load = React.useCallback(
    async (options?: { refresh?: boolean }) => {
      if (!cacheScope) return;
      if (options?.refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setLoadError(null);

      try {
        const snapshot = await fetchOpenActionsSnapshot(cacheScope);
        applySnapshot(snapshot);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Could not load actions.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [applySnapshot, cacheScope],
  );

  React.useEffect(() => {
    if (!cacheScope) return;
    const cached = readOpenActionsSnapshot(cacheScope);
    if (cached) {
      applySnapshot(cached);
      setLoading(false);
    } else {
      setBrandProducts([]);
      setCategoryProducts([]);
      setCategoryOptions([]);
      setLoading(true);
    }
    void load({ refresh: Boolean(cached) });
  }, [applySnapshot, cacheScope, load]);

  const ensureCategoryOptions = React.useCallback(async () => {
    if (categoryOptions.length > 0 || categoryOptionsLoading) return;
    setCategoryOptionsLoading(true);
    try {
      const data = await fetchMissingCategoryProducts(1);
      const options = data.categories ?? [];
      setCategoryOptions(options);
      if (cacheScope) {
        updateOpenActionsSnapshot(cacheScope, (current) => ({
          ...current,
          categoryOptions: options,
        }));
      }
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Could not load categories.");
    } finally {
      setCategoryOptionsLoading(false);
    }
  }, [cacheScope, categoryOptions.length, categoryOptionsLoading]);

  async function handleApproveBrand(row: SimpleActionRow) {
    const product = row.brandProduct;
    const brand =
      editingKey === row.key
        ? editBrandValue.trim()
        : row.brandSuggestion?.brand?.trim();
    if (!product || !brand || approvingKey) return;

    setApprovingKey(row.key);
    try {
      await saveProductBrand(product.id, brand);
      setBrandProducts((current) => current.filter((item) => item.id !== product.id));
      dismiss(row.key);
      if (editingKey === row.key) {
        closeCatalogEdit();
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to save brand.");
    } finally {
      setApprovingKey(null);
    }
  }

  async function handleApproveCategory(row: SimpleActionRow) {
    const product = row.categoryProduct;
    const categoryId =
      editingKey === row.key
        ? editCategoryId.trim()
        : row.categorySuggestion?.categoryId?.trim();
    if (!product || !categoryId || approvingKey) return;

    setApprovingKey(row.key);
    try {
      await saveProductCategory(product.id, categoryId);
      setCategoryProducts((current) => current.filter((item) => item.id !== product.id));
      dismiss(row.key);
      if (editingKey === row.key) {
        closeCatalogEdit();
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to save category.");
    } finally {
      setApprovingKey(null);
    }
  }

  function closeCatalogEdit() {
    setEditingKey(null);
    setEditBrandValue("");
    setEditCategoryId("");
    setEditError(null);
    setEditSuggesting(false);
  }

  function openBrandEdit(row: SimpleActionRow) {
    const product = row.brandProduct;
    if (!product) return;
    const suggestion = brandSuggestions[product.id] ?? product.suggestion ?? null;
    setEditingKey(row.key);
    setEditBrandValue(suggestion?.brand ?? "");
    setEditCategoryId("");
    setEditError(null);
  }

  function openCategoryEdit(row: SimpleActionRow) {
    const product = row.categoryProduct;
    if (!product) return;
    const suggestion = categorySuggestions[product.id] ?? product.suggestion ?? null;
    setEditingKey(row.key);
    setEditCategoryId(suggestion?.categoryId ?? "");
    setEditBrandValue("");
    setEditError(null);
    void ensureCategoryOptions();
  }

  async function runCatalogSuggest(row: SimpleActionRow) {
    if (editSuggesting) return;

    setEditSuggesting(true);
    setEditError(null);

    try {
      if (row.kind === "missing-brand" && row.brandProduct) {
        const data = await suggestProductBrand(row.brandProduct.id);
        if (data.brand) {
          setEditBrandValue(data.brand);
          setBrandSuggestions((current) => ({
            ...current,
            [row.brandProduct!.id]: {
              brand: data.brand ?? null,
              manufacturerId: data.manufacturerId,
              confidence: data.confidence,
              source: data.source,
            },
          }));
        } else {
          setEditError("Could not confidently suggest a brand. Enter one manually.");
        }
      } else if (row.kind === "assign-category" && row.categoryProduct) {
        const data = await suggestProductCategory(row.categoryProduct.id);
        if (data.categoryId) {
          setEditCategoryId(data.categoryId);
          setCategorySuggestions((current) => ({
            ...current,
            [row.categoryProduct!.id]: {
              categoryId: data.categoryId,
              categoryLabel: data.categoryLabel,
              confidence: data.confidence,
              source: data.source,
            },
          }));
        } else {
          setEditError("Could not confidently suggest a category. Choose one manually.");
        }
      }
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Could not fetch a suggestion.");
    } finally {
      setEditSuggesting(false);
    }
  }

  async function saveCatalogEdit(row: SimpleActionRow) {
    if (editSaving) return;

    setEditSaving(true);
    setEditError(null);

    try {
      if (row.kind === "missing-brand" && row.brandProduct) {
        const brand = editBrandValue.trim();
        if (!brand) return;
        await saveProductBrand(row.brandProduct.id, brand);
        setBrandProducts((current) => current.filter((item) => item.id !== row.brandProduct!.id));
        dismiss(row.key);
        closeCatalogEdit();
      } else if (row.kind === "assign-category" && row.categoryProduct) {
        const categoryId = editCategoryId.trim();
        if (!categoryId) return;
        await saveProductCategory(row.categoryProduct.id, categoryId);
        setCategoryProducts((current) => current.filter((item) => item.id !== row.categoryProduct!.id));
        dismiss(row.key);
        closeCatalogEdit();
      }
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Failed to save changes.");
    } finally {
      setEditSaving(false);
    }
  }

  function openCatalogEdit(row: SimpleActionRow) {
    if (row.kind === "missing-brand") {
      openBrandEdit(row);
      return;
    }
    if (row.kind === "assign-category") {
      openCategoryEdit(row);
    }
  }

  const rows = buildRows({
    brandProducts,
    categoryProducts,
    brandSuggestions,
    categorySuggestions,
  }).filter((row) => !isDismissed(row.key));

  function openRandomActionPreview() {
    const pool = rows.length > 0 ? rows : null;
    const row = pool ? pool[Math.floor(Math.random() * pool.length)] : null;
    const next: LightspeedActionPreview = row
      ? {
          key: row.key,
          kind: row.kind,
          title: row.title,
          subtitle: row.subtitle,
          suggestionLabel:
            row.kind === "missing-brand"
              ? row.brandSuggestion?.brand?.trim() || null
              : row.categorySuggestion?.categoryLabel?.trim() || null,
        }
      : SAMPLE_LIGHTSPEED_ACTION;
    setPreviewAction(next);
    setPreviewOpen(true);
  }

  React.useEffect(() => {
    if (loading) return;
    notifyOpenActionsChanged(rows.length);
  }, [loading, rows.length]);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 bg-gray-50 px-4 py-3 md:px-5">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-foreground">Lightspeed actions</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Fix missing brands and categories in your Lightspeed catalogue.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={openRandomActionPreview}
            className="inline-flex h-9 items-center rounded-md border border-input bg-white px-3 text-xs font-medium text-gray-700 transition-colors hover:bg-muted/40"
          >
            Preview popup
          </button>
          <button
            type="button"
            onClick={() => void load({ refresh: true })}
            disabled={loading || refreshing}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-input bg-white text-muted-foreground transition-colors hover:bg-muted/40 disabled:opacity-50"
            aria-label="Refresh actions"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </button>
        </div>
      </div>

      {loadError ? (
        <div className="border-b border-border/60 bg-white px-4 py-2.5 text-sm text-red-700 md:px-5">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{loadError}</span>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading actions…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
            <p className="text-sm font-medium text-foreground">You&apos;re all caught up</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              No Lightspeed catalogue fixes need attention.
            </p>
          </div>
        ) : (
          <Table className="w-full table-fixed border-collapse">
            <TableHeader className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_0_hsl(var(--border)/0.6)]">
              <TableRow className="border-border/60 hover:bg-transparent">
                <TableHead className="w-[40%] bg-gray-50 pl-4 text-[11px] font-medium text-muted-foreground">
                  Item
                </TableHead>
                <TableHead className="bg-gray-50 text-[11px] font-medium text-muted-foreground">
                  Detail
                </TableHead>
                <TableHead className="w-[220px] bg-gray-50 pr-4 text-right text-[11px] font-medium text-muted-foreground">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const busy = ignoringId === row.key || approvingKey === row.key;
                const isEditing = editingKey === row.key;
                const rowBusy = busy || (isEditing && editSaving);
                const hasSuggestion =
                  row.kind === "missing-brand"
                    ? Boolean(row.brandSuggestion?.brand)
                    : row.kind === "assign-category"
                      ? Boolean(row.categorySuggestion?.categoryId)
                      : false;

                return (
                  <React.Fragment key={row.key}>
                    <TableRow
                      className={cn(
                        "border-border/50 transition-colors hover:bg-muted/20",
                        rowBusy && "pointer-events-none opacity-45",
                        isEditing && "bg-gray-50/60 hover:bg-gray-50/60",
                      )}
                    >
                      <TableCell className="py-3 pl-4 align-top">
                        <div className="flex items-start gap-3">
                          <SourceIcon />
                          <div className="min-w-0">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                              {TYPE_LABELS[row.kind]}
                            </p>
                            <p className="mt-0.5 truncate text-sm font-medium text-gray-900">
                              {row.title}
                            </p>
                            <p className="truncate text-xs text-gray-500">{row.subtitle}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 align-top">
                        <SuggestionCell row={row} onEdit={() => openCatalogEdit(row)} />
                      </TableCell>
                      <TableCell className="py-3 pr-4 align-top text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {hasSuggestion || isEditing ? (
                            <button
                              type="button"
                              onClick={() =>
                                isEditing ? closeCatalogEdit() : openCatalogEdit(row)
                              }
                              disabled={rowBusy}
                              aria-label={isEditing ? "Close editor" : "Edit suggestion"}
                              title={isEditing ? "Close" : "Edit"}
                              className={cn(
                                rowIconButtonClass,
                                isEditing &&
                                  "border-[#f0cf45] bg-[#ffde59] text-gray-900 hover:bg-[#f0cf45] hover:text-gray-900",
                              )}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          {!isEditing && hasSuggestion ? (
                            <button
                              type="button"
                              onClick={() =>
                                void (row.kind === "missing-brand"
                                  ? handleApproveBrand(row)
                                  : handleApproveCategory(row))
                              }
                              disabled={rowBusy}
                              className={rowPrimaryButtonClass}
                            >
                              {approvingKey === row.key ? (
                                "Saving…"
                              ) : (
                                <>
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Approve
                                </>
                              )}
                            </button>
                          ) : null}
                          {!isEditing && !hasSuggestion ? (
                            <button
                              type="button"
                              onClick={() => openCatalogEdit(row)}
                              disabled={rowBusy}
                              className={rowPrimaryButtonClass}
                            >
                              {row.primaryLabel}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => dismiss(row.key)}
                            disabled={rowBusy}
                            aria-label="Dismiss"
                            title="Dismiss"
                            className={rowDismissButtonClass}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isEditing ? (
                      <CatalogEditRow
                        row={row}
                        categories={categoryOptions}
                        brandValue={editBrandValue}
                        categoryId={editCategoryId}
                        onBrandChange={setEditBrandValue}
                        onCategoryChange={setEditCategoryId}
                        onSuggest={() => void runCatalogSuggest(row)}
                        onSave={() => void saveCatalogEdit(row)}
                        onCancel={closeCatalogEdit}
                        saving={editSaving}
                        suggesting={editSuggesting}
                        categoriesLoading={categoryOptionsLoading}
                        error={editError}
                      />
                    ) : null}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
            )}
      </div>

      <LightspeedActionRequiredPopup
        open={previewOpen}
        action={previewAction}
        onClose={() => setPreviewOpen(false)}
        onApprove={() => setPreviewOpen(false)}
        onReject={() => setPreviewOpen(false)}
        onChange={() => setPreviewOpen(false)}
      />
    </div>
  );
}
