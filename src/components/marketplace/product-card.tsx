"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Package, Heart, Sparkles, Store } from "lucide-react";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { trackInteraction } from "@/lib/tracking/interaction-tracker";
import { getCardImageUrl } from "@/lib/utils/cloudinary";

// ============================================================
// Product Card - Image-First Design
// Large image with floating price, minimal clutter
// Uses Cloudinary CDN for ultra-fast image delivery (~200ms)
// ============================================================

interface ProductCardProps {
  product: MarketplaceProduct;
  priority?: boolean;
  isAdmin?: boolean;
  onNavigate?: () => void;
  onImageDiscoveryClick?: (productId: string) => void;
}

// Memoized product card to prevent unnecessary re-renders
export const ProductCard = React.memo<ProductCardProps>(function ProductCard({ 
  product, 
  priority = false,
  isAdmin = false,
  onNavigate,
  onImageDiscoveryClick 
}) {
  const router = useRouter();
  const [imageError, setImageError] = React.useState(false);
  const [isVisible, setIsVisible] = React.useState(priority);
  const [isLiked, setIsLiked] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);
  const imageRef = React.useRef<HTMLDivElement>(null);

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

  // Memoize image URL - uses Cloudinary cardUrl when available for instant loading
  const imageUrl = React.useMemo(() => {
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const productAny = product as any;
    
    // DEBUG: Log product data for troubleshooting
    if (productAny.listing_type === 'private_listing') {
      console.log(`🖼️ [ProductCard ${product.id?.substring(0, 8)}] listing_type:`, productAny.listing_type);
      console.log(`🖼️ [ProductCard ${product.id?.substring(0, 8)}] images array length:`, productAny.images?.length);
      if (productAny.images?.[0]) {
        console.log(`🖼️ [ProductCard ${product.id?.substring(0, 8)}] First image:`, {
          isPrimary: productAny.images[0].isPrimary,
          cardUrl: productAny.images[0].cardUrl?.substring(0, 60) + '...',
        });
        const primaryImg = productAny.images.find((img: any) => img.isPrimary);
        if (primaryImg) {
          console.log(`🖼️ [ProductCard ${product.id?.substring(0, 8)}] Primary image found:`, {
            cardUrl: primaryImg.cardUrl?.substring(0, 60) + '...',
          });
        }
      }
    }
    
    // Priority 1: Cloudinary card_url directly on product (canonical products)
    if (productAny.card_url) {
      return productAny.card_url;
    }
    
    // Priority 2: For private listings with images array
    if (productAny.listing_type === 'private_listing' && Array.isArray(productAny.images)) {
      const listingImages = productAny.images as Array<{ 
        url: string; 
        cardUrl?: string; 
        isPrimary?: boolean 
      }>;
      const primaryImage = listingImages.find(img => img.isPrimary) || listingImages[0];
      
      if (primaryImage) {
        // Use Cloudinary cardUrl if available (instant loading)
        return getCardImageUrl(primaryImage);
      }
    }
    
    // Priority 3: Legacy Supabase Storage image_variants
    if (product.image_variants && product.image_variants.medium) {
      return `${baseUrl}/storage/v1/object/public/product-images/${product.image_variants.medium}`;
    }
    
    // Priority 4: Direct primary image URL (legacy)
    if (product.primary_image_url && !product.primary_image_url.startsWith('blob:')) {
      return product.primary_image_url;
    }
    
    return null;
  }, [product.id, product.image_variants, product.primary_image_url, (product as any).card_url]);

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

  return (
    <Link 
      href={`/marketplace/product/${product.id}`}
      onClick={handleClick}
      className="block"
    >
      <motion.div
        id={`product-${product.id}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
        className="group cursor-pointer relative"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Image Container - Main focus */}
        <div 
          ref={imageRef}
          className="relative w-full overflow-hidden rounded-xl bg-gray-100 mb-2.5 border border-gray-200"
          style={{ aspectRatio: '1 / 1' }}
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

          {/* Floating Price Badge */}
          <div className="absolute bottom-2.5 left-2.5">
            <div className="bg-white/95 backdrop-blur-sm px-2.5 py-1 rounded-lg shadow-sm">
              <span className="text-sm font-bold text-gray-900">
                ${product.price.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>

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

        {/* Product Info - Simple text below */}
        <div className="px-0.5">
          {/* Product Title */}
          <h3 className="text-[13px] text-gray-800 font-medium leading-snug line-clamp-2 mb-1">
            {(product as any).display_name || product.description}
          </h3>

          {/* Seller info with type badge and optional time */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Store badge for store inventory items */}
            {(product as any).listing_type === 'store_inventory' && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-medium rounded">
                <Store className="h-2.5 w-2.5" />
                Store
              </span>
            )}
            <p className="text-xs text-gray-500">
              {(() => {
                const productAny = product as any;
                // For bike stores, show business name or "Bike Store"
                if (productAny.store_account_type === 'bicycle_store' || productAny.listing_type === 'store_inventory') {
                  return product.store_name || 'Bike Store';
                }
                // For individual users, show "FirstName L."
                if (productAny.first_name && productAny.last_name) {
                  return `${productAny.first_name} ${productAny.last_name.charAt(0)}.`;
                }
                // Fallback to store_name
                return product.store_name || 'Seller';
              })()}
            </p>
            {relativeTime && (
              <>
                <span className="text-gray-300">•</span>
                <span className="text-xs font-medium text-emerald-600">
                  {relativeTime}
                </span>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </Link>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for React.memo
  // Only re-render if product id or priority changes
  return prevProps.product.id === nextProps.product.id &&
         prevProps.priority === nextProps.priority;
});

// ============================================================
// Product Card Skeleton - Matching image-first design
// ============================================================

export function ProductCardSkeleton() {
  return (
    <div>
      {/* Image Skeleton */}
      <div 
        className="relative w-full rounded-xl bg-gray-100 animate-pulse mb-2.5 border border-gray-200" 
        style={{ aspectRatio: '1 / 1' }}
      >
        {/* Price badge skeleton */}
        <div className="absolute bottom-2.5 left-2.5">
          <div className="h-7 w-14 bg-gray-200 rounded-lg" />
        </div>
      </div>

      {/* Content Skeleton */}
      <div className="px-0.5 space-y-1.5">
        {/* Title Skeleton */}
        <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
        <div className="h-4 w-2/3 bg-gray-100 rounded animate-pulse" />
        
        {/* Store Skeleton */}
        <div className="h-3 w-16 bg-gray-100 rounded animate-pulse" />
      </div>
    </div>
  );
}

