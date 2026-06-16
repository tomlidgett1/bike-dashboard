"use client";

import * as React from "react";
import Image from "next/image";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Loader2,
  Package,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "@/components/layout/app-sidebar/dashboard-icons";
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
import { SettingsField } from "@/components/dashboard";
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

export type UberTab = "products" | "settings";
type FilterMode = "all" | "enabled" | "disabled";
type SortMode = "category" | "price_asc" | "price_desc" | "name";

const PANEL_CLASS =
  "overflow-hidden rounded-md border border-gray-200 bg-white divide-y divide-gray-100";

const fmtPrice = (price: number) =>
  `$${price.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function normalisePhoneInput(value: string): string {
  return value.trim().replace(/[^\d+]/g, "");
}

export function StoreUberManager({ activeTab = "products" }: { activeTab?: UberTab } = {}) {
  const [products, setProducts] = React.useState<UberProduct[]>([]);
  const [phones, setPhones] = React.useState<string[]>([]);
  const [storePhone, setStorePhone] = React.useState("");
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
      setStorePhone(data.store?.phone || "");
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

  const enabledCount = React.useMemo(
    () => products.filter((product) => product.uber_delivery_enabled).length,
    [products],
  );

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
    <div className="space-y-4">
      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-white px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {activeTab === "settings" ? (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-gray-900">Order alerts</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              SMS numbers that receive a notification when a customer places an Uber Direct order.
            </p>
          </div>

          <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
            {phones.length === 0 && storePhone ? (
              <span>
                No custom numbers saved — alerts go to your store phone{" "}
                <span className="font-medium text-gray-900">{storePhone}</span>.
              </span>
            ) : phones.length === 0 ? (
              <span>
                No custom numbers saved — add recipients below or set a store phone in your profile.
              </span>
            ) : (
              <span>
                Custom recipients below receive Uber order alerts
                {storePhone ? (
                  <>
                    {" "}
                    (falls back to <span className="font-medium text-gray-900">{storePhone}</span> if
                    empty)
                  </>
                ) : null}
                .
              </span>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-900">Active recipients</p>
            <div className="flex min-h-10 flex-wrap gap-2">
              {phones.length === 0 ? (
                <span className="inline-flex items-center rounded-md border border-dashed border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500">
                  No custom numbers
                </span>
              ) : (
                phones.map((phone) => (
                  <span
                    key={phone}
                    className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-900"
                  >
                    {phone}
                    <button
                      type="button"
                      onClick={() => removePhone(phone)}
                      aria-label={`Remove ${phone}`}
                      className="rounded-sm text-gray-400 transition-colors hover:text-gray-700"
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
              <Button type="button" variant="outline" size="sm" className="rounded-md" onClick={addPhone}>
                <Plus className="size-4" />
                Add
              </Button>
            </div>
          </SettingsField>

          <div className="flex justify-end border-t border-gray-200 pt-4">
            <Button
              type="button"
              size="sm"
              className="rounded-md"
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
                  <Check className="size-4 text-gray-600" />
                  Saved
                </>
              ) : (
                "Save recipients"
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-gray-900">Eligible products</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Turn Uber Direct on for individual products. Changes save automatically.
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {enabledCount} of {products.length} products enabled
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-md"
                onClick={() => setFilteredProducts(true)}
                disabled={filteredProducts.length === 0}
              >
                Enable filtered
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-md"
                onClick={() => setFilteredProducts(false)}
                disabled={filteredProducts.length === 0}
              >
                Disable filtered
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

          <div className="flex items-center rounded-md bg-gray-100 p-0.5 w-fit">
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

          {filteredProducts.length === 0 ? (
            <div className="rounded-md border border-dashed border-gray-200 bg-white py-12 text-center">
              <Package className="mx-auto mb-3 h-8 w-8 text-gray-300" />
              <p className="text-sm font-medium text-gray-900">No matching products</p>
              <p className="mt-1 text-xs text-gray-500">Try a different search or filter.</p>
            </div>
          ) : (
            <div className={PANEL_CLASS}>
              {filteredProducts.map((product) => {
                const saving = savingProducts.has(product.id);
                return (
                  <div
                    key={product.id}
                    className="grid items-center gap-3 px-3 py-2.5 transition-colors hover:bg-gray-50 sm:grid-cols-[44px_minmax(0,1fr)_130px_120px_54px]"
                  >
                    <div className="relative h-11 w-11 overflow-hidden rounded-md bg-gray-50">
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
                          <Package className="h-4 w-4 text-gray-300" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{product.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[10px]">
                          {product.category}
                        </Badge>
                        {product.subcategory ? (
                          <span className="text-[11px] text-gray-500">{product.subcategory}</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="text-sm font-medium text-gray-900 sm:text-right">
                      {fmtPrice(product.price)}
                    </div>

                    <div className="text-xs text-gray-500 sm:text-right">
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

          {filteredProducts.length > 0 ? (
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="mx-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 transition-colors hover:text-gray-800"
            >
              <ChevronDown className="h-3.5 w-3.5 rotate-180" />
              Back to top
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
