"use client";

import * as React from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { MapPin, Pencil, Truck, Globe, ChevronRight } from '@/components/layout/app-sidebar/dashboard-icons';
import { BuyerProtectionSheet } from "./buyer-protection-sheet";
import { UberDeliveryInlineBadge } from "./uber-delivery-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductInquiryButton } from "./product-inquiry-button";
import { MakeOfferButton } from "./make-offer-button";
import { BuyNowButton } from "./buy-now-button";
import { AddToCartButton } from "./add-to-cart-button";
import { VariantSelector } from "./product-detail/variant-selector";
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
                      <span
                        className="text-gray-400 mt-[3px] flex-shrink-0 select-none"
                        aria-hidden="true"
                      >
                        •
                      </span>
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
// Product Details Panel
// ============================================================

interface ProductDetailsPanelSimpleProps {
  product: MarketplaceProduct;
  onProductUpdate?: (updatedProduct: MarketplaceProduct) => void;
  brandLogoUrl?: string | null;
  brandName?: string | null;
}

type ProductDetailsTab = "overview" | "condition" | "specs";

function formatCurrency(value: number) {
  return `$${value.toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatAustralianDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function DetailBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-gray-200 bg-white p-3.5">
      <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </h3>
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
        {children}
      </div>
    </section>
  );
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
  const [buyerProtectionOpen, setBuyerProtectionOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<ProductDetailsTab>("overview");
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const tabIdPrefix = React.useId();

  const isOwner = user?.id === product.user_id;
  const isSold =
    !!(product as MarketplaceProduct & { sold_at?: string | null }).sold_at ||
    product.listing_status === "sold";
  const quantityOnHand = Number(product.qoh);
  const hasFiniteQuantity =
    product.qoh != null && Number.isFinite(quantityOnHand);
  const isOutOfStock =
    product.listing_type !== "private_listing" &&
    hasFiniteQuantity &&
    quantityOnHand <= 0;
  const maxQuantity =
    product.listing_type === "private_listing"
      ? 1
      : Math.max(1, hasFiniteQuantity ? quantityOnHand : 1);
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
  const hasConditionHistory = Boolean(
    product.condition_details ||
      product.seller_notes ||
      product.wear_notes ||
      product.usage_estimate ||
      product.purchase_date ||
      product.purchase_location ||
      product.service_history?.length ||
      product.upgrades_modifications ||
      product.included_accessories ||
      product.reason_for_selling,
  );
  const tabs = React.useMemo<Array<{ id: ProductDetailsTab; label: string }>>(
    () => [
      { id: "overview", label: "Overview" },
      ...(hasConditionHistory
        ? [{ id: "condition" as const, label: "Condition & history" }]
        : []),
      ...(showSpecsTab
        ? [{ id: "specs" as const, label: "Specifications" }]
        : []),
    ],
    [hasConditionHistory, showSpecsTab],
  );
  const livePrice = resolveLivePrice(product);
  const productName = product.display_name || product.description;
  const displayBrand = (brandName ?? product.brand)?.trim() || null;

  React.useEffect(() => {
    setProduct(initialProduct);
  }, [initialProduct]);

  React.useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab("overview");
    }
  }, [activeTab, tabs]);

  const handleProductUpdate = (updatedProduct: MarketplaceProduct) => {
    setProduct(updatedProduct);
    onProductUpdate?.(updatedProduct);
  };

  const handleTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    }
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;

    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    setActiveTab(nextTab.id);
    tabRefs.current[nextIndex]?.focus();
  };

  const fulfilmentOptions = [
    product.shipping_available
      ? product.shipping_cost
        ? `${formatCurrency(product.shipping_cost)} shipping`
        : "Free shipping"
      : null,
    product.pickup_location ? `Pickup from ${product.pickup_location}` : null,
  ].filter((option): option is string => Boolean(option));
  const shippingSummary =
    fulfilmentOptions.join(" · ") || "Fulfilment not specified — contact the seller";

  return (
    <div className="space-y-4 bg-white px-4 pb-5 pt-3 sm:px-5 sm:pt-4 lg:px-0 lg:pb-6 lg:pt-0">
      <section className="rounded-md border border-gray-200 bg-white p-4">
        {brandLogoUrl ? (
          <div className="mb-2">
            <ProductBrandLogoBadge
              logoUrl={brandLogoUrl}
              brandName={displayBrand}
            />
          </div>
        ) : null}
        {displayBrand && !brandLogoUrl ? (
          <p className="mb-1.5 text-xs font-medium text-gray-500">
            {displayBrand}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold leading-snug tracking-tight text-gray-900">
          {productName}
        </h1>

        <div className="mt-3 flex flex-wrap items-baseline gap-2.5">
          <p
            className={cn(
              "text-3xl font-semibold leading-none tracking-tight",
              livePrice.onSale ? "text-red-600" : "text-gray-900",
            )}
          >
            {formatCurrency(livePrice.price)}
          </p>
          {livePrice.onSale && livePrice.originalPrice != null ? (
            <>
              <p className="text-base font-medium text-gray-400 line-through">
                {formatCurrency(livePrice.originalPrice)}
              </p>
              <span className="rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                Save {formatCurrency(livePrice.originalPrice - livePrice.price)}
                {livePrice.percentOff ? ` (${livePrice.percentOff}%)` : ""}
              </span>
            </>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {product.listing_source === "online_catalog" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-[#ffde59] px-2 py-1 text-xs font-medium text-gray-900">
              <Globe className="h-3 w-3" />
              Online only
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
          {product.condition_rating && (
            <span className="inline-flex items-center rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700">
              {product.condition_rating}
            </span>
          )}
          {product.pickup_location && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              {product.pickup_location}
            </span>
          )}
          {!isSold && !isOwner && isUberDeliveryEligible && <UberDeliveryInlineBadge />}
        </div>

        {product.variants && product.variants.items.length > 1 && (
          <VariantSelector variants={product.variants} />
        )}
      </section>

      <section className="space-y-2 rounded-md border border-gray-200 bg-white p-3">
        {isSold ? (
          <div className="rounded-md border border-gray-200 bg-white p-4 text-center">
            <Badge className="mb-2 rounded-md border-0 bg-gray-100 px-4 py-1.5 text-sm font-medium text-gray-600">
              Sold
            </Badge>
            <p className="text-sm text-gray-500">This item has been sold</p>
          </div>
        ) : isOwner ? (
          <div className="space-y-2">
            <Button
              onClick={() => setIsEditOpen(true)}
              size="lg"
              className="h-11 w-full rounded-md bg-gray-900 text-sm font-medium text-white hover:bg-gray-800"
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit listing
            </Button>
            <div className="hidden sm:block">
              <ProductAskGenieButton product={product} />
            </div>
          </div>
        ) : isOutOfStock ? (
          <div className="space-y-3 rounded-md border border-gray-200 bg-white p-4 text-center">
            <div>
              <p className="text-sm font-semibold text-gray-900">Out of stock</p>
              <p className="mt-1 text-xs text-gray-500">
                Ask the seller about availability or similar products.
              </p>
            </div>
            <ProductInquiryButton
              productId={product.id}
              productName={productName}
              sellerId={product.user_id}
              sellerName={product.store_name}
              productImage={product.all_images?.[0] || product.primary_image_url || null}
              productPrice={livePrice.price}
              variant="outline"
              size="lg"
              fullWidth
              className="h-10 rounded-md bg-white text-sm font-medium"
              buttonLabel="Message seller"
            />
          </div>
        ) : (
          <>
            <BuyNowButton
              productId={product.id}
              productName={productName}
              productPrice={livePrice.price}
              sellerId={product.user_id}
              sellerName={product.store_name}
              uberDeliveryEligible={isUberDeliveryEligible}
              productImage={product.all_images?.[0] || null}
              maxQuantity={maxQuantity}
              shippingAvailable={product.shipping_available || false}
              shippingCost={product.shipping_cost || 0}
              pickupLocation={product.pickup_location || null}
              pickupOnly={product.pickup_only || false}
              variant="default"
              size="lg"
              fullWidth
              className="h-11"
              showStripeBranding={true}
            />
            <div
              className={cn(
                "grid gap-2",
                product.is_negotiable === false ? "grid-cols-2" : "grid-cols-3",
              )}
            >
              <div className="min-w-0 flex-1">
                <AddToCartButton
                  productId={product.id}
                  productName={productName}
                  productPrice={livePrice.price}
                  sellerId={product.user_id}
                  sellerName={product.store_name}
                  uberDeliveryEligible={isUberDeliveryEligible}
                  productImage={product.all_images?.[0] || product.primary_image_url || null}
                  maxQuantity={maxQuantity}
                  shippingAvailable={product.shipping_available || false}
                  shippingCost={product.shipping_cost || 0}
                  pickupLocation={product.pickup_location || null}
                  pickupOnly={product.pickup_only || false}
                  variant="outline"
                  size="lg"
                  fullWidth
                  className="h-10 gap-1 px-2 text-xs font-medium rounded-md bg-white"
                />
              </div>
              {product.is_negotiable !== false ? (
                <div className="min-w-0 flex-1">
                  <MakeOfferButton
                    productId={product.id}
                    productName={productName}
                    productPrice={livePrice.price}
                    sellerId={product.user_id}
                    productImage={product.all_images?.[0] || null}
                    variant="outline"
                    size="lg"
                    fullWidth
                    className="h-10 gap-1 rounded-md px-2 text-xs font-medium"
                  />
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                <ProductInquiryButton
                  productId={product.id}
                  productName={productName}
                  sellerId={product.user_id}
                  sellerName={product.store_name}
                  productImage={product.all_images?.[0] || product.primary_image_url || null}
                  productPrice={livePrice.price}
                  variant="outline"
                  size="lg"
                  fullWidth
                  className="h-10 gap-1 px-2 text-xs font-medium rounded-md bg-white"
                  buttonLabel="Message"
                />
              </div>
            </div>
            <div className="hidden sm:block">
              <ProductAskGenieButton product={product} />
            </div>
          </>
        )}
      </section>

      {!isOwner && !isSold && !isOutOfStock && (
        <section className="rounded-md border border-gray-200 bg-white p-3">
          <button
            type="button"
            onClick={() => setBuyerProtectionOpen(true)}
            className="flex w-full items-center gap-3 rounded-md text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
          >
            <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md">
              <Image
                src="/yjsmall.png"
                alt="Yellow Jersey"
                width={32}
                height={32}
                className="h-full w-full object-contain"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-gray-900">Buyer Protection</p>
              <p className="text-[11px] leading-snug text-gray-500">
                Coverage from payment through to delivery.
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
          </button>
          <div className="mt-3 space-y-2 border-t border-gray-100 pt-3 text-xs text-gray-600">
            <div className="flex items-center justify-between gap-4">
              <span>Checkout</span>
              <span className="font-medium text-gray-900">Secure Stripe payment</span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <span>Delivery</span>
              <span className="text-right font-medium text-gray-900">{shippingSummary}</span>
            </div>
          </div>
          <BuyerProtectionSheet
            open={buyerProtectionOpen}
            onOpenChange={setBuyerProtectionOpen}
          />
        </section>
      )}

      <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div
          className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit"
          role="tablist"
          aria-label="Product details"
        >
          {tabs.map((tab, index) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                id={`${tabIdPrefix}-${tab.id}-tab`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`${tabIdPrefix}-${tab.id}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
                  selected
                    ? "text-gray-800 bg-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-200/70",
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        id={`${tabIdPrefix}-overview-panel`}
        role="tabpanel"
        aria-labelledby={`${tabIdPrefix}-overview-tab`}
        tabIndex={0}
        hidden={activeTab !== "overview"}
        className="space-y-3 rounded-md border border-gray-200 bg-white p-4"
      >
          <section>
            <h2 className="mb-2 text-sm font-semibold text-gray-900">Description</h2>
            {product.product_description ? (
              <ProductDescription text={product.product_description} />
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-600">
                {product.description}
              </p>
            )}
          </section>

          {(product.shipping_available || product.pickup_location) && (
            <section className="border-t border-gray-100 pt-4">
              <h2 className="mb-3 text-sm font-semibold text-gray-900">
                Delivery and pickup
              </h2>
              <div className="space-y-2">
                {product.shipping_available && (
                  <div className="flex items-center gap-3 rounded-md border border-gray-200 bg-white p-3">
                    <Truck className="h-4 w-4 shrink-0 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Shipping available</p>
                      <p className="text-xs text-gray-500">
                        {product.shipping_cost
                          ? `${formatCurrency(product.shipping_cost)} shipping`
                          : "Free shipping"}
                      </p>
                    </div>
                  </div>
                )}
                {product.pickup_location && (
                  <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
                    <div className="flex items-center gap-3 p-3">
                      <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {product.pickup_only ? "Pickup only" : "Pickup available"}
                        </p>
                        <p className="text-xs text-gray-500">{product.pickup_location}</p>
                      </div>
                    </div>
                    <PickupLocationMap
                      location={product.pickup_location}
                      className="h-36 w-full"
                    />
                  </div>
                )}
              </div>
            </section>
          )}
      </div>

      {hasConditionHistory && (
        <div
          id={`${tabIdPrefix}-condition-panel`}
          role="tabpanel"
          aria-labelledby={`${tabIdPrefix}-condition-tab`}
          tabIndex={0}
          hidden={activeTab !== "condition"}
          className="space-y-3 rounded-md border border-gray-200 bg-white p-3"
        >
          {product.condition_details && (
            <DetailBlock label="Condition details">{product.condition_details}</DetailBlock>
          )}
          {product.seller_notes && (
            <DetailBlock label="Seller notes">{product.seller_notes}</DetailBlock>
          )}
          {product.wear_notes && (
            <DetailBlock label="Wear and marks">{product.wear_notes}</DetailBlock>
          )}
          {product.usage_estimate && (
            <DetailBlock label="Estimated usage">{product.usage_estimate}</DetailBlock>
          )}
          {(product.purchase_date || product.purchase_location) && (
            <DetailBlock label="Purchase history">
              <dl className="space-y-2">
                {product.purchase_date && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Purchased</dt>
                    <dd className="text-right font-medium text-gray-900">
                      {formatAustralianDate(product.purchase_date)}
                    </dd>
                  </div>
                )}
                {product.purchase_location && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Purchase location</dt>
                    <dd className="text-right font-medium text-gray-900">
                      {product.purchase_location}
                    </dd>
                  </div>
                )}
              </dl>
            </DetailBlock>
          )}
          {product.service_history?.length ? (
            <DetailBlock label="Service history">
              <ol className="divide-y divide-gray-100">
                {product.service_history.map((service, index) => (
                  <li key={`${service.date}-${service.shop}-${index}`} className="py-2 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-medium text-gray-900">
                        {service.work_done}
                      </span>
                      {service.date && (
                        <span className="text-xs text-gray-500">
                          {formatAustralianDate(service.date)}
                        </span>
                      )}
                    </div>
                    {service.shop && (
                      <p className="mt-0.5 text-xs text-gray-500">{service.shop}</p>
                    )}
                  </li>
                ))}
              </ol>
            </DetailBlock>
          ) : null}
          {product.upgrades_modifications && (
            <DetailBlock label="Upgrades and modifications">
              {product.upgrades_modifications}
            </DetailBlock>
          )}
          {product.included_accessories && (
            <DetailBlock label="Included accessories">
              {product.included_accessories}
            </DetailBlock>
          )}
          {product.reason_for_selling && (
            <DetailBlock label="Reason for selling">
              {product.reason_for_selling}
            </DetailBlock>
          )}
        </div>
      )}

      {showSpecsTab && (() => {
          const highlightSpecs = getHighlightSpecEntries(product, stockLabel);
          const structuredSpecs = getStructuredSpecEntries(product);
          const proseSpecs = product.product_specs;
          const listSpecs = proseSpecs
            ? highlightSpecs
            : [...highlightSpecs, ...structuredSpecs];
          const hasContent = listSpecs.length > 0 || Boolean(proseSpecs);

          if (!hasContent) {
            return (
              <div
                id={`${tabIdPrefix}-specs-panel`}
                role="tabpanel"
                aria-labelledby={`${tabIdPrefix}-specs-tab`}
                tabIndex={0}
                hidden={activeTab !== "specs"}
                className="rounded-md border border-gray-200 bg-white py-8 text-center text-sm text-gray-400"
              >
                No specifications available
              </div>
            );
          }

          return (
            <div
              id={`${tabIdPrefix}-specs-panel`}
              role="tabpanel"
              aria-labelledby={`${tabIdPrefix}-specs-tab`}
              tabIndex={0}
              hidden={activeTab !== "specs"}
              className="space-y-6 rounded-md border border-gray-200 bg-white p-4"
            >
              {listSpecs.length > 0 && (
                <dl className="divide-y divide-gray-100">
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
                <section
                  className={cn(
                    listSpecs.length > 0 && "border-t border-gray-100 pt-6",
                  )}
                >
                  {listSpecs.length > 0 && (
                    <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">
                      Details
                    </h3>
                  )}
                  <ProductDescription text={proseSpecs} />
                </section>
              ) : null}
            </div>
          );
        })()}

      {product.product_spec_sources?.length ? (
        <div className="rounded-md border border-gray-200 bg-white p-4">
          <SpecSources sources={product.product_spec_sources} />
        </div>
      ) : null}

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
