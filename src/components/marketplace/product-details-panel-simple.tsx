"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { MapPin, Heart, Share2, Tag, User, Package, Store, Info } from "lucide-react";
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

      {/* Action Buttons - Make Offer & Send Message */}
      <div className="px-4 pb-4">
        <div className="flex gap-2">
          <div className="flex-1">
            <MakeOfferButton
              productId={product.id}
              productName={(product as any).display_name || product.description}
              productPrice={product.price}
              sellerId={product.user_id}
              productImage={product.all_images?.[0] || null}
              variant="outline"
              size="lg"
              fullWidth
              className="rounded-md h-12 text-sm font-medium border-2 border-gray-300 hover:border-gray-400 hover:bg-gray-50"
            />
          </div>
          <div className="flex-1">
            <ProductInquiryButton
              productId={product.id}
              productName={(product as any).display_name || product.description}
              sellerId={product.user_id}
              size="lg"
              fullWidth
              className="rounded-md h-12 text-sm font-medium border-2 border-gray-300 hover:border-gray-400 hover:bg-gray-50"
            />
          </div>
        </div>
      </div>

      {/* Secondary Actions - Share, Save, Visit Store, Learn */}
      <div className="px-4 pb-4">
        <div className="flex items-center justify-around">
          <button 
            onClick={handleShare}
            className="flex flex-col items-center gap-1.5 py-2 hover:opacity-70 transition-opacity"
          >
            <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
              <Share2 className="h-5 w-5 text-gray-700" />
            </div>
            <span className="text-xs text-gray-700">Share</span>
          </button>

          <button 
            onClick={() => setIsLiked(!isLiked)}
            className="flex flex-col items-center gap-1.5 py-2 hover:opacity-70 transition-opacity"
          >
            <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
              <Heart className={cn("h-5 w-5", isLiked ? "fill-red-500 text-red-500" : "text-gray-700")} />
            </div>
            <span className="text-xs text-gray-700">Save</span>
          </button>

          <Link
            href={`/marketplace/store/${product.user_id}`}
            className="flex flex-col items-center gap-1.5 py-2 hover:opacity-70 transition-opacity"
          >
            <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
              <Store className="h-5 w-5 text-gray-700" />
            </div>
            <span className="text-xs text-gray-700">Visit Store</span>
          </Link>

          <button 
            onClick={() => {}}
            className="flex flex-col items-center gap-1.5 py-2 hover:opacity-70 transition-opacity"
          >
            <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
              <Info className="h-5 w-5 text-gray-700" />
            </div>
            <span className="text-xs text-gray-700">Learn</span>
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
          <div className="space-y-0 divide-y divide-gray-100">
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
            {(product as any).bike_type && (
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-600">Type</span>
                <span className="text-sm font-medium text-gray-900">{(product as any).bike_type}</span>
              </div>
            )}
            {((product as any).frame_size || (product as any).size) && (
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-600">Size</span>
                <span className="text-sm font-medium text-gray-900">{(product as any).frame_size || (product as any).size}</span>
              </div>
            )}
            {(product as any).frame_material && (
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-600">Frame Material</span>
                <span className="text-sm font-medium text-gray-900">{(product as any).frame_material}</span>
              </div>
            )}
            {(product as any).groupset && (
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-600">Groupset</span>
                <span className="text-sm font-medium text-gray-900">{(product as any).groupset}</span>
              </div>
            )}
            {(product as any).wheel_size && (
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-600">Wheel Size</span>
                <span className="text-sm font-medium text-gray-900">{(product as any).wheel_size}</span>
              </div>
            )}
            {(product as any).suspension_type && (
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-600">Suspension</span>
                <span className="text-sm font-medium text-gray-900">{(product as any).suspension_type}</span>
              </div>
            )}
            {(product as any).color_primary && (
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-600">Colour</span>
                <span className="text-sm font-medium text-gray-900">{(product as any).color_primary}</span>
              </div>
            )}
            
            {/* Apparel-Specific Fields */}
            {(product as any).gender_fit && (
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-600">Gender Fit</span>
                <span className="text-sm font-medium text-gray-900">{(product as any).gender_fit}</span>
              </div>
            )}
            {(product as any).apparel_material && (
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-600">Material</span>
                <span className="text-sm font-medium text-gray-900">{(product as any).apparel_material}</span>
              </div>
            )}
            
            {/* Part/Accessory Fields */}
            {(product as any).part_type_detail && (
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-600">Part Type</span>
                <span className="text-sm font-medium text-gray-900">{(product as any).part_type_detail}</span>
              </div>
            )}
            {(product as any).compatibility_notes && (
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-600">Compatibility</span>
                <span className="text-sm font-medium text-gray-900">{(product as any).compatibility_notes}</span>
              </div>
            )}
            {(product as any).material && (
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-600">Material</span>
                <span className="text-sm font-medium text-gray-900">{(product as any).material}</span>
              </div>
            )}
            {(product as any).weight && (
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-600">Weight</span>
                <span className="text-sm font-medium text-gray-900">{(product as any).weight}</span>
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

