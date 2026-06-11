"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { MapPin, Pencil, Shield, Truck, Globe } from "lucide-react";
import { UberDeliveryInlineBadge } from "./uber-delivery-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductInquiryButton } from "./product-inquiry-button";
import { MakeOfferButton } from "./make-offer-button";
import { BuyNowButton } from "./buy-now-button";
import { AddToCartButton } from "./add-to-cart-button";
import { ProductAskGenieButton } from "./product-ask-genie-button";
import { ProductBrandLogoBadge } from "./product-detail/product-brand-logo-badge";
import { useAuth } from "@/components/providers/auth-provider";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { resolveLivePrice } from "@/lib/marketplace/pricing";
import { formatStockOnHandLabel } from "@/lib/marketplace/stock-display";
import { hasBikeSpecs, parseBikeSpecs } from "@/lib/types/bike-specs";
import { SpecSources } from "@/components/products/spec-sources";
import { cn } from "@/lib/utils";

const PickupLocationMap = dynamic(
  () => import("./product-detail/pickup-location-map").then((mod) => mod.PickupLocationMap),
  {
    ssr: false,
    loading: () => <div className="mx-4 mb-3 h-36 rounded-md bg-gray-100 sm:mx-5" />,
  },
);

const EditProductDrawer = dynamic(
  () => import("./edit-product-drawer").then((mod) => mod.EditProductDrawer),
  { ssr: false },
);

// Adaptive spec row: label ↔ value (ecommerce spec table)
function SpecRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 px-4 py-3 lg:px-0 sm:grid-cols-[minmax(0,38%)_1fr] sm:items-baseline sm:gap-4">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="text-sm font-medium text-gray-900">{String(value)}</dd>
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
  brandLogoUrl?: string | null;
  brandName?: string | null;
}

export function ProductDetailsPanelSimple({
  product: initialProduct,
  onProductUpdate,
  brandLogoUrl,
  brandName,
}: ProductDetailsPanelSimpleProps) {
  const { user } = useAuth();
  const [product, setProduct] = React.useState(initialProduct);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'overview' | 'specs'>('overview');

  // Check if current user owns this product
  const isOwner = user?.id === product.user_id;
  
  // Check if product is sold
  const isSold = !!(product as any).sold_at || (product as any).listing_status === 'sold';
  const isUberDeliveryEligible =
    product.uber_delivery_enabled === true &&
    product.store_account_type === "bicycle_store" &&
    product.store_bicycle_store === true;
  const stockLabel = formatStockOnHandLabel(
    product.qoh,
    (product as { listing_type?: string }).listing_type,
  );
  const showSpecsTab = !(
    product.is_bicycle && hasBikeSpecs(parseBikeSpecs(product.bike_specs))
  );

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
    <div className="bg-transparent pb-4">
      {/* Header: Title, Price, Meta */}
      <div
        className={cn(
          "px-4 pb-4 sm:px-5 lg:px-0",
          brandLogoUrl ? "pt-3 lg:pt-2" : "pt-4 lg:pt-3",
        )}
      >
        {brandLogoUrl ? (
          <div className="mb-2">
            <ProductBrandLogoBadge
              logoUrl={brandLogoUrl}
              brandName={brandName ?? product.brand}
            />
          </div>
        ) : null}
        <h1 className="text-[22px] font-semibold leading-snug tracking-tight text-gray-900">
          {(product as any).display_name || product.description}
        </h1>

        {(() => {
          const live = resolveLivePrice(product);
          const fmt = (v: number) =>
            `$${v.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          return (
            <div className="mt-3 flex items-baseline gap-2.5 flex-wrap">
              <p
                className={cn(
                  "text-[28px] font-semibold leading-none tracking-tight",
                  live.onSale ? "text-red-600" : "text-gray-900",
                )}
              >
                {fmt(live.price)}
              </p>
              {live.onSale && (
                <>
                  <p className="text-base font-medium text-gray-400 line-through">
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

        {/* Meta badges */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {(product as any).listing_source === "online_catalog" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-[#ffde59] px-2 py-1 text-xs font-medium text-gray-900">
              <Globe className="h-3 w-3" />
              Online Only
            </span>
          )}
          {stockLabel && (
            <span
              className={cn(
                "inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium",
                stockLabel === "Out of stock"
                  ? "border-gray-200 bg-gray-100 text-gray-500"
                  : "border-gray-200 bg-white text-gray-700",
              )}
            >
              {stockLabel}
            </span>
          )}
          {(product as any).condition_rating && (
            <span className="inline-flex items-center rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700">
              {(product as any).condition_rating}
            </span>
          )}
          {!isSold && !isOwner && isUberDeliveryEligible && <UberDeliveryInlineBadge />}
        </div>

        {(product as any).pickup_location && (
          <div className="mt-2.5 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span className="text-xs text-gray-500">{(product as any).pickup_location}</span>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="space-y-2 px-4 pb-4 sm:px-5 lg:px-0">
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
              uberDeliveryEligible={isUberDeliveryEligible}
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
              uberDeliveryEligible={isUberDeliveryEligible}
              productImage={product.all_images?.[0] || product.primary_image_url || null}
              maxQuantity={product.listing_type === "private_listing" ? 1 : Math.max(1, product.qoh ?? 1)}
              variant="outline"
              size="lg"
              fullWidth
              className="h-11 bg-white"
            />
            <div className="hidden sm:block">
              <ProductAskGenieButton product={product} />
            </div>
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

      {/* Buyer Protection — trust container */}
      {!isOwner && !isSold && (
        <div className="flex items-center gap-3 border-t border-gray-200/80 px-4 py-3.5 sm:px-5 lg:px-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100">
            <Shield className="h-4 w-4 text-gray-500" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-900">Buyer Protection included</p>
            <p className="text-[11px] leading-snug text-gray-500">
              Covered from secure payment through to delivery.
            </p>
          </div>
        </div>
      )}

      {/* Tabs — standard underline (ecommerce) */}
      {showSpecsTab && (
        <div
          className="border-b border-gray-200 px-4 sm:px-5 lg:px-0"
          role="tablist"
          aria-label="Product details"
        >
          <div className="flex gap-8">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "overview"}
              onClick={() => setActiveTab("overview")}
              className={cn(
                "-mb-px border-b-2 pb-3 pt-1 text-sm font-medium transition-colors",
                activeTab === "overview"
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700",
              )}
            >
              Overview
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "specs"}
              onClick={() => setActiveTab("specs")}
              className={cn(
                "-mb-px border-b-2 pb-3 pt-1 text-sm font-medium transition-colors",
                activeTab === "specs"
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700",
              )}
            >
              Specifications
            </button>
          </div>
        </div>
      )}

      {/* Tab Content */}
      <div
        className={cn(
          "px-4 py-5 sm:px-5 lg:px-0",
          !showSpecsTab && "border-t border-gray-100",
        )}
      >
        {(activeTab === "overview" || !showSpecsTab) && (
          <div className="space-y-4">
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
                          className="mx-4 mb-3 h-36 sm:mx-5"
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
          </div>
        )}

        {showSpecsTab && activeTab === "specs" && (
          <div>
            {(product as any).condition_rating || stockLabel || (product as any).product_specs ? (
              <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
                <dl className="divide-y divide-gray-100">
                  {(product as any).condition_rating && (
                    <SpecRow label="Condition" value={(product as any).condition_rating} />
                  )}
                  {stockLabel && (
                    <SpecRow label="Stock on hand" value={Math.floor(Number(product.qoh))} />
                  )}
                </dl>
              </div>
            ) : null}

            {(product as any).product_specs ? (
              <div className={cn((product as any).condition_rating || stockLabel ? "mt-5" : "")}>
                <ProductDescription text={(product as any).product_specs} />
              </div>
            ) : (
              <div
                className={cn(
                  "overflow-hidden rounded-md border border-gray-200 bg-white",
                  (product as any).condition_rating || stockLabel ? "mt-5" : "",
                )}
              >
                <dl className="divide-y divide-gray-100">
                  {(product as any).brand && <SpecRow label="Brand" value={(product as any).brand} />}
                  {(product as any).model && <SpecRow label="Model" value={(product as any).model} />}
                  {(product as any).model_year && <SpecRow label="Year" value={(product as any).model_year} />}
                  {(product as any).bike_type && <SpecRow label="Type" value={(product as any).bike_type} />}
                  {((product as any).frame_size || (product as any).size) && (
                    <SpecRow label="Size" value={(product as any).frame_size || (product as any).size} />
                  )}
                  {(product as any).frame_material && (
                    <SpecRow label="Frame Material" value={(product as any).frame_material} />
                  )}
                  {(product as any).groupset && <SpecRow label="Groupset" value={(product as any).groupset} />}
                  {(product as any).wheel_size && <SpecRow label="Wheel Size" value={(product as any).wheel_size} />}
                  {(product as any).suspension_type && (
                    <SpecRow label="Suspension" value={(product as any).suspension_type} />
                  )}
                  {(product as any).color_primary && <SpecRow label="Colour" value={(product as any).color_primary} />}
                  {(product as any).gender_fit && <SpecRow label="Gender Fit" value={(product as any).gender_fit} />}
                  {(product as any).apparel_material && (
                    <SpecRow label="Material" value={(product as any).apparel_material} />
                  )}
                  {(product as any).part_type_detail && (
                    <SpecRow label="Part Type" value={(product as any).part_type_detail} />
                  )}
                  {(product as any).compatibility_notes && (
                    <SpecRow label="Compatibility" value={(product as any).compatibility_notes} />
                  )}
                  {(product as any).material && <SpecRow label="Material" value={(product as any).material} />}
                  {(product as any).weight && <SpecRow label="Weight" value={(product as any).weight} />}
                </dl>
                {!(product as any).brand &&
                  !(product as any).model &&
                  !(product as any).bike_type &&
                  !(product as any).condition_rating &&
                  !stockLabel && (
                    <div className="py-8 text-center text-sm text-gray-400">
                      No specifications available
                    </div>
                  )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Official sources cited during AI copy generation */}
      {(product as any).product_spec_sources?.length ? (
        <div className="border-t border-gray-100 px-4 pb-5 pt-4 sm:px-5 lg:px-0">
          <SpecSources sources={(product as any).product_spec_sources} />
        </div>
      ) : null}

      {/* Edit Product Drawer - Only for owners */}
      {isOwner && isEditOpen && (
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
