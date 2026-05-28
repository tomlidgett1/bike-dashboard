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
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ProductCarousel } from "@/components/marketplace/store-profile/product-carousel";
import { ProductCard } from "@/components/marketplace/product-card";
import { ServicesSection } from "@/components/marketplace/store-profile/services-section";
import { RentalsSection } from "@/components/marketplace/store-profile/rentals-section";
import { ContactModal } from "@/components/marketplace/store-profile/contact-modal";
import type { StoreProfile, OpeningHours } from "@/lib/types/store";

// ============================================================
// Store Profile View
// Purpose-built storefront for verified bicycle stores.
// Three primary destinations: Products, Rentals, Service —
// presented with the homepage's pill tab control.
// ============================================================

type StoreTab = "products" | "rentals" | "service";

interface StoreProfileViewProps {
  store: StoreProfile;
  isOwnProfile?: boolean;
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

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

function getOpenStatus(hours: OpeningHours | undefined): {
  open: boolean;
  label: string;
} | null {
  if (!hours) return null;
  const now = new Date();
  const today = hours[DAY_KEYS[now.getDay()]];
  if (!today) return null;
  if (today.closed) return { open: false, label: "Closed today" };
  const cur = now.getHours() * 60 + now.getMinutes();
  const open = toMinutes(today.open);
  const close = toMinutes(today.close);
  if (cur < open) return { open: false, label: `Opens ${today.open}` };
  if (cur >= close) return { open: false, label: "Closed" };
  return { open: true, label: `Open until ${today.close}` };
}

export function StoreProfileView({ store, isOwnProfile }: StoreProfileViewProps) {
  const [activeTab, setActiveTab] = React.useState<StoreTab>("products");
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);
  const [contactOpen, setContactOpen] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const totalProducts = store.categories.reduce((s, c) => s + c.product_count, 0);
  const serviceCount = store.services.length;
  const openStatus = getOpenStatus(store.opening_hours);

  const tabs: { key: StoreTab; label: string; icon: typeof Package }[] = [
    { key: "products", label: "Products", icon: Package },
    { key: "rentals", label: "Rentals", icon: Bike },
    { key: "service", label: "Service", icon: Wrench },
  ];

  const visibleCategories = selectedCategory
    ? store.categories.filter((c) => c.name === selectedCategory)
    : store.categories;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Store Header ─────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
          <div className="flex items-start gap-4 sm:gap-5">
            {/* Logo */}
            <div className="relative h-16 w-16 sm:h-20 sm:w-20 rounded-2xl overflow-hidden bg-gray-100 border border-gray-200 flex-shrink-0">
              {store.logo_url ? (
                <Image src={store.logo_url} alt={store.store_name} fill className="object-cover" priority />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Store className="h-8 w-8 text-gray-400" />
                </div>
              )}
            </div>

            {/* Identity + actions */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
                    {store.store_name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-gray-600">
                    {store.store_type && <span className="font-medium">{store.store_type}</span>}
                    {openStatus && (
                      <span className="flex items-center gap-1.5">
                        <span className={cn("h-1.5 w-1.5 rounded-full", openStatus.open ? "bg-green-500" : "bg-gray-400")} />
                        <span className={openStatus.open ? "text-green-700 font-medium" : "text-gray-500"}>
                          {openStatus.label}
                        </span>
                      </span>
                    )}
                    {store.address && (
                      <span className="flex items-center gap-1 min-w-0">
                        <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">{store.address}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Desktop actions */}
                <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                  {isOwnProfile ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => (window.location.href = "/settings/store")}
                      className="rounded-full cursor-pointer"
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Edit Store
                    </Button>
                  ) : (
                    <>
                      {store.phone && (
                        <Button asChild size="sm" className="rounded-full cursor-pointer bg-gray-900 hover:bg-gray-800">
                          <a href={`tel:${store.phone}`}>
                            <Phone className="h-4 w-4 mr-2" />
                            Call
                          </a>
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setContactOpen(true)}
                        className="rounded-full cursor-pointer"
                      >
                        <Clock className="h-4 w-4 mr-2" />
                        Hours & info
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Brand logos (desktop, inline) */}
              {store.brands.length > 0 && (
                <div className="hidden sm:flex items-center gap-5 flex-wrap mt-3">
                  {store.brands.map((brand) => (
                    <div key={brand.id} className="flex-shrink-0">
                      {brand.logo_url ? (
                        <div className="relative h-6 w-16 grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all">
                          <Image src={brand.logo_url} alt={brand.name} fill className="object-contain" sizes="64px" />
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500 font-medium">{brand.name}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Mobile actions */}
          <div className="flex sm:hidden items-center gap-2 mt-4">
            {isOwnProfile ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => (window.location.href = "/settings/store")}
                className="rounded-full cursor-pointer flex-1"
              >
                <Settings className="h-4 w-4 mr-2" />
                Edit Store
              </Button>
            ) : (
              <>
                {store.phone && (
                  <Button asChild size="sm" className="rounded-full cursor-pointer flex-1 bg-gray-900 hover:bg-gray-800">
                    <a href={`tel:${store.phone}`}>
                      <Phone className="h-4 w-4 mr-2" />
                      Call
                    </a>
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setContactOpen(true)}
                  className="rounded-full cursor-pointer flex-1"
                >
                  <Clock className="h-4 w-4 mr-2" />
                  Hours & info
                </Button>
              </>
            )}
          </div>

          {/* Brand logos (mobile) */}
          {store.brands.length > 0 && (
            <div className="flex sm:hidden items-center gap-5 flex-wrap mt-4">
              {store.brands.map((brand) => (
                <div key={brand.id} className="flex-shrink-0">
                  {brand.logo_url ? (
                    <div className="relative h-6 w-16 grayscale opacity-60">
                      <Image src={brand.logo_url} alt={brand.name} fill className="object-contain" sizes="64px" />
                    </div>
                  ) : (
                    <span className="text-sm text-gray-500 font-medium">{brand.name}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Tab Navigation (homepage pill style) ─────────── */}
      <div className="sticky top-16 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-200">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-center">
          <div className="h-11 grid grid-cols-3 rounded-full bg-white border border-gray-200 shadow-sm p-1">
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
                    "flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full px-4 sm:px-5 text-sm font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20",
                    active ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Tab Content ──────────────────────────────────── */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            {/* PRODUCTS */}
            {activeTab === "products" && (
              <>
                {store.categories.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-4 -mx-1 px-1 snap-x">
                    <button
                      type="button"
                      onClick={() => setSelectedCategory(null)}
                      className={cn(
                        "flex-shrink-0 snap-start cursor-pointer px-3.5 py-1.5 text-sm font-medium rounded-full transition-colors",
                        !selectedCategory
                          ? "bg-gray-900 text-white"
                          : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                      )}
                    >
                      All
                    </button>
                    {store.categories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategory(cat.name)}
                        className={cn(
                          "flex-shrink-0 snap-start cursor-pointer flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-full transition-colors whitespace-nowrap",
                          selectedCategory === cat.name
                            ? "bg-gray-900 text-white"
                            : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                        )}
                      >
                        {cat.name}
                        <span className="opacity-60">{cat.product_count}</span>
                      </button>
                    ))}
                  </div>
                )}

                {totalProducts > 0 ? (
                  isMobile ? (
                    <div className="grid grid-cols-2 gap-3">
                      {visibleCategories
                        .flatMap((c) => c.products)
                        .map((product, i) => (
                          <ProductCard key={product.id} product={product} priority={i < 6} />
                        ))}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {visibleCategories.map(
                        (cat) =>
                          cat.products.length > 0 && (
                            <ProductCarousel key={cat.id} categoryName={cat.name} products={cat.products} />
                          )
                      )}
                    </div>
                  )
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
                )}
              </>
            )}

            {/* RENTALS */}
            {activeTab === "rentals" && <RentalsSection storeName={store.store_name} />}

            {/* SERVICE */}
            {activeTab === "service" &&
              (serviceCount > 0 ? (
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
                      <Button asChild className="rounded-full cursor-pointer bg-white text-gray-900 hover:bg-gray-100 flex-shrink-0">
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
          </motion.div>
        </AnimatePresence>
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
