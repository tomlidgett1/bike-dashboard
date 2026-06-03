"use client";

export const dynamic = 'force-dynamic';

import * as React from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { Loader2, User, Package, ArrowLeft, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { MarketplaceLayout } from "@/components/layout/marketplace-layout";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import { ProductCard } from "@/components/marketplace/product-card";
import { ProductCarousel } from "@/components/marketplace/store-profile/product-carousel";
import { SellerHeader, SellerCategories } from "@/components/marketplace/seller-profile";
import { StoreProfileView } from "@/components/marketplace/store-profile/store-profile-view";
import { useAuth } from "@/components/providers/auth-provider";
import {
  clearStoreSplashSeed,
  readStoreSplashSeed,
  type StoreSplashSeed,
} from "@/lib/marketplace/store-splash";
import type { StoreProfile } from "@/lib/types/store";
import type { SellerProfile, SellerCategory } from "@/app/api/marketplace/seller/[sellerId]/route";
import type { MarketplaceProduct } from "@/lib/types/marketplace";

// ============================================================
// Profile Page
// Routes to one of two purpose-built experiences:
// - Bicycle stores  → StoreProfileView (Products/Rentals/Service)
// - Individual sellers → seller layout (For sale / Sold)
// ============================================================

type ProfileType = 'store' | 'seller' | null;

// Convert seller categories to marketplace products for carousel display
function convertSellerProductsToMarketplace(
  categories: SellerCategory[],
  sellerId: string,
  displayName: string,
  logoUrl: string | null
): { name: string; products: MarketplaceProduct[] }[] {
  return categories.map(cat => ({
    name: cat.display_name || cat.name,
    products: cat.products.map(p => ({
      id: p.id,
      description: p.description,
      display_name: p.display_name ?? undefined,
      price: p.price,
      marketplace_category: p.marketplace_category ?? '',
      marketplace_subcategory: p.marketplace_subcategory ?? '',
      primary_image_url: p.primary_image_url,
      image_variants: null,
      image_formats: null,
      store_name: displayName,
      store_logo_url: logoUrl,
      store_id: sellerId,
      category: p.marketplace_category,
      qoh: 1,
      model_year: null,
      created_at: p.created_at,
      user_id: sellerId,
      listing_type: 'private_listing' as const,
      condition_rating: p.condition_rating as MarketplaceProduct['condition_rating'],
    })),
  }));
}

export default function StoreProfilePage() {
  const params = useParams();
  const storeId = params.storeId as string;
  const { user } = useAuth();
  const router = useRouter();
  const [immersive, setImmersive] = React.useState(false);

  const [profileType, setProfileType] = React.useState<ProfileType>(null);
  const [store, setStore] = React.useState<StoreProfile | null>(null);
  const [seller, setSeller] = React.useState<SellerProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);
  const [selectedTab, setSelectedTab] = React.useState<'for-sale' | 'sold'>('for-sale');
  const [isMobile, setIsMobile] = React.useState(false);

  const isOwnProfile = user?.id === storeId;

  type SplashPhase = 'idle' | 'visible' | 'exiting' | 'done';
  const [splashSeed, setSplashSeed] = React.useState<StoreSplashSeed | null>(() =>
    readStoreSplashSeed(storeId)
  );
  const [splashPhase, setSplashPhase] = React.useState<SplashPhase>(() =>
    readStoreSplashSeed(storeId) ? 'visible' : 'idle'
  );
  const splashTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const splashPhaseRef = React.useRef<SplashPhase>('idle');

  React.useEffect(() => {
    splashPhaseRef.current = splashPhase;
  }, [splashPhase]);

  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  React.useEffect(() => {
    const seed = readStoreSplashSeed(storeId);
    setSplashSeed(seed);
    setSplashPhase(seed ? 'visible' : 'idle');

    if (splashTimerRef.current) {
      clearTimeout(splashTimerRef.current);
      splashTimerRef.current = null;
    }
  }, [storeId]);

  // Fetch profile - try store and seller in parallel for faster loading
  React.useEffect(() => {
    let cancelled = false;

    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError(null);
        setProfileType(null);
        setStore(null);
        setSeller(null);

        const [storeResponse, sellerResponse] = await Promise.all([
          fetch(`/api/marketplace/store/${storeId}`),
          fetch(`/api/marketplace/seller/${storeId}`),
        ]);

        if (cancelled) return;

        if (storeResponse.ok) {
          const data = await storeResponse.json();
          if (cancelled) return;
          setStore(data.store);
          setProfileType('store');
          return;
        }

        if (sellerResponse.ok) {
          const data = await sellerResponse.json();
          if (cancelled) return;
          setSeller(data.seller);
          setProfileType('seller');
          return;
        }

        setError('Profile not found');
      } catch (err) {
        if (cancelled) return;
        console.error('Error fetching profile:', err);
        setError('Failed to load profile');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (storeId) {
      fetchProfile();
    }

    return () => {
      cancelled = true;
    };
  }, [storeId]);

  // Drive the splash once. Card clicks seed the logo/name before navigation, so
  // the store splash can already be visible while the full profile payload loads.
  React.useEffect(() => {
    if (loading) return;

    if (splashTimerRef.current) {
      clearTimeout(splashTimerRef.current);
      splashTimerRef.current = null;
    }

    if (profileType === 'store' && store) {
      if (splashPhaseRef.current === 'exiting' || splashPhaseRef.current === 'done') {
        return;
      }

      setSplashPhase('visible');
      splashTimerRef.current = setTimeout(() => {
        if (splashPhaseRef.current !== 'done') {
          setSplashPhase('exiting');
        }
      }, splashSeed ? 450 : 800);
    } else {
      // Seller or error - dismiss the store splash immediately.
      setSplashPhase('done');
    }
    return () => {
      if (splashTimerRef.current) {
        clearTimeout(splashTimerRef.current);
        splashTimerRef.current = null;
      }
    };
  }, [loading, profileType, store, splashSeed]);

  // Loading state when no click-seeded store splash is available.
  if (loading && splashPhase === 'idle') {
    return (
      <MarketplaceLayout showFooter={false}>
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-gray-300" />
        </div>
      </MarketplaceLayout>
    );
  }

  // Error state
  if (!loading && (error || (!store && !seller))) {
    return (
      <>
        <MarketplaceHeader />
        <MarketplaceLayout showFooter={false}>
          <div className="flex items-center justify-center min-h-[60vh] pt-20">
            <div className="text-center">
              <div className="rounded-full bg-gray-100 p-6 mb-4 inline-block">
                <User className="h-12 w-12 text-gray-400" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                {error || 'Profile not found'}
              </h2>
              <p className="text-sm text-gray-600 mb-6">
                The profile you&apos;re looking for doesn&apos;t exist or is no longer available.
              </p>
              <a href="/marketplace" className="text-sm text-gray-900 hover:text-gray-700 font-medium">
                Back to marketplace
              </a>
            </div>
          </div>
        </MarketplaceLayout>
      </>
    );
  }

  // ── Bicycle store ──────────────────────────────────────
  const storeContent: React.ReactNode = (profileType === 'store' && store) ? (
    immersive ? (
      <div className="relative">
        {/* Minimal floating bar */}
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 pt-3 pb-2 pointer-events-none">
          <button
            onClick={() => router.push('/marketplace')}
            className="pointer-events-auto inline-flex items-center gap-0 bg-white/90 backdrop-blur-sm border border-gray-200 shadow-sm rounded-full overflow-hidden cursor-pointer hover:bg-white transition-colors"
          >
            <span className="px-3 py-1.5 border-r border-gray-200">
              <Image src="/yj.svg" alt="Yellow Jersey" width={72} height={14} className="h-[14px] w-auto block" unoptimized />
            </span>
            <span className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600">
              <ArrowLeft className="h-3 w-3" />
              Back
            </span>
          </button>
          <button
            onClick={() => setImmersive(false)}
            className="pointer-events-auto inline-flex items-center justify-center h-8 w-8 bg-white/90 backdrop-blur-sm border border-gray-200 shadow-sm rounded-full text-gray-400 hover:text-gray-700 hover:bg-white transition-colors cursor-pointer"
            title="Exit immersive mode"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <StoreProfileView store={store} isOwnProfile={isOwnProfile} immersive />
      </div>
    ) : (
      <MarketplaceLayout showFooter={false}>
        <StoreProfileView store={store} isOwnProfile={isOwnProfile} />
      </MarketplaceLayout>
    )
  ) : null;

  // ── Individual seller ──────────────────────────────────
  if (profileType === 'seller' && seller) {
    const categoryCarousels = convertSellerProductsToMarketplace(
      selectedTab === 'for-sale' ? seller.categories : seller.sold_categories,
      seller.id,
      seller.display_name,
      seller.logo_url
    );

    const displayedCarousels = selectedCategory
      ? categoryCarousels.filter(
          c => c.name.toLowerCase().replace(/\s+/g, '-') === selectedCategory.toLowerCase().replace(/\s+/g, '-')
        )
      : categoryCarousels;

    const hasProducts = displayedCarousels.some(c => c.products.length > 0);

    return (
      <>
        <MarketplaceHeader />
        <MarketplaceLayout showFooter={false}>
          <div className="pt-16 min-h-screen bg-gray-50">
            <SellerHeader
              seller={seller}
              isOwnProfile={isOwnProfile}
              onEditClick={() => { window.location.href = '/marketplace/settings'; }}
            />

            {/* For Sale / Sold tabs */}
            {isMobile ? (
              <div className="bg-white border-b border-gray-100 sticky top-16 z-30">
                <div className="px-3">
                  <div className="py-3">
                    <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
                      <button
                        onClick={() => { setSelectedTab('for-sale'); setSelectedCategory(null); }}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                          selectedTab === 'for-sale'
                            ? 'text-gray-800 bg-white shadow-sm'
                            : 'text-gray-600 hover:bg-gray-200/70'
                        }`}
                      >
                        For Sale
                      </button>
                      <button
                        onClick={() => { setSelectedTab('sold'); setSelectedCategory(null); }}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                          selectedTab === 'sold'
                            ? 'text-gray-800 bg-white shadow-sm'
                            : 'text-gray-600 hover:bg-gray-200/70'
                        }`}
                      >
                        Sold
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <SellerCategories
                categories={seller.categories}
                soldCategories={seller.sold_categories}
                selectedTab={selectedTab}
                selectedCategory={selectedCategory}
                onTabSelect={(tab) => { setSelectedTab(tab); setSelectedCategory(null); }}
                onCategorySelect={setSelectedCategory}
              />
            )}

            {/* Products */}
            <div className="px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
              {hasProducts ? (
                isMobile ? (
                  <div className="grid grid-cols-2 gap-3">
                    {displayedCarousels
                      .flatMap(carousel => carousel.products)
                      .map((product, index) => (
                        <ProductCard key={product.id} product={product} priority={index < 6} />
                      ))}
                  </div>
                ) : (
                  <div className="space-y-3 sm:space-y-4">
                    {displayedCarousels.map((carousel, index) => (
                      carousel.products.length > 0 && (
                        <ProductCarousel
                          key={`${carousel.name}-${index}`}
                          categoryName={carousel.name}
                          products={carousel.products}
                        />
                      )
                    ))}
                  </div>
                )
              ) : (
                <div className="flex items-center justify-center py-16 sm:py-24 px-4">
                  <div className="text-center">
                    <div className="rounded-full bg-gray-100 p-5 sm:p-6 mb-3 sm:mb-4 inline-block">
                      <Package className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400" />
                    </div>
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">
                      {selectedTab === 'sold' ? 'No sold items yet' : 'No products available'}
                    </h3>
                    <p className="text-xs sm:text-sm text-gray-600 max-w-xs mx-auto">
                      {selectedTab === 'sold'
                        ? "This seller hasn't sold any items yet."
                        : isOwnProfile
                          ? "You haven't listed any products yet."
                          : "This profile doesn't have any products listed."}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </MarketplaceLayout>
      </>
    );
  }

  const splashName = store?.store_name ?? splashSeed?.storeName ?? "Yellow Jersey";
  const splashLogoUrl = store?.logo_url ?? splashSeed?.logoUrl ?? null;

  // Store page + click-seeded splash overlay
  return (
    <>
      {storeContent}

      {splashPhase !== 'idle' && splashPhase !== 'done' && (
        <motion.div
          className="fixed inset-0 z-[200] bg-white flex flex-col items-center justify-center"
          initial={{ y: 0 }}
          animate={{ y: splashPhase === 'exiting' ? '-100%' : 0 }}
          transition={
            splashPhase === 'exiting'
              ? { duration: 0.55, ease: [0.55, 0, 0.45, 1] }
              : { duration: 0 }
          }
          onAnimationComplete={() => {
            if (splashPhase === 'exiting') {
              clearStoreSplashSeed();
              setSplashPhase('done');
            }
          }}
        >
          <AnimatePresence mode="wait">
            {splashLogoUrl ? (
              <motion.img
                key="logo"
                src={splashLogoUrl}
                alt={splashName}
                className="max-h-28 max-w-[300px] w-auto object-contain rounded-2xl"
                initial={{ opacity: 0, scale: 0.88, y: 14 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
              />
            ) : (
              <motion.div
                key="name"
                className="flex flex-col items-center gap-4 px-10 text-center"
                initial={{ opacity: 0, scale: 0.88, y: 14 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="h-20 w-20 rounded-3xl bg-gray-100 flex items-center justify-center text-2xl font-bold text-gray-400 select-none">
                  {splashName.charAt(0)}
                </div>
                <p className="text-2xl font-bold text-gray-900 tracking-tight">{splashName}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            className="absolute bottom-8 flex items-center gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.35 }}
            transition={{ delay: 0.25, duration: 0.3 }}
          >
            <span className="text-[11px] text-gray-400 tracking-wide uppercase font-medium">Powered by</span>
            <Image src="/yj.svg" alt="Yellow Jersey" width={60} height={12} className="h-3 w-auto" unoptimized />
          </motion.div>
        </motion.div>
      )}
    </>
  );
}
