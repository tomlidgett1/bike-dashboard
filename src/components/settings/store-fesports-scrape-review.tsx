"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { FEsportsScrapedProduct, FEsportsVariant } from "@/lib/scrapers/fesports-scraper";
import {
  formatStockStatusLabel,
  resolveStockAvailability,
  type StockAvailability,
} from "@/lib/scrapers/fesports-scraper";
import type {
  SupplierImageSourcePreference,
  SupplierImageSourcePreferences,
  SupplierProductMatches,
  SupplierScrapedProduct,
} from "@/lib/scrapers/supplier-types";
import { StoreSupplierPhotoPreview } from "@/components/settings/store-supplier-photo-preview";
import type { SupplierExcludedImages } from "@/components/settings/store-supplier-photo-preview";
import {
  DEFAULT_FIELD_MAPPING,
  YELLOW_JERSEY_PRODUCT_FIELDS,
  applyFieldMapping,
  buildScrapedFieldRecord,
  collectScrapedFieldKeys,
  validateFieldMapping,
  type FieldMapping,
} from "@/lib/scrapers/fesports-field-mapping";
import {
  resolveMarketplaceCategory,
  type SupplierCategoryAssignment,
  type SupplierCategoryOverrides,
} from "@/lib/scrapers/supplier-category";
import {
  assessProductPageReadiness,
  type ProductPageReadiness,
} from "@/lib/scrapers/supplier-readiness";
import {
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_SUBCATEGORIES,
  type MarketplaceCategory,
} from "@/lib/types/marketplace";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Download,
  ImageIcon,
  Search,
} from "@/components/layout/app-sidebar/dashboard-icons";

const EMPTY_OPTION = "__none__";
const NO_CATEGORY_KEY = "__uncategorised__";

function truncateCell(value: string, max = 120): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

function stockBadgeClass(availability: StockAvailability): string {
  if (availability === "in_stock") return "border-gray-300 bg-white text-gray-800";
  if (availability === "out_of_stock") return "border-gray-200 bg-gray-100 text-gray-500";
  return "border-gray-200 bg-white text-gray-500";
}

function StockBadge({
  soh,
  sohRaw,
}: {
  soh: number | null | undefined;
  sohRaw: string | null | undefined;
}) {
  const availability = resolveStockAvailability(soh, sohRaw);
  return (
    <span
      className={cn(
        "inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
        stockBadgeClass(availability),
      )}
      title={sohRaw ?? undefined}
    >
      {formatStockStatusLabel(soh, sohRaw)}
    </span>
  );
}

function VariantSummaryCell({ product }: { product: FEsportsScrapedProduct }) {
  const [expanded, setExpanded] = React.useState(false);

  if (product.variants.length === 0) {
    return <StockBadge soh={product.soh} sohRaw={product.sohRaw} />;
  }

  const inStock = product.variants.filter(
    (variant) => resolveStockAvailability(variant.soh, variant.sohRaw) === "in_stock",
  ).length;

  return (
    <div className="min-w-[180px] space-y-1.5">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex items-center gap-1 text-xs font-medium text-gray-700 hover:text-gray-900"
      >
        <ChevronDown
          className={cn("h-3 w-3 transition-transform", expanded ? "rotate-180" : "")}
        />
        {product.variants.length} variant{product.variants.length === 1 ? "" : "s"} · {inStock} in
        stock
      </button>
      {expanded ? (
        <div className="space-y-1">
          {product.variants.map((variant, index) => (
            <VariantRow
              key={`${variant.sku ?? variant.optionValue ?? "variant"}-${index}`}
              variant={variant}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function VariantRow({ variant }: { variant: FEsportsVariant }) {
  const value = variant.optionValue?.trim() || "Unnamed variant";
  const label = variant.optionName?.trim() ? `${variant.optionName.trim()}: ${value}` : value;

  return (
    <div className="flex items-start justify-between gap-2 rounded-md border border-gray-200 bg-white px-2 py-1.5">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-gray-900" title={label}>
          {label}
        </p>
        <p className="truncate text-[10px] text-gray-500">
          {[variant.sku ? `SKU ${variant.sku}` : null, variant.price ? variant.price : null]
            .filter(Boolean)
            .join(" · ") || "No SKU"}
        </p>
      </div>
      <StockBadge soh={variant.soh} sohRaw={variant.sohRaw} />
    </div>
  );
}

function ReadinessCell({ readiness }: { readiness: ProductPageReadiness }) {
  if (readiness.ready) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-gray-700"
        title={readiness.notes.join("\n") || undefined}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        Ready
        {readiness.notes.length > 0 ? (
          <span className="text-gray-400">· {readiness.notes.length} tip{readiness.notes.length === 1 ? "" : "s"}</span>
        ) : null}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-start gap-1 text-xs text-gray-600"
      title={[...readiness.gaps, ...readiness.notes].join("\n")}
    >
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="max-w-[150px]">{readiness.gaps.join(", ")}</span>
    </span>
  );
}

type StatusFilter = "all" | "new" | "changed" | "unchanged" | "attention";

interface StoreFesportsScrapeReviewProps {
  products: FEsportsScrapedProduct[];
  selectedIds: Set<string>;
  onToggleProduct: (productId: string) => void;
  onToggleAll: () => void;
  onCreateListings: (
    mapping: FieldMapping,
    imagePreferences?: SupplierImageSourcePreferences,
    categoryOverrides?: SupplierCategoryOverrides,
  ) => void;
  isCreating: boolean;
  sourceName?: string;
  initialFieldMapping?: FieldMapping;
  productMatches?: SupplierProductMatches;
  actionLabel?: string;
  onFieldMappingChange?: (mapping: FieldMapping) => void;
  /** Show the "Product categories" panel that maps supplier categories onto YJ vocabulary. */
  enableCategoryAssignment?: boolean;
  showPhotoPreview?: boolean;
  supplierPhotoLabel?: string;
  alternatePhotoSourceName?: string;
  imagePreferences?: SupplierImageSourcePreferences;
  onImagePreferenceChange?: (
    productId: string,
    preference: SupplierImageSourcePreference,
  ) => void;
  onApplyImagePreferenceToAll?: (preference: SupplierImageSourcePreference) => void;
  isFetchingAlternatePhotos?: boolean;
  onRefreshAlternatePhotos?: () => void;
  excludedImages?: SupplierExcludedImages;
  onRemoveImage?: (productId: string, imageUrl: string) => void;
  onRestoreImage?: (productId: string, imageUrl: string) => void;
}

export function StoreFesportsScrapeReview({
  products,
  selectedIds,
  onToggleProduct,
  onToggleAll,
  onCreateListings,
  isCreating,
  sourceName = "FEsports",
  initialFieldMapping = DEFAULT_FIELD_MAPPING,
  productMatches,
  actionLabel = "Import",
  onFieldMappingChange,
  enableCategoryAssignment = false,
  showPhotoPreview = false,
  supplierPhotoLabel,
  alternatePhotoSourceName,
  imagePreferences,
  onImagePreferenceChange,
  onApplyImagePreferenceToAll,
  isFetchingAlternatePhotos = false,
  onRefreshAlternatePhotos,
  excludedImages,
  onRemoveImage,
  onRestoreImage,
}: StoreFesportsScrapeReviewProps) {
  const [fieldMapping, setFieldMapping] = React.useState<FieldMapping>({
    ...initialFieldMapping,
  });
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [search, setSearch] = React.useState("");
  const [showRawFields, setShowRawFields] = React.useState(false);
  const [mappingOpen, setMappingOpen] = React.useState<boolean | null>(null);
  const [categoryOverrides, setCategoryOverrides] = React.useState<
    Record<string, SupplierCategoryAssignment>
  >({});

  const scrapedFieldKeys = React.useMemo(() => collectScrapedFieldKeys(products), [products]);
  const rawFieldKeys = React.useMemo(
    () => scrapedFieldKeys.filter((key) => key !== "variants"),
    [scrapedFieldKeys],
  );
  const selectedProducts = products.filter((product) => selectedIds.has(product.productId));
  const mappingErrors = React.useMemo(
    () => validateFieldMapping(fieldMapping, selectedProducts),
    [fieldMapping, selectedProducts],
  );
  const totalVariants = React.useMemo(
    () => products.reduce((sum, product) => sum + product.variants.length, 0),
    [products],
  );
  const mappedFieldCount = YELLOW_JERSEY_PRODUCT_FIELDS.filter(
    (field) => fieldMapping[field.key],
  ).length;
  const isMappingOpen = mappingOpen ?? mappingErrors.length > 0;

  const rows = React.useMemo(
    () =>
      products.map((product) => {
        const fields = buildScrapedFieldRecord(product);
        const mapped = applyFieldMapping(product, fieldMapping);
        const rawCategoryKey = mapped.marketplace_category?.trim() || NO_CATEGORY_KEY;
        return {
          product,
          fields,
          mapped,
          rawCategoryKey,
          readiness: assessProductPageReadiness(
            product as SupplierScrapedProduct,
            fieldMapping,
            imagePreferences,
            excludedImages,
          ),
        };
      }),
    [products, fieldMapping, imagePreferences, excludedImages],
  );

  // One assignment per distinct supplier category value, guessed from the
  // first product in the group and overridable by the store owner.
  const categoryGroups = React.useMemo(() => {
    if (!enableCategoryAssignment) return [];
    const groups = new Map<
      string,
      { rawLabel: string; count: number; guess: SupplierCategoryAssignment; confident: boolean }
    >();
    for (const row of rows) {
      const existing = groups.get(row.rawCategoryKey);
      if (existing) {
        existing.count += 1;
        continue;
      }
      const resolved = resolveMarketplaceCategory({
        rawCategory: row.mapped.marketplace_category,
        rawSubcategory: row.mapped.marketplace_subcategory,
        name: row.mapped.display_name,
        description: row.mapped.product_description,
      });
      groups.set(row.rawCategoryKey, {
        rawLabel:
          row.rawCategoryKey === NO_CATEGORY_KEY ? "No supplier category" : row.rawCategoryKey,
        count: 1,
        guess: { category: resolved.category, subcategory: resolved.subcategory },
        confident: resolved.confident,
      });
    }
    return [...groups.entries()].map(([key, group]) => ({ key, ...group }));
  }, [rows, enableCategoryAssignment]);

  const effectiveAssignment = React.useCallback(
    (rawKey: string): SupplierCategoryAssignment => {
      const override = categoryOverrides[rawKey];
      if (override) return override;
      const group = categoryGroups.find((candidate) => candidate.key === rawKey);
      return group?.guess ?? { category: "Parts", subcategory: "Other" };
    },
    [categoryOverrides, categoryGroups],
  );

  const setAssignment = (rawKey: string, assignment: SupplierCategoryAssignment) => {
    setCategoryOverrides((current) => ({ ...current, [rawKey]: assignment }));
  };

  const filteredRows = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter === "attention" && row.readiness.ready) return false;
      if (
        (statusFilter === "new" || statusFilter === "changed" || statusFilter === "unchanged") &&
        (productMatches?.[row.product.productId]?.status ?? "new") !== statusFilter
      ) {
        return false;
      }
      if (!query) return true;
      return [row.mapped.display_name, row.mapped.brand, row.mapped.system_sku]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [rows, statusFilter, search, productMatches]);

  const readyCount = rows.filter(
    (row) => selectedIds.has(row.product.productId) && row.readiness.ready,
  ).length;
  const attentionCount = rows.filter((row) => !row.readiness.ready).length;
  const matchCounts = React.useMemo(() => {
    if (!productMatches) return null;
    const values = Object.values(productMatches);
    return {
      new: values.filter((match) => match.status === "new").length,
      changed: values.filter((match) => match.status === "changed").length,
      unchanged: values.filter((match) => match.status === "unchanged").length,
    };
  }, [productMatches]);

  const updateMapping = (targetKey: string, sourceKey: string | null) => {
    setFieldMapping((current) => {
      const next = { ...current, [targetKey]: sourceKey };
      onFieldMappingChange?.(next);
      return next;
    });
  };

  const handleImport = () => {
    let overrides: SupplierCategoryOverrides | undefined;
    if (enableCategoryAssignment) {
      overrides = {};
      for (const row of rows) {
        if (!selectedIds.has(row.product.productId)) continue;
        overrides[row.product.productId] = effectiveAssignment(row.rawCategoryKey);
      }
    }
    onCreateListings(fieldMapping, imagePreferences, overrides);
  };

  const statusFilters: Array<{ id: StatusFilter; label: string; disabled?: boolean }> = [
    { id: "all", label: `All ${products.length}` },
    ...(matchCounts
      ? ([
          { id: "new", label: `New ${matchCounts.new}` },
          { id: "changed", label: `Changed ${matchCounts.changed}` },
          { id: "unchanged", label: `Unchanged ${matchCounts.unchanged}` },
        ] as Array<{ id: StatusFilter; label: string }>)
      : []),
    { id: "attention", label: `Needs attention ${attentionCount}` },
  ];

  return (
    <div className="space-y-4">
      {/* ── Field mapping (collapsible) ─────────────────────────────── */}
      <div className="rounded-md border border-gray-200 bg-white">
        <button
          type="button"
          onClick={() => setMappingOpen(!isMappingOpen)}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        >
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Field mapping</h3>
            <p className="mt-0.5 text-sm text-gray-600">
              {mappingErrors.length > 0
                ? mappingErrors[0]
                : `${mappedFieldCount} of ${YELLOW_JERSEY_PRODUCT_FIELDS.length} Yellow Jersey fields filled from ${sourceName}.`}
            </p>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-gray-500 transition-transform",
              isMappingOpen ? "rotate-180" : "",
            )}
          />
        </button>
        {isMappingOpen ? (
          <div className="border-t border-gray-200 px-5 py-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {YELLOW_JERSEY_PRODUCT_FIELDS.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">
                    {field.label}
                    {field.required ? <span className="text-gray-500"> *</span> : null}
                  </label>
                  <Select
                    value={fieldMapping[field.key] ?? EMPTY_OPTION}
                    onValueChange={(value) =>
                      updateMapping(field.key, value === EMPTY_OPTION ? null : value)
                    }
                  >
                    <SelectTrigger className="rounded-md">
                      <SelectValue placeholder={`Select ${sourceName} field`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EMPTY_OPTION}>Leave empty</SelectItem>
                      {scrapedFieldKeys.map((key) => (
                        <SelectItem key={key} value={key}>
                          {key}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {field.description ? (
                    <p className="text-xs text-gray-500">{field.description}</p>
                  ) : null}
                </div>
              ))}
            </div>
            {mappingErrors.length > 0 ? (
              <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                {mappingErrors.map((message) => (
                  <p key={message}>{message}</p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ── Category assignment ─────────────────────────────────────── */}
      {enableCategoryAssignment && categoryGroups.length > 0 ? (
        <div className="rounded-md border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-5 py-4">
            <h3 className="text-sm font-semibold text-gray-900">Product categories</h3>
            <p className="mt-0.5 text-sm text-gray-600">
              Supplier categories are matched to Yellow Jersey categories so products appear in
              storefront and marketplace browsing. Adjust any guesses before import.
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {categoryGroups.map((group) => {
              const assignment = effectiveAssignment(group.key);
              return (
                <div
                  key={group.key}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900" title={group.rawLabel}>
                      {group.rawLabel}
                    </p>
                    <p className="text-xs text-gray-500">
                      {group.count} product{group.count === 1 ? "" : "s"}
                      {!group.confident && !categoryOverrides[group.key] ? " · guessed" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={assignment.category}
                      onValueChange={(value) =>
                        setAssignment(group.key, {
                          category: value as MarketplaceCategory,
                          subcategory: MARKETPLACE_SUBCATEGORIES[
                            value as MarketplaceCategory
                          ].includes(assignment.subcategory)
                            ? assignment.subcategory
                            : "Other",
                        })
                      }
                    >
                      <SelectTrigger className="w-[140px] rounded-md">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MARKETPLACE_CATEGORIES.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={assignment.subcategory}
                      onValueChange={(value) =>
                        setAssignment(group.key, { ...assignment, subcategory: value })
                      }
                    >
                      <SelectTrigger className="w-[150px] rounded-md">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MARKETPLACE_SUBCATEGORIES[assignment.category].map((subcategory) => (
                          <SelectItem key={subcategory} value={subcategory}>
                            {subcategory}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ── Product table ────────────────────────────────────────────── */}
      <div className="rounded-md border border-gray-200 bg-white">
        <div className="space-y-3 border-b border-gray-200 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Products</h3>
              <p className="text-sm text-gray-600">
                {products.length} scraped
                {totalVariants > 0 ? ` · ${totalVariants} variants` : ""} ·{" "}
                {selectedProducts.length} selected · {readyCount} page-ready
              </p>
            </div>
            <Button variant="outline" className="rounded-md" onClick={onToggleAll}>
              {selectedIds.size === products.length ? "Deselect all" : "Select all"}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, SKU, brand"
                className="h-8 w-56 rounded-md pl-8 text-xs"
              />
            </div>
            <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
              {statusFilters.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setStatusFilter(filter.id)}
                  className={cn(
                    "px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
                    statusFilter === filter.id
                      ? "text-gray-800 bg-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-200/70",
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowRawFields((current) => !current)}
              className="text-xs font-medium text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline"
            >
              {showRawFields ? "Hide raw scraped fields" : "Show raw scraped fields"}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === products.length && products.length > 0}
                    onChange={onToggleAll}
                  />
                </th>
                <th className="sticky left-10 z-10 min-w-[240px] bg-gray-50 px-4 py-3 font-medium text-gray-700">
                  Product
                </th>
                {productMatches ? (
                  <th className="px-4 py-3 font-medium text-gray-700">Status</th>
                ) : null}
                <th className="min-w-[150px] px-4 py-3 font-medium text-gray-700">Page readiness</th>
                <th className="px-4 py-3 font-medium text-gray-700">Brand</th>
                {enableCategoryAssignment ? (
                  <th className="px-4 py-3 font-medium text-gray-700">Category</th>
                ) : null}
                <th className="px-4 py-3 font-medium text-gray-700">Price</th>
                <th className="min-w-[180px] px-4 py-3 font-medium text-gray-700">Stock</th>
                <th className="px-4 py-3 font-medium text-gray-700">Photos</th>
                {showRawFields
                  ? rawFieldKeys.map((key) => (
                      <th key={key} className="min-w-[160px] px-4 py-3 font-medium text-gray-700">
                        {key}
                      </th>
                    ))
                  : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filteredRows.map(({ product, fields, mapped, readiness, rawCategoryKey }) => {
                const isSelected = selectedIds.has(product.productId);
                const thumbnail = product.heroImageUrl ?? product.imageUrls[0] ?? null;
                const assignment = enableCategoryAssignment
                  ? effectiveAssignment(rawCategoryKey)
                  : null;
                return (
                  <tr
                    key={product.productId}
                    className={cn(isSelected ? "bg-gray-50" : "hover:bg-gray-50/60")}
                  >
                    <td className="sticky left-0 z-10 bg-inherit px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleProduct(product.productId)}
                      />
                    </td>
                    <td className="sticky left-10 z-10 max-w-[280px] bg-inherit px-4 py-3">
                      <div className="flex items-center gap-3">
                        {thumbnail ? (
                          <img
                            src={thumbnail}
                            alt=""
                            loading="lazy"
                            className="h-10 w-10 shrink-0 rounded-md border border-gray-200 object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dashed border-gray-200 text-gray-400">
                            <ImageIcon className="h-4 w-4" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p
                            className="truncate font-medium text-gray-900"
                            title={mapped.display_name}
                          >
                            {truncateCell(mapped.display_name, 80)}
                          </p>
                          <p className="truncate text-[11px] text-gray-500">
                            {mapped.system_sku ? `SKU ${mapped.system_sku}` : "No SKU"}
                          </p>
                        </div>
                      </div>
                    </td>
                    {productMatches ? (
                      <td className="px-4 py-3">
                        <span className="text-gray-700">
                          {productMatches[product.productId]?.status ?? "new"}
                        </span>
                        {productMatches[product.productId]?.changes.length ? (
                          <p className="mt-1 max-w-[200px] text-[11px] text-gray-500">
                            {productMatches[product.productId].changes.join(", ")}
                          </p>
                        ) : null}
                      </td>
                    ) : null}
                    <td className="px-4 py-3">
                      <ReadinessCell readiness={readiness} />
                    </td>
                    <td className="max-w-[140px] px-4 py-3 text-gray-700">
                      <span title={mapped.brand ?? ""}>
                        {mapped.brand ? truncateCell(mapped.brand, 40) : "Not set"}
                      </span>
                    </td>
                    {assignment ? (
                      <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                        {assignment.category} · {assignment.subcategory}
                      </td>
                    ) : null}
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                      {mapped.price > 0 ? `$${mapped.price.toFixed(2)}` : "Not set"}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <VariantSummaryCell product={product} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                      {readiness.imageCount}
                    </td>
                    {showRawFields
                      ? rawFieldKeys.map((key) => {
                          const value = fields[key] ?? "";
                          return (
                            <td key={key} className="max-w-[280px] px-4 py-3 text-gray-600">
                              <span title={value}>{truncateCell(value)}</span>
                            </td>
                          );
                        })
                      : null}
                  </tr>
                );
              })}
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={9 + (showRawFields ? rawFieldKeys.length : 0)}
                    className="px-4 py-8 text-center text-sm text-gray-500"
                  >
                    No products match this filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Photo comparison ─────────────────────────────────────────── */}
      {showPhotoPreview &&
      imagePreferences &&
      onImagePreferenceChange &&
      onApplyImagePreferenceToAll &&
      alternatePhotoSourceName ? (
        <StoreSupplierPhotoPreview
          products={products as SupplierScrapedProduct[]}
          selectedIds={selectedIds}
          supplierLabel={supplierPhotoLabel ?? sourceName}
          alternateSourceName={alternatePhotoSourceName}
          imagePreferences={imagePreferences}
          excludedImages={excludedImages}
          onImagePreferenceChange={onImagePreferenceChange}
          onApplyToAll={onApplyImagePreferenceToAll}
          onRemoveImage={onRemoveImage}
          onRestoreImage={onRestoreImage}
          isLoading={isFetchingAlternatePhotos}
        />
      ) : null}

      {/* ── Sticky import bar ────────────────────────────────────────── */}
      <div className="sticky bottom-0 z-20 -mx-1 rounded-md border border-gray-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-600">
            <span className="font-medium text-gray-900">{selectedProducts.length}</span> of{" "}
            {products.length} products selected · {readyCount} page-ready
            {mappingErrors.length > 0 ? " · fix field mapping to import" : ""}
          </p>
          <div className="flex items-center gap-2">
            {onRefreshAlternatePhotos && showPhotoPreview ? (
              <Button
                variant="outline"
                className="rounded-md"
                onClick={onRefreshAlternatePhotos}
                disabled={isFetchingAlternatePhotos || selectedProducts.length === 0}
              >
                {isFetchingAlternatePhotos ? "Matching photos…" : "Refresh official photos"}
              </Button>
            ) : null}
            <Button
              className="rounded-md"
              onClick={handleImport}
              disabled={!selectedProducts.length || isCreating || mappingErrors.length > 0}
            >
              <Download className="h-4 w-4" />
              {actionLabel} {selectedProducts.length} product
              {selectedProducts.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
