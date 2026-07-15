"use client";

import * as React from "react";
import { ImageIcon, X } from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";
import { defaultImagePreference } from "@/lib/scrapers/supplier-image-preferences";
import type {
  SupplierImageSourcePreference,
  SupplierImageSourcePreferences,
  SupplierScrapedProduct,
} from "@/lib/scrapers/supplier-types";

export type SupplierExcludedImages = Record<string, string[]>;

interface StoreSupplierPhotoPreviewProps {
  products: SupplierScrapedProduct[];
  selectedIds: Set<string>;
  supplierLabel: string;
  alternateSourceName: string;
  imagePreferences: SupplierImageSourcePreferences;
  excludedImages?: SupplierExcludedImages;
  onImagePreferenceChange: (
    productId: string,
    preference: SupplierImageSourcePreference,
  ) => void;
  onApplyToAll: (preference: SupplierImageSourcePreference) => void;
  onRemoveImage?: (productId: string, imageUrl: string) => void;
  onRestoreImage?: (productId: string, imageUrl: string) => void;
  isLoading?: boolean;
}

function ImageStrip({
  title,
  imageUrls,
  emptyLabel,
  excludedUrls,
  onRemove,
  onRestore,
}: {
  title: string;
  imageUrls: string[];
  emptyLabel: string;
  excludedUrls: Set<string>;
  onRemove?: (url: string) => void;
  onRestore?: (url: string) => void;
}) {
  const visible = imageUrls.filter((url) => !excludedUrls.has(url));
  const removed = imageUrls.filter((url) => excludedUrls.has(url));

  return (
    <div className="min-w-0 flex-1">
      <p className="mb-2 text-xs font-medium text-gray-700">
        {title}
        {removed.length > 0 ? ` · ${removed.length} removed` : ""}
      </p>
      {visible.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {visible.slice(0, 8).map((url) => (
            <div
              key={url}
              className="relative shrink-0 overflow-hidden rounded-md border border-gray-200 bg-white"
            >
              <a href={url} target="_blank" rel="noreferrer" className="block">
                <img src={url} alt="" className="h-20 w-20 object-cover" loading="lazy" />
              </a>
              {onRemove ? (
                <button
                  type="button"
                  onClick={() => onRemove(url)}
                  className="absolute right-1 top-1 rounded-md border border-gray-200 bg-white p-0.5 text-gray-600 hover:bg-gray-50"
                  aria-label="Remove photo"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </div>
          ))}
          {visible.length > 8 ? (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-xs text-gray-500">
              +{visible.length - 8}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-gray-200 bg-white px-3 text-xs text-gray-500">
          {emptyLabel}
        </div>
      )}
      {removed.length > 0 && onRestore ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {removed.slice(0, 4).map((url) => (
            <button
              key={url}
              type="button"
              onClick={() => onRestore(url)}
              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
            >
              Restore photo
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PreferenceTabs({
  value,
  onChange,
  hasAlternate,
}: {
  value: SupplierImageSourcePreference;
  onChange: (value: SupplierImageSourcePreference) => void;
  hasAlternate: boolean;
}) {
  const options: Array<{ id: SupplierImageSourcePreference; label: string }> = [
    { id: "supplier", label: "Supplier" },
    ...(hasAlternate ? [{ id: "alternate" as const, label: "Official" }] : []),
    ...(hasAlternate ? [{ id: "both" as const, label: "Both" }] : []),
  ];

  return (
    <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cn(
            "px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
            value === option.id
              ? "text-gray-800 bg-white shadow-sm"
              : "text-gray-600 hover:bg-gray-200/70",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function StoreSupplierPhotoPreview({
  products,
  selectedIds,
  supplierLabel,
  alternateSourceName,
  imagePreferences,
  excludedImages = {},
  onImagePreferenceChange,
  onApplyToAll,
  onRemoveImage,
  onRestoreImage,
  isLoading = false,
}: StoreSupplierPhotoPreviewProps) {
  const visibleProducts = products.filter((product) => selectedIds.has(product.productId));
  const matchedCount = visibleProducts.filter(
    (product) => product.alternatePhoto?.status === "matched",
  ).length;

  return (
    <div className="rounded-md border border-gray-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
        <div className="flex items-start gap-3">
          <ImageIcon className="mt-0.5 h-5 w-5 text-gray-700" />
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Compare photo sources</h3>
            <p className="mt-1 text-sm text-gray-600">
              Preview supplier photos against {alternateSourceName}. Remove any photos you do not
              want before import.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600">
            {matchedCount} official matches
          </span>
          <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
            {(["supplier", "alternate", "both"] as SupplierImageSourcePreference[]).map(
              (preference) => (
                <button
                  key={preference}
                  type="button"
                  onClick={() => onApplyToAll(preference)}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-md text-gray-600 transition-colors hover:bg-gray-200/70"
                >
                  All{" "}
                  {preference === "supplier"
                    ? "supplier"
                    : preference === "alternate"
                      ? "official"
                      : "both"}
                </button>
              ),
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4 p-5">
        {visibleProducts.length === 0 ? (
          <p className="text-sm text-gray-500">Select products to compare photo sources.</p>
        ) : (
          visibleProducts.map((product) => {
            const preference =
              imagePreferences[product.productId] ?? defaultImagePreference(product);
            const alternate = product.alternatePhoto;
            const hasAlternate = Boolean(alternate?.imageUrls?.length);
            const excluded = new Set(excludedImages[product.productId] ?? []);
            return (
              <div
                key={product.productId}
                className="rounded-md border border-gray-200 bg-white p-4"
              >
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{product.name}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {product.sku ? `SKU ${product.sku}` : "No SKU"}
                      {alternate?.productUrl ? (
                        <>
                          {" "}
                          ·{" "}
                          <a
                            href={alternate.productUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-gray-700 underline"
                          >
                            Official match
                          </a>
                        </>
                      ) : null}
                    </p>
                    {alternate?.status === "not_found" ? (
                      <p className="mt-1 text-xs text-gray-500">
                        No official photo match found. Supplier photos will be used.
                      </p>
                    ) : null}
                    {alternate?.status === "error" && alternate.error ? (
                      <p className="mt-1 text-xs text-gray-500">{alternate.error}</p>
                    ) : null}
                    {!alternate && isLoading ? (
                      <p className="mt-1 text-xs text-gray-500">
                        Matching official photos…
                      </p>
                    ) : null}
                  </div>
                  <PreferenceTabs
                    value={preference}
                    onChange={(value) => onImagePreferenceChange(product.productId, value)}
                    hasAlternate={hasAlternate}
                  />
                </div>
                <div className="flex flex-col gap-4 lg:flex-row">
                  <ImageStrip
                    title={`${supplierLabel} (${product.imageUrls.filter((url) => !excluded.has(url)).length})`}
                    imageUrls={product.imageUrls}
                    excludedUrls={excluded}
                    emptyLabel="No supplier photos"
                    onRemove={
                      onRemoveImage
                        ? (url) => onRemoveImage(product.productId, url)
                        : undefined
                    }
                    onRestore={
                      onRestoreImage
                        ? (url) => onRestoreImage(product.productId, url)
                        : undefined
                    }
                  />
                  <ImageStrip
                    title={`${alternateSourceName} (${(alternate?.imageUrls ?? []).filter((url) => !excluded.has(url)).length})`}
                    imageUrls={alternate?.imageUrls ?? []}
                    excludedUrls={excluded}
                    emptyLabel={
                      isLoading && !alternate
                        ? "Searching official site..."
                        : !alternate
                          ? "Matching with scrape…"
                          : alternate.status === "not_found"
                            ? "No official match"
                            : alternate.status === "error"
                              ? "Official fetch failed"
                              : "No official photos"
                    }
                    onRemove={
                      onRemoveImage
                        ? (url) => onRemoveImage(product.productId, url)
                        : undefined
                    }
                    onRestore={
                      onRestoreImage
                        ? (url) => onRestoreImage(product.productId, url)
                        : undefined
                    }
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
