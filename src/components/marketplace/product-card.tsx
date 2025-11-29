"use client";

import * as React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Package, Store, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductDetailModal } from "@/components/marketplace/product-detail-modal";
import type { MarketplaceProduct } from "@/lib/types/marketplace";

// ============================================================
// Product Card - Facebook Marketplace Style
// Clean card with store branding
// ============================================================

interface ProductCardProps {
  product: MarketplaceProduct;
  priority?: boolean;
}

export function ProductCard({ product, priority = false }: ProductCardProps) {
  const [imageError, setImageError] = React.useState(false);
  const [isVisible, setIsVisible] = React.useState(priority);
  const [logoError, setLogoError] = React.useState(false);
  const [isLiked, setIsLiked] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const imageRef = React.useRef<HTMLDivElement>(null);

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
        rootMargin: '200px',
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

  // Get best image URL
  const getImageUrl = () => {
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    
    console.log('🖼️ [CARD IMAGE DEBUG] Product:', product.id);
    console.log('🖼️ [CARD IMAGE DEBUG] listing_type:', (product as any).listing_type);
    console.log('🖼️ [CARD IMAGE DEBUG] images:', (product as any).images);
    
    // For private listings with images array
    if ((product as any).listing_type === 'private_listing' && Array.isArray((product as any).images)) {
      const listingImages = (product as any).images as Array<{ url: string; isPrimary?: boolean }>;
      const primaryImage = listingImages.find(img => img.isPrimary) || listingImages[0];
      console.log('🖼️ [CARD IMAGE DEBUG] Primary image:', primaryImage);
      if (primaryImage?.url && !primaryImage.url.startsWith('blob:')) {
        return primaryImage.url;
      }
    }
    
    // For store inventory
    if (product.image_variants && product.image_variants.medium) {
      return `${baseUrl}/storage/v1/object/public/product-images/${product.image_variants.medium}`;
    }
    
    if (product.primary_image_url && !product.primary_image_url.startsWith('blob:')) {
      return product.primary_image_url;
    }
    
    return null;
  };

  const imageUrl = getImageUrl();

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
        className="cursor-pointer"
        onClick={() => setIsModalOpen(true)}
      >
        {/* Image Container - Separate with thin border */}
        <div 
          ref={imageRef}
          className="relative aspect-square w-full overflow-hidden bg-gray-50 rounded-md border border-gray-200 mb-2"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
        {isVisible && imageUrl && !imageError ? (
          <Image
            src={imageUrl}
            alt={product.description}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1536px) 33vw, 20vw"
            className="object-cover"
            loading={priority ? 'eager' : 'lazy'}
            priority={priority}
            quality={85}
            onError={() => setImageError(true)}
          />
        ) : !isVisible ? (
          <div className="flex h-full w-full items-center justify-center bg-gray-50">
            <div className="animate-pulse h-full w-full bg-gray-100" />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Package className="h-16 w-16 text-gray-300" />
          </div>
        )}

        {/* Heart Icon - Top Right Corner */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsLiked(!isLiked);
          }}
          className="absolute top-2 right-2 z-10 p-1.5 bg-white rounded-full shadow-sm hover:shadow-md transition-all duration-200"
        >
          <Heart
            className={`h-4 w-4 transition-colors duration-200 ${
              isLiked 
                ? "fill-red-500 stroke-red-500" 
                : "stroke-gray-700 hover:stroke-red-500"
            }`}
          />
        </button>

        {/* Buy Now / Make Offer Button - Appears on Hover */}
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 flex items-center justify-center bg-black/20"
          >
            <div className="flex gap-2 px-4">
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  // Handle buy now
                }}
                className="bg-white text-gray-900 hover:bg-gray-100 rounded-md shadow-md font-semibold"
              >
                Buy Now
              </Button>
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  // Handle make offer
                }}
                variant="outline"
                className="bg-white border-gray-300 text-gray-900 hover:bg-gray-100 rounded-md shadow-md font-semibold"
              >
                Make Offer
              </Button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Product Info - Below image, separate */}
      <div className="space-y-1">
        {/* Price - Bold and prominent */}
        <p className="text-lg font-semibold text-gray-900">
          AU${product.price.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </p>

        {/* Product Title - Single line only */}
        <h3 className="text-sm text-gray-700 truncate leading-tight">
          {product.description}
        </h3>

        {/* Store Info - Minimal */}
        <div 
          className="flex items-center gap-1.5 pt-0.5 cursor-pointer hover:opacity-70 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            window.location.href = `/marketplace/store/${product.store_id}`;
          }}
        >
          {/* Store Logo */}
          <div className="relative h-5 w-5 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
            {product.store_logo_url && !logoError ? (
              <Image
                src={product.store_logo_url}
                alt={product.store_name}
                fill
                className="object-cover"
                onError={() => setLogoError(true)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Store className="h-3 w-3 text-gray-400" />
              </div>
            )}
          </div>

          {/* Store Name */}
          <span className="text-xs text-gray-500 truncate">
            {product.store_name}
          </span>
          
          {/* Verified Badge */}
          <Image
            src="/verified.png"
            alt="Verified"
            width={13}
            height={13}
            className="flex-shrink-0"
          />
        </div>
      </div>
      </motion.div>

      {/* Product Detail Modal */}
      <ProductDetailModal
        product={product}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}

// ============================================================
// Product Card Skeleton - Facebook Marketplace Style
// ============================================================

export function ProductCardSkeleton() {
  return (
    <div>
      {/* Image Skeleton - Separate container */}
      <div className="relative aspect-square w-full bg-gray-100 animate-pulse rounded-md border border-gray-200 mb-2" />

      {/* Content Skeleton */}
      <div className="space-y-1">
        {/* Price Skeleton */}
        <div className="h-6 w-20 bg-gray-100 rounded animate-pulse" />
        
        {/* Title Skeleton - Single line */}
        <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
        
        {/* Store Info Skeleton */}
        <div className="flex items-center gap-1.5 pt-0.5">
          <div className="h-5 w-5 rounded-full bg-gray-100 animate-pulse" />
          <div className="h-3 w-16 bg-gray-100 rounded animate-pulse" />
        </div>
      </div>
    </div>
  );
}

