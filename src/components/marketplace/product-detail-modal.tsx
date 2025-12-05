"use client";

import * as React from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { X, Store, Heart, Share2, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { cn } from "@/lib/utils";
import { EnhancedImageGallery } from "./product-detail/enhanced-image-gallery";
import { OverviewCard } from "./product-detail/overview-card";
import { ProductInquiryButton } from "./product-inquiry-button";
import { 
  ConditionSection, 
  SpecificationsSection, 
  HistorySection,
  WhatsIncludedSection,
  DeliverySection,
  SellerContactSection
} from "./product-detail/sections";

// ============================================================
// Enhanced Product Detail Modal
// ============================================================

interface ProductDetailModalProps {
  product: MarketplaceProduct | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ProductDetailModal({ product, isOpen, onClose }: ProductDetailModalProps) {
  const [currentImageIndex, setCurrentImageIndex] = React.useState(0);
  const [isLiked, setIsLiked] = React.useState(false);
  const [logoError, setLogoError] = React.useState(false);

  // Reset state when modal opens/closes
  React.useEffect(() => {
    if (isOpen) {
      setCurrentImageIndex(0);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Handle Escape key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!product) return null;

  // Get all available images
  const images = React.useMemo(() => {
    console.log('🖼️ [MODAL IMAGE DEBUG] Product:', product.id);
    console.log('🖼️ [MODAL IMAGE DEBUG] listing_type:', product.listing_type);
    console.log('🖼️ [MODAL IMAGE DEBUG] images field:', (product as any).images);
    console.log('🖼️ [MODAL IMAGE DEBUG] all_images:', product.all_images);
    console.log('🖼️ [MODAL IMAGE DEBUG] primary_image_url:', product.primary_image_url);
    
    const imgs: string[] = [];
    
    // For private listings with images array
    if (product.listing_type === 'private_listing' && Array.isArray((product as any).images)) {
      const listingImages = (product as any).images as Array<{ url: string; order: number }>;
      const filtered = listingImages
        .sort((a, b) => a.order - b.order)
        .map(img => img.url)
        .filter(url => url && !url.startsWith('blob:')); // Filter out blob URLs
      
      console.log('🖼️ [MODAL IMAGE DEBUG] Found private listing images:', filtered.length);
      console.log('🖼️ [MODAL IMAGE DEBUG] Image URLs:', filtered);
      
      return filtered;
    }
    
    // For store inventory with all_images array
    if (product.all_images && product.all_images.length > 0) {
      return product.all_images;
    }
    
    // Fallback to canonical products
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    
    if (product.image_variants && product.image_variants.original) {
      imgs.push(`${baseUrl}/storage/v1/object/public/product-images/${product.image_variants.original}`);
    } else if (product.primary_image_url && !product.primary_image_url.startsWith('blob:')) {
      imgs.push(product.primary_image_url);
    }
    
    return imgs.length > 0 ? imgs : [];
  }, [product]);

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: (product as any).display_name || product.description,
          text: `Check out this ${product.marketplace_category} - $${product.price}`,
          url: window.location.href,
        });
      } catch (err) {
        console.log('Share cancelled');
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(window.location.href);
      alert('Link copied to clipboard!');
    }
  };

  const handleContact = () => {
    // Scroll to contact section or open contact
    console.log('Contact seller');
  };

  // Calculate trust indicators
  const hasTrustBadges = 
    (product.service_history && product.service_history.length >= 2) ||
    (images.length >= 8);

  // Get listing age
  const listingAge = product.published_at 
    ? Math.floor((Date.now() - new Date(product.published_at).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative bg-gray-50 rounded-md shadow-2xl w-[95vw] max-w-[1400px] h-[90vh] flex flex-col overflow-hidden">
              {/* Close Button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 z-10 p-2 bg-white rounded-full shadow-lg hover:bg-gray-100 transition-colors"
              >
                <X className="h-5 w-5 text-gray-700" />
              </button>

              {/* Content Grid */}
              <div className="flex-1 overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-[60%_40%] gap-0 h-full">
                  {/* Left Side - Images */}
                  <div className="bg-white p-6 lg:p-8 border-r border-gray-200">
                    <EnhancedImageGallery
                      images={images}
                      productName={(product as any).display_name || product.description}
                      currentIndex={currentImageIndex}
                      onIndexChange={setCurrentImageIndex}
                      onLikeToggle={() => setIsLiked(!isLiked)}
                      isLiked={isLiked}
                    />
                  </div>

                  {/* Right Side - Details */}
                  <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
                    {/* Fixed Header */}
                    <div className="flex-shrink-0 bg-white border-b border-gray-200 p-6 overflow-visible">
                      {/* Seller Info */}
                      <div className="flex items-center gap-3 mb-4">
                        <div className="relative h-10 w-10 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
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
                              <Store className="h-5 w-5 text-gray-400" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-gray-900 truncate">{product.store_name}</p>
                            <Image
                              src="/verified.png"
                              alt="Verified"
                              width={16}
                              height={16}
                              className="flex-shrink-0"
                            />
                            {hasTrustBadges && (
                              <BadgeCheck className="h-4 w-4 text-green-600 flex-shrink-0" aria-label="Verified seller" />
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            {product.pickup_location && (
                              <span>📍 {product.pickup_location}</span>
                            )}
                            {listingAge !== null && (
                              <span>• Listed {listingAge === 0 ? 'today' : `${listingAge}d ago`}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Title & Description & Price */}
                      <div className="mb-4 space-y-3">
                        <h1 className="text-xl lg:text-2xl font-bold text-gray-900 line-clamp-2 leading-tight">
                          {(product as any).display_name || product.description}
                        </h1>
                        
                        {/* Product Description */}
                        {product.condition_details && (
                          <div className="p-3 bg-white border border-gray-200 rounded-xl">
                            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                              {product.condition_details}
                            </p>
                          </div>
                        )}
                        
                        <div className="flex items-baseline gap-2">
                          <p className="text-3xl lg:text-4xl font-black text-gray-900">
                            ${product.price.toLocaleString('en-AU')}
                          </p>
                          {product.is_negotiable && (
                            <span className="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded-md">
                              Negotiable
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <ProductInquiryButton
                            productId={product.id}
                            productName={(product as any).display_name || product.description}
                            sellerId={product.user_id}
                            variant="default"
                            fullWidth
                            className="bg-gray-900 hover:bg-gray-800 text-white rounded-md h-11"
                          />
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setIsLiked(!isLiked)}
                          className={cn(
                            "rounded-md h-11 w-11 border-2",
                            isLiked ? "border-red-500 text-red-500" : "border-gray-300"
                          )}
                        >
                          <Heart className={cn("h-5 w-5", isLiked && "fill-current")} />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={handleShare}
                          className="rounded-md h-11 w-11 border-2 border-gray-300"
                        >
                          <Share2 className="h-5 w-5" />
                        </Button>
                      </div>
                    </div>

                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-4 space-y-4 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
                      {/* Overview Card - Always Visible */}
                      <OverviewCard product={product} />

                      {/* Expandable Sections */}
                      <ConditionSection product={product} />
                      <SpecificationsSection product={product} />
                      <HistorySection product={product} />
                      <WhatsIncludedSection product={product} />
                      <DeliverySection product={product} />
                      <SellerContactSection product={product} />
                      
                      {/* Fallback if no sections shown */}
                      {!product.condition_rating && 
                       !product.frame_size && 
                       !product.size && 
                       !product.service_history?.length && (
                        <div className="bg-white rounded-md border border-gray-200 p-6 text-center">
                          <p className="text-sm text-gray-600 mb-2">
                            This is a basic listing without extended details.
                          </p>
                          <p className="text-xs text-gray-500">
                            Contact the seller for more information about this item.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
