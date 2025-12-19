"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Package } from "lucide-react";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import { ProductBreadcrumbs } from "@/components/marketplace/product-breadcrumbs";
import { ProductDetailsPanelSimple } from "@/components/marketplace/product-details-panel-simple";
import { EnhancedImageGallery } from "@/components/marketplace/product-detail/enhanced-image-gallery";
import { RecommendationCarousel } from "@/components/marketplace/product-detail/recommendation-carousel";
import { ProductUploadSuccessBanner } from "@/components/marketplace/product-upload-success-banner";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";
import { useProductView } from "@/lib/tracking/interaction-tracker";

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
  showUploadBanner?: boolean;
}

export function ProductPageClient({ 
  product, 
  similarProducts, 
  sellerProducts, 
  sellerInfo,
  showUploadBanner = false
}: ProductPageClientProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [currentImageIndex, setCurrentImageIndex] = React.useState(0);
  const [isLiked, setIsLiked] = React.useState(false);
  const [showBanner, setShowBanner] = React.useState(showUploadBanner);

  // Track product view with dwell time
  useProductView(product.id, user?.id);

  // Handle share functionality
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: (product as any).display_name || product.description,
          text: `Check out this ${product.marketplace_category} - $${product.price}`,
          url: window.location.href,
        });
      } catch (err) {
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
    
    // Priority 1: Manually uploaded images (in images JSONB field)
    if (Array.isArray((product as any).images) && (product as any).images.length > 0) {
      const manualImages = (product as any).images as Array<{ url: string; order?: number; isPrimary?: boolean }>;
      const filtered = manualImages
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((img) => img.url)
        .filter((url) => url && !url.startsWith("blob:"));
      
      if (filtered.length > 0) {
        return filtered;
      }
    }
    
    // Priority 2: For store inventory with all_images array
    if (product.all_images && product.all_images.length > 0) {
      return product.all_images;
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

  return (
    <>
      <MarketplaceHeader compactSearchOnMobile showFloatingButton={false} />
      
      {/* Main Content */}
      <div className="min-h-screen bg-white sm:bg-gray-50 pt-14 sm:pt-16 pb-24 sm:pb-8">
        {/* Upload Success Banner */}
        <ProductUploadSuccessBanner 
          show={showBanner} 
          onClose={() => setShowBanner(false)} 
        />
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
        >
          {/* Breadcrumbs - Hidden on mobile, shown on tablet+ */}
          <div className="hidden sm:block max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 mb-4 sm:mb-6">
            <ProductBreadcrumbs
              level1={product.marketplace_category}
              level2={product.marketplace_subcategory}
              level3={product.marketplace_level_3_category}
              productName={(product as any).display_name || product.description}
            />
          </div>

          {/* Two-Column Layout */}
          <div className="lg:max-w-[1400px] lg:mx-auto lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-[60%_40%] lg:gap-8">
              {/* Left Column - Image Gallery (Full-width on mobile) */}
              <div className="w-full">
                <EnhancedImageGallery
                  images={images}
                  productName={(product as any).display_name || product.description}
                  currentIndex={currentImageIndex}
                  onIndexChange={setCurrentImageIndex}
                  onLikeToggle={() => setIsLiked(!isLiked)}
                  isLiked={isLiked}
                  onShare={handleShare}
                />
              </div>

              {/* Right Column - Product Details */}
              <div className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:bg-white lg:rounded-md lg:overflow-y-auto lg:border lg:border-gray-200">
                <ProductDetailsPanelSimple product={product} />
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
            />
          </div>
        </motion.div>
      </div>
    </>
  );
}

