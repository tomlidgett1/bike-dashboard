"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import { MarketplaceSpaceTabs } from "@/components/marketplace/marketplace-space-tabs";
import { StoreProductContextHeader } from "@/components/marketplace/product-detail/store-product-context-header";
import { EyeOff } from "@/components/layout/app-sidebar/dashboard-icons";
import { ProductBreadcrumbs } from "@/components/marketplace/product-breadcrumbs";
import { ProductPageCategoryBrowse } from "@/components/marketplace/product-detail/product-page-category-browse";
import { ProductBrandLogoBadge } from "@/components/marketplace/product-detail/product-brand-logo-badge";
import { ProductPurchasePanel, ProductDetailTabs, shouldShowProductDetailTabs, getFeatureBullets } from "@/components/marketplace/product-details-panel-simple";
import { ProductAskGenieFloatingPill } from "@/components/marketplace/product-ask-genie-floating-pill";
import { ProductAskGenieImageBadge } from "@/components/marketplace/product-ask-genie-image-badge";
import { ProductGeniePanel } from "@/components/genie/product-genie-panel";
import { EnhancedImageGallery } from "@/components/marketplace/product-detail/enhanced-image-gallery";
import {
  ProductRecommendationsSection,
  type ProductRecommendations,
} from "@/components/marketplace/product-detail/product-recommendations-section";
import type { ProductSellerProfile } from "@/components/marketplace/product-detail/about-this-seller-section";
import { BikeSpecsDisplay } from "@/components/products/bike-specs-display";
import { BrandAboutSection } from "@/components/marketplace/product-detail/brand-about-section";
import { hasBikeSpecs, parseBikeSpecs } from "@/lib/types/bike-specs";
import { getFeaturedBrandAbout } from "@/lib/marketplace/featured-brand-about";
import {
  BikeSpecExplorePanel,
  type BikeSpecSelection,
} from "@/components/marketplace/bike-spec-explore-panel";
import type { MarketplaceProduct, MarketplaceSpace } from "@/lib/types/marketplace";
import type { StoreProfile } from "@/lib/types/store";
import { useAuth } from "@/components/providers/auth-provider";
import { useNestStorefrontChat } from "@/components/providers/nest-storefront-chat-provider";
import { useProductView, trackGalleryView } from "@/lib/tracking/interaction-tracker";
import { useStoreProductView } from "@/lib/tracking/store-analytics";
import { cn } from "@/lib/utils";
import { prefetchMarketplaceSpace } from "@/lib/hooks/use-marketplace-data";
import type { ViewMode } from "@/components/marketplace/unified-filter-bar";

const SimilarProductsCarousel = dynamic(
  () => import("@/components/marketplace/product-detail/similar-products-carousel").then((mod) => mod.SimilarProductsCarousel),
  { ssr: false },
);

const ProductUploadSuccessBanner = dynamic(
  () => import("@/components/marketplace/product-upload-success-banner").then((mod) => mod.ProductUploadSuccessBanner),
  { ssr: false },
);


const ImmersiveProductLayout = dynamic(
  () => import("./immersive-product-layout").then((mod) => mod.ImmersiveProductLayout),
  { ssr: false },
);

const WorldClassProductPageTemplate = dynamic(
  () =>
    import("@/components/demo/world-class-product-page-template").then(
      (mod) => mod.WorldClassProductPageTemplate,
    ),
  { ssr: false },
);

// ============================================================
// Product Page Client Component
// Handles interactive UI elements while receiving SSR data
// ============================================================

interface SellerInfo {
  id: string;
  name: string;
  logo_url: string | null;
  account_type: string | null;
}

interface ProductPageClientProps {
  product: MarketplaceProduct;
  sellerInfo: SellerInfo | null;
  /** Seller + brand recommendation lists, streamed in after first paint. */
  recommendationsPromise: Promise<ProductRecommendations>;
  brandName: string | null;
  brandLogoUrl?: string | null;
  sellerProfile?: ProductSellerProfile | null;
  /** Prefetched store chrome for product pages opened from a storefront. */
  storeProfile?: StoreProfile | null;
  showUploadBanner?: boolean;
}

type ProductPageImage = {
  url?: string;
  galleryUrl?: string;
  detailUrl?: string;
  cardUrl?: string;
  order?: number;
  isPrimary?: boolean;
};

export function ProductPageClient({
  product,
  sellerInfo,
  recommendationsPromise,
  brandName,
  brandLogoUrl = null,
  sellerProfile = null,
  storeProfile = null,
  showUploadBanner = false
}: ProductPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromStoreId = searchParams.get('store');
  const { user } = useAuth();
  const [currentImageIndex, setCurrentImageIndex] = React.useState(0);
  const [showBanner, setShowBanner] = React.useState(showUploadBanner);
  const [localProduct, setLocalProduct] = React.useState(product);
  const [exploreSpec, setExploreSpec] = React.useState<BikeSpecSelection | null>(null);
  const heroColumnRef = React.useRef<HTMLDivElement>(null);
  const [heroHeight, setHeroHeight] = React.useState<number | undefined>();

  const isOwner = !!user && user.id === product.user_id;
  const isStoreOwner = isOwner && product.store_account_type === "bicycle_store";
  const [viewAsCustomer, setViewAsCustomer] = React.useState(false);
  const [categoryMenuOpen, setCategoryMenuOpen] = React.useState(false);
  const showOwnerTools = isOwner && !viewAsCustomer;
  const { ensureBubble, releaseBubble } = useNestStorefrontChat();

  const productSpace: MarketplaceSpace =
    product.listing_type === "private_listing" ? "marketplace" : "stores";

  const goToMarketplaceSpace = React.useCallback(
    (space: MarketplaceSpace) => {
      if (space === "for-you") {
        router.push("/marketplace?space=for-you");
        return;
      }
      router.push(`/marketplace?space=${space}`);
    },
    [router],
  );

  const handlePrefetchSpace = React.useCallback((space: MarketplaceSpace) => {
    prefetchMarketplaceSpace(space);
  }, []);

  const handleViewModeChange = React.useCallback(
    (_mode: ViewMode) => {
      goToMarketplaceSpace("marketplace");
    },
    [goToMarketplaceSpace],
  );

  const categorySpaceTabs = (
    <MarketplaceSpaceTabs
      variant="inline"
      currentSpace={productSpace}
      viewMode="all"
      onViewModeChange={handleViewModeChange}
      onNavigateToStores={() => goToMarketplaceSpace("stores")}
      onNavigateToUber={() => goToMarketplaceSpace("uber")}
      onNavigateToForYou={() => goToMarketplaceSpace("for-you")}
      onPrefetchSpace={handlePrefetchSpace}
    />
  );
  // Keep Nest shopping agent available on store product pages.
  React.useEffect(() => {
    if (
      isOwner ||
      product.store_account_type !== "bicycle_store" ||
      !sellerInfo ||
      sellerInfo.account_type !== "bicycle_store"
    ) {
      return;
    }
    ensureBubble({
      storeId: sellerInfo.id,
      storeName: sellerInfo.name,
      storeLogoUrl: sellerInfo.logo_url,
    });
    return () => releaseBubble(sellerInfo.id);
  }, [
    ensureBubble,
    isOwner,
    product.store_account_type,
    releaseBubble,
    sellerInfo,
  ]);

  // Track product view with dwell time
  useProductView(product.id, user?.id);

  // Gallery engagement is a strong buying-intent signal — track image browsing
  // past the hero image.
  React.useEffect(() => {
    if (currentImageIndex > 0) {
      trackGalleryView(product.id, currentImageIndex, user?.id);
    }
  }, [currentImageIndex, product.id, user?.id]);
  useStoreProductView(
    !isOwner && product.store_account_type === "bicycle_store" ? product.user_id : null,
    product.id,
  );

  // Feed Nest shopping-agent browse context when viewing a store product.
  React.useEffect(() => {
    if (isOwner || product.store_account_type !== "bicycle_store" || !product.user_id) return;
    void import("@/lib/nest/storefront-browse-context")
      .then(({ recordBrowseProductView }) =>
        recordBrowseProductView(product.user_id, {
          productId: product.id,
          name: product.display_name || product.description || "Product",
          brand: product.brand ?? null,
          category: product.marketplace_category ?? null,
          price: typeof product.price === "number" ? product.price : null,
          source: "detail",
          dwellMs: 2500,
        }),
      )
      .catch(() => {});
  }, [
    isOwner,
    product.brand,
    product.description,
    product.display_name,
    product.id,
    product.marketplace_category,
    product.price,
    product.store_account_type,
    product.user_id,
  ]);

  // Get all available images
  const images = React.useMemo(() => {
    if (!product) return [];
    
    // Priority 1: Pre-computed all_images from server (already uses correct URL variants)
    if (product.all_images && product.all_images.length > 0) {
      return product.all_images;
    }
    
    // Priority 2: Images JSONB field - use galleryUrl for best quality on product pages
    if (Array.isArray(product.images) && product.images.length > 0) {
      const manualImages = product.images as ProductPageImage[];
      const filtered = manualImages
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        // Use galleryUrl (1200px 4:3 padded) for product pages, with fallbacks
        .map((img) => img.galleryUrl || img.detailUrl || img.url || img.cardUrl)
        .filter((url): url is string => !!url && !url.startsWith("blob:"));
      
      if (filtered.length > 0) {
        return filtered;
      }
    }
    
    // Priority 3: Fallback to image variants
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const imgs: string[] = [];
    
    if (product.image_variants && product.image_variants.original) {
      imgs.push(`${baseUrl}/storage/v1/object/public/product-images/${product.image_variants.original}`);
    } else if (product.primary_image_url && !product.primary_image_url.startsWith("blob:")) {
      imgs.push(product.primary_image_url);
    }
    
    return imgs.length > 0 ? imgs : ['/placeholder-product.svg'];
  }, [product]);

  React.useEffect(() => {
    const node = heroColumnRef.current;
    if (!node) return;

    const updateHeight = () => {
      setHeroHeight(node.getBoundingClientRect().height);
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, [images.length]);

  // Build the "See All" href for similar products
  const similarSeeAllHref = product.marketplace_subcategory
    ? `/marketplace?space=stores&level1=${encodeURIComponent(product.marketplace_category)}&level2=${encodeURIComponent(product.marketplace_subcategory)}`
    : product.marketplace_category
      ? `/marketplace?space=stores&level1=${encodeURIComponent(product.marketplace_category)}`
      : undefined;

  // Build the "See All" href for seller products
  const sellerSeeAllHref = sellerInfo
    ? `/marketplace/${sellerInfo.account_type === 'bicycle_store' ? 'store' : 'seller'}/${sellerInfo.id}`
    : undefined;

  // Show store header when the user arrived from a store page
  const showStoreHeader = !!fromStoreId && !!sellerInfo && sellerInfo.id === fromStoreId;
  const showFullWidthBikeSpecs =
    localProduct.is_bicycle && hasBikeSpecs(parseBikeSpecs(localProduct.bike_specs));
  const isSold =
    !!(localProduct as { sold_at?: string | null }).sold_at ||
    (localProduct as { listing_status?: string }).listing_status === "sold";
  const showAskGenie = !isSold;
  const featuredBrandAbout = React.useMemo(
    () => getFeaturedBrandAbout(localProduct.brand || brandName),
    [localProduct.brand, brandName],
  );

  const exitCustomerViewButton =
    isStoreOwner && viewAsCustomer ? (
      <button
        type="button"
        onClick={() => setViewAsCustomer(false)}
        title="Exit customer view"
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
      >
        <EyeOff className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Exit customer view</span>
      </button>
    ) : null;

  const galleryProps = {
    images,
    productName: product.display_name || product.description,
    currentIndex: currentImageIndex,
    onIndexChange: setCurrentImageIndex,
    heroOverlay: showAskGenie ? (
      <ProductAskGenieImageBadge product={localProduct} />
    ) : undefined,
    suppressHeroControlsOnDesktop: categoryMenuOpen,
  };

  const productBreadcrumbs = (
    <ProductBreadcrumbs
      level1={product.marketplace_category}
      level2={product.marketplace_subcategory}
      level3={product.marketplace_level_3_category}
      productName={product.display_name || product.description}
    />
  );

  const breadcrumbBrandLogo = brandLogoUrl ? (
    <ProductBrandLogoBadge
      logoUrl={brandLogoUrl}
      brandName={localProduct.brand || brandName}
      align="right"
      size="md"
      className="shrink-0"
    />
  ) : null;

  const showProductDetailTabs = shouldShowProductDetailTabs(localProduct);

  const featureBullets = React.useMemo(
    () => getFeatureBullets(localProduct),
    [localProduct],
  );

  const purchasePanel = (
    <ProductPurchasePanel
      product={localProduct}
      isStoreOwner={isStoreOwner}
      viewAsCustomer={viewAsCustomer}
      onViewAsCustomerChange={setViewAsCustomer}
      sellerProfile={sellerProfile}
    />
  );

  const detailTabs = (
    <ProductDetailTabs
      product={localProduct}
      overviewOnly={!showProductDetailTabs}
      featureBullets={featureBullets}
    />
  );

  const infoPanelContent = (
    <>
      {purchasePanel}
      <div className="lg:hidden">{detailTabs}</div>
    </>
  );

  // Immersive layout — per-product opt-in (Store Settings → Products tab).
  // World-class published pages take precedence over immersive.
  if (product.world_class_page) {
    return (
      <>
        {showStoreHeader ? (
          <StoreProductContextHeader
            storeId={fromStoreId!}
            initialStore={storeProfile}
            actionButtons={exitCustomerViewButton}
          />
        ) : (
          <>
            <MarketplaceHeader
              compactSearchOnMobile
              showFloatingButton={false}
              currentSpace={productSpace}
            />
            {exitCustomerViewButton ? (
              <div className="border-b border-gray-100 bg-white px-4 py-2">{exitCustomerViewButton}</div>
            ) : null}
          </>
        )}

        {/* Category nav — same L1/L2 browse strip as the standard PDP */}
        <div className="sticky top-14 z-40 hidden lg:block">
          <ProductPageCategoryBrowse
            activeLevel1={localProduct.marketplace_category}
            activeLevel2={localProduct.marketplace_subcategory}
            activeLevel3={localProduct.marketplace_level_3_category}
            className="px-4 xl:px-5"
            onMenuOpenChange={setCategoryMenuOpen}
            leading={categorySpaceTabs}
          />
        </div>

        <div
          className={cn(
            "relative z-0 transition-[filter] duration-[420ms] ease-[cubic-bezier(0.04,0.62,0.23,0.98)]",
            categoryMenuOpen &&
              "will-change-[filter] lg:blur-[6px] lg:brightness-[0.98] lg:saturate-[0.94]",
          )}
        >
          <WorldClassProductPageTemplate
            page={product.world_class_page}
            viewMode="desktop"
            product={localProduct}
            showAskGenie={showAskGenie}
            level1={localProduct.marketplace_category}
            level2={localProduct.marketplace_subcategory}
            level3={localProduct.marketplace_level_3_category}
            listingPrice={
              typeof localProduct.price === "number" ? localProduct.price : null
            }
            seller={{
              name:
                sellerInfo?.name ||
                localProduct.store_name ||
                "Store",
              logoUrl:
                sellerInfo?.logo_url ||
                localProduct.store_logo_url ||
                storeProfile?.logo_url ||
                null,
              location: storeProfile?.address || null,
              verified: sellerInfo?.account_type === "bicycle_store",
            }}
          />

          <div className="mx-auto min-w-0 max-w-[1536px] space-y-8 overflow-x-hidden px-4 pt-8 pb-6 sm:px-4 sm:pb-8 lg:px-4 lg:pt-10 lg:pb-10 xl:px-5">
            <SimilarProductsCarousel
              productId={product.id}
              seeAllHref={similarSeeAllHref}
              seeAllLabel="Browse Category"
            />
            <ProductRecommendationsSection
              promise={recommendationsPromise}
              sellerName={sellerInfo?.name ?? null}
              sellerSeeAllHref={sellerSeeAllHref}
              sellerSeeAllLabel="View All Listings"
              brandName={brandName}
            />
          </div>
        </div>
        <ProductGeniePanel />
        {showAskGenie ? (
          <ProductAskGenieFloatingPill product={localProduct} />
        ) : null}
      </>
    );
  }

  if (product.immersive_page) {
    return (
      <ImmersiveProductLayout
        product={localProduct}
        images={images}
        sellerInfo={sellerInfo}
        recommendationsPromise={recommendationsPromise}
        brandName={brandName}
        isOwner={showOwnerTools}
        isStoreOwner={isStoreOwner}
        viewAsCustomer={viewAsCustomer}
        onViewAsCustomerChange={setViewAsCustomer}
      />
    );
  }

  return (
    <>
      {showStoreHeader ? (
        <StoreProductContextHeader
          storeId={fromStoreId!}
          initialStore={storeProfile}
          actionButtons={exitCustomerViewButton}
        />
      ) : (
        <>
          <MarketplaceHeader
            compactSearchOnMobile
            showFloatingButton={false}
            currentSpace={productSpace}
          />
          {exitCustomerViewButton ? (
            <div className="pointer-events-none fixed right-3 top-3 z-50 sm:right-4 sm:top-4">
              <div className="pointer-events-auto shadow-sm">{exitCustomerViewButton}</div>
            </div>
          ) : null}
        </>
      )}

      {/* Category nav — flush below header, above product content */}
      <div className="sticky top-14 z-40 hidden lg:block">
        <ProductPageCategoryBrowse
          activeLevel1={localProduct.marketplace_category}
          activeLevel2={localProduct.marketplace_subcategory}
          activeLevel3={localProduct.marketplace_level_3_category}
          className="px-4 xl:px-5"
          onMenuOpenChange={setCategoryMenuOpen}
          leading={categorySpaceTabs}
        />
      </div>
      
      {/* Main Content */}
      <div
        className={cn(
          "min-h-screen overflow-x-hidden bg-white pb-28 sm:bg-gray-50 sm:pb-8",
          "relative z-0",
          "transition-[filter] duration-[420ms] ease-[cubic-bezier(0.04,0.62,0.23,0.98)]",
          categoryMenuOpen &&
            "will-change-[filter] lg:blur-[6px] lg:brightness-[0.98] lg:saturate-[0.94]",
        )}
      >
        {/* Upload Success Banner */}
        {showBanner && (
          <ProductUploadSuccessBanner
            show={showBanner}
            onClose={() => setShowBanner(false)}
          />
        )}
        
        <div>
          {/* Desktop: inset floating white card on gray page bg */}
          <div className="hidden lg:block lg:px-4 lg:pt-4 xl:px-5">
            <div className="mx-auto max-w-[1536px] overflow-visible rounded-xl border border-gray-200 bg-white shadow-[0_-1px_0_rgba(0,0,0,0.03)]">
              <div className="overflow-hidden">
                <div className="border-b border-gray-100 px-5 xl:px-6">
                  <div className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0 flex-1">{productBreadcrumbs}</div>
                    {breadcrumbBrandLogo}
                  </div>
                </div>
                <div className="flex items-start pt-6">
                  <div
                    ref={heroColumnRef}
                    className="min-w-0 w-[57%] bg-white pb-8 pl-5 pr-4 xl:pl-6 xl:pr-6"
                  >
                    <EnhancedImageGallery {...galleryProps} />
                  </div>
                  <div
                    className="sticky top-0 min-w-0 w-[43%] shrink-0 self-start overflow-y-auto overflow-x-hidden bg-white px-5 xl:pl-6 xl:pr-8"
                    style={
                      heroHeight
                        ? { height: heroHeight, maxHeight: heroHeight }
                        : undefined
                    }
                  >
                    {infoPanelContent}
                  </div>
                </div>
                {detailTabs && <div className="hidden lg:block">{detailTabs}</div>}
              </div>
            </div>
          </div>

          {/* Mobile / tablet: stacked gallery + flat gray info */}
          <div className="bg-white lg:hidden">
            <div className="mx-auto mb-3 hidden max-w-[1536px] items-center justify-between gap-3 px-4 pt-2 sm:mb-4 sm:flex sm:pt-3">
              <div className="min-w-0 flex-1">{productBreadcrumbs}</div>
              {breadcrumbBrandLogo}
            </div>
            <EnhancedImageGallery
              {...galleryProps}
              sidePanel={
                <div className="bg-gray-50">
                  {infoPanelContent}
                </div>
              }
            />
          </div>

          {showFullWidthBikeSpecs && (
            <BikeSpecsDisplay
              variant="fullWidth"
              bikeSpecs={localProduct.bike_specs}
              interactive
              onSpecClick={setExploreSpec}
              className="mt-6 sm:mt-8"
            />
          )}

          {featuredBrandAbout && (
            <BrandAboutSection
              brand={featuredBrandAbout}
              className={showFullWidthBikeSpecs ? undefined : "mt-6 sm:mt-8"}
            />
          )}

          <BikeSpecExplorePanel
            isOpen={!!exploreSpec}
            onClose={() => setExploreSpec(null)}
            spec={exploreSpec}
            productName={localProduct.display_name || localProduct.description}
            brand={localProduct.brand || brandName}
            model={undefined}
            bikeType={localProduct.bike_type}
          />

          {/* Recommendation Carousels */}
          <div className="mx-auto min-w-0 max-w-[1536px] space-y-8 overflow-x-hidden px-4 pt-8 pb-6 sm:px-4 sm:pb-8 lg:px-4 lg:pt-10 lg:pb-10 xl:px-5">
            {/* Similar Items Carousel — LLM-ranked in real time (client-fetched) */}
            <SimilarProductsCarousel
              productId={product.id}
              seeAllHref={similarSeeAllHref}
              seeAllLabel="Browse Category"
            />

            {/* Seller + Brand carousels — streamed in after first paint */}
            <ProductRecommendationsSection
              promise={recommendationsPromise}
              sellerName={sellerInfo?.name ?? null}
              sellerSeeAllHref={sellerSeeAllHref}
              sellerSeeAllLabel="View All Listings"
              brandName={brandName}
            />
          </div>
        </div>
      </div>

      <ProductGeniePanel />

      {showAskGenie && <ProductAskGenieFloatingPill product={localProduct} />}
    </>
  );
}
