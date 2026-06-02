"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, User, Sparkles, Pencil, Shield, ChevronRight, Truck, Globe } from "lucide-react";
import { PickupLocationMap } from "./product-detail/pickup-location-map";
import { UberDeliveryInlineBadge } from "./uber-delivery-banner";
import { MARKETPLACE_PROMO_BANNERS_ENABLED } from "@/lib/marketplace-feature-flags";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductInquiryButton } from "./product-inquiry-button";
import { MakeOfferButton } from "./make-offer-button";
import { BuyNowButton } from "./buy-now-button";
import { AddToCartButton } from "./add-to-cart-button";
import { ProductLearnPanel } from "./product-learn-panel";
import { EditProductDrawer } from "./edit-product-drawer";
import { useAuth } from "@/components/providers/auth-provider";
import { useAuthModal } from "@/components/providers/auth-modal-provider";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { resolveLivePrice } from "@/lib/marketplace/pricing";
import { cn } from "@/lib/utils";

// Adaptive spec row: short values inline (label ↔ value), long values stacked
function SpecRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-start gap-4 py-2.5">
      <span className="text-sm text-gray-500 w-[110px] flex-shrink-0">{label}</span>
      <span className="text-sm text-gray-900 flex-1 leading-relaxed">{String(value)}</span>
    </div>
  );
}

// Renders **bold** spans within a line of text
function InlineText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <strong key={i} className="font-semibold text-gray-900">{part}</strong>
          : part || null
      )}
    </>
  );
}

// Full markdown-aware description renderer
// Handles: **bold**, ## headings, • / - / * bullets, paragraphs
export function ProductDescription({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter(b => b.trim());

  return (
    <div className="space-y-3">
      {blocks.map((block, bi) => {
        const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean);

        // Heading block: single line starting with # or ##
        if (lines.length === 1 && /^#{1,3}\s/.test(lines[0])) {
          return (
            <h4 key={bi} className="text-sm font-semibold text-gray-900">
              <InlineText text={lines[0].replace(/^#+\s/, '')} />
            </h4>
          );
        }

        // Detect bullet lines (•, -, *)
        const isBullet = (l: string) => /^[•\-\*]\s/.test(l);
        const bulletLines = lines.filter(isBullet);
        const nonBulletLines = lines.filter(l => !isBullet(l));

        // Mixed block: optional header + bullet list
        if (bulletLines.length > 0) {
          // A standalone non-bullet line at the top is the section header
          const header = nonBulletLines.length === 1 ? nonBulletLines[0] : null;
          const headerIsBold = header?.startsWith('**') && header.endsWith('**');

          return (
            <div key={bi} className="space-y-1.5">
              {header && (
                <h4 className="text-sm font-semibold text-gray-900">
                  <InlineText text={headerIsBold ? header.slice(2, -2) : header} />
                </h4>
              )}
              <ul className="space-y-1.5">
                {bulletLines.map((line, li) => {
                  const content = line.replace(/^[•\-\*]\s/, '');
                  return (
                    <li key={li} className="flex gap-2 text-sm text-gray-600 leading-relaxed">
                      <span className="text-gray-400 mt-[3px] flex-shrink-0 select-none">•</span>
                      <span><InlineText text={content} /></span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        }

        // Plain paragraph — join lines (handles soft-wrapped AI output)
        return (
          <p key={bi} className="text-sm text-gray-600 leading-relaxed">
            <InlineText text={lines.join(' ')} />
          </p>
        );
      })}
    </div>
  );
}

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

  return (
    <div className="bg-white pb-5 sm:pb-6">
      {/* Header: Title, Price, Save/Share */}
      <div className="px-4 pt-4 pb-3">
        <h1 className="text-xl font-bold text-gray-900 leading-tight">
          {(product as any).display_name || product.description}
        </h1>
        <div className="flex items-center justify-between mt-2">
          {(() => {
            const live = resolveLivePrice(product);
            const fmt = (v: number) => `$${v.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            return (
              <div className="flex items-baseline gap-2 flex-wrap">
                <p className={`text-2xl font-bold ${live.onSale ? "text-red-600" : "text-gray-900"}`}>
                  {fmt(live.price)}
                </p>
                {live.onSale && (
                  <>
                    <p className="text-lg font-medium text-gray-400 line-through">
                      {fmt(live.originalPrice as number)}
                    </p>
                    <span className="inline-flex items-center rounded-md bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                      -{live.percentOff}%
                    </span>
                  </>
                )}
              </div>
            );
          })()}
          {/* Uber Delivery - Discreet inline badge (only for Ashburton Cycles) */}
          {MARKETPLACE_PROMO_BANNERS_ENABLED &&
            !isSold &&
            !isOwner &&
            product.store_name === "Ashburton Cycles" && <UberDeliveryInlineBadge />}
        </div>
        {(product as any).listing_source === 'online_catalog' && (
          <div className="mt-2">
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-[#ffde59] text-gray-900 text-xs font-medium rounded-md">
              <Globe className="h-3 w-3" />
              Online Only
            </span>
          </div>
        )}
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
      <div className="px-4 pb-3 space-y-2">
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
              productPrice={resolveLivePrice(product).price}
              sellerId={product.user_id}
              sellerName={product.store_name}
              productImage={product.all_images?.[0] || null}
              maxQuantity={product.listing_type === "private_listing" ? 1 : Math.max(1, product.qoh ?? 1)}
              shippingAvailable={(product as any).shipping_available || false}
              shippingCost={(product as any).shipping_cost || 0}
              pickupLocation={(product as any).pickup_location || null}
              pickupOnly={(product as any).pickup_only || false}
              variant="default"
              size="lg"
              fullWidth
              className="h-11"
              showStripeBranding={true}
            />
            <AddToCartButton
              productId={product.id}
              productName={(product as any).display_name || product.description}
              productPrice={resolveLivePrice(product).price}
              sellerId={product.user_id}
              sellerName={product.store_name}
              productImage={product.all_images?.[0] || product.primary_image_url || null}
              maxQuantity={product.listing_type === "private_listing" ? 1 : Math.max(1, product.qoh ?? 1)}
              variant="outline"
              size="lg"
              fullWidth
              className="h-11 bg-white"
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

      {/* Feature Badge - Buyer Protection */}
      <div className="px-4 pb-3 flex items-center gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Shield className="h-3 w-3 text-emerald-500" />
          Buyer Protection Included
        </span>
      </div>

      {/* Seller Row - Compact */}
      <div className="px-4 py-2.5 border-t border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="relative h-8 w-8 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
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
                <User className="h-4 w-4 text-gray-400" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{product.store_name}</p>
            <p className="text-xs text-gray-500">
              {product.store_account_type === 'bicycle_store' ? 'Bicycle Store' : 'Individual Seller'}
            </p>
          </div>
        </div>
        <Link 
          href={`/marketplace/store/${product.user_id}`}
          className="text-xs text-gray-500 hover:text-gray-700 flex items-center flex-shrink-0"
        >
          View Store
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Underline Tabs */}
      <div className="px-4 pt-2 border-b border-gray-200">
        <div className="flex">
          <button
            onClick={() => setActiveTab('overview')}
            className={cn(
              "flex-1 pb-2.5 text-sm font-medium border-b-2 transition-colors",
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
              "flex-1 pb-2.5 text-sm font-medium border-b-2 transition-colors",
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
                {(product as any).product_description ? (
                  <ProductDescription text={(product as any).product_description} />
                ) : (
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                    {product.description}
                  </p>
                )}
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

              {/* Research with AI */}
              <div className="pt-3">
                <button 
                  onClick={() => {
                    if (!user) {
                      openAuthModal();
                      return;
                    }
                    setIsLearnOpen(true);
                  }}
                  className="flex items-center gap-1.5 text-sm font-medium text-gray-900 hover:text-gray-600 transition-colors"
                >
                  <Sparkles className="h-4 w-4" />
                  Research with AI
                </button>
              </div>

              {/* Delivery Options */}
              {((product as any).shipping_available || (product as any).pickup_location) && (
                <div className="pt-3 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Delivery Options</h3>
                  <div className="space-y-2">
                    {/* Shipping Option */}
                    {(product as any).shipping_available && (
                      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-md">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white border border-gray-200">
                          <Truck className="h-4 w-4 text-gray-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">Shipping</p>
                          <p className="text-xs text-gray-500">
                            {(product as any).shipping_cost === 0 || !(product as any).shipping_cost
                              ? "Free shipping"
                              : `$${(product as any).shipping_cost.toLocaleString("en-AU")} shipping`}
                          </p>
                        </div>
                      </div>
                    )}
                    
                    {/* Pickup Option */}
                    {(product as any).pickup_location && (
                      <div className="bg-gray-50 rounded-md overflow-hidden">
                        <div className="flex items-center gap-3 p-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white border border-gray-200">
                            <MapPin className="h-4 w-4 text-gray-600" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">Pickup Available</p>
                            <p className="text-xs text-gray-500">{(product as any).pickup_location}</p>
                          </div>
                        </div>
                        {/* Map with privacy circle */}
                        <PickupLocationMap 
                          location={(product as any).pickup_location} 
                          className="h-36 mx-3 mb-3"
                        />
                      </div>
                    )}
                    
                    {/* Pickup Only Badge */}
                    {(product as any).pickup_only && !(product as any).shipping_available && (
                      <p className="text-xs text-gray-500 mt-1">This item is available for local pickup only</p>
                    )}
                  </div>
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
            >
              {/* Condition row — always shown at top when set */}
              {(product as any).condition_rating && (
                <SpecRow label="Condition" value={(product as any).condition_rating} />
              )}

              {(product as any).product_specs ? (
                /* AI-generated comprehensive spec sheet */
                <ProductDescription text={(product as any).product_specs} />
              ) : (
                /* Fallback: field-by-field display from database */
                <div className="divide-y divide-gray-100">
                  {(product as any).brand && <SpecRow label="Brand" value={(product as any).brand} />}
                  {(product as any).model && <SpecRow label="Model" value={(product as any).model} />}
                  {(product as any).model_year && <SpecRow label="Year" value={(product as any).model_year} />}
                  {(product as any).bike_type && <SpecRow label="Type" value={(product as any).bike_type} />}
                  {((product as any).frame_size || (product as any).size) && (
                    <SpecRow label="Size" value={(product as any).frame_size || (product as any).size} />
                  )}
                  {(product as any).frame_material && <SpecRow label="Frame Material" value={(product as any).frame_material} />}
                  {(product as any).groupset && <SpecRow label="Groupset" value={(product as any).groupset} />}
                  {(product as any).wheel_size && <SpecRow label="Wheel Size" value={(product as any).wheel_size} />}
                  {(product as any).suspension_type && <SpecRow label="Suspension" value={(product as any).suspension_type} />}
                  {(product as any).color_primary && <SpecRow label="Colour" value={(product as any).color_primary} />}
                  {(product as any).gender_fit && <SpecRow label="Gender Fit" value={(product as any).gender_fit} />}
                  {(product as any).apparel_material && <SpecRow label="Material" value={(product as any).apparel_material} />}
                  {(product as any).part_type_detail && <SpecRow label="Part Type" value={(product as any).part_type_detail} />}
                  {(product as any).compatibility_notes && <SpecRow label="Compatibility" value={(product as any).compatibility_notes} />}
                  {(product as any).material && <SpecRow label="Material" value={(product as any).material} />}
                  {(product as any).weight && <SpecRow label="Weight" value={(product as any).weight} />}
                  {!(product as any).brand &&
                   !(product as any).model &&
                   !(product as any).bike_type && (
                    <div className="py-4 text-center text-sm text-gray-400">
                      No specifications available
                    </div>
                  )}
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
