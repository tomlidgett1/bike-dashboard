"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import { StoreProductContextHeader } from "@/components/marketplace/product-detail/store-product-context-header";
import { ProductBreadcrumbs } from "@/components/marketplace/product-breadcrumbs";
import { ProductDetailsPanelSimple } from "@/components/marketplace/product-details-panel-simple";
import { EnhancedImageGallery } from "@/components/marketplace/product-detail/enhanced-image-gallery";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/auth-provider";
import { useProductView } from "@/lib/tracking/interaction-tracker";
import { useStoreProductView } from "@/lib/tracking/store-analytics";

const RecommendationCarousel = dynamic(
  () => import("@/components/marketplace/product-detail/recommendation-carousel").then((mod) => mod.RecommendationCarousel),
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
  similarProducts: MarketplaceProduct[];
  sellerProducts: MarketplaceProduct[];
  sellerInfo: SellerInfo | null;
  brandProducts: MarketplaceProduct[];
  brandName: string | null;
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
  similarProducts,
  sellerProducts,
  sellerInfo,
  brandProducts,
  brandName,
  showUploadBanner = false
}: ProductPageClientProps) {
  const searchParams = useSearchParams();
  const fromStoreId = searchParams.get('store');
  const { user } = useAuth();
  const [currentImageIndex, setCurrentImageIndex] = React.useState(0);
  const [isLiked, setIsLiked] = React.useState(false);
  const [showBanner, setShowBanner] = React.useState(showUploadBanner);
  const [localProduct, setLocalProduct] = React.useState(product);

  const isOwner = !!user && user.id === product.user_id;

  // Track product view with dwell time
  useProductView(product.id, user?.id);
  useStoreProductView(
    !isOwner && product.store_account_type === "bicycle_store" ? product.user_id : null,
    product.id,
  );

  // Handle share functionality
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: product.display_name || product.description,
          text: `Check out this ${product.marketplace_category} - $${product.price}`,
          url: window.location.href,
        });
      } catch {
        console.log("Share cancelled");
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert("Link copied to clipboard!");
    }
  };

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

  // Immersive layout — per-product opt-in (Store Settings → Products tab).
  if (product.immersive_page) {
    return (
      <ImmersiveProductLayout
        product={localProduct}
        images={images}
        sellerInfo={sellerInfo}
        similarProducts={similarProducts}
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
        <StoreProductContextHeader
          storeId={fromStoreId!}
          storeName={sellerInfo!.name}
          storeLogo={sellerInfo!.logo_url}
          accountType={sellerInfo!.account_type}
        />
      ) : (
        <MarketplaceHeader compactSearchOnMobile showFloatingButton={false} />
      )}
      
      {/* Main Content */}
      <div
        className={cn(
          "min-h-screen bg-white sm:bg-gray-50 pb-24 sm:pb-8",
          showStoreHeader ? "pt-16 sm:pt-[72px]" : "pt-14 sm:pt-16"
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
          {/* Breadcrumbs - Hidden on mobile, shown on tablet+ */}
          <div className="hidden sm:block max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 mb-4 sm:mb-6">
            <ProductBreadcrumbs
              level1={product.marketplace_category}
              level2={product.marketplace_subcategory}
              level3={product.marketplace_level_3_category}
              productName={product.display_name || product.description}
            />
          </div>

          {/* Two-Column Layout */}
          <div className="lg:max-w-[1400px] lg:mx-auto lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-[60%_40%] lg:gap-8">
              {/* Left Column - Image Gallery (Full-width on mobile) */}
              <div className="w-full">
                <EnhancedImageGallery
                  images={images}
                  productName={product.display_name || product.description}
                  currentIndex={currentImageIndex}
                  onIndexChange={setCurrentImageIndex}
                  onLikeToggle={() => setIsLiked(!isLiked)}
                  isLiked={isLiked}
                  onShare={handleShare}
                />
              </div>

              {/* Right Column - Floating card (all breakpoints; below hero on mobile) */}
              <div className="mx-3 mt-4 mb-2 sm:mx-5 sm:mt-6 sm:mb-4 lg:mx-0 lg:mt-2 lg:mb-2 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:self-start rounded-2xl border border-gray-200 bg-white shadow-xl shadow-gray-200/60 ring-1 ring-black/5 overflow-hidden">
                <ProductDetailsPanelSimple product={localProduct} />
                {isOwner && (
                  <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                    <ProductOptimizeDrawer
                      product={localProduct}
                      onProductUpdate={(updates) => setLocalProduct((prev) => ({ ...prev, ...updates }))}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Recommendation Carousels */}
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 mt-8 sm:mt-12 pt-4 sm:pt-5 border-t border-gray-200">
            {/* Similar Items Carousel */}
            <RecommendationCarousel
              title="Similar Items"
              products={similarProducts}
              isLoading={false}
              icon="sparkles"
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
              seller={sellerInfo}
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
    </>
  );
}
