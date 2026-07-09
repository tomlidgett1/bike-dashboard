"use client";

import * as React from "react";
import { Loader2, Search } from "@/components/layout/app-sidebar/dashboard-icons";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CrmProductOption } from "@/lib/crm/types";
import { campaignItemFromProduct } from "@/lib/crm/design";
import type { CampaignItem } from "@/lib/crm/types";

export function LightspeedProductPicker(props: {
  onSelect: (item: CampaignItem) => void;
  className?: string;
}) {
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [products, setProducts] = React.useState<CrmProductOption[]>([]);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (query.trim().length < 2) {
      setProducts([]);
      return;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/store/crm/products?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        setProducts(data.products ?? []);
        setOpen(true);
      } catch {
        setProducts([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div className={cn("relative", props.className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => products.length > 0 && setOpen(true)}
          placeholder="Search Lightspeed products…"
          className="h-9 rounded-full pl-9"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>
      {open && products.length > 0 ? (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border/60 bg-white shadow-lg">
          {products.map((product) => (
            <button
              key={product.id}
              type="button"
              className="flex w-full items-center gap-3 border-b border-border/40 px-3 py-2.5 text-left last:border-0 hover:bg-zinc-50"
              onClick={() => {
                props.onSelect(campaignItemFromProduct(product));
                setQuery("");
                setProducts([]);
                setOpen(false);
              }}
            >
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt=""
                  className="size-10 shrink-0 rounded-md object-cover"
                />
              ) : (
                <div className="size-10 shrink-0 rounded-md bg-zinc-100" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {product.name}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {[product.subtitle, product.price != null ? `$${product.price}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
