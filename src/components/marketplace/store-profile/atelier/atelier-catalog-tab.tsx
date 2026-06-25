"use client";

import * as React from "react";
import {
  Search,
  X,
  Tag,
  ArrowUpDown,
  ArrowRight,
  Package,
  LayoutGrid,
  Grip,
} from "@/components/layout/app-sidebar/dashboard-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { resolveLivePrice, sortProductsSaleFirst } from "@/lib/marketplace/pricing";
import {
  buildStoreProductSearchContext,
  filterAndRankStoreProductsBySearch,
} from "@/lib/marketplace/store-product-search";
import { AtelierProductCard } from "./atelier-product-card";
import { STUDIO, DISPLAY_FONT } from "./atelier-theme";
import type { StoreProfile, StoreCategoryWithProducts } from "@/lib/types/store";
import type { MarketplaceProduct } from "@/lib/types/marketplace";

type SortKey = "featured" | "price-asc" | "price-desc" | "newest";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "newest", label: "Newest" },
];

function sortLabel(key: SortKey): string {
  return SORT_OPTIONS.find((o) => o.value === key)?.label ?? "Featured";
}

function isBikesPage(category: { store_page?: string | null }) {
  return category.store_page === "bikes";
}

export interface AtelierCatalogTabProps {
  store: StoreProfile;
  page: "products" | "bikes";
  storeSearch: string;
  onStoreSearchChange: (value: string) => void;
  selectedCategory: string | null;
  onCategoryToggle: (name: string) => void;
  showSaleOnly: boolean;
  onSaleOnlyToggle: () => void;
  sort: SortKey;
  onSortChange: (sort: SortKey) => void;
  trackAnalytics?: boolean;
}

export function AtelierCatalogTab({
  store,
  page,
  storeSearch,
  onStoreSearchChange,
  selectedCategory,
  onCategoryToggle,
  showSaleOnly,
  onSaleOnlyToggle,
  sort,
  onSortChange,
}: AtelierCatalogTabProps) {
  const [compact, setCompact] = React.useState(false);

  const pageCategories = React.useMemo(
    () => store.categories.filter((c) => (page === "bikes" ? isBikesPage(c) : !isBikesPage(c))),
    [store.categories, page],
  );

  const searchContext = React.useMemo(
    () => buildStoreProductSearchContext(store.categories, store.brands ?? []),
    [store.categories, store.brands],
  );

  const allProducts = React.useMemo(() => {
    const seen = new Set<string>();
    const out: MarketplaceProduct[] = [];
    for (const c of pageCategories) {
      for (const p of c.products) {
        if (!seen.has(p.id)) { seen.add(p.id); out.push(p); }
      }
    }
    return out;
  }, [pageCategories]);

  const saleProductIds = React.useMemo(
    () => new Set(allProducts.filter((p) => resolveLivePrice(p).onSale).map((p) => p.id)),
    [allProducts],
  );

  const isSearchActive = storeSearch.trim().length > 0;

  const filteredProducts = React.useMemo(() => {
    let pool = selectedCategory
      ? pageCategories.filter((c) => c.name === selectedCategory).flatMap((c) => c.products)
      : allProducts;
    const seen = new Set<string>();
    let unique: MarketplaceProduct[] = [];
    for (const p of pool) { if (!seen.has(p.id)) { seen.add(p.id); unique.push(p); } }

    if (showSaleOnly) unique = unique.filter((p) => saleProductIds.has(p.id));
    const q = storeSearch.trim();
    if (q) unique = filterAndRankStoreProductsBySearch(unique, q, searchContext);

    switch (sort) {
      case "price-asc": unique = [...unique].sort((a, b) => (a.price ?? 0) - (b.price ?? 0)); break;
      case "price-desc": unique = [...unique].sort((a, b) => (b.price ?? 0) - (a.price ?? 0)); break;
      case "newest":
        unique = [...unique].sort(
          (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
        );
        break;
      default:
        unique = sortProductsSaleFirst(unique);
        break;
    }
    return unique;
  }, [allProducts, pageCategories, selectedCategory, showSaleOnly, saleProductIds, storeSearch, searchContext, sort]);

  const visibleCategories = pageCategories.filter((c) => c.products.length > 0);
  const isFlatView = isSearchActive || selectedCategory !== null || showSaleOnly;

  return (
    <div style={{ backgroundColor: STUDIO.surface, color: STUDIO.ink, minHeight: "60vh" }}>
      {/* Page header */}
      <div style={{ backgroundColor: STUDIO.surfaceAlt, borderBottom: `1px solid ${STUDIO.line}` }}>
        <div className="mx-auto max-w-[1400px] px-5 py-10 text-center sm:px-8 sm:py-14 lg:px-12">
          <h1 className="text-3xl tracking-[-0.01em] sm:text-4xl" style={{ fontFamily: DISPLAY_FONT, color: STUDIO.ink, fontWeight: 700 }}>
            {page === "bikes" ? "Bikes" : "Shop All"}
          </h1>
          <p className="mt-2 text-sm" style={{ color: STUDIO.muted, fontFamily: DISPLAY_FONT }}>
            {allProducts.length} {page === "bikes" ? "bikes" : "products"}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="sticky top-[64px] z-30 sm:top-[80px]" style={{ backgroundColor: STUDIO.surface, borderBottom: `1px solid ${STUDIO.line}` }}>
        <div className="mx-auto max-w-[1400px] px-5 py-3 sm:px-8 lg:px-12">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CategoryFilterRow
              categories={visibleCategories}
              selectedCategory={selectedCategory}
              onToggleCategory={onCategoryToggle}
              showSaleOnly={showSaleOnly}
              onSaleOnlyToggle={onSaleOnlyToggle}
              saleCount={saleProductIds.size}
            />

            <div className="flex items-center gap-2">
              <div className="relative w-full sm:w-56">
                <Search className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: STUDIO.faint }} />
                <input
                  type="text"
                  value={storeSearch}
                  onChange={(e) => onStoreSearchChange(e.target.value)}
                  placeholder="Search"
                  className="w-full pb-1.5 pl-6 pr-8 text-[13px] focus:outline-none"
                  style={{ backgroundColor: "transparent", borderBottom: `1px solid ${STUDIO.line}`, color: STUDIO.ink, fontFamily: DISPLAY_FONT }}
                />
                {storeSearch && (
                  <button type="button" onClick={() => onStoreSearchChange("")} className="absolute right-0 top-1/2 -translate-y-1/2" style={{ color: STUDIO.faint }} aria-label="Clear">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="hidden items-center sm:flex" style={{ border: `1px solid ${STUDIO.line}`, borderRadius: 2 }}>
                <button
                  type="button"
                  onClick={() => setCompact(false)}
                  className="flex h-9 w-9 items-center justify-center transition-colors hover:bg-black/[0.04]"
                  style={{ color: !compact ? STUDIO.ink : STUDIO.faint }}
                  aria-label="Grid view"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCompact(true)}
                  className="flex h-9 w-9 items-center justify-center transition-colors hover:bg-black/[0.04]"
                  style={{ color: compact ? STUDIO.ink : STUDIO.faint, borderLeft: `1px solid ${STUDIO.line}` }}
                  aria-label="Compact view"
                >
                  <Grip className="h-4 w-4" />
                </button>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2 px-3 py-2 text-[12px] font-medium transition-colors hover:bg-black/[0.04]"
                    style={{ border: `1px solid ${STUDIO.line}`, color: STUDIO.ink, borderRadius: 2, fontFamily: DISPLAY_FONT }}
                  >
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{sortLabel(sort)}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="min-w-48 rounded-none border-0 p-1"
                  style={{ backgroundColor: STUDIO.surface, border: `1px solid ${STUDIO.line}`, boxShadow: "0 20px 50px rgba(0,0,0,0.10)" }}
                >
                  <DropdownMenuRadioGroup value={sort} onValueChange={(v) => onSortChange(v as SortKey)}>
                    {SORT_OPTIONS.map((o) => (
                      <DropdownMenuRadioItem
                        key={o.value}
                        value={o.value}
                        className="rounded-none text-[13px] focus:bg-black/[0.04]"
                        style={{ color: STUDIO.ink, fontFamily: DISPLAY_FONT }}
                      >
                        {o.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-[1400px] px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
        {allProducts.length === 0 ? (
          <EmptyState
            icon={Package}
            title={page === "bikes" ? "No bikes yet" : "No products yet"}
            body="This store hasn't listed anything in this section yet."
          />
        ) : isFlatView ? (
          filteredProducts.length > 0 ? (
            <ProductGrid products={filteredProducts} store={store} compact={compact} />
          ) : (
            <EmptyState
              icon={Search}
              title="No matches"
              body={isSearchActive ? `Nothing matches “${storeSearch.trim()}”.` : "No items match these filters."}
            />
          )
        ) : (
          <div className="space-y-16">
            {visibleCategories.map((cat) => (
              <CategoryBlock key={cat.id} category={cat} store={store} compact={compact} sort={sort} onOpenCollection={onCategoryToggle} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryFilterRow({
  categories,
  selectedCategory,
  onToggleCategory,
  showSaleOnly,
  onSaleOnlyToggle,
  saleCount,
}: {
  categories: StoreCategoryWithProducts[];
  selectedCategory: string | null;
  onToggleCategory: (name: string) => void;
  showSaleOnly: boolean;
  onSaleOnlyToggle: () => void;
  saleCount: number;
}) {
  return (
    <div className="flex flex-1 items-center gap-2 overflow-x-auto scrollbar-hide">
      <button
        type="button"
        onClick={() => onToggleCategory(selectedCategory ?? "__none__")}
        className="shrink-0 px-4 py-2 text-[12px] font-medium uppercase tracking-[0.06em] transition-colors"
        style={{
          border: `1px solid ${!selectedCategory ? STUDIO.ink : STUDIO.line}`,
          color: !selectedCategory ? "#fff" : STUDIO.ink,
          backgroundColor: !selectedCategory ? STUDIO.ink : "transparent",
          borderRadius: 2,
          fontFamily: DISPLAY_FONT,
        }}
      >
        All
      </button>
      {saleCount > 0 && (
        <button
          type="button"
          onClick={onSaleOnlyToggle}
          className="flex shrink-0 items-center gap-1.5 px-4 py-2 text-[12px] font-medium uppercase tracking-[0.06em] transition-colors"
          style={{
            border: `1px solid ${showSaleOnly ? STUDIO.sale : STUDIO.line}`,
            color: showSaleOnly ? "#fff" : STUDIO.sale,
            backgroundColor: showSaleOnly ? STUDIO.sale : "transparent",
            borderRadius: 2,
            fontFamily: DISPLAY_FONT,
          }}
        >
          <Tag className="h-3 w-3" />
          Sale ({saleCount})
        </button>
      )}
      {categories.map((c) => {
        const active = selectedCategory === c.name;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onToggleCategory(c.name)}
            className="shrink-0 px-4 py-2 text-[12px] font-medium uppercase tracking-[0.06em] transition-colors"
            style={{
              border: `1px solid ${active ? STUDIO.ink : STUDIO.line}`,
              color: active ? "#fff" : STUDIO.ink,
              backgroundColor: active ? STUDIO.ink : "transparent",
              borderRadius: 2,
              fontFamily: DISPLAY_FONT,
            }}
          >
            {c.name}
          </button>
        );
      })}
    </div>
  );
}

function CategoryBlock({
  category,
  store,
  compact,
  sort,
  onOpenCollection,
}: {
  category: StoreCategoryWithProducts;
  store: StoreProfile;
  compact: boolean;
  sort: SortKey;
  onOpenCollection: (name: string) => void;
}) {
  const products = React.useMemo(() => {
    let list = [...category.products];
    switch (sort) {
      case "price-asc": list.sort((a, b) => (a.price ?? 0) - (b.price ?? 0)); break;
      case "price-desc": list.sort((a, b) => (b.price ?? 0) - (a.price ?? 0)); break;
      case "newest":
        list.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
        break;
      default:
        list = sortProductsSaleFirst(list);
        break;
    }
    return list;
  }, [category.products, sort]);

  if (products.length === 0) return null;

  return (
    <section>
      <div className="mb-6 flex items-end justify-between gap-4 border-b pb-3" style={{ borderColor: STUDIO.line }}>
        <h2 className="text-xl tracking-[-0.01em] sm:text-2xl" style={{ fontFamily: DISPLAY_FONT, color: STUDIO.ink, fontWeight: 700 }}>
          {category.name}
        </h2>
        <button
          type="button"
          onClick={() => onOpenCollection(category.name)}
          className="group hidden items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] transition-colors hover:opacity-60 sm:flex"
          style={{ color: STUDIO.ink, fontFamily: DISPLAY_FONT }}
        >
          View all ({products.length})
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
      <ProductGrid products={products} store={store} compact={compact} />
    </section>
  );
}

function ProductGrid({
  products,
  store,
  compact,
}: {
  products: MarketplaceProduct[];
  store: StoreProfile;
  compact: boolean;
}) {
  const colClass = compact
    ? "grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
    : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";
  return (
    <div className={cn("grid gap-x-4 gap-y-10 sm:gap-x-6 sm:gap-y-12", colClass)}>
      {products.map((p, i) => (
        <AtelierProductCard
          key={p.id}
          product={p}
          storeId={store.id}
          storeName={store.store_name}
          priority={i < 4}
        />
      ))}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Package;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <Icon className="h-12 w-12" style={{ color: STUDIO.faint }} />
      <h3 className="mt-6 text-xl" style={{ fontFamily: DISPLAY_FONT, color: STUDIO.ink, fontWeight: 700 }}>
        {title}
      </h3>
      <p className="mt-2 max-w-sm text-sm" style={{ color: STUDIO.muted, fontFamily: DISPLAY_FONT }}>{body}</p>
    </div>
  );
}
