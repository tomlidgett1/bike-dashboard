"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import {
  Phone,
  MapPin,
  Settings,
  Package,
  Bike,
  Wrench,
  Star,
  ChevronRight,
  Search,
  LayoutGrid,
  Grip,
  ArrowUpDown,
  Tag,
  ImagePlus,
  Loader2 as SpinnerIcon,
  Eye,
  EyeOff,
} from '@/components/layout/app-sidebar/dashboard-icons';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StoreProductCard } from "@/components/marketplace/store-profile/store-product-card";
import { StoreProductCarouselScroll } from "@/components/marketplace/store-profile/store-product-carousel-scroll";
import { ListItemBannerSlot } from "@/components/marketplace/list-item-banner";
import { BikeIcon, getCategoryIconName } from "@/components/ui/bike-icon";
import { StoreCarouselRowControls } from "@/components/marketplace/store-profile/store-carousel-row-controls";
import { StoreHomeTab } from "@/components/marketplace/store-profile/store-home-tab";
import {
  StoreProfileChrome,
  STORE_PAGE_CONTENT_SHELL,
  parseStoreTabParam,
  type StoreTab,
} from "@/components/marketplace/store-profile/store-profile-chrome";
import { UberCarouselLogo } from "@/components/marketplace/store-profile/uber-carousel-logo";
import type { StoreCategoryWithProducts, StoreProfile, OpeningHours, StoreSectionWithCategories } from "@/lib/types/store";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { resolveLivePrice, sortProductsSaleFirst } from "@/lib/marketplace/pricing";
import {
  buildStoreProductSearchContext,
  filterAndRankStoreProductsBySearch,
} from "@/lib/marketplace/store-product-search";
import {
  trackStoreBehaviourEvent,
  useProductImpressions,
  useStorePageView,
  useStoreScrollDepthTracking,
  useStoreSearchTracking,
  useStoreSectionViewTracking,
  useStoreTabTracking,
} from "@/lib/tracking/store-analytics";

// ============================================================
// Store Profile View
// Hero-banner storefront for verified bicycle stores.
// Tabs: Products · Bikes · Rentals · Service · About · Reviews
// ============================================================

const BRAND_YELLOW = "#ffde59";

const ServicesSection = dynamic(() =>
  import("@/components/marketplace/store-profile/services-section").then((mod) => mod.ServicesSection),
);
const RentalsSection = dynamic(() =>
  import("@/components/marketplace/store-profile/rentals-section").then((mod) => mod.RentalsSection),
);

function isBikesStorePage(category: { store_page?: string | null }) {
  return category.store_page === "bikes";
}
type SortKey = "featured" | "price-asc" | "price-desc" | "newest";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "newest", label: "Newest" },
];

function sortLabel(key: SortKey): string {
  return SORT_OPTIONS.find((option) => option.value === key)?.label ?? "Featured";
}

function StoreSortButton({
  sort,
  onSortChange,
  size = "md",
}: {
  sort: SortKey;
  onSortChange: (sort: SortKey) => void;
  size?: "md" | "sm";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Sort: ${sortLabel(sort)}`}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white shadow-none transition-colors cursor-pointer",
            size === "md" ? "h-9 w-9 min-w-9" : "h-8 w-8 min-w-8",
            sort !== "featured" ? "text-gray-900" : "text-gray-500 hover:text-gray-700",
          )}
        >
          <ArrowUpDown className={size === "md" ? "h-4 w-4" : "h-3.5 w-3.5"} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44 bg-white">
        <DropdownMenuRadioGroup value={sort} onValueChange={(v) => onSortChange(v as SortKey)}>
          {SORT_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
type StoreProductCategory = StoreCategoryWithProducts & {
  products: MarketplaceProduct[];
  carousel_size?: string;
  section_id?: string | null;
  logo_url?: string | null;
  hide_title?: boolean;
  subtitle?: string | null;
};

interface StoreProfileViewProps {
  store: StoreProfile;
  isOwnProfile?: boolean;
  /** Immersive / full-screen mode — hides YJ header, adds top breathing room */
  immersive?: boolean;
}

const DAY_KEYS: (keyof OpeningHours)[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const WEEK_ORDER: (keyof OpeningHours)[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

function StoreProductCategoryPills({
  categories,
  selectedCategory,
  onToggleCategory,
  showSaleOnly,
  onToggleSaleOnly,
  saleCount,
  searchQuery,
  emptySearchMessage,
  className,
}: {
  categories: StoreCategoryWithProducts[];
  selectedCategory: string | null;
  onToggleCategory: (name: string) => void;
  showSaleOnly: boolean;
  onToggleSaleOnly: () => void;
  saleCount: number;
  searchQuery: string;
  emptySearchMessage?: string;
  className?: string;
}) {
  const isSearchActive = searchQuery.trim().length > 0;

  const salePill = saleCount > 0 && (
    <button
      type="button"
      onClick={onToggleSaleOnly}
      className={cn(
        "flex-shrink-0 cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full transition-colors whitespace-nowrap border",
        showSaleOnly
          ? "bg-red-600 text-white border-red-600"
          : "bg-white text-red-600 border-red-200 hover:bg-red-50",
      )}
    >
      <Tag className="h-3.5 w-3.5 flex-shrink-0" />
      Sale
      {!isSearchActive && (
        <span
          className={cn(
            "text-[11px] font-semibold rounded-full px-1.5 py-0 leading-5",
            showSaleOnly ? "bg-white/20 text-white" : "bg-red-100 text-red-600",
          )}
        >
          {saleCount}
        </span>
      )}
    </button>
  );

  if (isSearchActive) {
    return (
      <div className={cn("flex items-center gap-2 min-w-0", className)}>
        {salePill}
        {emptySearchMessage && (
          <p className="min-w-0 text-sm text-gray-600 truncate">{emptySearchMessage}</p>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 overflow-x-auto overflow-y-hidden overscroll-x-contain scrollbar-hide min-w-0",
        className,
      )}
    >
      {salePill}
      {categories.map((cat) => {
        const isActive = selectedCategory === cat.name;
        const iconName = getCategoryIconName(cat.name);
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onToggleCategory(cat.name)}
            className={cn(
              "flex-shrink-0 cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full transition-colors whitespace-nowrap border",
              isActive
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50",
            )}
          >
            <BikeIcon
              iconName={iconName}
              size={18}
              className={cn(
                "h-[18px] w-[18px] flex-shrink-0 transition-opacity",
                isActive ? "opacity-100 brightness-0 invert" : "opacity-60",
              )}
            />
            {cat.name}
          </button>
        );
      })}
    </div>
  );
}

function getCollapsedCarouselLimit(
  catSize: 'featured' | 'normal' | 'compact',
  viewportWidth: number,
): number {
  if (viewportWidth >= 1800) {
    return catSize === 'featured' ? 10 : catSize === 'compact' ? 16 : 14;
  }
  if (viewportWidth >= 1536) {
    return catSize === 'featured' ? 8 : catSize === 'compact' ? 14 : 12;
  }
  if (viewportWidth >= 1280) {
    return catSize === 'featured' ? 6 : catSize === 'compact' ? 12 : 10;
  }
  if (viewportWidth >= 1024) {
    return catSize === 'featured' ? 5 : catSize === 'compact' ? 10 : 8;
  }
  return catSize === 'featured' ? 4 : 8;
}

// ── Per-category horizontal-scroll row ─────────────────────────────────────
interface CategoryScrollRowProps {
  products: MarketplaceProduct[];
  catSize: 'featured' | 'normal' | 'compact';
  rowIndex: number;
  isExpanded: boolean;
  storeId: string;
  storeName: string;
  trackAnalytics?: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** When true, carousel bleeds to screen edges on mobile (standalone rows). */
  edgeBleed?: boolean;
  onBackgroundRemove?: (product: MarketplaceProduct) => void;
  backgroundRemovingIds?: Set<string>;
}

function CategoryScrollRow({
  products,
  catSize,
  rowIndex,
  isExpanded,
  storeId,
  storeName,
  trackAnalytics,
  scrollRef,
  edgeBleed = false,
  onBackgroundRemove,
  backgroundRemovingIds,
}: CategoryScrollRowProps) {
  const impressionContext = React.useMemo(
    () => ({ rowIndex, carouselSize: catSize, expanded: isExpanded }),
    [catSize, isExpanded, rowIndex],
  );
  const impressionRef = useProductImpressions(
    trackAnalytics ? storeId : null,
    products,
    impressionContext,
  );

  // Mobile: uniform card slots. sm+: widths follow carousel_size from settings.

  // ── Grid (expanded) ───────────────────────────────────────────────────────
  if (isExpanded) {
    const gridCls = cn(
      "grid grid-cols-2 gap-3",
      catSize === 'compact' && "sm:gap-3 sm:[grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]",
      catSize === 'featured' && "sm:grid-cols-4 sm:gap-4",
      catSize === 'normal' && "sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-4",
    );
    return (
      <div ref={impressionRef} className={gridCls}>
        {products.map((product, j) => (
          <React.Fragment key={product.id}>
            <div className="h-full" data-analytics-product-id={product.id}>
              <StoreProductCard
                product={product}
                priority={rowIndex === 0 && j < 6}
                inCarousel={false}
                storeId={storeId}
                storeName={storeName}
                onBackgroundRemove={onBackgroundRemove}
                backgroundRemoveBusy={backgroundRemovingIds?.has(product.id) ?? false}
              />
            </div>
            <ListItemBannerSlot
              productIndex={j}
              productCount={products.length}
            />
          </React.Fragment>
        ))}
      </div>
    );
  }

  // ── Horizontal scroll (default) ───────────────────────────────────────────
  return (
    <div ref={impressionRef} className="min-w-0 max-w-full">
      <StoreProductCarouselScroll scrollRef={scrollRef} bleed={edgeBleed}>
        {products.map((product, j) => (
          <div
            key={product.id}
            data-analytics-product-id={product.id}
            className={cn(
              "snap-start flex-none min-h-0",
              "w-[42vw]",
              catSize === 'featured' &&
                "sm:w-[clamp(170px,18vw,260px)]",
              catSize === 'compact' &&
                "sm:w-[clamp(118px,12vw,155px)]",
              catSize === 'normal' &&
                "sm:w-[clamp(145px,15vw,205px)]",
            )}
          >
            <StoreProductCard
              product={product}
              priority={rowIndex === 0 && j < 6}
              inCarousel
              storeId={storeId}
              storeName={storeName}
              onBackgroundRemove={onBackgroundRemove}
              backgroundRemoveBusy={backgroundRemovingIds?.has(product.id) ?? false}
            />
          </div>
        ))}
      </StoreProductCarouselScroll>
    </div>
  );
}

function CarouselEditableTitle({
  name,
  categoryId,
  canEdit,
  onRename,
}: {
  name: string;
  categoryId: string;
  canEdit?: boolean;
  onRename?: (categoryId: string, name: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(name);
  const [saving, setSaving] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setDraft(name);
  }, [name]);

  React.useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const commit = React.useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === name) {
      setDraft(name);
      setEditing(false);
      return;
    }
    if (!onRename) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const ok = await onRename(categoryId, trimmed);
    setSaving(false);
    if (ok) {
      setEditing(false);
    } else {
      setDraft(name);
      setEditing(false);
    }
  }, [categoryId, draft, name, onRename]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          }
          if (e.key === "Escape") {
            setDraft(name);
            setEditing(false);
          }
        }}
        disabled={saving}
        className="min-w-[8rem] max-w-[min(100%,20rem)] rounded-md border border-gray-200 bg-white px-2 py-0.5 text-base font-semibold text-gray-900 focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
        aria-label="Carousel name"
      />
    );
  }

  return (
    <h3
      className={cn(
        "text-base font-semibold text-gray-900",
        canEdit && "cursor-text rounded-md px-1 hover:bg-gray-100/80",
      )}
      onDoubleClick={() => {
        if (canEdit) setEditing(true);
      }}
      title={canEdit ? "Double-click to rename" : undefined}
    >
      {name}
    </h3>
  );
}

// ── Single carousel row within a section or standalone ─────────────────────
function CarouselRow({
  cat,
  rowIndex,
  expandedCategories,
  setExpandedCategories,
  compact,
  isOwnProfile,
  storeId,
  storeName,
  trackAnalytics,
  onBackgroundRemove,
  backgroundRemovingIds,
  onCategoryRename,
  edgeBleed = true,
}: {
  cat: {
    id: string;
    name: string;
    products: MarketplaceProduct[];
    carousel_size?: string;
    logo_url?: string | null;
    hide_title?: boolean;
    subtitle?: string | null;
    source?: string | null;
  };
  rowIndex: number;
  expandedCategories: Set<string>;
  setExpandedCategories: React.Dispatch<React.SetStateAction<Set<string>>>;
  compact: boolean;
  isOwnProfile?: boolean;
  storeId?: string;
  storeName: string;
  trackAnalytics?: boolean;
  onBackgroundRemove?: (product: MarketplaceProduct) => void;
  backgroundRemovingIds?: Set<string>;
  onCategoryRename?: (categoryId: string, name: string) => Promise<boolean>;
  edgeBleed?: boolean;
}) {
  const [logoUrl, setLogoUrl] = React.useState<string | null>(cat.logo_url ?? null);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !storeId) return;
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split('.').pop();
      // Path must be under the authenticated user's folder to satisfy bucket RLS
      const path = `${storeId}/category-${cat.id}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('logo')
        .upload(path, file, { cacheControl: '31536000', upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('logo').getPublicUrl(path);
      await fetch(`/api/marketplace/store/${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId: cat.id, logo_url: publicUrl }),
      });
      setLogoUrl(publicUrl);
    } catch (err) {
      console.error('Category logo upload failed:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const catSize = (compact ? 'compact' : (cat.carousel_size ?? 'normal')) as 'featured' | 'normal' | 'compact';
  const isExpanded = expandedCategories.has(cat.id);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);
  const [viewportWidth, setViewportWidth] = React.useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth
  );

  React.useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // How many cards fit on screen — used only to decide when to show "See All" (grid expand).
  // The horizontal carousel always includes every product so arrows can scroll the full set.
  const collapsedLimit = getCollapsedCarouselLimit(catSize, viewportWidth);
  const displayedProducts = cat.products;
  const showSeeAll = cat.products.length > collapsedLimit;

  const checkScroll = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }, []);

  // Reset scroll position only when carousel content/mode changes — not on every
  // checkScroll re-render (displayedProducts used to be a fresh .slice() each render).
  React.useEffect(() => {
    if (isExpanded) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = 0;
    checkScroll();
  }, [isExpanded, cat.id, cat.products.length, checkScroll]);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || isExpanded) return;

    const t = setTimeout(checkScroll, 60);
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);

    const resizeObserver = new ResizeObserver(() => checkScroll());
    resizeObserver.observe(el);

    return () => {
      clearTimeout(t);
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
      resizeObserver.disconnect();
    };
  }, [checkScroll, isExpanded, cat.id, cat.products.length]);

  const scrollCarousel = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollAmount = el.clientWidth * 0.75;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const target =
      dir === "left"
        ? Math.max(0, el.scrollLeft - scrollAmount)
        : Math.min(maxScroll, el.scrollLeft + scrollAmount);

    el.scrollTo({ left: target, behavior: "smooth" });
    if (trackAnalytics && storeId) {
      trackStoreBehaviourEvent(storeId, "carousel_scroll", {
        categoryId: cat.id,
        categoryName: cat.name,
        rowIndex,
        direction: dir,
        carouselSize: catSize,
        scrollFrom: Math.round(el.scrollLeft),
        scrollTo: Math.round(target),
      });
    }
  };

  const toggleExpanded = () => {
    if (trackAnalytics && storeId) {
      trackStoreBehaviourEvent(storeId, "carousel_expand", {
        categoryId: cat.id,
        categoryName: cat.name,
        rowIndex,
        carouselSize: catSize,
        expanded: !isExpanded,
      });
    }
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (isExpanded) {
        next.delete(cat.id);
      } else {
        next.add(cat.id);
      }
      return next;
    });
  };

  if (cat.products.length === 0) return null;

  return (
    <section
      key={cat.id}
      data-store-analytics-section={`carousel:${cat.id}`}
      data-store-analytics-label={cat.name}
    >
      <div className={cn("mb-1 flex items-center justify-between gap-2", !edgeBleed && "px-4 sm:px-4 lg:px-4 xl:px-5")}>
        <div className="flex min-w-0 items-center gap-3">
          {logoUrl ? (
            <div className="group relative h-8 flex-shrink-0 inline-flex items-center">
              <img src={logoUrl} alt={cat.name} className="h-full w-auto max-w-[96px] object-contain rounded-sm" />
              {isOwnProfile && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 flex items-center justify-center bg-white/70 opacity-0 group-hover:opacity-100 transition-opacity rounded cursor-pointer"
                  title="Change logo"
                >
                  {uploading ? <SpinnerIcon className="h-3.5 w-3.5 animate-spin text-gray-600" /> : <ImagePlus className="h-3.5 w-3.5 text-gray-600" />}
                </button>
              )}
            </div>
          ) : isOwnProfile ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors cursor-pointer disabled:opacity-50"
              title="Add logo"
            >
              {uploading ? <SpinnerIcon className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
              <span>Add logo</span>
            </button>
          ) : null}
          {isOwnProfile && (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleLogoUpload}
            />
          )}
          {!cat.hide_title && (
            <div className="min-w-0">
              <CarouselEditableTitle
                name={cat.name}
                categoryId={cat.id}
                canEdit={isOwnProfile}
                onRename={onCategoryRename}
              />
              {cat.subtitle ? (
                <p className="m-0 mt-0.5 truncate text-sm leading-snug text-gray-500">
                  {cat.subtitle}
                </p>
              ) : null}
            </div>
          )}
        </div>
        {isExpanded ? (
          <button
            type="button"
            onClick={toggleExpanded}
            className="text-sm font-semibold text-gray-900 hover:text-gray-700 transition-colors cursor-pointer flex-shrink-0"
          >
            Show less
          </button>
        ) : (
          <StoreCarouselRowControls
            showSeeAll={showSeeAll}
            seeAllLabel="See All"
            onSeeAll={toggleExpanded}
            canScrollLeft={canScrollLeft}
            canScrollRight={canScrollRight}
            onScrollLeft={() => scrollCarousel("left")}
            onScrollRight={() => scrollCarousel("right")}
          />
        )}
      </div>
      <CategoryScrollRow
        products={displayedProducts}
        catSize={catSize}
        rowIndex={rowIndex}
        isExpanded={isExpanded}
        storeId={storeId ?? ''}
        storeName={storeName}
        trackAnalytics={trackAnalytics}
        scrollRef={scrollRef}
        edgeBleed={edgeBleed}
        onBackgroundRemove={onBackgroundRemove}
        backgroundRemovingIds={backgroundRemovingIds}
      />
    </section>
  );
}

function applyStoreProductFilters(
  products: MarketplaceProduct[],
  options: {
    searchQuery: string;
    showSaleOnly: boolean;
    saleProductIds: Set<string>;
    sort: SortKey;
    searchContext: ReturnType<typeof buildStoreProductSearchContext>;
  },
): MarketplaceProduct[] {
  let filtered = [...products];
  if (options.showSaleOnly) {
    filtered = filtered.filter((p) => options.saleProductIds.has(p.id));
  }

  const query = options.searchQuery.trim();
  if (query) {
    filtered = filterAndRankStoreProductsBySearch(filtered, query, options.searchContext);
  }

  switch (options.sort) {
    case "price-asc":
      filtered.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
      break;
    case "price-desc":
      filtered.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
      break;
    case "newest":
      filtered.sort(
        (a, b) =>
          new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
      );
      break;
    default:
      break;
  }

  if (options.showSaleOnly || query) {
    return filtered;
  }
  return sortProductsSaleFirst(filtered);
}

// ── Flat grid shown while the store product search box has a query ───────────
function ProductSearchResultsGrid({
  products,
  compact,
  storeId,
  storeName,
  trackAnalytics,
  onBackgroundRemove,
  backgroundRemovingIds,
}: {
  products: MarketplaceProduct[];
  compact: boolean;
  storeId: string;
  storeName: string;
  trackAnalytics?: boolean;
  onBackgroundRemove?: (product: MarketplaceProduct) => void;
  backgroundRemovingIds?: Set<string>;
}) {
  const impressionRef = useProductImpressions(
    trackAnalytics ? storeId : null,
    products,
    { expanded: true, carouselSize: compact ? "compact" : "normal", rowIndex: 0 },
  );

  const gridCls = cn(
    "grid grid-cols-2 gap-3",
    compact && "sm:gap-3 sm:[grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]",
    !compact &&
      "sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 sm:gap-4",
  );

  return (
    <div ref={impressionRef} className={gridCls}>
      {products.map((product, index) => (
        <React.Fragment key={product.id}>
          <div className="h-full" data-analytics-product-id={product.id}>
            <StoreProductCard
              product={product}
              priority={index < 8}
              storeId={storeId}
              storeName={storeName}
              onBackgroundRemove={onBackgroundRemove}
              backgroundRemoveBusy={backgroundRemovingIds?.has(product.id) ?? false}
            />
          </div>
          <ListItemBannerSlot
            productIndex={index}
            productCount={products.length}
          />
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Products tab — sections + standalone carousels ──────────────────────────
function ProductsTab({
  sortedCategories,
  sections,
  pageLayout,
  expandedCategories,
  setExpandedCategories,
  compact,
  isOwnProfile,
  storeId,
  storeName,
  trackAnalytics,
  onBackgroundRemove,
  backgroundRemovingIds,
  onCategoryRename,
}: {
  sortedCategories: StoreProductCategory[];
  sections: StoreSectionWithCategories[];
  pageLayout?: Array<{ type: string; id: string }> | null;
  expandedCategories: Set<string>;
  setExpandedCategories: React.Dispatch<React.SetStateAction<Set<string>>>;
  compact: boolean;
  isOwnProfile?: boolean;
  storeId?: string;
  storeName: string;
  trackAnalytics?: boolean;
  onBackgroundRemove?: (product: MarketplaceProduct) => void;
  backgroundRemovingIds?: Set<string>;
  onCategoryRename?: (categoryId: string, name: string) => Promise<boolean>;
}) {
  const productsByCatId = new Map(sortedCategories.map((c) => [c.id, c.products]));

  // Sections that have at least one visible carousel (after search/filter)
  const visibleSectionMap = new Map<string, StoreSectionWithCategories & { categories: StoreProductCategory[] }>(
    sections
      .map((sec) => ({
        ...sec,
        categories: sec.categories
          .map((c) => ({ ...c, products: productsByCatId.get(c.id) ?? c.products }))
          .filter((c) => c.products.length > 0),
      }))
      .filter((sec) => sec.categories.length > 0)
      .map((sec) => [sec.id, sec as StoreSectionWithCategories & { categories: StoreProductCategory[] }])
  );

  // Standalone carousels (not in any section)
  const sectionedIds = new Set(sections.flatMap((s) => s.categories.map((c) => c.id)));
  const allSectionedIds = new Set([...visibleSectionMap.values()].flatMap((s) => s.categories.map((c) => c.id)));
  const standaloneById = new Map(
    sortedCategories
      .filter((c) => (!c.section_id && !sectionedIds.has(c.id) && c.products.length > 0)
        || (c.section_id && !allSectionedIds.has(c.id) && c.products.length > 0))
      .map((c) => [c.id, c])
  );

  let rowIndex = 0;

  // ── Render helpers ──────────────────────────────────────────
  const renderSection = (section: StoreSectionWithCategories & { categories: StoreProductCategory[] }) => {
    const hasUberCarousel = section.categories.some((cat) => cat.source === "uber");

    return (
      <div key={section.id} className="overflow-x-hidden border-y border-gray-300 bg-gray-200/60 py-4">
        <div className="mb-2 px-4 sm:px-4 lg:px-4 xl:px-5">
          <div className="flex items-center gap-3">
            {hasUberCarousel && <UberCarouselLogo className="h-7 px-2.5" />}
            <h2 className="text-base font-semibold tracking-tight text-gray-900 leading-snug">{section.name}</h2>
          </div>
          {section.description && (
            <p className="mt-0.5 text-sm text-gray-500 leading-snug">{section.description}</p>
          )}
        </div>
        <div className="space-y-2">
        {section.categories.map((cat) => {
          const r = rowIndex++;
          return (
            <CarouselRow
              key={cat.id}
              cat={{ ...cat, logo_url: cat.logo_url ?? null }}
              rowIndex={r}
              expandedCategories={expandedCategories}
              setExpandedCategories={setExpandedCategories}
              compact={compact}
              isOwnProfile={isOwnProfile}
              storeId={storeId}
              storeName={storeName}
              trackAnalytics={trackAnalytics}
              edgeBleed={false}
              onBackgroundRemove={onBackgroundRemove}
              backgroundRemovingIds={backgroundRemovingIds}
              onCategoryRename={onCategoryRename}
            />
          );
        })}
        </div>
      </div>
    );
  };

  const renderCarousel = (cat: (typeof sortedCategories)[number]) => {
    const r = rowIndex++;
    return (
      <CarouselRow
        key={cat.id}
        cat={cat}
        rowIndex={r}
        expandedCategories={expandedCategories}
        setExpandedCategories={setExpandedCategories}
        compact={compact}
        isOwnProfile={isOwnProfile}
        storeId={storeId}
        storeName={storeName}
        trackAnalytics={trackAnalytics}
        onBackgroundRemove={onBackgroundRemove}
        backgroundRemovingIds={backgroundRemovingIds}
        onCategoryRename={onCategoryRename}
      />
    );
  };

  // ── Layout-driven rendering (interleaved) ───────────────────
  if (pageLayout && pageLayout.length > 0) {
    const renderedIds = new Set<string>();
    const ordered: React.ReactNode[] = [];

    for (const entry of pageLayout) {
      if (entry.type === 'section') {
        const sec = visibleSectionMap.get(entry.id);
        if (sec) { ordered.push(renderSection(sec)); renderedIds.add(entry.id); }
      } else if (entry.type === 'carousel') {
        const cat = standaloneById.get(entry.id);
        if (cat) { ordered.push(renderCarousel(cat)); renderedIds.add(entry.id); }
      }
    }

    // Append anything not yet in the saved layout (newly created items)
    const extras: React.ReactNode[] = [];
    for (const [id, sec] of visibleSectionMap) {
      if (!renderedIds.has(id)) extras.push(renderSection(sec));
    }
    for (const [id, cat] of standaloneById) {
      if (!renderedIds.has(id)) extras.push(renderCarousel(cat));
    }

    return (
      <div className="space-y-2">
        {ordered}
        {extras}
      </div>
    );
  }

  // ── Fallback: sections first, then standalone ───────────────
  const visibleSections = [...visibleSectionMap.values()];
  const standalonePlusSectionless = [...standaloneById.values()];

  return (
    <div className="space-y-2">
      {visibleSections.map((section) => renderSection(section))}
      {standalonePlusSectionless.map((cat) => renderCarousel(cat))}
    </div>
  );
}

export function StoreProfileView({ store: initialStore, isOwnProfile, immersive }: StoreProfileViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [store, setStore] = React.useState(initialStore);
  // Home is the storefront landing page; it's the default tab unless the owner
  // has explicitly switched it off (homepage_config.enabled === false).
  const homeEnabled = store.homepage_config?.enabled !== false;
  const tabFromUrl = parseStoreTabParam(searchParams.get("tab"), homeEnabled);
  const [activeTab, setActiveTab] = React.useState<StoreTab>(
    tabFromUrl ?? (homeEnabled ? "home" : "products"),
  );
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState<SortKey>("featured");
  const [storeSearch, setStoreSearch] = React.useState(searchParams.get("q") ?? "");
  const [mobileSearchOpen, setMobileSearchOpen] = React.useState(false);
  const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(new Set());
  const [expandedBikesCategories, setExpandedBikesCategories] = React.useState<Set<string>>(new Set());
  const [compact, setCompact] = React.useState(false);
  const [showSaleOnly, setShowSaleOnly] = React.useState(false);
  const [previewMode, setPreviewMode] = React.useState(false);
  const [hoursOpen, setHoursOpen] = React.useState(false);
  const [backgroundRemovingIds, setBackgroundRemovingIds] = React.useState<Set<string>>(new Set());
  const analyticsRootRef = React.useRef<HTMLDivElement | null>(null);
  const shouldTrackStoreAnalytics = !isOwnProfile;
  const analyticsContext = React.useMemo(() => ({ tab: activeTab }), [activeTab]);

  useStorePageView(shouldTrackStoreAnalytics ? store.id : null);
  useStoreTabTracking(shouldTrackStoreAnalytics ? store.id : null, activeTab, shouldTrackStoreAnalytics);
  useStoreScrollDepthTracking(
    shouldTrackStoreAnalytics ? store.id : null,
    analyticsContext,
    shouldTrackStoreAnalytics,
  );
  useStoreSectionViewTracking(
    shouldTrackStoreAnalytics ? store.id : null,
    analyticsRootRef,
    analyticsContext,
    shouldTrackStoreAnalytics,
  );

  React.useEffect(() => {
    setStore(initialStore);
  }, [initialStore]);

  // When previewMode is on, strip all owner-only UI so the store sees exactly
  // what a customer sees (no logo-upload overlays, no owner-only empty states, etc.)
  const viewAsOwner = isOwnProfile && !previewMode;

  // Load the full product catalog in the background as soon as the (lean) store
  // page mounts, so the Products/Bikes tabs are ready by the time they're opened
  // — without bloating the Home payload with every category's products. Deferred
  // slightly so it never competes with the Home tab's first paint.
  React.useEffect(() => {
    if (store.product_feed_complete !== false) return;

    let cancelled = false;

    const timer = window.setTimeout(() => {
      fetch(`/api/marketplace/store/${store.id}`)
        .then(async (response) => {
          if (!response.ok) throw new Error(`Store products request failed: ${response.status}`);
          return response.json();
        })
        .then((data) => {
          if (!cancelled && data.store) {
            setStore(data.store);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            console.error('[Store profile] Failed to load full product feed:', error);
          }
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [store.id, store.product_feed_complete]);

  // Flatten + dedupe products across categories
  const allProducts = React.useMemo(() => {
    const seen = new Set<string>();
    const out: MarketplaceProduct[] = [];
    for (const cat of store.categories) {
      for (const p of cat.products) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          out.push(p);
        }
      }
    }
    return out;
  }, [store.categories]);

  const storeSearchContext = React.useMemo(
    () => buildStoreProductSearchContext(store.categories, store.brands ?? []),
    [store.categories, store.brands],
  );

  // Sale product IDs — resolved with expiry awareness
  const saleProductIds = React.useMemo(
    () => new Set(allProducts.filter((p) => resolveLivePrice(p).onSale).map((p) => p.id)),
    [allProducts]
  );

  const isProductSearchActive = storeSearch.trim().length > 0;
  const isCategoryPillFilterActive = selectedCategory !== null || showSaleOnly;
  const showProductGrid = isProductSearchActive || isCategoryPillFilterActive;
  const showHeaderSearch =
    (activeTab === "home" || activeTab === "products") && allProducts.length > 0;
  const mobileSearchMode = mobileSearchOpen && showHeaderSearch;

  React.useEffect(() => {
    if (activeTab !== "products" && activeTab !== "home") {
      setMobileSearchOpen(false);
    }
  }, [activeTab]);

  const filterOptions = React.useMemo(
    () => ({ searchQuery: storeSearch, showSaleOnly, saleProductIds, sort, searchContext: storeSearchContext }),
    [storeSearch, showSaleOnly, saleProductIds, sort, storeSearchContext],
  );

  const searchedProducts = React.useMemo(() => {
    const pool = selectedCategory
      ? store.categories
          .filter((c) => c.name === selectedCategory)
          .flatMap((c) => c.products)
      : allProducts;
    const seen = new Set<string>();
    const unique: MarketplaceProduct[] = [];
    for (const p of pool) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        unique.push(p);
      }
    }
    return applyStoreProductFilters(unique, filterOptions);
  }, [allProducts, selectedCategory, store.categories, filterOptions]);

  const buildSortedCategories = React.useCallback(
    (page: "products" | "bikes") => {
      const pageCategories = store.categories.filter((category) =>
        page === "bikes"
          ? isBikesStorePage(category)
          : !isBikesStorePage(category),
      );
      const cats = selectedCategory
        ? pageCategories.filter((c) => c.name === selectedCategory)
        : pageCategories;
      return cats.map((cat) => ({
        ...cat,
        products: applyStoreProductFilters(cat.products, filterOptions),
        logo_url: cat.logo_url ?? null,
      }));
    },
    [selectedCategory, store.categories, filterOptions],
  );

  const sortedCategories = React.useMemo(
    () => buildSortedCategories("products"),
    [buildSortedCategories],
  );

  const sortedBikesCategories = React.useMemo(
    () => buildSortedCategories("bikes"),
    [buildSortedCategories],
  );

  const productsSections = React.useMemo(
    () =>
      (store.sections ?? []).map((section) => ({
        ...section,
        categories: section.categories.filter((category) => !isBikesStorePage(category)),
      })),
    [store.sections],
  );

  const bikesCarouselCount = React.useMemo(
    () =>
      sortedBikesCategories.reduce(
        (count, category) => count + (category.products.length > 0 ? 1 : 0),
        0,
      ),
    [sortedBikesCategories],
  );

  const visibleProductCount = isProductSearchActive
    ? searchedProducts.length
    : sortedCategories.reduce((n, c) => n + c.products.length, 0);

  useStoreSearchTracking(
    isOwnProfile ? null : store.id,
    storeSearch,
    visibleProductCount,
    (activeTab === "products" || activeTab === "home") && isProductSearchActive,
  );

  const directionsUrl = store.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`
    : null;

  const trackBehaviour = React.useCallback(
    (eventType: Parameters<typeof trackStoreBehaviourEvent>[1], metadata: Record<string, unknown> = {}) => {
      if (!shouldTrackStoreAnalytics) return;
      trackStoreBehaviourEvent(store.id, eventType, metadata);
    },
    [shouldTrackStoreAnalytics, store.id],
  );

  const handleStoreSearchChange = React.useCallback(
    (value: string, source: "store_header_search" | "home_floating_search" = "store_header_search") => {
      setStoreSearch((current) => {
        if (!current.trim() && value.trim()) {
          trackBehaviour("search_focus", { tab: activeTab, source });
        }
        if (current.trim() && !value.trim()) {
          trackBehaviour("search_clear", { tab: activeTab, source });
        }
        return value;
      });

      // Header search on Home jumps to Products. The home floating search bar
      // stays on Home and renders results inline so typing isn't interrupted.
      if (source !== "home_floating_search" && value.trim().length > 0) {
        setActiveTab((tab) => {
          if (tab !== "home") return tab;
          window.requestAnimationFrame(() => {
            window.scrollTo({ top: 0, behavior: "smooth" });
          });
          return "products";
        });
      }
    },
    [activeTab, trackBehaviour],
  );

  const handleTabSelect = React.useCallback(
    (tab: StoreTab) => {
      setActiveTab(tab);
      setSelectedCategory(null);
    },
    [],
  );

  const handleCategoryToggle = React.useCallback(
    (name: string) => {
      setSelectedCategory((current) => {
        const next = current === name ? null : name;
        trackBehaviour("category_filter", {
          tab: activeTab,
          categoryName: name,
          selected: next === name,
        });
        return next;
      });
    },
    [activeTab, trackBehaviour],
  );

  const handleSaleOnlyToggle = React.useCallback(() => {
    setShowSaleOnly((current) => {
      trackBehaviour("category_filter", {
        tab: activeTab,
        categoryName: "Sale",
        selected: !current,
      });
      return !current;
    });
  }, [activeTab, trackBehaviour]);

  const handleSortChange = React.useCallback(
    (nextSort: SortKey) => {
      trackBehaviour("sort_change", {
        tab: activeTab,
        sort: nextSort,
        previousSort: sort,
      });
      setSort(nextSort);
    },
    [activeTab, sort, trackBehaviour],
  );

  const handleHoursOpenChange = React.useCallback(
    (open: boolean) => {
      if (open) {
        trackBehaviour("hours_open", { tab: activeTab, source: "store_profile_chrome" });
      }
      setHoursOpen(open);
    },
    [activeTab, trackBehaviour],
  );

  // Home-tab CTA dispatcher: tab key → switch tab; 'call'/'directions'/URL → act.
  const handleHomeNavigate = React.useCallback(
    (href: string) => {
      if (!href) return;
      if (href === "call") {
        trackBehaviour("contact_click", { action: "call", label: "Call", tab: activeTab, source: "home_cta" });
        if (store.phone) window.location.href = `tel:${store.phone}`;
        return;
      }
      if (href === "directions") {
        trackBehaviour("contact_click", { action: "directions", label: "Directions", tab: activeTab, source: "home_cta" });
        if (directionsUrl) window.open(directionsUrl, "_blank", "noopener,noreferrer");
        return;
      }
      if (/^https?:\/\//i.test(href)) {
        trackBehaviour("cta_click", { action: "external_link", href, tab: activeTab, source: "home_cta" });
        window.open(href, "_blank", "noopener,noreferrer");
        return;
      }
      const tabKeys: StoreTab[] = ["home", "products", "bikes", "rentals", "service", "about", "reviews"];
      if (tabKeys.includes(href as StoreTab)) {
        const tab = href as StoreTab;
        trackBehaviour("cta_click", { action: "open_tab", tab, previousTab: activeTab, source: "home_cta" });
        setActiveTab(tab);
        setSelectedCategory(null);
        if (tab === "home") {
          handleStoreSearchChange("");
          setMobileSearchOpen(false);
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [activeTab, directionsUrl, handleStoreSearchChange, store.phone, trackBehaviour],
  );

  // Open the Products tab pre-filtered to a category (from a Home collection tile).
  const handleOpenCollection = React.useCallback((categoryName: string) => {
    trackBehaviour("collection_open", {
      categoryName,
      previousTab: activeTab,
      source: "home_collection",
    });
    setActiveTab("products");
    setSelectedCategory(categoryName);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeTab, trackBehaviour]);

  const handleCategoryRename = React.useCallback(
    async (categoryId: string, name: string): Promise<boolean> => {
      const previousName = store.categories.find((c) => c.id === categoryId)?.name;
      try {
        const response = await fetch("/api/store/categories", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: categoryId, name }),
        });
        if (!response.ok) return false;

        const renameInList = (categories: StoreCategoryWithProducts[]) =>
          categories.map((category) =>
            category.id === categoryId ? { ...category, name } : category,
          );

        setStore((prev) => ({
          ...prev,
          categories: renameInList(prev.categories),
          sections: prev.sections.map((section) => ({
            ...section,
            categories: renameInList(section.categories),
          })),
        }));

        if (previousName) {
          setSelectedCategory((current) => (current === previousName ? name : current));
        }
        return true;
      } catch (error) {
        console.error("[Store profile] Failed to rename carousel:", error);
        return false;
      }
    },
    [store.categories],
  );

  const patchStoreProduct = React.useCallback(
    (productId: string, patch: Partial<MarketplaceProduct>) => {
      const patchCategories = (categories: StoreCategoryWithProducts[]) =>
        categories.map((category) => ({
          ...category,
          products: category.products.map((product) =>
            product.id === productId ? { ...product, ...patch } : product,
          ),
        }));

      setStore((prev) => ({
        ...prev,
        categories: patchCategories(prev.categories),
        sections: prev.sections.map((section) => ({
          ...section,
          categories: patchCategories(section.categories),
        })),
      }));
    },
    [],
  );

  const handleBackgroundRemove = React.useCallback(
    async (product: MarketplaceProduct) => {
      let alreadyRunning = false;
      setBackgroundRemovingIds((prev) => {
        if (prev.has(product.id)) {
          alreadyRunning = true;
          return prev;
        }
        return new Set([...prev, product.id]);
      });
      if (alreadyRunning) return;

      try {
        const response = await fetch(`/api/products/${product.id}/background-remove`, {
          method: "POST",
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.success) {
          throw new Error(json.error || "Background fix failed");
        }
        patchStoreProduct(product.id, json.product ?? {});
      } catch (error) {
        console.error("[Store profile] Background fix failed:", error);
      } finally {
        setBackgroundRemovingIds((prev) => {
          const next = new Set(prev);
          next.delete(product.id);
          return next;
        });
      }
    },
    [patchStoreProduct],
  );

  const actionButtons = (
    <>
      {isOwnProfile && !previewMode && (
        <HeroAction
          icon={Settings}
          label="Edit Store"
          onClick={() => {
            router.push("/settings/store/landing");
          }}
        />
      )}
      {isOwnProfile && (
        <HeroAction
          icon={previewMode ? EyeOff : Eye}
          label={previewMode ? "Exit preview" : "Preview"}
          active={previewMode}
          onClick={() => setPreviewMode((v) => !v)}
        />
      )}
    </>
  );
  const storeContentShell = immersive
    ? "max-w-[1400px] mx-auto px-4 sm:px-8 lg:px-12"
    : STORE_PAGE_CONTENT_SHELL;

  return (
    <div ref={analyticsRootRef} className={cn("min-h-screen overflow-x-hidden bg-gray-50", immersive && "pt-14")}>
      <div>
      <div>
      <StoreProfileChrome
        store={store}
        contentShell={storeContentShell}
        activeTab={activeTab}
        storeSearch={storeSearch}
        onStoreSearchChange={handleStoreSearchChange}
        mobileSearchOpen={mobileSearchOpen}
        onMobileSearchOpenChange={setMobileSearchOpen}
        showHeaderSearch={showHeaderSearch}
        hoursOpen={hoursOpen}
        onHoursOpenChange={handleHoursOpenChange}
        onTabSelect={handleTabSelect}
        actionButtons={actionButtons}
        immersive={immersive}
        onBehaviourEvent={trackBehaviour}
        floatingBarExtra={
          activeTab === "products" && allProducts.length > 0 ? (
            <StoreProductCategoryPills
              className="flex-1"
              categories={store.categories}
              selectedCategory={selectedCategory}
              onToggleCategory={handleCategoryToggle}
              showSaleOnly={showSaleOnly}
              onToggleSaleOnly={handleSaleOnlyToggle}
              saleCount={saleProductIds.size}
              searchQuery={storeSearch}
              emptySearchMessage={
                isProductSearchActive && visibleProductCount === 0
                  ? `No results for “${storeSearch.trim()}”`
                  : undefined
              }
            />
          ) : undefined
        }
      />
      </div>

      {/* Cover banner (optional) — scrolls beneath the sticky header.
          Hidden on Home, where the hero owns the cover imagery. */}
      {store.cover_image_url && activeTab !== "home" && (
        <div className={cn(
          "relative h-32 sm:h-44 lg:h-52 w-full overflow-hidden bg-gray-100",
          mobileSearchMode && "hidden md:block",
        )}>
          <Image src={store.cover_image_url} alt="" fill sizes="100vw" className="object-cover" priority />
          <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
        </div>
      )}

      {/* ── Products filter bar ─────────────────────────── */}
      {activeTab === "products" && allProducts.length > 0 && (
        <div className={cn("bg-gray-50", mobileSearchMode && "hidden md:block")}>
          <div className={cn(
            "pt-3 pb-1",
            storeContentShell
          )}>
            <div className="flex items-center gap-2 sm:gap-3">
              <StoreProductCategoryPills
                className="flex-1"
                categories={store.categories}
                selectedCategory={selectedCategory}
                onToggleCategory={handleCategoryToggle}
                showSaleOnly={showSaleOnly}
                onToggleSaleOnly={handleSaleOnlyToggle}
                saleCount={saleProductIds.size}
                searchQuery={storeSearch}
                emptySearchMessage={
                  isProductSearchActive && visibleProductCount === 0
                    ? `No results for “${storeSearch.trim()}”`
                    : undefined
                }
              />

              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="md:hidden">
                  <StoreSortButton sort={sort} onSortChange={handleSortChange} size="sm" />
                </div>
                <div className="hidden md:flex items-center gap-2">
                <div className="flex items-center rounded-md border border-gray-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      trackBehaviour("cta_click", { action: "view_density", label: "Default view", tab: activeTab });
                      setCompact(false);
                    }}
                    className={cn(
                      "flex items-center justify-center w-8 h-8 transition-colors cursor-pointer",
                      !compact ? "bg-gray-900 text-white" : "bg-white text-gray-400 hover:text-gray-700"
                    )}
                    title="Default view"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      trackBehaviour("cta_click", { action: "view_density", label: "Compact view", tab: activeTab });
                      setCompact(true);
                    }}
                    className={cn(
                      "flex items-center justify-center w-8 h-8 transition-colors cursor-pointer",
                      compact ? "bg-gray-900 text-white" : "bg-white text-gray-400 hover:text-gray-700"
                    )}
                    title="Compact view"
                  >
                    <Grip className="h-3.5 w-3.5" />
                  </button>
                </div>
                <StoreSortButton sort={sort} onSortChange={handleSortChange} size="sm" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ TAB CONTENT ═══════════════════════════════════
          Home is full-bleed (it manages its own width + spacing); every other
          tab keeps the standard padded container. */}
      <div className={cn(
        "overflow-x-hidden",
        activeTab === "home"
          ? ""
          : cn("pt-2 pb-5 sm:pt-3 sm:pb-7", storeContentShell)
      )}>
          <div
            key={activeTab}
            data-store-analytics-section={`tab:${activeTab}`}
            data-store-analytics-label={`${activeTab} tab`}
          >
            {/* HOME — storefront landing page */}
            {activeTab === "home" && (
              <StoreHomeTab
                store={store}
                isOwnProfile={viewAsOwner}
                trackAnalytics={!isOwnProfile}
                contentShell={storeContentShell}
                onNavigate={handleHomeNavigate}
                onOpenCollection={handleOpenCollection}
                onOpenHours={() => handleHoursOpenChange(true)}
                onTrackBehaviour={trackBehaviour}
                storeSearch={storeSearch}
                onStoreSearchChange={allProducts.length > 0 ? handleStoreSearchChange : undefined}
                homeSearchResultsSlot={
                  isProductSearchActive ? (
                    searchedProducts.length > 0 ? (
                      <ProductSearchResultsGrid
                        products={searchedProducts}
                        compact={compact}
                        storeId={store.id}
                        storeName={store.store_name}
                        trackAnalytics={!isOwnProfile}
                        onBackgroundRemove={viewAsOwner ? handleBackgroundRemove : undefined}
                        backgroundRemovingIds={backgroundRemovingIds}
                      />
                    ) : (
                      <EmptyState
                        icon={Search}
                        title="No matching products"
                        body={`Nothing in this store matches “${storeSearch.trim()}”. Try a different term or clear the search.`}
                      />
                    )
                  ) : null
                }
              />
            )}

            {/* PRODUCTS — the Home payload is lean (it carries only featured +
                on-sale products), so the full catalog loads in the background on
                mount. Show a brief loader until it's ready — it's usually already
                loaded by the time this tab is opened. */}
            {activeTab === "products" &&
              (!store.product_feed_complete ? (
                <div className="flex min-h-[320px] items-center justify-center gap-2 text-sm font-medium text-gray-500">
                  <SpinnerIcon className="h-4 w-4 animate-spin" />
                  Loading products...
                </div>
              ) : allProducts.length > 0 ? (
                showProductGrid ? (
                  searchedProducts.length > 0 ? (
                    <ProductSearchResultsGrid
                      products={searchedProducts}
                      compact={compact}
                      storeId={store.id}
                      storeName={store.store_name}
                      trackAnalytics={!isOwnProfile}
                      onBackgroundRemove={viewAsOwner ? handleBackgroundRemove : undefined}
                      backgroundRemovingIds={backgroundRemovingIds}
                    />
                  ) : (
                    <EmptyState
                      icon={isProductSearchActive ? Search : Tag}
                      title="No matching products"
                      body={
                        isProductSearchActive
                          ? `Nothing in this store matches “${storeSearch.trim()}”. Try a different term or clear the search.`
                          : showSaleOnly && selectedCategory
                            ? `No sale items in “${selectedCategory}”. Try another category or clear the filters.`
                            : showSaleOnly
                              ? "Nothing on sale right now. Check back soon or browse all products."
                              : `No products in “${selectedCategory}”. Try another category or clear the filter.`
                      }
                    />
                  )
                ) : (
                  <ProductsTab
                    sortedCategories={sortedCategories}
                    sections={productsSections}
                    pageLayout={store.homepage_config?.products_page_layout}
                    expandedCategories={expandedCategories}
                    setExpandedCategories={setExpandedCategories}
                    compact={compact}
                    isOwnProfile={viewAsOwner}
                    storeId={store.id}
                    storeName={store.store_name}
                    trackAnalytics={!isOwnProfile}
                    onBackgroundRemove={viewAsOwner ? handleBackgroundRemove : undefined}
                    backgroundRemovingIds={backgroundRemovingIds}
                    onCategoryRename={viewAsOwner ? handleCategoryRename : undefined}
                  />
                )
              ) : (
                <EmptyState
                  icon={Package}
                  title="No products yet"
                  body={
                    viewAsOwner
                      ? "Sync your inventory or add products to start showcasing your range here."
                      : "This store hasn't listed any products yet."
                  }
                />
              ))}

            {/* BIKES — same lean-home behaviour as Products: wait for the
                background full-feed fetch before rendering the catalog. */}
            {activeTab === "bikes" &&
              (!store.product_feed_complete ? (
                <div className="flex min-h-[320px] items-center justify-center gap-2 text-sm font-medium text-gray-500">
                  <SpinnerIcon className="h-4 w-4 animate-spin" />
                  Loading bikes...
                </div>
              ) : bikesCarouselCount > 0 ? (
                <ProductsTab
                  sortedCategories={sortedBikesCategories}
                  sections={[]}
                  pageLayout={store.homepage_config?.bikes_page_layout}
                  expandedCategories={expandedBikesCategories}
                  setExpandedCategories={setExpandedBikesCategories}
                  compact={compact}
                  isOwnProfile={viewAsOwner}
                  storeId={store.id}
                  storeName={store.store_name}
                  trackAnalytics={!isOwnProfile}
                />
              ) : (
                <EmptyState
                  icon={Bike}
                  title="No bikes yet"
                  body={
                    viewAsOwner
                      ? "Add carousels to your Bikes page in Settings → Storefront → Carousels."
                      : "This store hasn't listed any bikes yet."
                  }
                />
              ))}

            {/* RENTALS */}
            {activeTab === "rentals" &&
              (store.rentals.length > 0 ? (
                <div className="space-y-6">
                  <RentalsSection
                    rentals={store.rentals}
                    storeName={store.store_name}
                    storeId={store.id}
                    storePhone={store.phone}
                  />
                  {!viewAsOwner && store.phone && (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-md bg-gray-900 text-white px-6 py-5">
                      <div>
                        <h3 className="text-base font-semibold">Interested in hiring?</h3>
                        <p className="text-sm text-gray-300 mt-0.5">
                          Call {store.store_name} to check availability and book a rental.
                        </p>
                      </div>
                      <a
                        href={`tel:${store.phone.replace(/\s/g, "")}`}
                        onClick={() =>
                          trackBehaviour("contact_click", {
                            action: "call",
                            label: "Call rental store",
                            tab: "rentals",
                            source: "rentals_banner",
                          })
                        }
                        className="inline-flex items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100 transition-colors"
                      >
                        Call {store.phone}
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <RentalsSection rentals={[]} storeName={store.store_name} storeId={store.id} />
              ))}

            {/* SERVICE */}
            {activeTab === "service" &&
              (store.services.length > 0 ? (
                <div className="space-y-6">
                  <ServicesSection services={store.services} />
                  {!viewAsOwner && store.phone && (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl bg-gray-900 text-white px-6 py-5">
                      <div>
                        <h3 className="text-base font-semibold">Need a service or repair?</h3>
                        <p className="text-sm text-gray-300 mt-0.5">
                          Give {store.store_name} a call to book your bike in.
                        </p>
                      </div>
                      <Button
                        asChild
                        className="rounded-lg cursor-pointer text-gray-900 font-semibold hover:brightness-95 flex-shrink-0"
                        style={{ backgroundColor: BRAND_YELLOW }}
                      >
                        <a
                          href={`tel:${store.phone}`}
                          onClick={() =>
                            trackBehaviour("service_book_click", {
                              action: "call_to_book",
                              label: "Call to book",
                              serviceName: "Call to book",
                              tab: "service",
                              source: "services_banner",
                            })
                          }
                        >
                          <Phone className="h-4 w-4 mr-2" />
                          Call to book
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </a>
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState
                  icon={Wrench}
                  title="No services listed"
                  body={
                    viewAsOwner
                      ? "Add the services you offer so customers know what you can help with."
                      : "This store hasn't listed any services yet."
                  }
                />
              ))}

            {/* ABOUT */}
            {activeTab === "about" && (
              <div className="pt-2 sm:pt-4">
                <AboutTab store={store} />
              </div>
            )}

            {/* REVIEWS */}
            {activeTab === "reviews" && (
              <EmptyState
                icon={Star}
                title="No reviews yet"
                body="Reviews from customers will appear here once this store has been rated."
              />
            )}
          </div>
      </div>
      </div>

    </div>
  );
}

// ── Hero secondary action button ───────────────────────────
function HeroAction({
  icon: Icon,
  label,
  onClick,
  href,
  active,
}: {
  icon: typeof Package;
  label: string;
  onClick?: () => void;
  href?: string;
  active?: boolean;
}) {
  const cls = cn(
    "inline-flex items-center gap-1.5 rounded-md px-2.5 h-8 text-sm font-medium cursor-pointer transition-colors",
    active
      ? "bg-gray-100 text-gray-900"
      : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        <Icon className="h-3.5 w-3.5" />
        {label}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      <Icon className={cn("h-3.5 w-3.5", active && "fill-current")} />
      {label}
    </button>
  );
}

// ── About tab ──────────────────────────────────────────────
function normaliseStoreDescription(description: string | null | undefined): string | null {
  if (!description) return null;
  const trimmed = description.trim();
  if (!trimmed || /^n\/?a$/i.test(trimmed)) return null;
  return trimmed;
}

function AboutTab({
  store,
}: {
  store: StoreProfile;
}) {
  const todayKey = DAY_KEYS[new Date().getDay()];
  const description =
    normaliseStoreDescription(store.description) ??
    `${store.store_name}${store.store_type ? ` — ${store.store_type}` : ""}. Visit us in store or get in touch for products, rentals and servicing.`;

  const directionsUrl = store.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`
    : null;

  const hasContact = Boolean(store.address || store.phone);
  const hasHours = Boolean(store.opening_hours);

  return (
    <div className="mx-auto max-w-2xl space-y-10 sm:space-y-12">
      {/* Intro */}
      <section className="space-y-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-400">
          About
        </p>
        <h2 className="text-[28px] font-semibold tracking-tight text-gray-900 sm:text-[32px]">
          {store.store_name}
        </h2>
        <p className="text-[15px] leading-[1.65] text-gray-500 sm:text-base">
          {description}
        </p>
      </section>

      {/* Contact */}
      {hasContact && (
        <section className="space-y-2.5">
          <p className="px-1 text-[11px] font-medium uppercase tracking-[0.14em] text-gray-400">
            Contact
          </p>
          <div className="overflow-hidden rounded-md bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.04]">
            {store.address && (
              <a
                href={directionsUrl ?? undefined}
                target={directionsUrl ? "_blank" : undefined}
                rel={directionsUrl ? "noopener noreferrer" : undefined}
                className={cn(
                  "group flex items-center gap-3.5 px-4 py-3.5 transition-colors",
                  directionsUrl && "cursor-pointer hover:bg-gray-50/80",
                  store.phone && "border-b border-gray-100",
                )}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-50">
                  <MapPin className="h-[17px] w-[17px] text-gray-500" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-gray-400">Address</p>
                  <p className="mt-0.5 text-[15px] leading-snug text-gray-900">{store.address}</p>
                </div>
                {directionsUrl && (
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-400" />
                )}
              </a>
            )}
            {store.phone && (
              <a
                href={`tel:${store.phone.replace(/\s/g, "")}`}
                className="group flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-gray-50/80 cursor-pointer"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-50">
                  <Phone className="h-[17px] w-[17px] text-gray-500" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-gray-400">Phone</p>
                  <p className="mt-0.5 text-[15px] leading-snug text-gray-900">{store.phone}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-400" />
              </a>
            )}
          </div>
        </section>
      )}

      {/* Opening hours */}
      {hasHours && (
        <section className="space-y-2.5">
          <p className="px-1 text-[11px] font-medium uppercase tracking-[0.14em] text-gray-400">
            Opening hours
          </p>
          <div className="overflow-hidden rounded-md bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.04]">
            {WEEK_ORDER.map((day, index) => {
              const h = store.opening_hours?.[day];
              const isToday = day === todayKey;
              const hoursLabel =
                !h || h.closed ? "Closed" : `${h.open} – ${h.close}`;

              return (
                <div
                  key={day}
                  className={cn(
                    "flex items-center justify-between px-4 py-3",
                    index < WEEK_ORDER.length - 1 && "border-b border-gray-100",
                    isToday && "bg-gray-50/60",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-[15px] capitalize",
                        isToday ? "font-semibold text-gray-900" : "text-gray-600",
                      )}
                    >
                      {day}
                    </span>
                    {isToday && (
                      <span className="rounded-md bg-gray-900 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        Today
                      </span>
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-[15px] tabular-nums",
                      isToday ? "font-medium text-gray-900" : "text-gray-500",
                      (!h || h.closed) && "text-gray-400",
                    )}
                  >
                    {hoursLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Brands */}
      {store.brands.length > 0 && (
        <section className="space-y-3">
          <p className="px-1 text-[11px] font-medium uppercase tracking-[0.14em] text-gray-400">
            Brands we stock
          </p>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3">
            {store.brands.map((brand) => (
              <div
                key={brand.id}
                className="flex aspect-[5/3] items-center justify-center rounded-md bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.04] transition-shadow hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
              >
                {brand.logo_url ? (
                  <div className="relative h-full w-full">
                    <Image
                      src={brand.logo_url}
                      alt={brand.name}
                      fill
                      className="object-contain opacity-70 grayscale transition-all duration-300 hover:opacity-100 hover:grayscale-0"
                      sizes="(max-width: 640px) 28vw, 120px"
                    />
                  </div>
                ) : (
                  <span className="text-center text-xs font-medium leading-tight text-gray-500">
                    {brand.name}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
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
    <div className="flex items-center justify-center py-16 sm:py-24 px-4">
      <div className="text-center max-w-sm mx-auto">
        <div className="rounded-full bg-gray-100 p-5 sm:p-6 mb-4 inline-block">
          <Icon className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400" />
        </div>
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}
