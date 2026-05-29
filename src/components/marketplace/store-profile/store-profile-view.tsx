"use client";

import * as React from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  Store,
  Phone,
  MapPin,
  Clock,
  Settings,
  Package,
  Bike,
  Wrench,
  Info,
  Star,
  Heart,
  Bookmark,
  Navigation,
  MessageSquare,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProductCard } from "@/components/marketplace/product-card";
import { ProductCarousel } from "@/components/marketplace/store-profile/product-carousel";
import { ServicesSection } from "@/components/marketplace/store-profile/services-section";
import { RentalsSection } from "@/components/marketplace/store-profile/rentals-section";
import { ContactModal } from "@/components/marketplace/store-profile/contact-modal";
import type { StoreProfile, OpeningHours } from "@/lib/types/store";
import type { MarketplaceProduct } from "@/lib/types/marketplace";

// ============================================================
// Store Profile View
// Hero-banner storefront for verified bicycle stores.
// Tabs: Products · Rentals · Service · About · Reviews
// ============================================================

const BRAND_YELLOW = "#ffde59";

type StoreTab = "products" | "rentals" | "service" | "about" | "reviews";
type SortKey = "featured" | "price-asc" | "price-desc" | "newest";

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

export function StoreProfileView({ store, isOwnProfile, immersive }: StoreProfileViewProps) {
  const [activeTab, setActiveTab] = React.useState<StoreTab>("products");
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState<SortKey>("featured");
  const [storeSearch, setStoreSearch] = React.useState("");
  const [contactOpen, setContactOpen] = React.useState(false);
  const [isFollowing, setIsFollowing] = React.useState(false);
  const [isSaved, setIsSaved] = React.useState(false);
  const [followLoading, setFollowLoading] = React.useState(false);

  const openStatus = getOpenStatus(store.opening_hours);

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

  const sortedCategories = React.useMemo(() => {
    const cats = selectedCategory
      ? store.categories.filter((c) => c.name === selectedCategory)
      : store.categories;
    const q = storeSearch.trim().toLowerCase();
    return cats.map((cat) => {
      let products = [...cat.products];
      if (q) {
        products = products.filter(
          (p) =>
            (p.display_name ?? p.description ?? "").toLowerCase().includes(q) ||
            (p.description ?? "").toLowerCase().includes(q)
        );
      }
      switch (sort) {
        case "price-asc": products.sort((a, b) => (a.price ?? 0) - (b.price ?? 0)); break;
        case "price-desc": products.sort((a, b) => (b.price ?? 0) - (a.price ?? 0)); break;
        case "newest": products.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()); break;
      }
      return { ...cat, products };
    });
  }, [selectedCategory, sort, store.categories, storeSearch]);

  const handleFollow = async () => {
    if (followLoading) return;
    setFollowLoading(true);
    setIsFollowing((v) => !v); // optimistic
    try {
      const res = await fetch("/api/marketplace/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: store.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setIsFollowing(data.isFollowing);
      }
    } catch {
      setIsFollowing((v) => !v); // revert
    } finally {
      setFollowLoading(false);
    }
  };

  const directionsUrl = store.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`
    : null;

  const tabs: { key: StoreTab; label: string; icon: typeof Package }[] = [
    { key: "products", label: "Products", icon: Package },
    { key: "rentals", label: "Rentals", icon: Bike },
    { key: "service", label: "Service", icon: Wrench },
    { key: "about", label: "About", icon: Info },
    { key: "reviews", label: "Reviews", icon: Star },
  ];

  const actionButtons = (
    <>
      {isOwnProfile ? (
        <button
          onClick={() => (window.location.href = "/settings/store")}
          className="inline-flex items-center gap-2 rounded-full px-4 h-9 text-sm font-semibold text-gray-900 cursor-pointer transition hover:brightness-95"
          style={{ backgroundColor: BRAND_YELLOW }}
        >
          <Settings className="h-4 w-4" />
          Edit Store
        </button>
      ) : (
        <button
          onClick={handleFollow}
          disabled={followLoading}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-4 h-9 text-sm font-semibold cursor-pointer transition-all disabled:opacity-70 border",
            isFollowing
              ? "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              : "text-gray-900 border-transparent hover:brightness-95"
          )}
          style={isFollowing ? undefined : { backgroundColor: BRAND_YELLOW }}
        >
          <Heart className={cn("h-4 w-4", isFollowing && "fill-current")} />
          {isFollowing ? "Following" : "Follow Store"}
        </button>
      )}
      <HeroAction icon={MessageSquare} label="Contact" onClick={() => setContactOpen(true)} />
      {directionsUrl && <HeroAction icon={Navigation} label="Directions" href={directionsUrl} />}
      {!isOwnProfile && (
        <HeroAction
          icon={Bookmark}
          label={isSaved ? "Saved" : "Save"}
          active={isSaved}
          onClick={() => setIsSaved((v) => !v)}
        />
      )}
    </>
  );

  return (
    <div className={cn("min-h-screen", immersive ? "bg-white" : "bg-gray-50")}>
      <div className={immersive ? "pt-14" : "px-3 sm:px-4 py-3 sm:py-4"}>
        <div className={immersive ? "" : "bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden"}>
      {/* ══ HERO ══════════════════════════════════════════ */}
      <section className="bg-white">
        {store.cover_image_url && (
          <div className="relative h-40 sm:h-52 overflow-hidden">
            <Image src={store.cover_image_url} alt="" fill className="object-cover" priority />
          </div>
        )}

        <div className="px-5 sm:px-8 lg:px-10 pt-5 sm:pt-6 pb-5 sm:pb-6">
          <div className="flex items-start justify-between gap-4">
            {/* Logo + identity */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-5 min-w-0">
              {/* Logo */}
              <div className="relative h-20 w-20 sm:h-24 sm:w-24 rounded-2xl overflow-hidden bg-gray-100 border border-gray-200 shadow-sm flex-shrink-0">
                {store.logo_url ? (
                  <Image src={store.logo_url} alt={store.store_name} fill className="object-cover" priority />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gray-100">
                    <Store className="h-9 w-9 text-gray-400" />
                  </div>
                )}
              </div>

              {/* Identity */}
              <div className="min-w-0 py-1">
                <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">
                  {store.store_name}
                </h1>

                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {store.store_type && (
                    <span className="text-sm text-gray-500">{store.store_type}</span>
                  )}
                  {store.store_type && openStatus && (
                    <span className="text-gray-300 text-sm">·</span>
                  )}
                  {openStatus && (
                    <span className="flex items-center gap-1.5 text-sm text-gray-500">
                      <span className={cn("inline-block h-1.5 w-1.5 rounded-full flex-shrink-0", openStatus.open ? "bg-emerald-500" : "bg-gray-300")} />
                      {openStatus.label}
                    </span>
                  )}
                </div>

                {/* Rating (only when data exists) */}
                {store.rating != null && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-sm text-gray-500">
                    <Star className="h-3.5 w-3.5 fill-current text-gray-400" />
                    <span className="font-medium text-gray-700">{store.rating.toFixed(1)}</span>
                    {store.review_count != null && (
                      <span className="text-gray-400">({store.review_count} reviews)</span>
                    )}
                  </div>
                )}

                {/* Address */}
                {store.address && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-sm text-gray-400">
                    <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">{store.address}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Top-right actions (desktop) */}
            <div className="hidden sm:flex items-center gap-2 flex-shrink-0 pt-1">
              {actionButtons}
            </div>
          </div>

          {/* Actions (mobile) */}
          <div className="flex sm:hidden flex-wrap items-center gap-2 mt-4">
            {actionButtons}
          </div>
        </div>
      </section>

      {/* ── Pill tab bar ─────────────────────────────────── */}
      <div className={cn(
        "py-3",
        immersive ? "max-w-[1400px] mx-auto px-4 sm:px-8 lg:px-12" : "px-5 sm:px-8 lg:px-10"
      )}>
        <div className="overflow-x-auto scrollbar-hide">
          <div className="inline-flex h-11 items-center gap-1 rounded-full bg-white border border-gray-200 shadow-sm p-1">
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
                    "flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 sm:px-3.5 text-sm font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20",
                    active ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ══ CATEGORY / FILTER BAR (Products only) ═════════ */}
      {activeTab === "products" && allProducts.length > 0 && (
        <div className="bg-white border-b border-gray-200">
          <div className={cn(
            "py-3",
            immersive ? "max-w-[1400px] mx-auto px-4 sm:px-8 lg:px-12" : "px-5 sm:px-8 lg:px-10"
          )}>
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Store search */}
              <div className="relative flex-shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={storeSearch}
                  onChange={(e) => setStoreSearch(e.target.value)}
                  placeholder="Search products…"
                  className="h-9 w-44 sm:w-56 rounded-full border border-gray-200 bg-white pl-8 pr-8 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-colors"
                />
                {storeSearch && (
                  <button
                    type="button"
                    onClick={() => setStoreSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* All Categories dropdown */}
              {store.categories.length > 1 && (
                <Select
                  value={selectedCategory ?? "__all__"}
                  onValueChange={(v) => setSelectedCategory(v === "__all__" ? null : v)}
                >
                  <SelectTrigger className="h-9 w-auto rounded-full border-gray-200 cursor-pointer flex-shrink-0 gap-1.5 font-medium text-gray-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Categories</SelectItem>
                    {store.categories.map((c) => (
                      <SelectItem key={c.id} value={c.name}>
                        {c.name} ({c.product_count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Category pills */}
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide flex-1 min-w-0">
                {store.categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() =>
                      setSelectedCategory((cur) => (cur === cat.name ? null : cat.name))
                    }
                    className={cn(
                      "flex-shrink-0 cursor-pointer px-3.5 py-1.5 text-sm font-medium rounded-full transition-colors whitespace-nowrap border",
                      selectedCategory === cat.name
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    )}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>

              {/* Sort + count */}
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="hidden sm:inline text-sm text-gray-500 tabular-nums">
                  {sortedCategories.reduce((n, c) => n + c.products.length, 0)} items
                </span>
                <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                  <SelectTrigger className="h-9 w-auto rounded-full border-gray-200 cursor-pointer gap-1.5 font-medium text-gray-700">
                    <span className="text-gray-500 mr-1">Sort:</span>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="featured">Featured</SelectItem>
                    <SelectItem value="price-asc">Price: Low to High</SelectItem>
                    <SelectItem value="price-desc">Price: High to Low</SelectItem>
                    <SelectItem value="newest">Newest</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ TAB CONTENT ═══════════════════════════════════ */}
      <div className={cn(
        "py-5 sm:py-7",
        immersive
          ? "max-w-[1400px] mx-auto px-4 sm:px-8 lg:px-12"
          : "px-5 sm:px-8 lg:px-10"
      )}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            {/* PRODUCTS */}
            {activeTab === "products" &&
              (allProducts.length > 0 ? (
                <div className="space-y-8">
                  {sortedCategories.map((cat, i) =>
                    cat.products.length > 0 ? (
                      <section key={cat.id}>
                        {/* Category header */}
                        <div className="flex items-center gap-2 mb-3">
                          <h3 className="text-sm font-semibold text-gray-900">{cat.name}</h3>
                          {!selectedCategory && i === 0 && (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-800" style={{ backgroundColor: '#ffde59' }}>
                              Featured
                            </span>
                          )}
                          <span className="text-xs text-gray-400 tabular-nums">({cat.products.length})</span>
                        </div>
                        {/* 6-column grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                          {cat.products.map((product, j) => (
                            <ProductCard key={product.id} product={product} priority={i === 0 && j < 6} />
                          ))}
                        </div>
                      </section>
                    ) : null
                  )}
                </div>
              ) : (
                <EmptyState
                  icon={Package}
                  title="No products yet"
                  body={
                    isOwnProfile
                      ? "Sync your inventory or add products to start showcasing your range here."
                      : "This store hasn't listed any products yet."
                  }
                />
              ))}

            {/* RENTALS */}
            {activeTab === "rentals" && <RentalsSection storeName={store.store_name} />}

            {/* SERVICE */}
            {activeTab === "service" &&
              (store.services.length > 0 ? (
                <div className="space-y-6">
                  <ServicesSection services={store.services} />
                  {!isOwnProfile && store.phone && (
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
                    isOwnProfile
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
          </motion.div>
        </AnimatePresence>
      </div>
        </div>
      </div>

      <ContactModal
        isOpen={contactOpen}
        onClose={() => setContactOpen(false)}
        storeName={store.store_name}
        phone={store.phone}
        address={store.address}
        openingHours={store.opening_hours}
      />
    </div>
  );
}

// ── Hero action button (translucent on dark) ───────────────
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
    "inline-flex items-center gap-2 rounded-full px-4 h-9 text-sm font-medium cursor-pointer transition-colors border",
    active
      ? "bg-gray-900 text-white border-gray-900"
      : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        <Icon className="h-4 w-4" />
        {label}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      <Icon className={cn("h-4 w-4", active && "fill-current")} />
      {label}
    </button>
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
          {openStatus && (
            <span
              className={cn(
                "text-xs font-medium px-2 py-0.5 rounded-full",
                openStatus.open ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
              )}
            >
              {openStatus.open ? "Open" : "Closed"}
            </span>
          )}
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
