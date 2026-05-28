"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, Heart, Sparkles, Store, BadgeCheck } from "lucide-react";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { trackInteraction } from "@/lib/tracking/interaction-tracker";
import { getCardImageUrl } from "@/lib/utils/cloudinary";
import { cn } from "@/lib/utils";
import { MARKETPLACE_PROMO_BANNERS_ENABLED } from "@/lib/marketplace-feature-flags";

// ============================================================
// Product Card - Image-First Design
// Large image with floating price, minimal clutter
// Uses Cloudinary CDN for ultra-fast image delivery (~200ms)
// ============================================================

interface ProductCardProps {
  product: MarketplaceProduct;
  priority?: boolean;
  featuredMobile?: boolean;
  /** Row layout for marketplace list view */
  layout?: "grid" | "list";
  isAdmin?: boolean;
  onNavigate?: () => void;
  onImageDiscoveryClick?: (productId: string) => void;
}

type ListingImage = {
  url: string;
  cardUrl?: string;
  isPrimary?: boolean;
};

type ProductCardData = MarketplaceProduct & {
  store_name?: string;
  card_url?: string | null;
  images?: ListingImage[] | null;
};

// Memoized product card to prevent unnecessary re-renders
export const ProductCard = React.memo<ProductCardProps>(function ProductCard({ 
  product, 
  priority = false,
  featuredMobile = false,
  layout = "grid",
  isAdmin = false,
  onNavigate,
  onImageDiscoveryClick 
}) {
  const router = useRouter();
  const [imageError, setImageError] = React.useState(false);
  const [isVisible, setIsVisible] = React.useState(priority);
  const [isLiked, setIsLiked] = React.useState(false);
  const imageRef = React.useRef<HTMLDivElement>(null);
  const productData = product as ProductCardData;

  // Get relative time for new listings (show for products < 24 hours old)
  const relativeTime = React.useMemo(() => {
    if (!product.created_at) return null;
    const createdAt = new Date(product.created_at);
    const now = new Date();
    const hoursDiff = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
    
    // Only show for products listed in last 24 hours
    if (hoursDiff > 24) return null;
    
    if (hoursDiff < 1) {
      const minutes = Math.floor(hoursDiff * 60);
      return `${minutes}m ago`;
    } else {
      return `${Math.floor(hoursDiff)}h ago`;
    }
  }, [product.created_at]);

  // Intersection Observer for lazy loading
  React.useEffect(() => {
    if (priority || isVisible) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsVisible(true);
        }
      },
      {
        rootMargin: '400px', // Increased for earlier prefetching
        threshold: 0.01,
      }
    );

    const target = imageRef.current;
    if (target) {
      observer.observe(target);
    }

    return () => {
      if (target) {
        observer.unobserve(target);
      }
    };
  }, [priority, isVisible]);

  // Image URL - uses card_url from product_images table (source of truth)
  // The API fetches the primary image and passes it as card_url
  const imageUrl = React.useMemo(() => {
    // Priority 1: card_url from API (fetched from product_images table)
    if (productData.card_url) {
      return productData.card_url;
    }
    
    // Priority 2: For private listings with images array (legacy fallback)
    if (productData.listing_type === 'private_listing' && Array.isArray(productData.images)) {
      const primaryImage = productData.images.find(img => img.isPrimary) || productData.images[0];
      
      if (primaryImage) {
        return getCardImageUrl(primaryImage);
      }
    }
    
    // Priority 3: Legacy primary_image_url fallback
    if (product.primary_image_url && !product.primary_image_url.startsWith('blob:')) {
      return product.primary_image_url;
    }
    
    return null;
  }, [product.primary_image_url, productData.card_url, productData.images, productData.listing_type]);

  // Memoize click handler to prevent recreating on every render
  const handleClick = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    
    // Trigger full-page loading overlay
    if (onNavigate) {
      onNavigate();
    }
    
    trackInteraction('click', {
      productId: product.id,
      metadata: {
        source: 'product_card',
        category: product.marketplace_category,
        price: product.price,
      }
    });

    // Navigate to product page
    router.push(`/marketplace/product/${product.id}`);
  }, [product.id, product.marketplace_category, product.price, router, onNavigate]);

  // Memoize like/unlike handler
  const handleLikeToggle = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const newLikedState = !isLiked;
    setIsLiked(newLikedState);
    trackInteraction(newLikedState ? 'like' : 'unlike', {
      productId: product.id,
      metadata: { source: 'product_card' }
    });
  }, [isLiked, product.id]);

  const isList = layout === "list";

  return (
    <Link
      href={`/marketplace/product/${product.id}`}
      onClick={handleClick}
      className={cn(
        "product-card-root block",
        isList && "w-full",
        !isList && featuredMobile && "col-span-2 sm:col-span-1"
      )}
    >
      <div
        id={`product-${product.id}`}
        className={cn(
          "group cursor-pointer relative",
          isList && "flex flex-row gap-3 items-stretch w-full rounded-md border border-gray-200/80 bg-white p-2 sm:p-3"
        )}
      >
        {/* Image Container - Main focus */}
        <div 
          ref={imageRef}
          className={cn(
            "relative overflow-hidden rounded-md bg-gray-100 border border-gray-200/80",
            isList
              ? "w-28 sm:w-32 flex-shrink-0 aspect-square mb-0"
              : "w-full mb-0.5",
            !isList && (featuredMobile ? "aspect-[4/3]" : "aspect-square")
          )}
        >
          {isVisible && imageUrl && !imageError ? (
            <Image
              src={imageUrl}
              alt={product.description}
              fill
              unoptimized // Cloudinary already optimizes - skip Next.js processing
              className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
              loading={priority ? 'eager' : 'lazy'}
              priority={priority}
              placeholder="blur"
              blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgZmlsbD0iI2Y3ZjdmNyIvPjwvc3ZnPg=="
              onError={() => setImageError(true)}
            />
          ) : !isVisible ? (
            <div className="flex h-full w-full items-center justify-center">
              <div className="animate-pulse h-full w-full bg-gray-200/50" />
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="h-12 w-12 text-gray-300" />
            </div>
          )}

          {/* Uber Express Badge - Only for Ashburton Cycles */}
          {MARKETPLACE_PROMO_BANNERS_ENABLED &&
            productData.store_name === "Ashburton Cycles" && (
            <div className="absolute bottom-2.5 right-2.5">
              <div className="bg-black/85 px-2 py-1 rounded-lg shadow-sm flex items-center gap-1">
                <Image 
                  src="/uber.jpg" 
                  alt="Uber" 
                  width={26} 
                  height={10}
                  quality={100}
                  className="object-contain"
                />
                <span className="text-[10px] font-semibold text-green-500">1hr</span>
              </div>
            </div>
          )}

          {/* Wishlist Button */}
          <button
            onClick={handleLikeToggle}
            className={`absolute top-2.5 right-2.5 transition-all duration-200 ${
              isLiked 
                ? "opacity-100" 
                : "opacity-0 group-hover:opacity-100"
            }`}
          >
            <Heart
              className={`h-5 w-5 transition-colors duration-200 ${
                isLiked 
                  ? "fill-red-500 stroke-red-500" 
                  : "stroke-white"
              }`}
              style={{ filter: isLiked ? 'none' : 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
            />
          </button>

          {/* Condition Badge - Only for private listings with condition */}
          {productData.listing_type === 'private_listing' && productData.condition_rating && (
            <div className="absolute top-2 left-2 z-10">
              <span className="px-1.5 py-0.5 bg-white/90 rounded-md text-[10px] font-medium text-gray-700 shadow-sm">
                {productData.condition_rating}
              </span>
            </div>
          )}

          {/* Admin: Image Discovery Button */}
          {isAdmin && onImageDiscoveryClick && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onImageDiscoveryClick(product.id);
              }}
              className="absolute top-2.5 left-2.5 bg-white/95 backdrop-blur-sm px-2 py-1 rounded-md shadow-sm opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-white z-20"
            >
              <div className="flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-purple-600" />
                <span className="text-xs font-medium text-gray-700">New Image</span>
              </div>
            </button>
          )}
        </div>

        {/* Product Info - Improved text layout */}
        <div
          className={cn(
            isList && "flex flex-1 flex-col justify-center min-w-0 py-0",
            !isList && (featuredMobile ? "px-0.5 pt-1 mb-3" : "px-0.5 mb-2")
          )}
        >
          {/* Product Title - Enhanced typography */}
          <h3
            className={cn(
              "text-gray-900 leading-tight line-clamp-2",
              isList && "text-sm font-semibold mb-1",
              !isList &&
                (featuredMobile
                  ? "text-base font-semibold line-clamp-1 mb-0.5"
                  : "text-sm font-medium line-clamp-1 mb-0")
            )}
          >
            {productData.display_name || product.description}
          </h3>

          {/* Price - Below title, size between title and location */}
          <p
            className={cn(
              "font-semibold text-gray-900 mb-0 leading-tight",
              isList && "text-sm",
              !isList &&
                (featuredMobile ? "text-sm" : "text-xs")
            )}
          >
            ${product.price.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>

          {/* Seller info - Better organized layout */}
          <div className={cn("flex items-center gap-0.5 flex-wrap", isList ? "mt-1" : "mt-0.5")}>
            {/* Store badge for store inventory items */}
            {productData.listing_type === 'store_inventory' && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-medium rounded-md">
                <Store className="h-2.5 w-2.5" />
                Store
              </span>
            )}
            
            {/* Seller name/location with verified badge */}
            <div className="flex items-center gap-0.5 flex-1 min-w-0">
              <p className="text-xs text-gray-600 font-medium truncate">
                {(() => {
                  // For private listings, show pickup location instead of seller name
                  if (productData.listing_type === 'private_listing') {
                    return productData.pickup_location || 'Melbourne';
                  }
                  // For bike stores, show business name or "Bike Store"
                  if (productData.store_account_type === 'bicycle_store' || productData.listing_type === 'store_inventory') {
                    return product.store_name || 'Bike Store';
                  }
                  // For individual users (fallback), show "FirstName L."
                  if (productData.first_name && productData.last_name) {
                    return `${productData.first_name} ${productData.last_name.charAt(0)}.`;
                  }
                  // Fallback to store_name
                  return product.store_name || 'Seller';
                })()}
              </p>
              {/* Verified badge for Ashburton Cycles */}
              {product.store_name === 'Ashburton Cycles' && (
                <BadgeCheck className="h-3 w-3 text-blue-500 flex-shrink-0" />
              )}
            </div>

            {/* Secondary info - Time */}
            {relativeTime && (
              <div className="flex items-center gap-0.5 text-xs">
                <span className="text-emerald-600 font-medium whitespace-nowrap">
                  {relativeTime}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for React.memo
  // Only re-render if product id or priority changes
  return prevProps.product.id === nextProps.product.id &&
         prevProps.priority === nextProps.priority &&
         prevProps.featuredMobile === nextProps.featuredMobile &&
         prevProps.layout === nextProps.layout;
});

// ============================================================
// Product Card Skeleton - Matching image-first design
// ============================================================

export function ProductCardSkeleton({ layout = "grid" }: { layout?: "grid" | "list" }) {
  if (layout === "list") {
    return (
      <div className="flex flex-row gap-3 w-full rounded-md border border-gray-200/80 bg-white p-2 sm:p-3">
        <div className="w-28 sm:w-32 flex-shrink-0 aspect-square rounded-md bg-gray-100 animate-pulse border border-gray-200" />
        <div className="flex-1 min-w-0 flex flex-col justify-center space-y-2 py-0.5">
          <div className="h-4 w-[85%] bg-gray-100 rounded animate-pulse" />
          <div className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
          <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
        </div>
      </div>
    );
  }
  return (
    <div>
      {/* Image Skeleton */}
      <div 
        className="relative w-full rounded-xl bg-gray-100 animate-pulse mb-0.5 border border-gray-200" 
        style={{ aspectRatio: '1 / 1' }}
      >
      </div>

      {/* Content Skeleton */}
      <div className="px-0.5 space-y-0">
        {/* Title Skeleton */}
        <div className="h-4 w-full bg-gray-100 rounded animate-pulse mb-0" />
        
        {/* Price Skeleton */}
        <div className="h-3 w-20 bg-gray-100 rounded animate-pulse mb-0.5" />
        
        {/* Store Skeleton */}
        <div className="h-3 w-16 bg-gray-100 rounded animate-pulse" />
      </div>
    </div>
  );
}

