"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart, Share2, Shield, Package, Clock, Eye, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductInquiryButton } from "./product-inquiry-button";
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
    <div className="flex flex-col h-full overflow-y-auto border border-gray-200" style={{
      scrollbarWidth: 'thin',
      scrollbarColor: '#d1d5db transparent'
    }}>
      <div className="p-4 sm:p-6 space-y-4">
        {/* Status Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          {viewCount && (
            <div className="flex items-center gap-1 px-2.5 py-1 bg-gray-100 rounded-md text-xs text-gray-700">
              <Eye className="h-3 w-3" />
              <span>{viewCount} views</span>
            </div>
          )}
          {listingAge !== null && (
            <div className="flex items-center gap-1 px-2.5 py-1 bg-gray-100 rounded-md text-xs text-gray-700">
              <Clock className="h-3 w-3" />
              <span>Listed {listingAge === 0 ? "today" : `${listingAge}d ago`}</span>
            </div>
          )}
        </div>

        {/* Product Title */}
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 leading-tight">
          {(product as any).display_name || product.description}
        </h1>

        {/* Pricing Display */}
        <div className="mb-4">
          <div className="flex items-baseline gap-3 mb-2">
            {/* Current Price */}
            <p className="text-3xl sm:text-4xl font-bold text-gray-900">
              ${product.price.toLocaleString("en-AU")}
            </p>

            {/* Negotiable Badge */}
            {product.is_negotiable && (
              <span className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-md">
                Negotiable
              </span>
            )}
          </div>

          {/* Size/Condition Chips */}
          <div className="flex items-center gap-2 flex-wrap">
            {product.frame_size && (
              <span className="px-2.5 py-1 bg-white border border-gray-300 text-gray-700 text-xs font-medium rounded-md">
                Size {product.frame_size}
              </span>
            )}
            {product.size && (
              <span className="px-2.5 py-1 bg-white border border-gray-300 text-gray-700 text-xs font-medium rounded-md">
                Size {product.size}
              </span>
            )}
            {product.condition_rating && (
              <span className="px-2.5 py-1 bg-white border border-gray-300 text-gray-700 text-xs font-medium rounded-md">
                {product.condition_rating}
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          {/* Buy Now Button */}
          <Button
            size="lg"
            className="w-full bg-gray-900 hover:bg-gray-800 text-white rounded-md h-12 font-semibold"
          >
            Buy Now
          </Button>

          {/* Make Offer / Message Button */}
          <div className="w-full">
            <ProductInquiryButton
              productId={product.id}
              productName={
                (product as any).display_name || product.description
              }
              sellerId={product.user_id}
              variant="outline"
              size="lg"
              fullWidth
              className="rounded-md h-12 border-2 border-gray-300 font-semibold"
            />
          </div>

          {/* Like & Share Row */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="lg"
              onClick={() => setIsLiked(!isLiked)}
              className={cn(
                "flex-1 rounded-md h-12 border-2",
                isLiked
                  ? "border-red-500 text-red-500 hover:bg-red-50"
                  : "border-gray-300 hover:border-gray-400"
              )}
            >
              <Heart
                className={cn("h-5 w-5 mr-2", isLiked && "fill-current")}
              />
              Save
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={handleShare}
              className="flex-1 rounded-md h-12 border-2 border-gray-300 hover:border-gray-400"
            >
              <Share2 className="h-5 w-5 mr-2" />
              Share
            </Button>
          </div>
        </div>

        {/* Buyer Protection Notice */}
        <div className="mt-4 p-3 bg-white border border-gray-200 rounded-md">
          <div className="flex items-start gap-2">
            <Shield className="h-4 w-4 text-gray-700 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-900">
                All purchases through Bike are covered by Buyer Protection.
              </p>
            </div>
          </div>
        </div>

        {/* Shipping Info */}
        {product.pickup_location && (
          <div className="mt-3 p-3 bg-white border border-gray-200 rounded-md">
            <div className="flex items-start gap-2">
              <Package className="h-4 w-4 text-gray-700 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-700">
                  <span className="font-semibold">Pickup:</span>{" "}
                  {product.pickup_location}
                </p>
                {product.shipping_available && (
                  <p className="text-xs text-gray-600 mt-1">
                    Shipping also available
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Seller Info */}
        <div className="bg-white border border-gray-200 rounded-md p-4">
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
                  <Package className="h-6 w-6 text-gray-400" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-semibold text-gray-900 truncate">
                  {product.store_name}
                </p>
                <Image
                  src="/verified.png"
                  alt="Verified"
                  width={16}
                  height={16}
                  className="flex-shrink-0"
                />
              </div>
              <div className="flex items-center gap-2">
                <p className="text-xs text-gray-600">Verified seller</p>
                {product.store_account_type === 'bicycle_store' && (
                  <Link
                    href={`/marketplace/store/${product.user_id}`}
                    className="text-xs text-gray-900 hover:text-gray-700 font-medium flex items-center gap-1 transition-colors"
                  >
                    Visit Store
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Overview */}
        <OverviewCard product={product} />

        {/* Expandable Detail Sections */}
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
  );
}

