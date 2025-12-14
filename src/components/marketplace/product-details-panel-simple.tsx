"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Heart, Share2, User, Store, Sparkles, Pencil, Zap, Shield, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductInquiryButton } from "./product-inquiry-button";
import { MakeOfferButton } from "./make-offer-button";
import { BuyNowButton } from "./buy-now-button";
import { ProductLearnPanel } from "./product-learn-panel";
import { EditProductDrawer } from "./edit-product-drawer";
import { useAuth } from "@/components/providers/auth-provider";
import { useAuthModal } from "@/components/providers/auth-modal-provider";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { cn } from "@/lib/utils";

// ============================================================
// Product Details Panel - Underline Tabs Design
// Clean, modern design with tabbed navigation
// ============================================================

interface ProductDetailsPanelSimpleProps {
  product: MarketplaceProduct;
  onProductUpdate?: (updatedProduct: MarketplaceProduct) => void;
}

export function ProductDetailsPanelSimple({ product: initialProduct, onProductUpdate }: ProductDetailsPanelSimpleProps) {
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [product, setProduct] = React.useState(initialProduct);
  const [isLiked, setIsLiked] = React.useState(false);
  const [logoError, setLogoError] = React.useState(false);
  const [isLearnOpen, setIsLearnOpen] = React.useState(false);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'overview' | 'specs'>('overview');

  // Check if current user owns this product
  const isOwner = user?.id === product.user_id;
  
  // Check if product is sold
  const isSold = !!(product as any).sold_at || (product as any).listing_status === 'sold';

  // Sync product state with prop
  React.useEffect(() => {
    setProduct(initialProduct);
  }, [initialProduct]);

  // Handle product update from edit drawer
  const handleProductUpdate = (updatedProduct: MarketplaceProduct) => {
    setProduct(updatedProduct);
    onProductUpdate?.(updatedProduct);
  };

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
      {/* Header: Title, Price, Save/Share */}
      <div className="px-4 pt-4 pb-3">
        <h1 className="text-xl font-bold text-gray-900 leading-tight">
          {(product as any).display_name || product.description}
        </h1>
        <div className="flex items-center justify-between mt-2">
          <p className="text-2xl font-bold text-gray-900">
            ${product.price.toLocaleString("en-AU")}
          </p>
          <div className="flex gap-1.5">
            <button 
              onClick={() => setIsLiked(!isLiked)}
              className="h-9 w-9 rounded-md bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
            >
              <Heart className={cn("h-4 w-4", isLiked ? "fill-red-500 text-red-500" : "text-gray-600")} />
            </button>
            <button 
              onClick={handleShare}
              className="h-9 w-9 rounded-md bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
            >
              <Share2 className="h-4 w-4 text-gray-600" />
            </button>
          </div>
        </div>
        {(product as any).pickup_location && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <MapPin className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-xs text-gray-500">
              {(product as any).pickup_location}
              {(product as any).condition_rating && ` • ${(product as any).condition_rating}`}
            </span>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="px-4 pb-4 space-y-2">
        {isSold ? (
          /* Sold View: Show sold banner */
          <div className="p-4 bg-gray-100 rounded-md text-center">
            <Badge className="rounded-md bg-gray-200 text-gray-600 border-0 text-sm px-4 py-1.5 font-medium mb-2">
              Sold
            </Badge>
            <p className="text-sm text-gray-500">This item has been sold</p>
          </div>
        ) : isOwner ? (
          /* Owner View: Edit Button */
          <Button
            onClick={() => setIsEditOpen(true)}
            size="lg"
            className="w-full h-11 rounded-md text-sm font-medium bg-gray-900 hover:bg-gray-800 text-white"
          >
            <Pencil className="h-4 w-4 mr-2" />
            Edit Listing
          </Button>
        ) : (
          /* Buyer View: Buy Now, Make Offer & Send Message */
          <>
            <BuyNowButton
              productId={product.id}
              productName={(product as any).display_name || product.description}
              productPrice={product.price}
              sellerId={product.user_id}
              shippingCost={(product as any).shipping_available ? ((product as any).shipping_cost || 0) : 0}
              variant="default"
              size="lg"
              fullWidth
              className="h-11"
              showStripeBranding={true}
            />
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
                  className="rounded-md h-10 text-sm font-medium"
                />
              </div>
              <div className="flex-1">
                <ProductInquiryButton
                  productId={product.id}
                  productName={(product as any).display_name || product.description}
                  sellerId={product.user_id}
                  sellerName={product.store_name}
                  productImage={product.all_images?.[0] || product.primary_image_url || null}
                  productPrice={product.price}
                  variant="outline"
                  size="lg"
                  fullWidth
                  className="rounded-md h-10 text-sm font-medium bg-white"
                  buttonLabel="Message"
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Feature Badges */}
      <div className="px-4 pb-4 flex gap-2">
        <Badge className="rounded-md bg-amber-50 text-amber-700 border-0 text-xs px-2.5 py-1 font-medium">
          <Zap className="h-3 w-3 mr-1" />
          1-Hour Express
        </Badge>
        <Badge className="rounded-md bg-emerald-50 text-emerald-700 border-0 text-xs px-2.5 py-1 font-medium">
          <Shield className="h-3 w-3 mr-1" />
          Buyer Protection
        </Badge>
      </div>

      {/* Seller Row */}
      <div className="px-4 py-3 border-t border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
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
                  <User className="h-5 w-5 text-gray-400" />
                </div>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{product.store_name}</p>
              <p className="text-xs text-gray-500">
                {product.store_account_type === 'bicycle_store' ? 'Bicycle Store' : 'Individual Seller'}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="text-xs" asChild>
            <Link href={`/marketplace/store/${product.user_id}`}>
              View Store
              <ChevronRight className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Underline Tabs */}
      <div className="px-4 pt-3 border-b border-gray-200">
        <div className="flex">
          <button
            onClick={() => setActiveTab('overview')}
            className={cn(
              "flex-1 pb-3 text-sm font-medium border-b-2 transition-colors",
              activeTab === 'overview'
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('specs')}
            className={cn(
              "flex-1 pb-3 text-sm font-medium border-b-2 transition-colors",
              activeTab === 'specs'
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            Specs
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-4 py-4">
        <AnimatePresence mode="wait">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Description */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Description</h3>
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                  {(product as any).condition_details || (product as any).display_name || product.description}
                </p>
                {/* Research with AI */}
                <button 
                  onClick={() => {
                    if (!user) {
                      openAuthModal();
                      return;
                    }
                    setIsLearnOpen(true);
                  }}
                  className="flex items-center gap-1.5 mt-4 text-sm font-medium text-gray-900 hover:text-gray-600 transition-colors"
                >
                  <Sparkles className="h-4 w-4" />
                  Research with AI
                </button>
              </div>

              {/* Seller Notes */}
              {(product as any).seller_notes && (
                <div className="pt-3 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Seller Notes</h3>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                    {(product as any).seller_notes}
                  </p>
                </div>
              )}

              {/* Location */}
              {(product as any).pickup_location && (
                <div className="pt-3 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Location</h3>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-600">{(product as any).pickup_location}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1 ml-6">Location is approximate</p>
                </div>
              )}
            </motion.div>
          )}

          {/* Specs Tab */}
          {activeTab === 'specs' && (
            <motion.div
              key="specs"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              className="space-y-0 divide-y divide-gray-100"
            >
              {(product as any).condition_rating && (
                <div className="flex justify-between py-2.5">
                  <span className="text-sm text-gray-500">Condition</span>
                  <span className="text-sm font-medium text-gray-900">{(product as any).condition_rating}</span>
                </div>
              )}
              {(product as any).brand && (
                <div className="flex justify-between py-2.5">
                  <span className="text-sm text-gray-500">Brand</span>
                  <span className="text-sm font-medium text-gray-900">{(product as any).brand}</span>
                </div>
              )}
              {(product as any).model && (
                <div className="flex justify-between py-2.5">
                  <span className="text-sm text-gray-500">Model</span>
                  <span className="text-sm font-medium text-gray-900">{(product as any).model}</span>
                </div>
              )}
              {(product as any).model_year && (
                <div className="flex justify-between py-2.5">
                  <span className="text-sm text-gray-500">Year</span>
                  <span className="text-sm font-medium text-gray-900">{(product as any).model_year}</span>
                </div>
              )}
              {(product as any).bike_type && (
                <div className="flex justify-between py-2.5">
                  <span className="text-sm text-gray-500">Type</span>
                  <span className="text-sm font-medium text-gray-900">{(product as any).bike_type}</span>
                </div>
              )}
              {((product as any).frame_size || (product as any).size) && (
                <div className="flex justify-between py-2.5">
                  <span className="text-sm text-gray-500">Size</span>
                  <span className="text-sm font-medium text-gray-900">{(product as any).frame_size || (product as any).size}</span>
                </div>
              )}
              {(product as any).frame_material && (
                <div className="flex justify-between py-2.5">
                  <span className="text-sm text-gray-500">Frame Material</span>
                  <span className="text-sm font-medium text-gray-900">{(product as any).frame_material}</span>
                </div>
              )}
              {(product as any).groupset && (
                <div className="flex justify-between py-2.5">
                  <span className="text-sm text-gray-500">Groupset</span>
                  <span className="text-sm font-medium text-gray-900">{(product as any).groupset}</span>
                </div>
              )}
              {(product as any).wheel_size && (
                <div className="flex justify-between py-2.5">
                  <span className="text-sm text-gray-500">Wheel Size</span>
                  <span className="text-sm font-medium text-gray-900">{(product as any).wheel_size}</span>
                </div>
              )}
              {(product as any).suspension_type && (
                <div className="flex justify-between py-2.5">
                  <span className="text-sm text-gray-500">Suspension</span>
                  <span className="text-sm font-medium text-gray-900">{(product as any).suspension_type}</span>
                </div>
              )}
              {(product as any).color_primary && (
                <div className="flex justify-between py-2.5">
                  <span className="text-sm text-gray-500">Colour</span>
                  <span className="text-sm font-medium text-gray-900">{(product as any).color_primary}</span>
                </div>
              )}
              {/* Apparel-Specific Fields */}
              {(product as any).gender_fit && (
                <div className="flex justify-between py-2.5">
                  <span className="text-sm text-gray-500">Gender Fit</span>
                  <span className="text-sm font-medium text-gray-900">{(product as any).gender_fit}</span>
                </div>
              )}
              {(product as any).apparel_material && (
                <div className="flex justify-between py-2.5">
                  <span className="text-sm text-gray-500">Material</span>
                  <span className="text-sm font-medium text-gray-900">{(product as any).apparel_material}</span>
                </div>
              )}
              {/* Part/Accessory Fields */}
              {(product as any).part_type_detail && (
                <div className="flex justify-between py-2.5">
                  <span className="text-sm text-gray-500">Part Type</span>
                  <span className="text-sm font-medium text-gray-900">{(product as any).part_type_detail}</span>
                </div>
              )}
              {(product as any).compatibility_notes && (
                <div className="flex justify-between py-2.5">
                  <span className="text-sm text-gray-500">Compatibility</span>
                  <span className="text-sm font-medium text-gray-900">{(product as any).compatibility_notes}</span>
                </div>
              )}
              {(product as any).material && (
                <div className="flex justify-between py-2.5">
                  <span className="text-sm text-gray-500">Material</span>
                  <span className="text-sm font-medium text-gray-900">{(product as any).material}</span>
                </div>
              )}
              {(product as any).weight && (
                <div className="flex justify-between py-2.5">
                  <span className="text-sm text-gray-500">Weight</span>
                  <span className="text-sm font-medium text-gray-900">{(product as any).weight}</span>
                </div>
              )}
              {/* If no specs exist, show a message */}
              {!(product as any).condition_rating && 
               !(product as any).brand && 
               !(product as any).model && 
               !(product as any).bike_type && (
                <div className="py-4 text-center text-sm text-gray-400">
                  No specifications available
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* AI Product Learn Panel */}
      <ProductLearnPanel
        product={product}
        isOpen={isLearnOpen}
        onClose={() => setIsLearnOpen(false)}
      />

      {/* Edit Product Drawer - Only for owners */}
      {isOwner && (
        <EditProductDrawer
          product={product}
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          onUpdate={handleProductUpdate}
        />
      )}
    </div>
  );
}
