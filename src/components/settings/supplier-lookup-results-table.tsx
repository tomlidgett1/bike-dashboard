"use client";

import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  SupplierAudience,
  SupplierCatalogueSearchHit,
  SupplierStockStatus,
} from "@/lib/supplier-catalogue/types";

function formatMoney(
  value: number | null,
  currency: string,
): string {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: currency || "AUD",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

function audienceLabel(audience: SupplierAudience): string {
  switch (audience) {
    case "kids":
      return "Kids";
    case "mens":
      return "Mens";
    case "womens":
      return "Womens";
    case "unisex":
      return "Unisex";
    default:
      return "Unknown";
  }
}

function StockBadge({ status }: { status: SupplierStockStatus }) {
  const label =
    status === "in_stock"
      ? "In stock"
      : status === "out_of_stock"
        ? "Out of stock"
        : "Unknown";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        status === "in_stock"
          ? "border-gray-200 bg-white text-gray-800"
          : status === "out_of_stock"
            ? "border-gray-200 bg-gray-50 text-gray-500"
            : "border-gray-200 bg-white text-gray-400",
      )}
    >
      {label}
    </span>
  );
}

function joinList(values: string[], max = 4): string {
  if (!values.length) return "—";
  if (values.length <= max) return values.join(", ");
  return `${values.slice(0, max).join(", ")} +${values.length - max}`;
}

export function SupplierLookupResultsTable({
  results,
  isLoading,
}: {
  results: SupplierCatalogueSearchHit[];
  isLoading?: boolean;
}) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 12,
  });

  if (!isLoading && results.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center rounded-md border border-gray-200 bg-white px-6 py-16 text-center shadow-sm">
        <p className="text-sm font-medium text-gray-800">No matching products</p>
        <p className="mt-1 text-sm text-gray-500">
          Try a broader request, or drop brand/colour filters.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-[min(70vh,calc(100dvh-13rem))] min-h-[28rem] w-full flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm">
      <div className="shrink-0 overflow-x-auto border-b border-gray-100 bg-gray-50">
        <div className="grid min-w-[1100px] grid-cols-[56px_minmax(180px,1.6fr)_110px_120px_90px_120px_120px_100px_100px_90px_110px] gap-3 px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">
          <div />
          <div>Product</div>
          <div>Brand</div>
          <div>Supplier</div>
          <div>For</div>
          <div>Sizes</div>
          <div>Colours</div>
          <div>Cost</div>
          <div>RRP</div>
          <div>Stock</div>
          <div />
        </div>
      </div>

      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
        <div
          className="relative min-w-[1100px]"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = results[virtualRow.index];
            if (!row) return null;
            return (
              <div
                key={row.productId}
                className="absolute left-0 top-0 grid w-full grid-cols-[56px_minmax(180px,1.6fr)_110px_120px_90px_120px_120px_100px_100px_90px_110px] gap-3 border-b border-gray-50 px-4 py-2.5 text-sm hover:bg-gray-50/80"
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="flex items-center">
                  {row.heroImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.heroImageUrl}
                      alt=""
                      className="h-11 w-11 rounded-md object-cover border border-gray-100 bg-white"
                    />
                  ) : (
                    <div className="h-11 w-11 rounded-md border border-gray-100 bg-gray-50" />
                  )}
                </div>
                <div className="flex min-w-0 flex-col justify-center">
                  <span className="truncate font-medium text-gray-900">
                    {row.name}
                  </span>
                  <span className="truncate text-xs text-gray-500">
                    {row.supplierSku || row.upc || row.productType || "—"}
                  </span>
                </div>
                <div className="flex items-center truncate text-gray-700">
                  {row.brand || "—"}
                </div>
                <div className="flex items-center truncate text-gray-700">
                  {row.supplierName}
                </div>
                <div className="flex items-center text-gray-700">
                  {audienceLabel(row.audience)}
                </div>
                <div className="flex items-center truncate text-xs text-gray-600">
                  {joinList(row.sizes)}
                </div>
                <div className="flex items-center truncate text-xs text-gray-600">
                  {joinList(row.colours)}
                </div>
                <div className="flex items-center text-gray-800">
                  {formatMoney(row.costPrice, row.currency)}
                </div>
                <div className="flex items-center text-gray-800">
                  {formatMoney(row.retailPrice, row.currency)}
                </div>
                <div className="flex items-center">
                  <StockBadge status={row.stockStatus} />
                </div>
                <div className="flex items-center justify-end">
                  <a
                    href={row.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                  >
                    View
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
