"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import { Package } from "lucide-react";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import { ProductBreadcrumbs } from "@/components/marketplace/product-breadcrumbs";
import { ProductDetailsPanel } from "@/components/marketplace/product-details-panel";
import { EnhancedImageGallery } from "@/components/marketplace/product-detail/enhanced-image-gallery";
import { RecommendationCarousel } from "@/components/marketplace/product-detail/recommendation-carousel";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";
import { useProductView } from "@/lib/tracking/interaction-tracker";

// ============================================================
// Product Page - Depop-inspired Layout
// Full-page product view with breadcrumbs and two-column layout
// ============================================================

interface SellerInfo {
  id: string;
  name: string;
  logo_url: string | null;
  account_type: string | null;
}

export default function ProductPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params?.productId as string;
  const { user } = useAuth();

  const [product, setProduct] = React.useState<MarketplaceProduct | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = React.useState(0);
  const [isLiked, setIsLiked] = React.useState(false);

  // Recommendation states
  const [similarProducts, setSimilarProducts] = React.useState<MarketplaceProduct[]>([]);
  const [sellerProducts, setSellerProducts] = React.useState<MarketplaceProduct[]>([]);
  const [sellerInfo, setSellerInfo] = React.useState<SellerInfo | null>(null);
  const [similarLoading, setSimilarLoading] = React.useState(true);
  const [sellerLoading, setSellerLoading] = React.useState(true);

  // Track product view with dwell time
  useProductView(productId, user?.id);

  // Fetch product data
  React.useEffect(() => {
    const fetchProduct = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/marketplace/products/${productId}`);
        
        if (!response.ok) {
          if (response.status === 404) {
            setError("Product not found");
          } else {
            throw new Error("Failed to fetch product");
          }
          return;
        }

        const data = await response.json();
        setProduct(data.product);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        console.error("Error fetching product:", err);
      } finally {
        setLoading(false);
      }
    };

    if (productId) {
      fetchProduct();
    }
  }, [productId]);

  // Fetch similar products and seller products in parallel
  React.useEffect(() => {
    if (!productId || loading) return;

    const fetchRecommendations = async () => {
      // Fetch similar products
      const fetchSimilar = async () => {
        try {
          setSimilarLoading(true);
          const response = await fetch(`/api/marketplace/products/${productId}/similar?limit=12`);
          if (response.ok) {
            const data = await response.json();
            setSimilarProducts(data.products || []);
          }
        } catch (err) {
          console.error("Error fetching similar products:", err);
        } finally {
          setSimilarLoading(false);
        }
      };

      // Fetch seller products
      const fetchSellerProducts = async () => {
        try {
          setSellerLoading(true);
          const response = await fetch(`/api/marketplace/products/${productId}/seller-products?limit=12`);
          if (response.ok) {
            const data = await response.json();
            setSellerProducts(data.products || []);
            setSellerInfo(data.seller || null);
          }
        } catch (err) {
          console.error("Error fetching seller products:", err);
        } finally {
          setSellerLoading(false);
        }
      };

      // Run both fetches in parallel
      await Promise.all([fetchSimilar(), fetchSellerProducts()]);
    };

    fetchRecommendations();
  }, [productId, loading]);

  // Get all available images
  const images = React.useMemo(() => {
    if (!product) return [];
    
    const imgs: string[] = [];
    
    // Priority 1: Manually uploaded images (in images JSONB field) - works for both listing types
    if (Array.isArray((product as any).images) && (product as any).images.length > 0) {
      const manualImages = (product as any).images as Array<{ url: string; order?: number; isPrimary?: boolean }>;
      const filtered = manualImages
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((img) => img.url)
        .filter((url) => url && !url.startsWith("blob:"));
      
      if (filtered.length > 0) {
        console.log(`📸 [PRODUCT PAGE] Using ${filtered.length} manually uploaded images`);
        return filtered;
      }
    }
    
    // Priority 2: For store inventory with all_images array (canonical images)
    if (product.all_images && product.all_images.length > 0) {
      return product.all_images;
    }
    
    // Priority 3: Fallback to image variants
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    
    if (product.image_variants && product.image_variants.original) {
      imgs.push(`${baseUrl}/storage/v1/object/public/product-images/${product.image_variants.original}`);
    } else if (product.primary_image_url && !product.primary_image_url.startsWith("blob:")) {
      imgs.push(product.primary_image_url);
    }
    
    return imgs.length > 0 ? imgs : ['/placeholder-product.svg'];
  }, [product]);

  // Loading state
  if (loading) {
    return (
      <>
        <MarketplaceHeader />
        <div className="min-h-screen bg-gray-50 pt-16">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="animate-pulse space-y-6">
              {/* Breadcrumb skeleton */}
              <div className="h-4 w-64 bg-gray-200 rounded" />
              
              {/* Two-column grid skeleton */}
              <div className="grid grid-cols-1 lg:grid-cols-[60%_40%] gap-6 lg:gap-8">
                {/* Left - Image skeleton */}
                <div className="bg-white rounded-md h-[600px]" />
                
                {/* Right - Details skeleton */}
                <div className="bg-white rounded-md p-6 space-y-4">
                  <div className="h-6 w-3/4 bg-gray-200 rounded" />
                  <div className="h-8 w-1/3 bg-gray-200 rounded" />
                  <div className="h-12 w-full bg-gray-200 rounded-md" />
                  <div className="h-12 w-full bg-gray-200 rounded-md" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Error state
  if (error || !product) {
    return (
      <>
        <MarketplaceHeader />
        <div className="min-h-screen bg-gray-50 pt-16 flex items-center justify-center">
          <div className="text-center max-w-md px-4">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <Package className="h-10 w-10 text-gray-400" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {error === "Product not found" ? "Product Not Found" : "Error Loading Product"}
            </h1>
            <p className="text-gray-600 mb-6">
              {error === "Product not found"
                ? "This product may have been sold or is no longer available."
                : "We couldn't load this product. Please try again."}
            </p>
            <Button
              onClick={() => router.push("/marketplace")}
              className="bg-gray-900 hover:bg-gray-800 text-white rounded-md"
            >
              Back to Marketplace
            </Button>
          </div>
        </div>
      </>
    );
  }

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
      <MarketplaceHeader compactSearchOnMobile />
      
      {/* Main Content */}
      <div className="min-h-screen bg-gray-50 pt-14 sm:pt-16">
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
                />
              </div>

              {/* Right Column - Product Details */}
              <div className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:bg-white lg:rounded-md lg:overflow-hidden">
                <ProductDetailsPanel product={product} />
              </div>
            </div>
          </div>

          {/* Recommendation Carousels */}
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 mt-6 sm:mt-10 pt-4 sm:pt-6 border-t border-gray-200">
            {/* Similar Items Carousel */}
            <RecommendationCarousel
              title="Similar Items"
              subtitle={product.marketplace_subcategory 
                ? `More ${product.marketplace_subcategory.toLowerCase()} you might like`
                : "Items you might also like"}
              products={similarProducts}
              isLoading={similarLoading}
              icon="sparkles"
              seeAllHref={similarSeeAllHref}
              seeAllLabel="Browse Category"
            />

            {/* More from Seller Carousel */}
            <RecommendationCarousel
              title="More from this Seller"
              subtitle={sellerInfo?.name ? `See more listings from ${sellerInfo.name}` : undefined}
              products={sellerProducts}
              isLoading={sellerLoading}
              icon="store"
              seeAllHref={sellerSeeAllHref}
              seeAllLabel="View All Listings"
              seller={sellerInfo}
              className="mt-2"
            />
          </div>
        </motion.div>
      </div>
    </>
  );
}

