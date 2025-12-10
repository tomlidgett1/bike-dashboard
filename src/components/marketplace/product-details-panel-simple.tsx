"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { MapPin, Heart, Share2, Bell, Tag, User, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductInquiryButton } from "./product-inquiry-button";
import { MakeOfferButton } from "./make-offer-button";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { cn } from "@/lib/utils";

// ============================================================
// Simple Product Details Panel - Facebook Marketplace Style
// Clean, minimal design optimized for mobile
// ============================================================

interface ProductDetailsPanelSimpleProps {
  product: MarketplaceProduct;
}

export function ProductDetailsPanelSimple({ product }: ProductDetailsPanelSimpleProps) {
  const [isLiked, setIsLiked] = React.useState(false);
  const [logoError, setLogoError] = React.useState(false);

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

  return (
    <div className="bg-white">
      {/* Title, Price, Location */}
      <div className="px-4 py-4 space-y-3">
        <h1 className="text-2xl font-bold text-gray-900 leading-tight">
          {(product as any).display_name || product.description}
        </h1>

        <p className="text-3xl font-bold text-gray-900">
          ${product.price.toLocaleString("en-AU")}
        </p>

        {(product as any).pickup_location && (
          <div className="flex items-center gap-1.5 text-gray-600">
            <MapPin className="h-4 w-4" />
            <span className="text-sm">Nearby • {(product as any).pickup_location}</span>
          </div>
        )}
      </div>

      {/* Send Message Button */}
      <div className="px-4 pb-4">
        <ProductInquiryButton
          productId={product.id}
          productName={(product as any).display_name || product.description}
          sellerId={product.user_id}
          size="lg"
          fullWidth
          className="rounded-md h-12 bg-white border-2 border-gray-900 text-gray-900 font-semibold hover:bg-gray-50"
        />
      </div>

      {/* Action Buttons Row */}
      <div className="px-4 pb-4">
        <div className="grid grid-cols-4 gap-3">
          <button className="flex flex-col items-center gap-1.5 py-3">
            <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
              <Bell className="h-5 w-5 text-gray-700" />
            </div>
            <span className="text-xs text-gray-700">Alerts</span>
          </button>

          <button 
            onClick={(e) => {
              e.preventDefault();
              // Trigger make offer modal
            }}
            className="flex flex-col items-center gap-1.5 py-3"
          >
            <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
              <Tag className="h-5 w-5 text-gray-700" />
            </div>
            <span className="text-xs text-gray-700">Send offer</span>
          </button>

          <button 
            onClick={handleShare}
            className="flex flex-col items-center gap-1.5 py-3"
          >
            <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
              <Share2 className="h-5 w-5 text-gray-700" />
            </div>
            <span className="text-xs text-gray-700">Share</span>
          </button>

          <button 
            onClick={() => setIsLiked(!isLiked)}
            className="flex flex-col items-center gap-1.5 py-3"
          >
            <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
              <Heart className={cn("h-5 w-5", isLiked ? "fill-red-500 text-red-500" : "text-gray-700")} />
            </div>
            <span className="text-xs text-gray-700">Save</span>
          </button>
        </div>
      </div>

      {/* Description */}
      <div className="border-t border-gray-200">
        <div className="px-4 py-4">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Description</h2>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {(product as any).condition_details || (product as any).display_name || product.description}
          </p>
        </div>
      </div>

      {/* Seller Information */}
      <div className="border-t border-gray-200">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900">Seller information</h2>
            <Link 
              href={`/marketplace/${product.store_account_type === 'bicycle_store' ? 'store' : 'seller'}/${product.user_id}`}
              className="text-sm text-blue-600 font-medium"
            >
              Seller Details
            </Link>
          </div>

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
                  <User className="h-5 w-5 text-gray-400" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">{product.store_name}</p>
              <p className="text-sm text-gray-600">
                {product.store_account_type === 'bicycle_store' ? 'Bicycle Store' : 'Individual Seller'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="border-t border-gray-200">
        <div className="px-4 py-4">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Details</h2>
          <div className="space-y-2">
            {(product as any).condition_rating && (
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-600">Condition</span>
                <span className="text-sm font-medium text-gray-900">{(product as any).condition_rating}</span>
              </div>
            )}
            {(product as any).brand && (
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-600">Brand</span>
                <span className="text-sm font-medium text-gray-900">{(product as any).brand}</span>
              </div>
            )}
            {(product as any).model && (
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-600">Model</span>
                <span className="text-sm font-medium text-gray-900">{(product as any).model}</span>
              </div>
            )}
            {(product as any).model_year && (
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-600">Year</span>
                <span className="text-sm font-medium text-gray-900">{(product as any).model_year}</span>
              </div>
            )}
            {((product as any).frame_size || (product as any).size) && (
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-600">Size</span>
                <span className="text-sm font-medium text-gray-900">{(product as any).frame_size || (product as any).size}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Location */}
      {(product as any).pickup_location && (
        <div className="border-t border-gray-200">
          <div className="px-4 py-4">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Location</h2>
            <p className="text-sm text-gray-900 font-medium">{(product as any).pickup_location}</p>
            <p className="text-sm text-gray-600 mt-1">Location is approximate</p>
          </div>
        </div>
      )}
    </div>
  );
}

