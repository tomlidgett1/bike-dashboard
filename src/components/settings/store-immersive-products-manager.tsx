"use client";

import * as React from "react";
import Image from "next/image";
import { Loader2, Search, Package, Sparkles, ExternalLink, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ImmersiveProduct {
  id: string;
  description: string;
  display_name?: string | null;
  price: number;
  primary_image_url: string | null;
  resolved_image_url: string | null;
  immersive_page?: boolean | null;
}

export function StoreImmersiveProductsManager() {
  const [products, setProducts] = React.useState<ImmersiveProduct[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<"all" | "on">("all");
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [errorId, setErrorId] = React.useState<string | null>(null);

  const fetchProducts = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/products?pageSize=500&status=active&stock=in-stock");
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products ?? []);
      }
    } catch (err) {
      console.error("Failed to fetch products:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const immersiveCount = React.useMemo(
    () => products.filter((p) => p.immersive_page).length,
    [products]
  );

  const filtered = React.useMemo(() => {
    let list = products;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.description.toLowerCase().includes(q) ||
          (p.display_name || "").toLowerCase().includes(q)
      );
    }
    if (filter === "on") list = list.filter((p) => p.immersive_page);
    return list;
  }, [products, search, filter]);

  const toggle = async (product: ImmersiveProduct, next: boolean) => {
    setSavingId(product.id);
    setErrorId(null);
    // Optimistic update
    setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, immersive_page: next } : p)));
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ immersive_page: next }),
      });
      if (!res.ok) throw new Error("Save failed");
    } catch {
      // Revert on failure
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, immersive_page: !next } : p)));
      setErrorId(product.id);
      setTimeout(() => setErrorId((id) => (id === product.id ? null : id)), 4000);
    } finally {
      setSavingId(null);
    }
  };

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

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="flex items-center gap-3 rounded-md border border-border bg-muted/50 px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#ffde59]/20 flex-shrink-0">
          <Sparkles className="h-4 w-4 text-amber-600" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {immersiveCount} {immersiveCount === 1 ? "product uses" : "products use"} the Immersive layout
          </p>
          <p className="text-xs text-muted-foreground">
            Immersive pages show a full-screen cinematic hero with a floating buy card. Toggle it per product below.
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <div className="flex gap-0.5 p-1 bg-muted rounded-md text-xs flex-shrink-0">
          {(["all", "on"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-2.5 py-1 rounded font-medium transition-all",
                filter === f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f === "all" ? `All (${products.length})` : `Immersive (${immersiveCount})`}
            </button>
          ))}
        </div>
      </div>

      {/* Product list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Package className="h-7 w-7 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No products match your filter</p>
          </div>
        ) : (
          filtered.map((product) => {
            const imageUrl = product.resolved_image_url || product.primary_image_url;
            const title = product.display_name || product.description;
            const isOn = !!product.immersive_page;
            return (
              <div
                key={product.id}
                className={cn(
                  "flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors",
                  isOn ? "border-[#ffde59]/60 bg-[#ffde59]/[0.06]" : "border-border bg-card hover:border-foreground/20"
                )}
              >
                {/* Image */}
                <div className="h-10 w-10 rounded bg-muted flex-shrink-0 overflow-hidden">
                  {imageUrl ? (
                    <Image src={imageUrl} alt={title} width={40} height={40} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Package className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </div>

                {/* Title + price */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate leading-tight">{title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      ${product.price?.toLocaleString("en-AU")}
                    </span>
                    {isOn && (
                      <Badge className="h-4 gap-1 border-0 bg-[#ffde59] text-[10px] font-semibold text-black px-1.5">
                        <Sparkles className="h-2.5 w-2.5" />
                        Immersive
                      </Badge>
                    )}
                    {errorId === product.id && (
                      <span className="flex items-center gap-1 text-[10px] text-red-500">
                        <AlertCircle className="h-2.5 w-2.5" /> Couldn&apos;t save
                      </span>
                    )}
                  </div>
                </div>

                {/* Preview link */}
                <a
                  href={`/marketplace/product/${product.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Preview product page"
                  className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors flex-shrink-0"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>

                {/* Toggle */}
                <div className="flex items-center flex-shrink-0">
                  {savingId === product.id ? (
                    <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                  ) : (
                    <Switch
                      checked={isOn}
                      onCheckedChange={(v) => toggle(product, v)}
                      aria-label="Toggle immersive page"
                    />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
