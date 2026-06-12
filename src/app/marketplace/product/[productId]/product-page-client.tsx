"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import { StoreProductContextHeader } from "@/components/marketplace/product-detail/store-product-context-header";
import { ProductBreadcrumbs } from "@/components/marketplace/product-breadcrumbs";
import { ProductDetailsPanelSimple } from "@/components/marketplace/product-details-panel-simple";
import { ProductAskGenieFloatingPill } from "@/components/marketplace/product-ask-genie-floating-pill";
import { ProductAskGenieImageBadge } from "@/components/marketplace/product-ask-genie-image-badge";
import { ProductGeniePanel } from "@/components/genie/product-genie-panel";
import { EnhancedImageGallery } from "@/components/marketplace/product-detail/enhanced-image-gallery";
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
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/auth-provider";
import { useProductView, trackGalleryView } from "@/lib/tracking/interaction-tracker";
import { useStoreProductView } from "@/lib/tracking/store-analytics";

const RecommendationCarousel = dynamic(
  () => import("@/components/marketplace/product-detail/recommendation-carousel").then((mod) => mod.RecommendationCarousel),
  { ssr: false },
);

const SimilarProductsCarousel = dynamic(
  () => import("@/components/marketplace/product-detail/similar-products-carousel").then((mod) => mod.SimilarProductsCarousel),
  { ssr: false },
);

const ProductUploadSuccessBanner = dynamic(
  () => import("@/components/marketplace/product-upload-success-banner").then((mod) => mod.ProductUploadSuccessBanner),
  { ssr: false },
);

const ProductOptimizeDrawer = dynamic(
  () => import("@/components/marketplace/product-optimize-drawer").then((mod) => mod.ProductOptimizeDrawer),
  { ssr: false },
);

const ImmersiveProductLayout = dynamic(
  () => import("./immersive-product-layout").then((mod) => mod.ImmersiveProductLayout),
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
  sellerProducts: MarketplaceProduct[];
  sellerInfo: SellerInfo | null;
  brandProducts: MarketplaceProduct[];
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
  sellerProducts,
  sellerInfo,
  brandProducts,
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

  const isOwner = !!user && user.id === product.user_id;

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
    !!(localProduct as { sold_at?: string | null }).sold_at ||
    (localProduct as { listing_status?: string }).listing_status === "sold";
  const showAskGenie = !isOwner && !isSold;
  const featuredBrandAbout = React.useMemo(
    () => getFeaturedBrandAbout(localProduct.brand || brandName),
    [localProduct.brand, brandName],
  );

  const galleryProps = {
    images,
    productName: product.display_name || product.description,
    currentIndex: currentImageIndex,
    onIndexChange: setCurrentImageIndex,
    heroOverlay: showAskGenie ? (
      <ProductAskGenieImageBadge product={localProduct} />
    ) : undefined,
  };

  const productBreadcrumbs = (
    <ProductBreadcrumbs
      level1={product.marketplace_category}
      level2={product.marketplace_subcategory}
      level3={product.marketplace_level_3_category}
      productName={product.display_name || product.description}
    />
  );

  const infoPanelContent = (
    <>
      <ProductDetailsPanelSimple
        product={localProduct}
        brandLogoUrl={brandLogoUrl}
        brandName={localProduct.brand || brandName}
      />
      {sellerProfile && (
        <AboutThisSellerSection seller={sellerProfile} embedded />
      )}
      {isOwner && (
        <div className="border-t border-gray-200/80 px-4 py-3 sm:px-5 lg:px-0">
          <ProductOptimizeDrawer
            product={localProduct}
            onProductUpdate={(updates) =>
              setLocalProduct((prev) => ({ ...prev, ...updates }))
            }
          />
        </div>
      )}
    </>
  );

  // Immersive layout — per-product opt-in (Store Settings → Products tab).
  if (product.immersive_page) {
    return (
      <ImmersiveProductLayout
        product={localProduct}
        images={images}
        sellerInfo={sellerInfo}
        sellerProducts={sellerProducts}
        brandProducts={brandProducts}
        brandName={brandName}
        isOwner={isOwner}
      />
    );
  }

  return (
    <>
      {showStoreHeader ? (
        <StoreProductContextHeader storeId={fromStoreId!} />
      ) : (
        <MarketplaceHeader compactSearchOnMobile showFloatingButton={false} />
      )}
      
      {/* Main Content */}
      <div className="min-h-screen overflow-x-hidden bg-white sm:bg-gray-50 pb-28 sm:pb-8">
        {/* Upload Success Banner */}
        {showBanner && (
          <ProductUploadSuccessBanner
            show={showBanner}
            onClose={() => setShowBanner(false)}
          />
        )}
        
        <div>
          {/* Desktop: photos (white) + info (gray); white wrapper avoids gray dead space beside thumbnails */}
          <div className="hidden bg-white lg:block">
            <div className="mx-auto flex max-w-[1536px] items-start">
              <div className="min-w-0 w-[62%] pl-3 pr-4 xl:pl-4 xl:pr-6">
                <div className="pt-4 sm:pt-6 pb-4 sm:pb-6">{productBreadcrumbs}</div>
                <EnhancedImageGallery {...galleryProps} />
              </div>
              <div className="sticky top-0 min-w-0 w-[38%] shrink-0 self-start bg-gray-50 px-4 max-h-screen overflow-y-auto overscroll-contain [scrollbar-width:thin] xl:px-5">
                {infoPanelContent}
              </div>
            </div>
          </div>

          {/* Mobile / tablet: stacked gallery + flat gray info */}
          <div className="bg-white lg:hidden">
            <div className="hidden sm:block max-w-[1536px] mx-auto px-4 sm:px-4 pt-4 sm:pt-6 mb-4 sm:mb-6">
              {productBreadcrumbs}
            </div>
            <EnhancedImageGallery
              {...galleryProps}
              sidePanel={
                <div className="border-t border-gray-200/80 bg-gray-50">
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
          <div
            className={cn(
              "mx-auto min-w-0 max-w-[1536px] space-y-2 overflow-x-hidden border-t border-gray-200 bg-gray-50 px-4 pt-3 pb-4 sm:px-4 sm:py-5 lg:px-4 xl:px-5",
              showFullWidthBikeSpecs || featuredBrandAbout ? "mt-0" : "mt-0 lg:mt-8"
            )}
          >
            {/* Similar Items Carousel — LLM-ranked in real time */}
            <SimilarProductsCarousel
              productId={product.id}
              seeAllHref={similarSeeAllHref}
              seeAllLabel="Browse Category"
            />

            {/* More from Seller Carousel */}
            <RecommendationCarousel
              title={sellerInfo?.name ? `More from ${sellerInfo.name}` : "More from this Seller"}
              products={sellerProducts}
              isLoading={false}
              icon="store"
              seeAllHref={sellerSeeAllHref}
              seeAllLabel="View All Listings"
            />

            {/* More from Brand Carousel */}
            {brandName && (
              <RecommendationCarousel
                title={`More from ${brandName}`}
                products={brandProducts}
                isLoading={false}
                icon="sparkles"
                seeAllHref={`/marketplace?brand=${encodeURIComponent(brandName)}`}
                seeAllLabel={`All ${brandName}`}
              />
            )}
          </div>
        </div>
      </div>

      <ProductGeniePanel />

      {showAskGenie && <ProductAskGenieFloatingPill product={localProduct} />}
    </>
  );
}
