"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart, Share2, Shield, Package, Clock, Eye, ExternalLink, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductInquiryButton } from "./product-inquiry-button";
import { MakeOfferButton } from "./make-offer-button";
import { ProductLearnPanel } from "./product-learn-panel";
import { OverviewCard } from "./product-detail/overview-card";
import {
  ConditionSection,
  SpecificationsSection,
  HistorySection,
  WhatsIncludedSection,
  DeliverySection,
  SellerContactSection,
} from "./product-detail/sections";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { cn } from "@/lib/utils";

// ============================================================
// Product Details Panel - Depop-inspired Right Column
// ============================================================

interface ProductDetailsPanelProps {
  product: MarketplaceProduct;
}

export function ProductDetailsPanel({ product }: ProductDetailsPanelProps) {
  const [isLiked, setIsLiked] = React.useState(false);
  const [logoError, setLogoError] = React.useState(false);
  const [isLearnOpen, setIsLearnOpen] = React.useState(false);

  // Calculate trust indicators
  const hasTrustBadges =
    (product.service_history && product.service_history.length >= 2) ||
    (product.all_images && product.all_images.length >= 8);

  // Get listing age
  const listingAge = product.published_at
    ? Math.floor(
        (Date.now() - new Date(product.published_at).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : null;

  // Mock view count - replace with actual data
  const viewCount = Math.floor(Math.random() * 50) + 10;

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
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(window.location.href);
      alert("Link copied to clipboard!");
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto lg:bg-white" style={{
      scrollbarWidth: 'thin',
      scrollbarColor: '#d1d5db transparent'
    }}>
      <div className="px-4 py-5 sm:px-6 sm:py-6 space-y-6">
        
        {/* ===== HERO SECTION ===== */}
        <div className="space-y-4">
          {/* Product Title - Clean and Bold */}
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight tracking-tight">
            {(product as any).display_name || product.description}
          </h1>

          {/* Price - Large and Prominent */}
          <div className="flex items-baseline gap-3">
            <p className="text-4xl sm:text-5xl font-bold text-gray-900">
              ${product.price.toLocaleString("en-AU")}
            </p>
            {product.is_negotiable && (
              <span className="text-sm text-gray-500 font-medium">
                or best offer
              </span>
            )}
          </div>

          {/* Quick Stats - Minimal Pills */}
          {(product.frame_size || product.size || product.condition_rating || product.bike_type || product.model_year) && (
            <div className="flex items-center gap-2 flex-wrap">
              {product.model_year && (
                <span className="px-3 py-1.5 bg-gray-50 text-gray-700 text-sm font-medium rounded-full">
                  {product.model_year}
                </span>
              )}
              {product.bike_type && (
                <span className="px-3 py-1.5 bg-gray-50 text-gray-700 text-sm font-medium rounded-full">
                  {product.bike_type}
                </span>
              )}
              {(product.frame_size || product.size) && (
                <span className="px-3 py-1.5 bg-gray-50 text-gray-700 text-sm font-medium rounded-full">
                  Size {product.frame_size || product.size}
                </span>
              )}
              {product.condition_rating && (
                <span className="px-3 py-1.5 bg-gray-50 text-gray-700 text-sm font-medium rounded-full">
                  {product.condition_rating}
                </span>
              )}
              {listingAge !== null && (
                <span className="px-3 py-1.5 bg-gray-50 text-gray-500 text-sm rounded-full">
                  Listed {listingAge === 0 ? "today" : `${listingAge}d ago`}
                </span>
              )}
            </div>
          )}

          {/* Product Description - Clean Box */}
          {product.condition_details && (
            <div className="pt-4 border-t border-gray-100">
              <p className="text-base text-gray-700 leading-relaxed whitespace-pre-wrap">
                {product.condition_details}
              </p>
            </div>
          )}
        </div>

        {/* ===== PRIMARY ACTIONS ===== */}
        <div className="space-y-3 pt-2">
          {/* Buy Now - Primary CTA */}
          <Button
            size="lg"
            className="w-full bg-gray-900 hover:bg-gray-800 text-white rounded-xl h-14 text-base font-semibold shadow-sm"
          >
            Buy Now
          </Button>

          {/* Make Offer & Send Message - Side by Side */}
          <div className="flex gap-2">
            <div className="flex-1">
              <MakeOfferButton
                productId={product.id}
                productName={
                  (product as any).display_name || product.description
                }
                productPrice={product.price}
                sellerId={product.user_id}
                productImage={product.all_images?.[0] || null}
                variant="outline"
                size="lg"
                fullWidth
                className="rounded-xl h-12 text-sm font-medium border-2 border-gray-300 hover:border-gray-400 hover:bg-gray-50"
              />
            </div>
            <div className="flex-1">
              <ProductInquiryButton
                productId={product.id}
                productName={
                  (product as any).display_name || product.description
                }
                sellerId={product.user_id}
                sellerName={product.store_name}
                productImage={product.all_images?.[0] || product.primary_image_url || null}
                productPrice={product.price}
                variant="outline"
                size="lg"
                fullWidth
                className="rounded-xl h-12 text-sm font-medium border-2 border-gray-300 hover:border-gray-400 hover:bg-gray-50"
              />
            </div>
          </div>

          {/* Secondary Actions - Subtle */}
          <div className="flex items-center justify-center gap-6 pt-2">
            <button
              onClick={() => setIsLiked(!isLiked)}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <Heart
                className={cn("h-5 w-5", isLiked && "fill-current text-red-500")}
              />
              <span className="font-medium">Save</span>
            </button>
            <button
              onClick={handleShare}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <Share2 className="h-5 w-5" />
              <span className="font-medium">Share</span>
            </button>
            <button
              onClick={() => setIsLearnOpen(true)}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <Sparkles className="h-5 w-5" />
              <span className="font-medium">Learn</span>
            </button>
          </div>
        </div>

        {/* ===== KEY INFORMATION ===== */}
        <div className="space-y-4 pt-4 border-t border-gray-100">
          
          {/* Delivery Info */}
          {product.pickup_location && (
            <div className="flex items-start gap-3">
              <Package className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {product.shipping_available ? "Pickup or Delivery" : "Pickup Only"}
                </p>
                <p className="text-sm text-gray-600 mt-0.5">
                  {product.pickup_location}
                </p>
              </div>
            </div>
          )}

          {/* Buyer Protection - Subtle */}
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">
                Buyer Protection
              </p>
              <p className="text-sm text-gray-600 mt-0.5">
                Secure payments and purchase protection
              </p>
            </div>
          </div>
        </div>

        {/* ===== SELLER INFO - Moved Lower ===== */}
        <div className="pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-3">
            Sold By
          </p>
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
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
                  <Package className="h-5 w-5 text-gray-400" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="font-semibold text-gray-900 truncate">
                  {product.store_name}
                </p>
                <Image
                  src="/verified.png"
                  alt="Verified"
                  width={14}
                  height={14}
                  className="flex-shrink-0"
                />
              </div>
              {product.store_account_type === 'bicycle_store' && (
                <Link
                  href={`/marketplace/store/${product.user_id}`}
                  className="text-sm text-gray-600 hover:text-gray-900 font-medium inline-flex items-center gap-1 transition-colors mt-0.5"
                >
                  View store
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* ===== PRODUCT DETAILS ===== */}
        <div className="pt-6 border-t border-gray-100 space-y-1">
          <OverviewCard product={product} />

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
              <div className="text-center py-8">
                <p className="text-sm text-gray-500">
                  Contact seller for more details
                </p>
              </div>
            )}
        </div>
      </div>

      {/* AI Product Learn Panel */}
      <ProductLearnPanel
        product={product}
        isOpen={isLearnOpen}
        onClose={() => setIsLearnOpen(false)}
      />
    </div>
  );
}

