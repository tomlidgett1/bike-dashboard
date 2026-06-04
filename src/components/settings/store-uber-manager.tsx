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
import { SettingsField, SettingsSection } from "@/components/dashboard";
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
      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-white px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <SettingsSection
        title="Order alerts"
        description="SMS numbers that receive a notification when a customer places an Uber Direct order."
        icon={Phone}
        footer={
          <Button
            type="button"
            size="sm"
            onClick={savePhones}
            disabled={savingPhones}
          >
            {savingPhones ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving…
              </>
            ) : phoneSaved ? (
              <>
                <Check className="size-4 text-emerald-600" />
                Saved
              </>
            ) : (
              "Save recipients"
            )}
          </Button>
        }
      >
        <div className="space-y-5">
          <div className="rounded-md border bg-white px-4 py-3 text-sm text-muted-foreground">
            If no numbers are listed here, order alerts fall back to your store phone on file.
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Active recipients</p>
            <div className="flex min-h-10 flex-wrap gap-2">
              {phones.length === 0 ? (
                <span className="inline-flex items-center rounded-md border border-dashed border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
                  No custom numbers — store phone fallback
                </span>
              ) : (
                phones.map((phone) => (
                  <span
                    key={phone}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm"
                  >
                    {phone}
                    <button
                      type="button"
                      onClick={() => removePhone(phone)}
                      aria-label={`Remove ${phone}`}
                      className="rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>

          <SettingsField
            label="Add recipient"
            hint="Press Enter or click Add. Include country code where needed."
          >
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
                placeholder="+61 400 000 000"
                className="h-9 rounded-md"
              />
              <Button type="button" variant="outline" size="sm" onClick={addPhone}>
                <Plus className="size-4" />
                Add
              </Button>
            </div>
          </SettingsField>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Eligible products"
        description="Turn Uber Direct on for individual products. Changes save automatically."
        icon={Package}
        headerAction={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFilteredProducts(true)}
              disabled={filteredProducts.length === 0}
            >
              Enable filtered
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFilteredProducts(false)}
              disabled={filteredProducts.length === 0}
            >
              Disable filtered
            </Button>
          </div>
        }
        contentClassName="space-y-4"
      >
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
            <SelectTrigger size="sm" className="rounded-md">
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
            <SelectTrigger size="sm" className="rounded-md">
              <SlidersHorizontal className="size-4" />
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

        <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
          {(["all", "enabled", "disabled"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMode(item)}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
                mode === item
                  ? "text-gray-800 bg-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-200/70"
              )}
            >
              {item === "all" ? "All" : item === "enabled" ? "Enabled" : "Disabled"}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-md border border-border bg-white">
          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <Package className="mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">No matching products</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Try a different search or filter.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredProducts.map((product) => {
                const saving = savingProducts.has(product.id);
                return (
                  <div
                    key={product.id}
                    className={cn(
                      "grid items-center gap-3 px-4 py-3 transition-colors sm:grid-cols-[44px_minmax(0,1fr)_130px_120px_54px]",
                      product.uber_delivery_enabled
                        ? "bg-emerald-50/40"
                        : "bg-white hover:bg-muted/30"
                    )}
                  >
                    <div className="relative h-11 w-11 overflow-hidden rounded-md bg-muted ring-1 ring-border/60">
                      {product.image_url ? (
                        <Image
                          src={product.image_url}
                          alt={product.name}
                          fill
                          unoptimized
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Package className="h-4 w-4 text-muted-foreground/50" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[10px]">
                          {product.category}
                        </Badge>
                        {product.subcategory ? (
                          <span className="text-[11px] text-muted-foreground">{product.subcategory}</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="text-sm font-medium text-foreground sm:text-right">
                      {fmtPrice(product.price)}
                    </div>

                    <div className="text-xs text-muted-foreground sm:text-right">
                      {product.stock == null ? "Stock —" : `${product.stock} in stock`}
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
          className="mx-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDown className="h-3.5 w-3.5 rotate-180" />
          Back to top
        </button>
      </SettingsSection>
    </div>
  );
}
