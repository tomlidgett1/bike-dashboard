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
import { Download } from "@/components/layout/app-sidebar/dashboard-icons";

const EMPTY_OPTION = "__none__";

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

function VariantRows({ product }: { product: FEsportsScrapedProduct }) {
  if (product.variants.length === 0) {
    return (
      <div className="space-y-1">
        <p className="text-[11px] text-gray-500">No variants</p>
        <StockBadge soh={product.soh} sohRaw={product.sohRaw} />
      </div>
    );
  }

  const optionNames = [
    ...new Set(
      product.variants
        .map((variant) => variant.optionName?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  const singleOptionName = optionNames.length === 1 ? optionNames[0] : null;

  return (
    <div className="min-w-[220px] space-y-1.5">
      {singleOptionName ? (
        <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
          {singleOptionName}
        </p>
      ) : null}
      <div className="space-y-1">
        {product.variants.map((variant, index) => (
          <VariantRow
            key={`${variant.sku ?? variant.optionValue ?? "variant"}-${index}`}
            variant={variant}
            showOptionName={!singleOptionName}
          />
        ))}
      </div>
      <p className="text-[10px] text-gray-500">
        {product.variants.length} variant{product.variants.length === 1 ? "" : "s"} ·{" "}
        {
          product.variants.filter(
            (variant) => resolveStockAvailability(variant.soh, variant.sohRaw) === "in_stock",
          ).length
        }{" "}
        in stock
      </p>
    </div>
  );
}

function VariantRow({
  variant,
  showOptionName,
}: {
  variant: FEsportsVariant;
  showOptionName: boolean;
}) {
  const value = variant.optionValue?.trim() || "Unnamed variant";
  const label =
    showOptionName && variant.optionName?.trim()
      ? `${variant.optionName.trim()}: ${value}`
      : value;

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

interface StoreFesportsScrapeReviewProps {
  products: FEsportsScrapedProduct[];
  selectedIds: Set<string>;
  onToggleProduct: (productId: string) => void;
  onToggleAll: () => void;
  onCreateListings: (
    mapping: FieldMapping,
    imagePreferences?: SupplierImageSourcePreferences,
  ) => void;
  isCreating: boolean;
  sourceName?: string;
  initialFieldMapping?: FieldMapping;
  productMatches?: SupplierProductMatches;
  actionLabel?: string;
  onFieldMappingChange?: (mapping: FieldMapping) => void;
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
  showPhotoPreview = false,
  supplierPhotoLabel,
  alternatePhotoSourceName,
  imagePreferences,
  onImagePreferenceChange,
  onApplyImagePreferenceToAll,
  isFetchingAlternatePhotos = false,
  excludedImages,
  onRemoveImage,
  onRestoreImage,
}: StoreFesportsScrapeReviewProps) {
  const [fieldMapping, setFieldMapping] = React.useState<FieldMapping>({
    ...initialFieldMapping,
  });
  const scrapedFieldKeys = React.useMemo(() => collectScrapedFieldKeys(products), [products]);
  const tableFieldKeys = React.useMemo(
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

  const tableRows = React.useMemo(
    () =>
      products.map((product) => ({
        product,
        fields: buildScrapedFieldRecord(product),
        mapped: applyFieldMapping(product, fieldMapping),
      })),
    [products, fieldMapping],
  );

  const updateMapping = (targetKey: string, sourceKey: string | null) => {
    setFieldMapping((current) => {
      const next = {
        ...current,
        [targetKey]: sourceKey,
      };
      onFieldMappingChange?.(next);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-gray-200 bg-white p-5">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-gray-900">Map fields to Yellow Jersey</h3>
          <p className="text-sm text-gray-600">
            Choose which scraped {sourceName} field fills each Yellow Jersey product field.
            {showPhotoPreview
              ? " Photo import source is chosen separately in the preview below."
              : " Images are always imported from the scraped image list."}
          </p>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
          <div className="mt-4 rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-700">
            {mappingErrors.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        ) : null}
      </div>

      <div className="rounded-md border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Scraped product data</h3>
            <p className="text-sm text-gray-600">
              {products.length} products
              {totalVariants > 0 ? ` · ${totalVariants} variants` : ""} ·{" "}
              {selectedProducts.length} selected for import · {scrapedFieldKeys.length} scraped
              fields
            </p>
          </div>
          {productMatches ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
              <span className="rounded-md border border-gray-200 bg-white px-2 py-1">
                {Object.values(productMatches).filter((match) => match.status === "new").length} new
              </span>
              <span className="rounded-md border border-gray-200 bg-white px-2 py-1">
                {Object.values(productMatches).filter((match) => match.status === "changed").length} changed
              </span>
              <span className="rounded-md border border-gray-200 bg-white px-2 py-1">
                {Object.values(productMatches).filter((match) => match.status === "unchanged").length} unchanged
              </span>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <Button variant="outline" className="rounded-md" onClick={onToggleAll}>
              {selectedIds.size === products.length ? "Deselect all" : "Select all"}
            </Button>
            <Button
              className="rounded-md"
              onClick={() => onCreateListings(fieldMapping, imagePreferences)}
              disabled={!selectedProducts.length || isCreating || mappingErrors.length > 0}
            >
              <Download className="h-4 w-4" />
              {actionLabel} {selectedProducts.length} product{selectedProducts.length === 1 ? "" : "s"}
            </Button>
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
                <th className="sticky left-10 z-10 bg-gray-50 px-4 py-3 font-medium text-gray-700">
                  Mapped name
                </th>
                {productMatches ? (
                  <th className="px-4 py-3 font-medium text-gray-700">Import status</th>
                ) : null}
                <th className="px-4 py-3 font-medium text-gray-700">Mapped brand</th>
                <th className="px-4 py-3 font-medium text-gray-700">Mapped price</th>
                <th className="min-w-[260px] px-4 py-3 font-medium text-gray-700">
                  Variants & stock
                </th>
                {tableFieldKeys.map((key) => (
                  <th key={key} className="min-w-[160px] px-4 py-3 font-medium text-gray-700">
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {tableRows.map(({ product, fields, mapped }) => {
                const isSelected = selectedIds.has(product.productId);
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
                    <td className="sticky left-10 z-10 max-w-[220px] bg-inherit px-4 py-3 font-medium text-gray-900">
                      <span title={mapped.display_name}>{truncateCell(mapped.display_name, 80)}</span>
                    </td>
                    {productMatches ? (
                      <td className="px-4 py-3">
                        <span className="rounded-md border border-gray-200 bg-white px-2 py-1 font-medium text-gray-700">
                          {productMatches[product.productId]?.status ?? "new"}
                        </span>
                        {productMatches[product.productId]?.changes.length ? (
                          <p className="mt-1 max-w-[220px] text-[11px] text-gray-500">
                            {productMatches[product.productId].changes.join(", ")}
                          </p>
                        ) : null}
                      </td>
                    ) : null}
                    <td className="max-w-[160px] px-4 py-3 text-gray-700">
                      <span title={mapped.brand ?? ""}>{mapped.brand ? truncateCell(mapped.brand, 40) : "Not set"}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                      {mapped.price > 0 ? `$${mapped.price.toFixed(2)}` : "Not set"}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <VariantRows product={product} />
                    </td>
                    {tableFieldKeys.map((key) => {
                      const value = fields[key] ?? "";
                      return (
                        <td key={key} className="max-w-[280px] px-4 py-3 text-gray-600">
                          <span title={value}>{truncateCell(value)}</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

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
    </div>
  );
}
