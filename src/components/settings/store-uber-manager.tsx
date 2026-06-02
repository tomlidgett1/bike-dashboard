"use client";

import * as React from "react";
import Image from "next/image";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Loader2,
  Package,
  Phone,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface UberProduct {
  id: string;
  name: string;
  price: number;
  category: string;
  subcategory: string | null;
  stock: number | null;
  image_url: string | null;
  uber_delivery_enabled: boolean;
  listing_source: string | null;
}

type FilterMode = "all" | "enabled" | "disabled";
type SortMode = "category" | "price_asc" | "price_desc" | "name";

const fmtPrice = (price: number) =>
  `$${price.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function normalisePhoneInput(value: string): string {
  return value.trim().replace(/[^\d+]/g, "");
}

export function StoreUberManager() {
  const [products, setProducts] = React.useState<UberProduct[]>([]);
  const [phones, setPhones] = React.useState<string[]>([]);
  const [phoneDraft, setPhoneDraft] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState("all");
  const [mode, setMode] = React.useState<FilterMode>("all");
  const [sort, setSort] = React.useState<SortMode>("category");
  const [loading, setLoading] = React.useState(true);
  const [savingPhones, setSavingPhones] = React.useState(false);
  const [savingProducts, setSavingProducts] = React.useState<Set<string>>(() => new Set());
  const [error, setError] = React.useState<string | null>(null);
  const [phoneSaved, setPhoneSaved] = React.useState(false);

  const fetchSettings = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/store/uber");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load Uber settings");

      setProducts(data.products || []);
      setPhones(data.store?.notificationPhones || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Uber settings");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const categories = React.useMemo(() => {
    return Array.from(new Set(products.map((product) => product.category).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [products]);

  const enabledCount = React.useMemo(
    () => products.filter((product) => product.uber_delivery_enabled).length,
    [products]
  );

  const filteredProducts = React.useMemo(() => {
    const query = search.trim().toLowerCase();

    return products
      .filter((product) => {
        if (mode === "enabled" && !product.uber_delivery_enabled) return false;
        if (mode === "disabled" && product.uber_delivery_enabled) return false;
        if (category !== "all" && product.category !== category) return false;
        if (!query) return true;
        return (
          product.name.toLowerCase().includes(query) ||
          product.category.toLowerCase().includes(query) ||
          (product.subcategory || "").toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        switch (sort) {
          case "price_asc":
            return a.price - b.price;
          case "price_desc":
            return b.price - a.price;
          case "name":
            return a.name.localeCompare(b.name);
          case "category":
          default:
            return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
        }
      });
  }, [category, mode, products, search, sort]);

  const patchProduct = async (product: UberProduct, next: boolean) => {
    setSavingProducts((prev) => new Set(prev).add(product.id));
    setError(null);
    setProducts((prev) =>
      prev.map((item) =>
        item.id === product.id ? { ...item, uber_delivery_enabled: next } : item
      )
    );

    try {
      const res = await fetch("/api/store/uber", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, uberDeliveryEnabled: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save product");
    } catch (err) {
      setProducts((prev) =>
        prev.map((item) =>
          item.id === product.id ? { ...item, uber_delivery_enabled: !next } : item
        )
      );
      setError(err instanceof Error ? err.message : "Failed to save product");
    } finally {
      setSavingProducts((prev) => {
        const nextSet = new Set(prev);
        nextSet.delete(product.id);
        return nextSet;
      });
    }
  };

  const addPhone = () => {
    const phone = normalisePhoneInput(phoneDraft);
    if (!phone || phones.includes(phone)) return;
    setPhones((prev) => [...prev, phone]);
    setPhoneDraft("");
    setPhoneSaved(false);
  };

  const removePhone = (phone: string) => {
    setPhones((prev) => prev.filter((item) => item !== phone));
    setPhoneSaved(false);
  };

  const savePhones = async () => {
    setSavingPhones(true);
    setError(null);
    setPhoneSaved(false);
    try {
      const res = await fetch("/api/store/uber", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationPhones: phones }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save phone numbers");
      setPhones(data.notificationPhones || []);
      setPhoneSaved(true);
      window.setTimeout(() => setPhoneSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save phone numbers");
    } finally {
      setSavingPhones(false);
    }
  };

  const setFilteredProducts = async (enabled: boolean) => {
    const targets = filteredProducts.filter((product) => product.uber_delivery_enabled !== enabled);
    for (const product of targets) {
      await patchProduct(product, enabled);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Order Alerts</h2>
            <p className="text-xs text-muted-foreground">Uber order SMS recipients</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={savePhones}
            disabled={savingPhones}
            className="h-8 rounded-md"
          >
            {savingPhones ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : phoneSaved ? (
              <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <Phone className="mr-1.5 h-3.5 w-3.5" />
            )}
            Save
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {phones.length === 0 ? (
            <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
              Store phone fallback
            </span>
          ) : (
            phones.map((phone) => (
              <span
                key={phone}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground"
              >
                {phone}
                <button
                  type="button"
                  onClick={() => removePhone(phone)}
                  aria-label={`Remove ${phone}`}
                  className="rounded-sm text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))
          )}
        </div>

        <div className="flex gap-2">
          <Input
            value={phoneDraft}
            onChange={(event) => setPhoneDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addPhone();
              }
            }}
            placeholder="Add mobile number"
            className="h-9 rounded-md"
          />
          <Button type="button" variant="outline" onClick={addPhone} className="h-9 rounded-md">
            <Plus className="mr-1.5 h-4 w-4" />
            Add
          </Button>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Products</h2>
            <p className="text-xs text-muted-foreground">
              {enabledCount} of {products.length} enabled
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFilteredProducts(true)}
              className="h-8 rounded-md"
              disabled={filteredProducts.length === 0}
            >
              Enable Filtered
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFilteredProducts(false)}
              className="h-8 rounded-md"
              disabled={filteredProducts.length === 0}
            >
              Disable Filtered
            </Button>
          </div>
        </div>

        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_180px_170px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products"
              className="h-9 rounded-md pl-8"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-9 rounded-md">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(value) => setSort(value as SortMode)}>
            <SelectTrigger className="h-9 rounded-md">
              <SlidersHorizontal className="mr-2 h-3.5 w-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="category">Category</SelectItem>
              <SelectItem value="price_asc">Price low to high</SelectItem>
              <SelectItem value="price_desc">Price high to low</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-1 rounded-md bg-muted p-1 text-xs">
          {(["all", "enabled", "disabled"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMode(item)}
              className={cn(
                "rounded px-2.5 py-1.5 font-medium transition-colors",
                mode === item
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {item === "all" ? "All" : item === "enabled" ? "Enabled" : "Disabled"}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-md border border-border">
          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Package className="mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">No matching products</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredProducts.map((product) => {
                const saving = savingProducts.has(product.id);
                return (
                  <div
                    key={product.id}
                    className={cn(
                      "grid items-center gap-3 px-3 py-2.5 transition-colors sm:grid-cols-[44px_minmax(0,1fr)_130px_120px_54px]",
                      product.uber_delivery_enabled ? "bg-emerald-50/50" : "bg-background hover:bg-muted/40"
                    )}
                  >
                    <div className="relative h-11 w-11 overflow-hidden rounded-md bg-muted">
                      {product.image_url ? (
                        <Image src={product.image_url} alt={product.name} fill className="object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Package className="h-4 w-4 text-muted-foreground/50" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge variant="secondary" className="h-5 rounded px-1.5 text-[10px]">
                          {product.category}
                        </Badge>
                        {product.subcategory && (
                          <span className="text-[11px] text-muted-foreground">{product.subcategory}</span>
                        )}
                      </div>
                    </div>

                    <div className="text-sm font-medium text-foreground sm:text-right">
                      {fmtPrice(product.price)}
                    </div>

                    <div className="text-xs text-muted-foreground sm:text-right">
                      {product.stock == null ? "Stock -" : `${product.stock} in stock`}
                    </div>

                    <div className="flex items-center justify-end">
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <Switch
                          checked={product.uber_delivery_enabled}
                          onCheckedChange={(value) => patchProduct(product, value)}
                          aria-label={`Toggle Uber delivery for ${product.name}`}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="mx-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className="h-3.5 w-3.5 rotate-180" />
          Top
        </button>
      </section>
    </div>
  );
}
