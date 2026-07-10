"use client";

import * as React from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { MapPin, Pencil, Truck, Globe, ChevronRight, Eye, Minus, Plus, ShieldCheck, Lock, RotateCcw, Check } from '@/components/layout/app-sidebar/dashboard-icons';
import { BuyerProtectionSheet } from "./buyer-protection-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MakeOfferButton } from "./make-offer-button";
import { BuyNowButton } from "./buy-now-button";
import { AddToCartButton } from "./add-to-cart-button";
import { VariantSelector } from "./product-detail/variant-selector";
import { ProductAskGenieButton } from "./product-ask-genie-button";
import { ProductBrandLogoBadge } from "./product-detail/product-brand-logo-badge";
import {
  AboutThisSellerSection,
  type ProductSellerProfile,
} from "./product-detail/about-this-seller-section";
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
    loading: () => <div className="h-36 w-full bg-gray-100" />,
  },
);

const EditProductDrawer = dynamic(
  () => import("./edit-product-drawer").then((mod) => mod.EditProductDrawer),
  { ssr: false },
);

// Flat spec row — label / value, no card chrome
function SpecRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3.5 sm:grid sm:grid-cols-[minmax(0,34%)_1fr] sm:justify-start sm:gap-6 sm:py-3">
      <dt className="shrink-0 text-sm text-gray-500">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium leading-snug text-gray-900 sm:text-left">
        {String(value)}
      </dd>
    </div>
  );
}

type SpecEntry = { label: string; value: string | number };

function getHighlightSpecEntries(
  product: MarketplaceProduct,
  stockLabel: string | null,
): SpecEntry[] {
  const p = product as unknown as Record<string, unknown>;
  const rows: SpecEntry[] = [];

  if (p.condition_rating) {
    rows.push({ label: "Condition", value: p.condition_rating as string });
  }
  if (stockLabel) {
    rows.push({ label: "Stock on hand", value: Math.floor(Number(product.qoh)) });
  }

  return rows;
}

function getStructuredSpecEntries(product: MarketplaceProduct): SpecEntry[] {
  const p = product as unknown as Record<string, unknown>;
  const rows: SpecEntry[] = [];
  const add = (label: string, key: string) => {
    const value = p[key];
    if (value != null && value !== "") {
      rows.push({ label, value: value as string | number });
    }
  };

  add("Brand", "brand");
  add("Model", "model");
  add("Year", "model_year");
  add("Type", "bike_type");

  const size = (p.frame_size || p.size) as string | undefined;
  if (size) rows.push({ label: "Size", value: size });

  add("Frame material", "frame_material");
  add("Groupset", "groupset");
  add("Wheel size", "wheel_size");
  add("Suspension", "suspension_type");
  add("Colour", "color_primary");
  add("Gender fit", "gender_fit");
  add("Apparel material", "apparel_material");
  add("Part type", "part_type_detail");
  add("Compatibility", "compatibility_notes");
  add("Material", "material");
  add("Weight", "weight");

  return rows;
}

const formatProductPrice = (value: number) =>
  `$${value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function getFeatureBullets(product: MarketplaceProduct): string[] {
  const text = (product as { product_description?: string }).product_description?.trim();
  if (!text) return [];

  const bullets = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[•\-\*]\s/.test(line))
    .map((line) => line.replace(/^[•\-\*]\s/, "").replace(/\*\*(.+?)\*\*/g, "$1").trim())
    .filter(Boolean);

  return bullets.slice(0, 6);
}

export function getOverviewText(product: MarketplaceProduct): string {
  const text =
    (product as { product_description?: string }).product_description?.trim() ||
    product.description?.trim() ||
    "";

  if (!text) return "";

  const prose = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^[•\-\*]\s/.test(line))
    .join("\n\n")
    .trim();

  return prose || text;
}

export function shouldShowProductDetailTabs(product: MarketplaceProduct): boolean {
  return !(product.is_bicycle && hasBikeSpecs(parseBikeSpecs(product.bike_specs)));
}

function QuantitySelector({
  quantity,
  maxQuantity,
  onChange,
}: {
  quantity: number;
  maxQuantity: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="inline-flex items-center overflow-hidden rounded-md border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, quantity - 1))}
        disabled={quantity <= 1}
        className="flex h-10 w-10 items-center justify-center text-gray-500 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Decrease quantity"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="flex h-10 w-12 items-center justify-center border-x border-gray-200 text-sm font-semibold text-gray-900">
        {quantity}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(maxQuantity, quantity + 1))}
        disabled={quantity >= maxQuantity}
        className="flex h-10 w-10 items-center justify-center text-gray-500 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Increase quantity"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

const TRUST_ITEMS = [
  { icon: ShieldCheck, title: "Buyer Protection", subtitle: "Coverage included" },
  { icon: Lock, title: "Secure Checkout", subtitle: "Stripe payments" },
  { icon: Truck, title: "Fast Delivery", subtitle: "Tracked shipping" },
  { icon: RotateCcw, title: "Easy Returns", subtitle: "Simple resolution" },
] as const;

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
// Product Details Panel — reference storefront layout
// ============================================================

interface ProductPanelProps {
  product: MarketplaceProduct;
  onProductUpdate?: (updatedProduct: MarketplaceProduct) => void;
  brandLogoUrl?: string | null;
  brandName?: string | null;
  isStoreOwner?: boolean;
  viewAsCustomer?: boolean;
  onViewAsCustomerChange?: (value: boolean) => void;
  sellerProfile?: ProductSellerProfile | null;
  featureBullets?: string[];
}

type ProductDetailsPanelSimpleProps = ProductPanelProps & {
  includeTabs?: boolean;
};

export function ProductPurchasePanel({
  product: initialProduct,
  onProductUpdate,
  brandLogoUrl,
  brandName,
  isStoreOwner = false,
  viewAsCustomer = false,
  onViewAsCustomerChange,
  sellerProfile = null,
  featureBullets = [],
}: ProductPanelProps) {
  const { user } = useAuth();
  const [product, setProduct] = React.useState(initialProduct);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [quantity, setQuantity] = React.useState(1);

  const isOwner = user?.id === product.user_id;
  const showOwnerTools = isOwner && !viewAsCustomer;
  const isSold = !!(product as any).sold_at || (product as any).listing_status === "sold";
  const isUberDeliveryEligible =
    product.uber_delivery_enabled === true &&
    product.store_account_type === "bicycle_store" &&
    product.store_bicycle_store === true;
  const stockLabel = formatStockOnHandLabel(
    product.qoh,
    (product as { listing_type?: string }).listing_type,
  );
  const maxQuantity =
    product.listing_type === "private_listing" ? 1 : Math.max(1, product.qoh ?? 1);
  const live = resolveLivePrice(product);
  const displayBrand = (brandName ?? product.brand)?.trim() || null;
  const productTitle = (product as any).display_name || product.description;
  const overviewText = getOverviewText(product);

  React.useEffect(() => {
    setProduct(initialProduct);
  }, [initialProduct]);

  React.useEffect(() => {
    setQuantity((current) => Math.min(Math.max(current, 1), maxQuantity));
  }, [maxQuantity]);

  const handleProductUpdate = (updatedProduct: MarketplaceProduct) => {
    setProduct(updatedProduct);
    onProductUpdate?.(updatedProduct);
  };

  return (
    <div className="flex h-full flex-col bg-transparent pb-2 lg:pb-0">
      <div
        className={cn(
          "px-4 pb-4 sm:px-5 lg:px-0 lg:pb-0",
          brandLogoUrl ? "pt-3 lg:pt-0" : "pt-2 sm:pt-4 lg:pt-0",
        )}
      >
        {brandLogoUrl ? (
          <div className="mb-3">
            <ProductBrandLogoBadge logoUrl={brandLogoUrl} brandName={displayBrand} />
          </div>
        ) : displayBrand ? (
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
            {displayBrand}
          </p>
        ) : null}

        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-gray-900 lg:text-[28px]">
          {productTitle}
        </h1>

        {live.onSale ? (
          <div className="mt-3 lg:mt-2.5">
            <p className="text-[32px] font-bold leading-none tracking-tight text-gray-900 lg:text-[30px]">
              {formatProductPrice(live.price)}
            </p>
            <p className="mt-1.5 text-sm text-gray-500">
              Was{" "}
              <span className="text-gray-400 line-through">
                {formatProductPrice(live.originalPrice as number)}
              </span>
              <span className="mx-1.5 text-gray-300">·</span>
              <span className="font-medium text-gray-700">Save {live.percentOff}%</span>
            </p>
          </div>
        ) : (
          <p className="mt-3 text-[32px] font-bold leading-none tracking-tight text-gray-900 lg:mt-2.5 lg:text-[30px]">
            {formatProductPrice(live.price)}
          </p>
        )}

        {!isSold && stockLabel && (
          <p className="mt-2.5 text-sm text-gray-500">{stockLabel}</p>
        )}

        {product.variants && product.variants.items.length > 1 && (
          <div className="mt-4">
            <VariantSelector variants={product.variants} />
          </div>
        )}

        {!isSold && !showOwnerTools && maxQuantity > 1 && (
          <div className="mt-4 lg:mt-3">
            <QuantitySelector
              quantity={quantity}
              maxQuantity={maxQuantity}
              onChange={setQuantity}
            />
          </div>
        )}
      </div>

      <div className="space-y-2.5 px-4 pb-4 sm:px-5 lg:shrink-0 lg:px-0 lg:pb-0">
        {isSold ? (
          <div className="rounded-md bg-gray-100 p-4 text-center">
            <Badge className="mb-2 rounded-md border-0 bg-gray-200 px-4 py-1.5 text-sm font-medium text-gray-600">
              Sold
            </Badge>
            <p className="text-sm text-gray-500">This item has been sold</p>
          </div>
        ) : showOwnerTools ? (
          <div className="space-y-2">
            <Button
              onClick={() => setIsEditOpen(true)}
              size="lg"
              className="h-12 w-full rounded-md bg-[#1e2a3a] text-sm font-semibold text-white hover:bg-[#152232]"
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit Listing
            </Button>
            {isStoreOwner && onViewAsCustomerChange && (
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => onViewAsCustomerChange(true)}
                className="h-11 w-full rounded-md bg-white text-sm font-medium"
              >
                <Eye className="mr-2 h-4 w-4" />
                View as customer
              </Button>
            )}
            <div className="hidden sm:block">
              <ProductAskGenieButton product={product} />
            </div>
          </div>
        ) : (
          <>
            <AddToCartButton
              productId={product.id}
              productName={productTitle}
              productPrice={live.price}
              sellerId={product.user_id}
              sellerName={product.store_name}
              uberDeliveryEligible={isUberDeliveryEligible}
              productImage={product.all_images?.[0] || product.primary_image_url || null}
              maxQuantity={maxQuantity}
              quantity={quantity}
              label={`Add to Cart — ${formatProductPrice(live.price * quantity)}`}
              variant="default"
              size="lg"
              fullWidth
              className="h-12 rounded-md bg-[#1e2a3a] text-sm font-semibold text-white hover:bg-[#152232]"
            />

            <div className="grid grid-cols-2 gap-3">
              <BuyNowButton
                productId={product.id}
                productName={productTitle}
                productPrice={live.price}
                sellerId={product.user_id}
                sellerName={product.store_name}
                uberDeliveryEligible={isUberDeliveryEligible}
                productImage={product.all_images?.[0] || null}
                maxQuantity={maxQuantity}
                quantity={quantity}
                buttonLabel="Buy Now"
                shippingAvailable={(product as any).shipping_available || false}
                shippingCost={(product as any).shipping_cost || 0}
                pickupLocation={(product as any).pickup_location || null}
                pickupOnly={(product as any).pickup_only || false}
                variant="outline"
                size="lg"
                fullWidth
                className="h-11 rounded-md border-gray-200 bg-white text-sm font-medium text-gray-900 hover:bg-gray-50"
                showStripeBranding={false}
              />
              <MakeOfferButton
                productId={product.id}
                productName={productTitle}
                productPrice={product.price}
                sellerId={product.user_id}
                productImage={product.all_images?.[0] || null}
                variant="outline"
                size="lg"
                fullWidth
                className="h-11 rounded-md border-gray-200 bg-white text-sm font-medium text-gray-900 hover:bg-gray-50"
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-200" />
              <p className="flex shrink-0 items-center gap-1.5 text-xs text-gray-400">
                Secure checkout powered by
                <Image src="/stripe.svg" alt="Stripe" width={42} height={17} className="opacity-70" />
              </p>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <ProductPurchaseExtras
              embedded
              product={product}
              viewAsCustomer={viewAsCustomer}
            />

            {(overviewText || featureBullets.length > 0 || sellerProfile) && (
              <AboutThisSellerSection
                seller={sellerProfile}
                inPanel
                featureBullets={featureBullets}
                overviewContent={
                  overviewText ? <ProductDescription text={overviewText} /> : null
                }
              />
            )}
          </>
        )}
      </div>

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

export function ProductPurchaseExtras({
  product,
  viewAsCustomer = false,
  embedded = false,
}: {
  product: MarketplaceProduct;
  viewAsCustomer?: boolean;
  embedded?: boolean;
}) {
  const { user } = useAuth();
  const [buyerProtectionOpen, setBuyerProtectionOpen] = React.useState(false);
  const isOwner = user?.id === product.user_id;
  const showOwnerTools = isOwner && !viewAsCustomer;
  const isSold = !!(product as any).sold_at || (product as any).listing_status === "sold";

  if (showOwnerTools || isSold) return null;

  return (
    <div
      className={cn(
        embedded
          ? "space-y-3"
          : "border-t border-gray-200 bg-white px-4 py-5 sm:px-5 lg:px-4 lg:py-6 xl:px-5",
      )}
    >
      <div className={cn(embedded ? "space-y-3" : "mx-auto max-w-[1536px] space-y-5")}>
        <div
          className={cn(
            "grid grid-cols-4 gap-x-2 gap-y-0",
            !embedded && "sm:gap-x-4",
          )}
        >
          {TRUST_ITEMS.map(({ icon: Icon, title, subtitle }) => (
            <div key={title} className="flex items-start gap-2">
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-600" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold leading-tight text-gray-900">{title}</p>
                <p className="text-[10px] leading-snug text-gray-500">{subtitle}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setBuyerProtectionOpen(true)}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-xl border border-[#f2e7a8] bg-[#fff8d6] text-left transition-colors hover:bg-[#fff3bf]",
            embedded ? "px-3 py-2.5" : "gap-3 px-4 py-3 sm:max-w-md",
          )}
        >
          <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-md">
            <Image
              src="/yjsmall.png"
              alt="Yellow Jersey"
              width={28}
              height={28}
              className="h-full w-full object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-gray-900">Buyer Protection included</p>
            <p className="text-[10px] leading-snug text-gray-600">
              Covered from payment through to delivery.
            </p>
          </div>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-500" />
        </button>
        <BuyerProtectionSheet open={buyerProtectionOpen} onOpenChange={setBuyerProtectionOpen} />

        {!embedded && <ProductAskGenieButton product={product} />}
      </div>
    </div>
  );
}

export function ProductDetailTabs({
  product,
  overviewOnly = false,
  hideOverviewDescription = false,
  featureBullets = [],
}: {
  product: MarketplaceProduct;
  overviewOnly?: boolean;
  hideOverviewDescription?: boolean;
  featureBullets?: string[];
}) {
  const [activeTab, setActiveTab] = React.useState<"overview" | "specs">("overview");
  const stockLabel = formatStockOnHandLabel(
    product.qoh,
    (product as { listing_type?: string }).listing_type,
  );
  const highlightSpecs = getHighlightSpecEntries(product, stockLabel);
  const structuredSpecs = getStructuredSpecEntries(product);
  const proseSpecs = (product as { product_specs?: string }).product_specs;
  const listSpecs = proseSpecs ? highlightSpecs : [...highlightSpecs, ...structuredSpecs];
  const hasSpecContent = listSpecs.length > 0 || Boolean(proseSpecs);

  return (
    <div className="border-t border-gray-200 bg-white">
      {!overviewOnly && (
        <div
          className="border-b border-gray-200 px-4 sm:px-5 lg:px-4 xl:px-5"
          role="tablist"
          aria-label="Product details"
        >
          <div className="mx-auto flex max-w-[1536px] gap-8">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "overview"}
              onClick={() => setActiveTab("overview")}
              className={cn(
                "-mb-px border-b-2 pb-4 pt-5 text-sm font-medium transition-colors",
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
                "-mb-px border-b-2 pb-4 pt-5 text-sm font-medium transition-colors",
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

      <div className="px-4 py-8 sm:px-5 lg:px-4 xl:px-5">
        <div className="mx-auto max-w-[1536px]">
          {(overviewOnly || activeTab === "overview") ? (
            <div className="space-y-6">
              {!hideOverviewDescription && (
                <div
                  className={cn(
                    getOverviewText(product) && featureBullets.length > 0
                      ? "grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-x-10"
                      : "space-y-6",
                  )}
                >
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Overview</h2>
                    <div className="mt-3 space-y-4">
                      {(product as any).product_description ? (
                        <ProductDescription text={getOverviewText(product) || (product as any).product_description} />
                      ) : (
                        <p className="text-sm leading-relaxed text-gray-600 whitespace-pre-wrap">
                          {product.description}
                        </p>
                      )}
                      {(product as any).seller_notes && (
                        <div className="border-t border-gray-100 pt-4">
                          <h3 className="mb-2 text-sm font-semibold text-gray-900">Seller Notes</h3>
                          <p className="text-sm leading-relaxed text-gray-600 whitespace-pre-wrap">
                            {(product as any).seller_notes}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {featureBullets.length > 0 && (
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">Key Features</h2>
                      <ul className="mt-3 space-y-2.5">
                        {featureBullets.map((feature) => (
                          <li key={feature} className="flex items-start gap-2.5 text-sm text-gray-600">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-gray-900" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {hideOverviewDescription && (product as any).seller_notes && (
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Seller Notes</h2>
                  <p className="mt-3 text-sm leading-relaxed text-gray-600 whitespace-pre-wrap">
                    {(product as any).seller_notes}
                  </p>
                </div>
              )}

              {((product as any).shipping_available || (product as any).pickup_location) && (
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Delivery Options</h2>
                  <div className="mt-3 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                    {(product as any).shipping_available && (
                      <div
                        className={cn(
                          "flex items-center gap-3 px-4 py-3",
                          (product as any).pickup_location && "border-b border-gray-200",
                        )}
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white">
                          <Truck className="h-4 w-4 text-gray-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">Shipping</p>
                          <p className="text-xs text-gray-500">
                            {(product as any).shipping_cost === 0 || !(product as any).shipping_cost
                              ? "Free shipping"
                              : `$${(product as any).shipping_cost.toLocaleString("en-AU")} shipping`}
                          </p>
                        </div>
                      </div>
                    )}
                    {(product as any).pickup_location && (
                      <>
                        <div className="flex items-center gap-3 px-4 py-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white">
                            <MapPin className="h-4 w-4 text-gray-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">Pickup Available</p>
                            <p className="text-xs text-gray-500">{(product as any).pickup_location}</p>
                          </div>
                        </div>
                        <PickupLocationMap
                          location={(product as any).pickup_location}
                          className="h-36 w-full"
                        />
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : hasSpecContent ? (
            <div className="space-y-6">
              {listSpecs.length > 0 && (
                <dl className="divide-y divide-gray-100 border-t border-gray-100">
                  {listSpecs.map((entry, index) => (
                    <SpecRow
                      key={`${entry.label}-${index}`}
                      label={entry.label}
                      value={entry.value}
                    />
                  ))}
                </dl>
              )}
              {proseSpecs ? (
                <section className={cn(listSpecs.length > 0 && "border-t border-gray-100 pt-6")}>
                  {listSpecs.length > 0 && (
                    <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">
                      Details
                    </h3>
                  )}
                  <ProductDescription text={proseSpecs} />
                </section>
              ) : null}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-gray-400">No specifications available</p>
          )}

          {(product as any).product_spec_sources?.length ? (
            <div className="mt-8 border-t border-gray-100 pt-6">
              <SpecSources sources={(product as any).product_spec_sources} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ProductDetailsPanelSimple({
  includeTabs = true,
  product,
  ...props
}: ProductDetailsPanelSimpleProps) {
  const showTabs = includeTabs && shouldShowProductDetailTabs(product);

  return (
    <>
      <ProductPurchasePanel product={product} {...props} />
      {showTabs && <ProductDetailTabs product={product} />}
    </>
  );
}
