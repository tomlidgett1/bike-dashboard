"use client";

import * as React from "react";
import { Loader2, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { InstagramCatalogueProduct } from "@/lib/instagram/catalogue";
import { cn } from "@/lib/utils";

function formatPrice(price: number | null) {
  if (price == null) return null;
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(price);
}

export function InstagramProductPickerDialog({
  open,
  onOpenChange,
  selectedProductId,
  onSelect,
  onClear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedProductId?: string | null;
  onSelect: (product: InstagramCatalogueProduct) => void;
  onClear?: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const [products, setProducts] = React.useState<InstagramCatalogueProduct[]>(
    [],
  );
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    setError(null);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    let active = true;
    const handle = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/store/instagram/catalogue?q=${encodeURIComponent(query)}`,
          { cache: "no-store" },
        );
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) {
          throw new Error(data.error || "Could not search products.");
        }
        setProducts((data.products as InstagramCatalogueProduct[]) || []);
      } catch (err) {
        if (!active) return;
        setProducts([]);
        setError(
          err instanceof Error ? err.message : "Could not search products.",
        );
      } finally {
        if (active) setLoading(false);
      }
    }, query ? 280 : 0);

    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [open, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-w-lg gap-4 rounded-md border border-gray-200 bg-white p-5 text-gray-900 shadow-sm",
          "animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out",
        )}
        overlayClassName="animate-in fade-in duration-200 bg-black/40 supports-backdrop-filter:backdrop-blur-sm"
      >
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="text-base font-medium text-gray-900">
            Use a product photo
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500">
            Search your catalogue and pick an approved primary image. AI will
            feature that exact product in the post.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search bikes, parts, brands…"
            className="rounded-md border-gray-200 pl-9"
          />
        </div>

        {error ? (
          <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
            {error}
          </div>
        ) : null}

        <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching…
            </div>
          ) : products.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">
              {query.length >= 2
                ? "No marketplace-ready products with approved photos."
                : "Showing recent products with approved primary photos."}
            </p>
          ) : (
            products.map((product) => {
              const selected = product.id === selectedProductId;
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => {
                    onSelect(product);
                    onOpenChange(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md border px-2.5 py-2 text-left transition-colors",
                    selected
                      ? "border-gray-300 bg-gray-50"
                      : "border-gray-200 bg-white hover:bg-gray-50",
                  )}
                >
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={product.imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {product.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {[
                        product.brand,
                        product.salePrice != null && product.price != null
                          ? `${formatPrice(product.salePrice)} (was ${formatPrice(product.price)})`
                          : formatPrice(product.salePrice ?? product.price),
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Approved primary photo"}
                    </p>
                    {product.description ? (
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-gray-400">
                        {product.description}
                      </p>
                    ) : null}
                  </div>
                  <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                    {selected ? "Selected" : "Use photo"}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {selectedProductId && onClear ? (
          <button
            type="button"
            onClick={() => {
              onClear();
              onOpenChange(false);
            }}
            className="inline-flex items-center gap-1 self-start rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            <X className="h-3 w-3" />
            Clear selected product
          </button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
