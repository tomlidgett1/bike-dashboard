"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import {
  Store,
  Home,
  Phone,
  MapPin,
  Clock,
  Settings,
  Package,
  Bike,
  Wrench,
  Info,
  Star,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  LayoutGrid,
  Grip,
  ArrowUpDown,
  Tag,
  Shield,
  Zap,
  Lock,
  Shirt,
  CircleDot,
  Leaf,
  ImagePlus,
  Loader2 as SpinnerIcon,
  Eye,
  EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProductCard } from "@/components/marketplace/product-card";
import { StoreCarouselRowControls } from "@/components/marketplace/store-profile/store-carousel-row-controls";
import { StoreHomeTab } from "@/components/marketplace/store-profile/store-home-tab";
import { CartButton } from "@/components/marketplace/cart-button";
import { UberCarouselLogo } from "@/components/marketplace/store-profile/uber-carousel-logo";
import type { StoreCategoryWithProducts, StoreProfile, OpeningHours, StoreSectionWithCategories } from "@/lib/types/store";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { resolveLivePrice } from "@/lib/marketplace/pricing";
import { useProductImpressions, useStorePageView, useStoreSearchTracking } from "@/lib/tracking/store-analytics";

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

type StoreTab = "home" | "products" | "bikes" | "rentals" | "service" | "about" | "reviews";

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

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

function getOpenStatus(hours: OpeningHours | undefined): { open: boolean; label: string } | null {
  if (!hours) return null;
  const now = new Date();
  const today = hours[DAY_KEYS[now.getDay()]];
  if (!today) return null;
  if (today.closed) return { open: false, label: "Closed today" };
  const cur = now.getHours() * 60 + now.getMinutes();
  const open = toMinutes(today.open);
  const close = toMinutes(today.close);
  if (cur < open) return { open: false, label: `Opens ${today.open}` };
  if (cur >= close) return { open: false, label: "Closed now" };
  return { open: true, label: `Open until ${today.close}` };
}

const CATEGORY_ICON_MAP: [RegExp, typeof Package][] = [
  [/bike|bicycle|cycling|road|mountain|bmx|gravel|enduro|trail/i, Bike],
  [/e-?bike|electric/i, Zap],
  [/helmet|safety|protection|head/i, Shield],
  [/clothing|apparel|jersey|shorts|kit|wear/i, Shirt],
  [/wheel|tyre|tire|tube|rim/i, CircleDot],
  [/lock|security/i, Lock],
  [/light|lighting|led/i, Zap],
  [/nutrition|food|energy|gel|bar|drink/i, Leaf],
  [/part|component|drivetrain|brake|gear|derailleur/i, Wrench],
  [/tool/i, Wrench],
  [/accessory|accessories|bag|pack|luggage/i, Tag],
];

function getCategoryIcon(name: string): typeof Package {
  for (const [re, Icon] of CATEGORY_ICON_MAP) {
    if (re.test(name)) return Icon;
  }
  return Package;
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
  trackAnalytics?: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

function CategoryScrollRow({ products, catSize, rowIndex, isExpanded, storeId, trackAnalytics, scrollRef }: CategoryScrollRowProps) {
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
  const cardCompact = catSize === 'compact';
  const cardFeatured = catSize === 'featured';

  // ── Grid (expanded) ───────────────────────────────────────────────────────
  if (isExpanded) {
    const gridCls = cn(
      "grid grid-cols-2 gap-1.5",
      catSize === 'compact' && "sm:gap-2 sm:[grid-template-columns:repeat(auto-fill,minmax(130px,1fr))]",
      catSize === 'featured' && "sm:grid-cols-4 sm:gap-3",
      catSize === 'normal' && "sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-2.5",
    );
    return (
      <div ref={impressionRef} className={gridCls}>
        {products.map((product, j) => (
          <div key={product.id} data-analytics-product-id={product.id}>
            <ProductCard
              product={product}
              priority={rowIndex === 0 && j < 6}
              hideStoreMeta
              compact={cardCompact}
              featuredMobile={cardFeatured}
              storeId={storeId}
            />
          </div>
        ))}
      </div>
    );
  }

  // ── Horizontal scroll (default) ───────────────────────────────────────────
  return (
    <div ref={impressionRef}>
      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-hidden scrollbar-hide snap-x snap-mandatory sm:snap-none"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch', overflowY: 'hidden' } as React.CSSProperties}
      >
        {/* Single-row scroll track — fixed slots + inCarousel disable the 300px
            content-visibility placeholder that otherwise pads the row bottom. */}
        <div
          className={cn(
            "flex items-start gap-1.5",
            catSize === 'compact' ? "sm:gap-1.5" : "sm:gap-2",
          )}
        >
          {products.map((product, j) => (
            <div
              key={product.id}
              data-analytics-product-id={product.id}
              className={cn(
                "snap-start flex-none min-h-0 overflow-hidden",
                "w-[42vw] h-[calc(42vw+40px)] max-h-[calc(42vw+40px)]",
                catSize === 'featured' &&
                  "sm:w-[clamp(170px,18vw,260px)] sm:h-[calc(clamp(170px,18vw,260px)*0.75+2.75rem)] sm:max-h-[calc(clamp(170px,18vw,260px)*0.75+2.75rem)]",
                catSize === 'compact' &&
                  "sm:w-[clamp(118px,12vw,155px)] sm:h-[calc(clamp(118px,12vw,155px)+40px)] sm:max-h-[calc(clamp(118px,12vw,155px)+40px)]",
                catSize === 'normal' &&
                  "sm:w-[clamp(145px,15vw,205px)] sm:h-[calc(clamp(145px,15vw,205px)+40px)] sm:max-h-[calc(clamp(145px,15vw,205px)+40px)]",
              )}
            >
              <ProductCard
                product={product}
                priority={rowIndex === 0 && j < 6}
                hideStoreMeta
                compact={cardCompact}
                featuredMobile={cardFeatured}
                inCarousel
                storeId={storeId}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
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
  trackAnalytics,
}: {
  cat: { id: string; name: string; products: MarketplaceProduct[]; carousel_size?: string; logo_url?: string | null; hide_title?: boolean; source?: string | null };
  rowIndex: number;
  expandedCategories: Set<string>;
  setExpandedCategories: React.Dispatch<React.SetStateAction<Set<string>>>;
  compact: boolean;
  isOwnProfile?: boolean;
  storeId?: string;
  trackAnalytics?: boolean;
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
  };

  const toggleExpanded = () => {
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
    <section key={cat.id}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-3">
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
          {!cat.hide_title && <h3 className="text-base font-semibold text-gray-900">{cat.name}</h3>}
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
        trackAnalytics={trackAnalytics}
        scrollRef={scrollRef}
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
  },
): MarketplaceProduct[] {
  let filtered = [...products];
  if (options.showSaleOnly) {
    filtered = filtered.filter((p) => options.saleProductIds.has(p.id));
  }
  const query = normaliseStoreSearchText(options.searchQuery);
  if (query) {
    const queryTokens = query.split(" ").filter(Boolean);
    filtered = filtered.filter((p) => matchesStoreProductSearch(p, query, queryTokens));
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
  return filtered;
}

function normaliseStoreSearchText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function matchesStoreProductSearch(
  product: MarketplaceProduct,
  query: string,
  queryTokens: string[],
): boolean {
  const haystack = normaliseStoreSearchText(
    [
      product.display_name,
      product.description,
      product.brand,
      product.marketplace_category,
      product.marketplace_subcategory,
      product.marketplace_level_3_category,
      product.category_name,
      product.model_year,
    ]
      .filter(Boolean)
      .join(" "),
  );

  return haystack.includes(query) || queryTokens.every((token) => haystack.includes(token));
}

// ── Flat grid shown while the store product search box has a query ───────────
function ProductSearchResultsGrid({
  products,
  compact,
  storeId,
  trackAnalytics,
}: {
  products: MarketplaceProduct[];
  compact: boolean;
  storeId: string;
  trackAnalytics?: boolean;
}) {
  const impressionRef = useProductImpressions(
    trackAnalytics ? storeId : null,
    products,
    { expanded: true, carouselSize: compact ? "compact" : "normal", rowIndex: 0 },
  );

  const gridCls = cn(
    "grid grid-cols-2 gap-1.5",
    compact && "sm:gap-2 sm:[grid-template-columns:repeat(auto-fill,minmax(130px,1fr))]",
    !compact &&
      "sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 sm:gap-2.5 md:gap-3",
  );

  return (
    <div ref={impressionRef} className={gridCls}>
      {products.map((product, index) => (
        <div key={product.id} data-analytics-product-id={product.id}>
          <ProductCard
            product={product}
            priority={index < 8}
            hideStoreMeta
            compact={compact}
            storeId={storeId}
          />
        </div>
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
  trackAnalytics,
}: {
  sortedCategories: StoreProductCategory[];
  sections: StoreSectionWithCategories[];
  pageLayout?: Array<{ type: string; id: string }> | null;
  expandedCategories: Set<string>;
  setExpandedCategories: React.Dispatch<React.SetStateAction<Set<string>>>;
  compact: boolean;
  isOwnProfile?: boolean;
  storeId?: string;
  trackAnalytics?: boolean;
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
      <div key={section.id} className="bg-gray-200/60 border-y border-gray-300 -mx-5 sm:-mx-8 lg:-mx-10 px-5 sm:px-8 lg:px-10 py-1 space-y-2">
        <div>
          <div className="flex items-center gap-3">
            {hasUberCarousel && <UberCarouselLogo className="h-7 px-2.5" />}
            <h2 className="text-base font-semibold tracking-tight text-gray-900 leading-snug">{section.name}</h2>
          </div>
          {section.description && (
            <p className="mt-0.5 text-sm text-gray-500 leading-snug">{section.description}</p>
          )}
        </div>
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
              trackAnalytics={trackAnalytics}
            />
          );
        })}
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
        trackAnalytics={trackAnalytics}
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
  const [store, setStore] = React.useState(initialStore);
  // Home is the storefront landing page; it's the default tab unless the owner
  // has explicitly switched it off (homepage_config.enabled === false).
  const homeEnabled = store.homepage_config?.enabled !== false;
  const [activeTab, setActiveTab] = React.useState<StoreTab>(homeEnabled ? "home" : "products");
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState<SortKey>("featured");
  const [storeSearch, setStoreSearch] = React.useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = React.useState(false);
  const mobileSearchInputRef = React.useRef<HTMLInputElement>(null);
  const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(new Set());
  const [expandedBikesCategories, setExpandedBikesCategories] = React.useState<Set<string>>(new Set());
  const [compact, setCompact] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const [showSaleOnly, setShowSaleOnly] = React.useState(false);
  const [previewMode, setPreviewMode] = React.useState(false);
  const [hoursOpen, setHoursOpen] = React.useState(false);
  const [loadingFullProducts, setLoadingFullProducts] = React.useState(false);

  useStorePageView(isOwnProfile ? null : store.id);

  React.useEffect(() => {
    setStore(initialStore);
  }, [initialStore]);

  // When previewMode is on, strip all owner-only UI so the store sees exactly
  // what a customer sees (no logo-upload overlays, no owner-only empty states, etc.)
  const viewAsOwner = isOwnProfile && !previewMode;

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  React.useEffect(() => {
    if (
      (activeTab !== "products" && activeTab !== "bikes") ||
      store.product_feed_complete !== false
    ) {
      return;
    }

    let cancelled = false;
    setLoadingFullProducts(true);

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
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingFullProducts(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, store.id, store.product_feed_complete]);

  const openStatus = getOpenStatus(store.opening_hours);
  const headerRating =
    store.rating != null && store.homepage_config?.badges?.show_rating === true
      ? store.rating
      : null;
  const showHeaderHoursBadge = openStatus != null;

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

  // Sale product IDs — resolved with expiry awareness
  const saleProductIds = React.useMemo(
    () => new Set(allProducts.filter((p) => resolveLivePrice(p).onSale).map((p) => p.id)),
    [allProducts]
  );

  const isProductSearchActive = storeSearch.trim().length > 0;
  const mobileSearchMode =
    mobileSearchOpen && activeTab === "products" && allProducts.length > 0;

  React.useEffect(() => {
    if (activeTab !== "products") {
      setMobileSearchOpen(false);
    }
  }, [activeTab]);

  React.useEffect(() => {
    if (mobileSearchMode) {
      mobileSearchInputRef.current?.focus();
    }
  }, [mobileSearchMode]);

  const filterOptions = React.useMemo(
    () => ({ searchQuery: storeSearch, showSaleOnly, saleProductIds, sort }),
    [storeSearch, showSaleOnly, saleProductIds, sort],
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
    activeTab === "products" && isProductSearchActive,
  );

  const directionsUrl = store.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`
    : null;

  // Home-tab CTA dispatcher: tab key → switch tab; 'call'/'directions'/URL → act.
  const handleHomeNavigate = React.useCallback(
    (href: string) => {
      if (!href) return;
      if (href === "call") {
        if (store.phone) window.location.href = `tel:${store.phone}`;
        return;
      }
      if (href === "directions") {
        if (directionsUrl) window.open(directionsUrl, "_blank", "noopener,noreferrer");
        return;
      }
      if (/^https?:\/\//i.test(href)) {
        window.open(href, "_blank", "noopener,noreferrer");
        return;
      }
      const tabKeys: StoreTab[] = ["home", "products", "bikes", "rentals", "service", "about", "reviews"];
      if (tabKeys.includes(href as StoreTab)) {
        setActiveTab(href as StoreTab);
        setSelectedCategory(null);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [store.phone, directionsUrl],
  );

  // Open the Products tab pre-filtered to a category (from a Home collection tile).
  const handleOpenCollection = React.useCallback((categoryName: string) => {
    setActiveTab("products");
    setSelectedCategory(categoryName);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const tabs: { key: StoreTab; label: string; icon: typeof Package }[] = [
    ...(homeEnabled ? [{ key: "home" as StoreTab, label: "Home", icon: Home }] : []),
    { key: "products", label: "Products", icon: Package },
    { key: "bikes", label: "Bikes", icon: Bike },
    { key: "rentals", label: "Rentals", icon: CircleDot },
    { key: "service", label: "Service", icon: Wrench },
    { key: "about", label: "About", icon: Info },
    { key: "reviews", label: "Reviews", icon: Star },
  ];

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
    : "px-5 sm:px-8 lg:px-10";

  return (
    <div className={cn("min-h-screen bg-gray-50", immersive && "pt-14")}>
      <div>
      <div>
      {/* ══ STICKY STORE HEADER ════════════════════════════
          Single row: [store logo] [store name]  |  [search] [← YJ back pill] */}
      <header className={cn(
        "sticky top-0 z-40 bg-white/95 backdrop-blur-md transition-all duration-200",
        scrolled
          ? "border-b-2 border-[#ffde59]"
          : "border-b border-gray-200"
      )}>
        <div className={cn("px-5 sm:px-8 lg:px-10", mobileSearchMode && "max-md:px-3")}>
          {mobileSearchMode ? (
            <div className="relative flex h-14 w-full items-center md:hidden">
              <Search className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                ref={mobileSearchInputRef}
                type="text"
                value={storeSearch}
                onChange={(e) => setStoreSearch(e.target.value)}
                placeholder={`Search ${store.store_name}…`}
                className="h-11 w-full rounded-md border border-gray-200 bg-white pl-9 pr-10 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-colors"
              />
              <button
                type="button"
                onClick={() => {
                  if (storeSearch) {
                    setStoreSearch("");
                    mobileSearchInputRef.current?.focus();
                  } else {
                    setMobileSearchOpen(false);
                  }
                }}
                className="absolute right-2.5 top-1/2 z-10 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700 cursor-pointer"
                aria-label={storeSearch ? "Clear search" : "Close search"}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          <div
            className={cn(
              "relative h-14 items-center justify-between gap-3 sm:h-16 sm:gap-4",
              mobileSearchMode ? "hidden md:flex" : "flex",
            )}
          >
            {/* Store identity */}
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">

              <div className="h-9 w-9 sm:h-11 sm:w-11 rounded-full ring-1 ring-gray-200 flex-shrink-0 overflow-hidden bg-white">
                {store.logo_url ? (
                  <Image
                    src={store.logo_url}
                    alt={store.store_name}
                    width={44}
                    height={44}
                    sizes="44px"
                    className="h-full w-full object-cover"
                    priority
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center bg-gray-50">
                    <Store className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                  </div>
                )}
              </div>
              <div className="flex min-w-0 flex-col items-start text-left">
                <h1 className="text-[15px] sm:text-lg font-bold tracking-tight text-gray-900 leading-tight truncate">
                  {store.store_name}
                </h1>
                {showHeaderHoursBadge && openStatus && (
                  <button
                    type="button"
                    onClick={() => setHoursOpen(true)}
                    className={cn(
                      "mt-0.5 inline-flex items-center justify-start gap-1 rounded-full text-left text-[10px] font-semibold leading-none transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-900/10 sm:hidden",
                      openStatus.open ? "text-green-700" : "text-gray-600"
                    )}
                    aria-label={`Show opening hours. ${openStatus.label}`}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        openStatus.open ? "bg-green-500" : "bg-gray-400"
                      )}
                      aria-hidden="true"
                    />
                    {openStatus.label}
                  </button>
                )}
                {(headerRating != null || store.address || store.phone || showHeaderHoursBadge) && (
                  <div className="hidden min-w-0 items-center justify-start gap-1.5 text-left text-[11px] text-gray-500 sm:flex sm:text-xs sm:mt-0.5">
                    {headerRating != null && (
                      <span className="inline-flex items-center gap-0.5 flex-shrink-0">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        <span className="font-semibold text-gray-700">{headerRating.toFixed(1)}</span>
                        {store.review_count != null && (
                          <span className="text-gray-400">({store.review_count})</span>
                        )}
                      </span>
                    )}
                    {headerRating != null && store.address && (
                      <span className="text-gray-300 flex-shrink-0">·</span>
                    )}
                    {store.address && (
                      directionsUrl ? (
                        <a
                          href={directionsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate hidden sm:inline hover:text-gray-900 transition-colors"
                        >
                          {store.address}
                        </a>
                      ) : (
                        <span className="truncate hidden sm:inline">{store.address}</span>
                      )
                    )}
                    {store.address && store.phone && (
                      <span className="text-gray-300 hidden sm:inline flex-shrink-0">·</span>
                    )}
                    {store.phone && (
                      <a
                        href={`tel:${store.phone}`}
                        className="hidden sm:inline flex-shrink-0 hover:text-gray-900 transition-colors"
                      >
                        {store.phone}
                      </a>
                    )}
                    {showHeaderHoursBadge && openStatus && (
                      <>
                        {(store.address || store.phone || headerRating != null) && (
                          <span
                            className={cn(
                              "text-gray-300 flex-shrink-0",
                              headerRating == null && "hidden sm:inline"
                            )}
                          >
                            ·
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setHoursOpen(true)}
                          className={cn(
                            "inline-flex flex-shrink-0 items-center justify-start gap-1 rounded-full px-2 py-0.5 text-left text-[11px] font-semibold transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-900/10 cursor-pointer",
                            openStatus.open ? "text-green-700" : "text-gray-600"
                          )}
                          aria-label={`Show opening hours. ${openStatus.label}`}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              openStatus.open ? "bg-green-500" : "bg-gray-400"
                            )}
                            aria-hidden="true"
                          />
                          {openStatus.label}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Actions: search (products) + Edit/Preview + back to YJ */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {activeTab === "products" && allProducts.length > 0 && (
                <div className="relative hidden md:block">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={storeSearch}
                    onChange={(e) => setStoreSearch(e.target.value)}
                    placeholder="Search products…"
                    className="h-9 w-44 lg:w-56 rounded-md border border-gray-200 bg-white pl-8 pr-8 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-colors"
                  />
                  {storeSearch && (
                    <button
                      type="button"
                      onClick={() => setStoreSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
              {activeTab === "products" && allProducts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMobileSearchOpen(true)}
                  className="flex md:hidden h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors cursor-pointer"
                  aria-label="Search products"
                >
                  <Search className="h-4 w-4" />
                </button>
              )}
              {actionButtons}
              <CartButton />
              {/* Back to Yellow Jersey — far-right pill */}
              <div className="hidden sm:block h-6 w-px bg-gray-200 flex-shrink-0 ml-1" aria-hidden="true" />
              <a
                href="/marketplace"
                aria-label="Back to Yellow Jersey marketplace"
                className="hidden sm:inline-flex items-center gap-2 flex-shrink-0 rounded-full border border-gray-200 bg-white hover:bg-gray-50 px-3 py-1.5 transition-colors"
              >
                <ChevronLeft className="h-3 w-3 text-gray-400" />
                <Image
                  src="/yjlogo.svg"
                  alt="Yellow Jersey"
                  width={72}
                  height={26}
                  className="h-[22px] w-auto translate-y-[1px]"
                  unoptimized
                />
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* ── Underline tab bar ────────────────────────────── */}
      <div className={cn(
        "bg-gray-50 border-b border-gray-200",
        storeContentShell,
        mobileSearchMode && "hidden md:block",
      )}>
        <div className="flex items-center">
          {/* Tabs — scrollable */}
          <div className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain scrollbar-hide flex-1 min-w-0">
            {tabs.map(({ key, label, icon: Icon }) => {
              const active = activeTab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setActiveTab(key);
                    setSelectedCategory(null);
                  }}
                  className={cn(
	                    "relative flex cursor-pointer items-center gap-1.5 px-3 sm:px-3.5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors focus:outline-none",
                    active ? "text-gray-900" : "text-gray-500 hover:text-gray-900"
                  )}
                >
                  <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", active ? "text-gray-900" : "text-gray-400")} />
                  {label}
                  {active && (
                    <span
                      className="absolute inset-x-1.5 -bottom-px h-[2px] rounded-full bg-gray-900"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Brand logos — pinned far right, desktop only */}
          {store.brands.filter(b => b.is_active && b.logo_url).length > 0 && (
            <div className="hidden sm:flex items-center gap-3 flex-shrink-0 pl-4 ml-2 border-l border-gray-200 py-2">
              {store.brands
                .filter(b => b.is_active && b.logo_url)
                .sort((a, b) => a.display_order - b.display_order)
                .slice(0, 6)
                .map(brand => (
                  <div key={brand.id} className="h-7 w-16 flex items-center justify-center flex-shrink-0" title={brand.name}>
                    <img
                      src={brand.logo_url!}
                      alt={brand.name}
                      className="max-h-full max-w-full object-contain opacity-60 hover:opacity-100 transition-opacity"
                    />
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
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

      <StoreHoursDialog
        open={hoursOpen}
        onOpenChange={setHoursOpen}
        store={store}
        openStatus={openStatus}
      />

      {/* ── Products filter bar ─────────────────────────── */}
      {activeTab === "products" && allProducts.length > 0 && (
        <div className={cn("bg-gray-50", mobileSearchMode && "hidden md:block")}>
          <div className={cn(
            "pt-3 pb-1",
            storeContentShell
          )}>
            <div className="flex items-center gap-2 sm:gap-3">
              {isProductSearchActive ? (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {saleProductIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowSaleOnly((v) => !v)}
                      className={cn(
                        "flex-shrink-0 cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full transition-colors whitespace-nowrap border",
                        showSaleOnly
                          ? "bg-red-600 text-white border-red-600"
                          : "bg-white text-red-600 border-red-200 hover:bg-red-50"
                      )}
                    >
                      <Tag className="h-3.5 w-3.5 flex-shrink-0" />
                      Sale
                    </button>
                  )}
                  {visibleProductCount === 0 && (
                    <p className="min-w-0 text-sm text-gray-600 truncate">
                      {`No results for “${storeSearch.trim()}”`}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 overflow-x-auto overflow-y-hidden overscroll-x-contain scrollbar-hide flex-1 min-w-0">
                  {/* Sale pill — only when discounted products exist */}
                  {saleProductIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowSaleOnly((v) => !v)}
                      className={cn(
                        "flex-shrink-0 cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full transition-colors whitespace-nowrap border",
                        showSaleOnly
                          ? "bg-red-600 text-white border-red-600"
                          : "bg-white text-red-600 border-red-200 hover:bg-red-50"
                      )}
                    >
                      <Tag className="h-3.5 w-3.5 flex-shrink-0" />
                      Sale
                      <span className={cn(
                        "text-[11px] font-semibold rounded-full px-1.5 py-0 leading-5",
                        showSaleOnly ? "bg-white/20 text-white" : "bg-red-100 text-red-600"
                      )}>
                        {saleProductIds.size}
                      </span>
                    </button>
                  )}
                  {store.categories.map((cat) => {
                    const CatIcon = getCategoryIcon(cat.name);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategory((cur) => (cur === cat.name ? null : cat.name))}
                        className={cn(
                          "flex-shrink-0 cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full transition-colors whitespace-nowrap border",
                          selectedCategory === cat.name
                            ? "bg-gray-900 text-white border-gray-900"
                            : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                        )}
                      >
                        <CatIcon className="h-3.5 w-3.5 flex-shrink-0" />
                        {cat.name}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="md:hidden">
                  <StoreSortButton sort={sort} onSortChange={setSort} size="sm" />
                </div>
                <div className="hidden md:flex items-center gap-2">
                <div className="flex items-center rounded-md border border-gray-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setCompact(false)}
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
                    onClick={() => setCompact(true)}
                    className={cn(
                      "flex items-center justify-center w-8 h-8 transition-colors cursor-pointer",
                      compact ? "bg-gray-900 text-white" : "bg-white text-gray-400 hover:text-gray-700"
                    )}
                    title="Compact view"
                  >
                    <Grip className="h-3.5 w-3.5" />
                  </button>
                </div>
                <StoreSortButton sort={sort} onSortChange={setSort} size="sm" />
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
        activeTab === "home"
          ? "" // full-bleed; inherits the page's gray-50 so white cards pop
          : cn("pt-2 pb-5 sm:pt-3 sm:pb-7", storeContentShell)
      )}>
          <div key={activeTab}>
            {/* HOME — storefront landing page */}
            {activeTab === "home" && (
              <StoreHomeTab
                store={store}
                isOwnProfile={viewAsOwner}
                trackAnalytics={!isOwnProfile}
                contentShell={storeContentShell}
                onNavigate={handleHomeNavigate}
                onOpenCollection={handleOpenCollection}
                onOpenHours={() => setHoursOpen(true)}
              />
            )}

            {/* PRODUCTS */}
            {activeTab === "products" &&
              (loadingFullProducts ? (
                <div className="flex min-h-[320px] items-center justify-center gap-2 text-sm font-medium text-gray-500">
                  <SpinnerIcon className="h-4 w-4 animate-spin" />
                  Loading products...
                </div>
              ) : allProducts.length > 0 ? (
                isProductSearchActive ? (
                  searchedProducts.length > 0 ? (
                    <ProductSearchResultsGrid
                      products={searchedProducts}
                      compact={compact}
                      storeId={store.id}
                      trackAnalytics={!isOwnProfile}
                    />
                  ) : (
                    <EmptyState
                      icon={Search}
                      title="No matching products"
                      body={`Nothing in this store matches “${storeSearch.trim()}”. Try a different term or clear the search.`}
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
                    trackAnalytics={!isOwnProfile}
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

            {/* BIKES */}
            {activeTab === "bikes" &&
              (loadingFullProducts ? (
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
                        <a href={`tel:${store.phone}`}>
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
              <AboutTab store={store} openStatus={openStatus} />
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

function StoreHoursDialog({
  open,
  onOpenChange,
  store,
  openStatus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  store: StoreProfile;
  openStatus: { open: boolean; label: string } | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "top-auto bottom-0 left-0 max-w-none translate-x-0 translate-y-0 rounded-b-none rounded-t-2xl p-0 duration-200 data-open:slide-in-from-bottom-8 data-closed:slide-out-to-bottom-8",
          "sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:p-0 sm:data-open:slide-in-from-bottom-0 sm:data-closed:slide-out-to-bottom-0"
        )}
      >
        <DialogHeader className="border-b border-gray-100 px-5 pb-4 pt-5">
          <DialogTitle className="text-base font-semibold text-gray-900">
            Opening hours
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500">
            {store.store_name}
          </DialogDescription>
        </DialogHeader>
        <StoreHoursList store={store} openStatus={openStatus} />
      </DialogContent>
    </Dialog>
  );
}

function StoreHoursList({
  store,
  openStatus,
}: {
  store: StoreProfile;
  openStatus: { open: boolean; label: string } | null;
}) {
  const todayKey = DAY_KEYS[new Date().getDay()];

  return (
    <div className="px-5 pb-6 pt-4">
      {openStatus && (
        <div
          className={cn(
            "mb-4 flex items-center justify-between rounded-lg px-3 py-2 text-sm",
            openStatus.open ? "bg-green-50 text-green-800" : "bg-gray-100 text-gray-700"
          )}
        >
          <span className="font-semibold">{openStatus.open ? "Open now" : "Closed"}</span>
          <span className="text-xs font-medium">{openStatus.label}</span>
        </div>
      )}

      <div className="space-y-1.5">
        {WEEK_ORDER.map((day) => {
          const h = store.opening_hours?.[day];
          const isToday = day === todayKey;

          return (
            <div
              key={day}
              className={cn(
                "flex items-center justify-between rounded-md px-3 py-2 text-sm",
                isToday ? "bg-gray-900 font-semibold text-white" : "text-gray-600"
              )}
            >
              <span className="capitalize">{day}</span>
              <span>
                {!h || h.closed ? (
                  <span className={cn(isToday ? "text-white/75" : "text-gray-400")}>
                    Closed
                  </span>
                ) : (
                  `${h.open} - ${h.close}`
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── About tab ──────────────────────────────────────────────
function AboutTab({
  store,
  openStatus,
}: {
  store: StoreProfile;
  openStatus: { open: boolean; label: string } | null;
}) {
  const todayKey = DAY_KEYS[new Date().getDay()];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-5xl">
      {/* Left: about + contact */}
      <div className="lg:col-span-2 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">About {store.store_name}</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            {store.description ||
              `${store.store_name}${store.store_type ? ` — ${store.store_type}` : ""}. Visit us in store or get in touch for products, rentals and servicing.`}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {store.address && (
            <InfoTile icon={MapPin} label="Address" value={store.address} />
          )}
          {store.phone && (
            <InfoTile icon={Phone} label="Phone" value={store.phone} href={`tel:${store.phone}`} />
          )}
        </div>

        {store.brands.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Brands we stock</h3>
            <div className="flex items-center gap-5 flex-wrap">
              {store.brands.map((brand) => (
                <div key={brand.id}>
                  {brand.logo_url ? (
                    <div className="relative h-7 w-20 grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition-all">
                      <Image src={brand.logo_url} alt={brand.name} fill className="object-contain" sizes="80px" />
                    </div>
                  ) : (
                    <span className="text-sm text-gray-500 font-medium">{brand.name}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: opening hours */}
      <div className="rounded-2xl border border-gray-200 p-5 h-fit">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-400" />
            Opening hours
          </h3>
        </div>
        <div className="space-y-2">
          {WEEK_ORDER.map((day) => {
            const h = store.opening_hours?.[day];
            const isToday = day === todayKey;
            return (
              <div
                key={day}
                className={cn(
                  "flex items-center justify-between text-sm",
                  isToday ? "font-semibold text-gray-900" : "text-gray-600"
                )}
              >
                <span className="capitalize">{day}</span>
                <span>
                  {!h || h.closed ? (
                    <span className="text-gray-400">Closed</span>
                  ) : (
                    `${h.open} – ${h.close}`
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Package;
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <div className="flex items-start gap-3 rounded-xl border border-gray-200 p-4">
      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
        <Icon className="h-4 w-4 text-gray-600" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className="text-sm text-gray-900 mt-0.5 break-words">{value}</p>
      </div>
    </div>
  );
  return href ? (
    <a href={href} className="block hover:bg-gray-50 rounded-xl transition-colors cursor-pointer">
      {content}
    </a>
  ) : (
    content
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
