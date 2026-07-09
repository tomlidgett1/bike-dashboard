"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import { StoreProductContextHeader } from "@/components/marketplace/product-detail/store-product-context-header";
import { ProductBreadcrumbs } from "@/components/marketplace/product-breadcrumbs";
import { ProductDetailsPanelSimple } from "@/components/marketplace/product-details-panel-simple";
import { BuyNowButton } from "@/components/marketplace/buy-now-button";
import { ProductAskGenieFloatingPill } from "@/components/marketplace/product-ask-genie-floating-pill";
import { ProductAskGenieImageBadge } from "@/components/marketplace/product-ask-genie-image-badge";
import { ProductGeniePanel } from "@/components/genie/product-genie-panel";
import { EnhancedImageGallery } from "@/components/marketplace/product-detail/enhanced-image-gallery";
import {
  ProductRecommendationsSection,
  type ProductRecommendations,
} from "@/components/marketplace/product-detail/product-recommendations-section";
import {
  AboutThisSellerSection,
  type ProductSellerProfile,
} from "@/components/marketplace/product-detail/about-this-seller-section";
import { BikeSpecsDisplay } from "@/components/products/bike-specs-display";
import { BrandAboutSection } from "@/components/marketplace/product-detail/brand-about-section";
import { hasBikeSpecs, parseBikeSpecs } from "@/lib/types/bike-specs";
import { getFeaturedBrandAbout } from "@/lib/marketplace/featured-brand-about";
import {
  BikeSpecExplorePanel,
  type BikeSpecSelection,
} from "@/components/marketplace/bike-spec-explore-panel";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { resolveLivePrice } from "@/lib/marketplace/pricing";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/auth-provider";
import { useProductView, trackGalleryView } from "@/lib/tracking/interaction-tracker";
import { useStoreProductView } from "@/lib/tracking/store-analytics";

const SimilarProductsCarousel = dynamic(
  () => import("@/components/marketplace/product-detail/similar-products-carousel").then((mod) => mod.SimilarProductsCarousel),
  { ssr: false },
);

const ProductUploadSuccessBanner = dynamic(
  () => import("@/components/marketplace/product-upload-success-banner").then((mod) => mod.ProductUploadSuccessBanner),
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
  showUploadBanner = false
}: ProductPageClientProps) {
  const searchParams = useSearchParams();
  const fromStoreId = searchParams.get('store');
  const { user } = useAuth();
  const [currentImageIndex, setCurrentImageIndex] = React.useState(0);
  const [showBanner, setShowBanner] = React.useState(showUploadBanner);
  const [localProduct, setLocalProduct] = React.useState(product);
  const [exploreSpec, setExploreSpec] = React.useState<BikeSpecSelection | null>(null);

  const isOwner = !!user && user.id === localProduct.user_id;

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

  // Get all available images
  const images = React.useMemo(() => {
    // Priority 1: Pre-computed all_images from server (already uses correct URL variants)
    if (localProduct.all_images && localProduct.all_images.length > 0) {
      return localProduct.all_images;
    }
    
    // Priority 2: Images JSONB field - use galleryUrl for best quality on product pages
    if (Array.isArray(localProduct.images) && localProduct.images.length > 0) {
      const manualImages = localProduct.images as ProductPageImage[];
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
    
    if (localProduct.image_variants && localProduct.image_variants.original) {
      imgs.push(`${baseUrl}/storage/v1/object/public/product-images/${localProduct.image_variants.original}`);
    } else if (localProduct.primary_image_url && !localProduct.primary_image_url.startsWith("blob:")) {
      imgs.push(localProduct.primary_image_url);
    }
    
    return imgs.length > 0 ? imgs : ['/placeholder-product.svg'];
  }, [localProduct]);

  // Build the "See All" href for similar products
  const similarSeeAllHref = product.marketplace_subcategory
    ? `/marketplace?level1=${encodeURIComponent(product.marketplace_category)}&level2=${encodeURIComponent(product.marketplace_subcategory)}`
    : product.marketplace_category
      ? `/marketplace?level1=${encodeURIComponent(product.marketplace_category)}`
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
    !!(localProduct as MarketplaceProduct & { sold_at?: string | null }).sold_at ||
    localProduct.listing_status === "sold";
  const quantityOnHand = Number(localProduct.qoh);
  const hasFiniteQuantity =
    localProduct.qoh != null && Number.isFinite(quantityOnHand);
  const isOutOfStock =
    hasFiniteQuantity && quantityOnHand <= 0;
  const showMobilePurchaseBar = !isOwner && !isSold && !isOutOfStock;
  const showAskGenie = !isSold;
  const livePrice = resolveLivePrice(localProduct);
  const featuredBrandAbout = React.useMemo(
    () => getFeaturedBrandAbout(localProduct.brand || brandName),
    [localProduct.brand, brandName],
  );

  const galleryProps = {
    images,
    productName: localProduct.display_name || localProduct.description,
    currentIndex: currentImageIndex,
    onIndexChange: setCurrentImageIndex,
    heroOverlay: showAskGenie ? (
      <ProductAskGenieImageBadge product={localProduct} />
    ) : undefined,
  };

  const productBreadcrumbs = (
    <ProductBreadcrumbs
      level1={localProduct.marketplace_category}
      level2={localProduct.marketplace_subcategory}
      level3={localProduct.marketplace_level_3_category}
      productName={localProduct.display_name || localProduct.description}
    />
  );

  const infoPanelContent = (
    <>
      <ProductDetailsPanelSimple
        product={localProduct}
        brandLogoUrl={brandLogoUrl}
        brandName={localProduct.brand || brandName}
        onProductUpdate={setLocalProduct}
      />
      {sellerProfile && (
        <AboutThisSellerSection seller={sellerProfile} embedded />
      )}
    </>
  );

  return (
    <>
      {showStoreHeader ? (
        <StoreProductContextHeader storeId={fromStoreId!} />
      ) : (
        <MarketplaceHeader compactSearchOnMobile showFloatingButton={false} />
      )}
      
      {/* Main Content */}
      <div
        className={cn(
          "min-h-screen overflow-x-hidden bg-white sm:bg-gray-50 sm:pb-8",
          showMobilePurchaseBar ? "pb-32" : "pb-8",
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
          {/* Desktop: photos (white) + info (gray); white wrapper avoids gray dead space beside thumbnails */}
          <div className="hidden bg-white lg:block lg:pb-0">
            <div className="mx-auto max-w-[1536px] pl-3 pr-4 xl:pl-4 xl:pr-6">
              <div className="pt-6 pb-6">{productBreadcrumbs}</div>
            </div>
            <div className="mx-auto flex max-w-[1536px] items-start">
              <div className="min-w-0 w-3/5 bg-white pl-3 pr-4 xl:pl-4 xl:pr-6">
                <EnhancedImageGallery {...galleryProps} />
              </div>
              <div className="sticky top-4 min-w-0 w-2/5 shrink-0 self-start overflow-y-auto bg-white px-4 max-h-[calc(100vh-1rem)] [scrollbar-width:thin] xl:px-5">
                {infoPanelContent}
              </div>
            </div>
          </div>

          {/* Mobile / tablet: stacked gallery + flat gray info */}
          <div className="bg-white lg:hidden">
            <div className="mx-auto mb-2 max-w-[1536px] overflow-x-auto px-4 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mb-6 sm:pt-6">
              <div className="w-max whitespace-nowrap text-xs sm:text-sm">
                {productBreadcrumbs}
              </div>
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
          <div className="mx-auto min-w-0 max-w-[1536px] space-y-2 overflow-x-hidden border-t border-gray-200 bg-gray-50 px-4 pt-4 pb-4 sm:px-4 sm:pb-5 lg:px-4 lg:pt-5 lg:pb-6 xl:px-5">
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

      {showAskGenie && (
        <ProductAskGenieFloatingPill
          product={localProduct}
          className={showMobilePurchaseBar ? "!bottom-[4.75rem]" : undefined}
        />
      )}

      {showMobilePurchaseBar && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white/95 px-3 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-4px_18px_rgba(0,0,0,0.08)] backdrop-blur sm:hidden">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <div className="min-w-0 shrink-0">
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                Price
              </p>
              <p
                className={cn(
                  "text-lg font-semibold leading-tight",
                  livePrice.onSale ? "text-red-600" : "text-gray-900",
                )}
              >
                ${livePrice.price.toLocaleString("en-AU", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
            <BuyNowButton
              productId={localProduct.id}
              productName={localProduct.display_name || localProduct.description}
              productPrice={livePrice.price}
              sellerId={localProduct.user_id}
              sellerName={localProduct.store_name}
              uberDeliveryEligible={
                localProduct.uber_delivery_enabled === true &&
                localProduct.store_account_type === "bicycle_store" &&
                localProduct.store_bicycle_store === true
              }
              productImage={localProduct.all_images?.[0] || localProduct.primary_image_url}
              maxQuantity={
                localProduct.listing_type === "private_listing"
                  ? 1
                  : Math.max(1, hasFiniteQuantity ? quantityOnHand : 1)
              }
              shippingAvailable={localProduct.shipping_available || false}
              shippingCost={localProduct.shipping_cost || 0}
              pickupLocation={localProduct.pickup_location || null}
              pickupOnly={localProduct.pickup_only || false}
              size="lg"
              fullWidth
              className="h-11 px-3 text-sm"
              showStripeBranding={false}
            />
          </div>
        </div>
      )}
    </>
  );
}
