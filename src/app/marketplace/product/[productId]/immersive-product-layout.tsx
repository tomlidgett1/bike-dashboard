"use client";

/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as React from "react";
import Link from "next/link";
import { Heart, Share2, ChevronLeft, ShieldCheck, BadgeCheck, Lock, Store, MapPin, Truck, ArrowRight } from "lucide-react";
import { BuyNowButton } from "@/components/marketplace/buy-now-button";
import { AddToCartButton } from "@/components/marketplace/add-to-cart-button";
import { MakeOfferButton } from "@/components/marketplace/make-offer-button";
import { ProductInquiryButton } from "@/components/marketplace/product-inquiry-button";
import { ProductDescription } from "@/components/marketplace/product-details-panel-simple";
import { RecommendationCarousel } from "@/components/marketplace/product-detail/recommendation-carousel";
import { resolveLivePrice } from "@/lib/marketplace/pricing";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { cn } from "@/lib/utils";

interface SellerInfo {
  id: string;
  name: string;
  logo_url: string | null;
  account_type: string | null;
}

interface ImmersiveProductLayoutProps {
  product: MarketplaceProduct;
  images: string[];
  sellerInfo: SellerInfo | null;
  similarProducts: MarketplaceProduct[];
  sellerProducts: MarketplaceProduct[];
  brandProducts: MarketplaceProduct[];
  brandName: string | null;
  isOwner: boolean;
}

const fmtPrice = (v: number) =>
  `$${v.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Trust signals shown in the immersive buy card — Yellow Jersey's escrow promise.
const TRUST = [
  { icon: Lock, label: "Escrow protected" },
  { icon: ShieldCheck, label: "Buyer Protection" },
  { icon: BadgeCheck, label: "Verified seller" },
];

export function ImmersiveProductLayout({
  product,
  images,
  sellerInfo,
  similarProducts,
  sellerProducts,
  brandProducts,
  brandName,
  isOwner,
}: ImmersiveProductLayoutProps) {
  const [activeIdx, setActiveIdx] = React.useState(0);
  const [liked, setLiked] = React.useState(false);

  const title = (product as any).display_name || product.description;
  const live = resolveLivePrice(product);
  const isSold = !!(product as any).sold_at || (product as any).listing_status === "sold";

  const heroImage = images[activeIdx] || images[0] || "/placeholder-product.svg";
  const brand = (product as any).brand as string | null | undefined;
  const eyebrow = [brand, product.marketplace_category].filter(Boolean).join(" · ");

  const storeHref = sellerInfo
    ? `/marketplace/${sellerInfo.account_type === "bicycle_store" ? "store" : "seller"}/${sellerInfo.id}`
    : `/marketplace/store/${product.user_id}`;

  const handleShare = async () => {
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ title, url: window.location.href });
      } catch {
        /* cancelled */
      }
    } else if (typeof navigator !== "undefined") {
      navigator.clipboard?.writeText(window.location.href);
    }
  };

  // Spec candidates → render the ones that have a value.
  const specPairs: Array<[string, string | number | null | undefined]> = [
    ["Condition", (product as any).condition_rating],
    ["Year", product.model_year],
    ["Size", (product as any).frame_size || (product as any).size],
    ["Frame", (product as any).frame_material],
    ["Groupset", (product as any).groupset],
    ["Weight", (product as any).bike_weight || (product as any).weight],
    ["Wheels", (product as any).wheel_size],
    ["Material", (product as any).material || (product as any).apparel_material],
  ];
  const specs = specPairs.filter(([, v]) => !!v) as Array<[string, string | number]>;
  const heroStats = specs.slice(0, 4);
  const featImageA = images[1] || images[0] || "/placeholder-product.svg";
  const featImageB = images[2] || images[1] || images[0] || "/placeholder-product.svg";
  const statCols =
    heroStats.length >= 4
      ? "grid-cols-2 sm:grid-cols-4"
      : heroStats.length === 3
        ? "grid-cols-3"
        : heroStats.length === 2
          ? "grid-cols-2"
          : "grid-cols-1";

  const sellerName = sellerInfo?.name || product.store_name;
  const sellerLogo = sellerInfo?.logo_url || product.store_logo_url;
  const isStore = (sellerInfo?.account_type || product.store_account_type) === "bicycle_store";
  const isUberDeliveryEligible =
    product.uber_delivery_enabled === true &&
    (sellerInfo?.account_type || product.store_account_type) === "bicycle_store" &&
    product.store_bicycle_store === true;

  // Reused, real purchase actions — styled for the dark immersive card.
  const buyActions = (
    <div className="space-y-2.5">
      <BuyNowButton
        productId={product.id}
        productName={title}
        productPrice={live.price}
        sellerId={product.user_id}
        sellerName={product.store_name}
        uberDeliveryEligible={isUberDeliveryEligible}
        productImage={images[0] || null}
        maxQuantity={product.listing_type === "private_listing" ? 1 : Math.max(1, product.qoh ?? 1)}
        shippingAvailable={(product as any).shipping_available || false}
        shippingCost={(product as any).shipping_cost || 0}
        pickupLocation={(product as any).pickup_location || null}
        pickupOnly={(product as any).pickup_only || false}
        variant="default"
        size="lg"
        fullWidth
        className="h-12 rounded-xl bg-[#ffde59] text-black font-bold hover:bg-[#fcd535] border-0 shadow-lg shadow-black/30"
        showStripeBranding={false}
      />
      <div className="grid grid-cols-2 gap-2.5">
        <MakeOfferButton
          productId={product.id}
          productName={title}
          productPrice={product.price}
          sellerId={product.user_id}
          productImage={images[0] || null}
          variant="outline"
          size="lg"
          fullWidth
          className="h-11 rounded-xl bg-white/5 border-white/20 text-white font-medium hover:bg-white/10 hover:text-white"
        />
        <AddToCartButton
          productId={product.id}
          productName={title}
          productPrice={live.price}
          sellerId={product.user_id}
          sellerName={product.store_name}
          uberDeliveryEligible={isUberDeliveryEligible}
          productImage={images[0] || null}
          maxQuantity={product.listing_type === "private_listing" ? 1 : Math.max(1, product.qoh ?? 1)}
          variant="outline"
          size="lg"
          fullWidth
          className="h-11 rounded-xl bg-white/5 border-white/20 text-white font-medium hover:bg-white/10 hover:text-white"
        />
      </div>
      <ProductInquiryButton
        productId={product.id}
        productName={title}
        sellerId={product.user_id}
        sellerName={product.store_name}
        productImage={images[0] || null}
        productPrice={product.price}
        variant="outline"
        size="lg"
        fullWidth
        className="h-11 rounded-xl bg-transparent border-white/20 text-white/90 font-medium hover:bg-white/10 hover:text-white"
        buttonLabel="Message seller"
      />
    </div>
  );

  return (
    <div className="relative bg-[#0b0b0e] text-white min-h-screen">
      {/* ── Immersive top bar ─────────────────────────────────────────── */}
      <header className="absolute inset-x-0 top-0 z-30">
        <div className="mx-auto max-w-[1500px] px-4 sm:px-8 h-16 flex items-center justify-between">
          <Link
            href={sellerInfo ? storeHref : "/marketplace"}
            className="flex items-center gap-2.5 min-w-0 group"
          >
            <ChevronLeft className="h-4 w-4 text-white/50 group-hover:text-white transition-colors flex-shrink-0" />
            <div className="h-8 w-8 rounded-full overflow-hidden bg-white/10 ring-1 ring-white/15 flex items-center justify-center flex-shrink-0">
              {sellerLogo ? (
                <img src={sellerLogo} alt={sellerName} className="h-full w-full object-cover" />
              ) : (
                <Store className="h-4 w-4 text-white/60" />
              )}
            </div>
            <span className="text-sm font-semibold tracking-tight truncate text-white/90 group-hover:text-white transition-colors">
              {sellerName}
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLiked((v) => !v)}
              aria-label="Save"
              className="h-9 w-9 rounded-full bg-white/10 ring-1 ring-white/15 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <Heart className={cn("h-4 w-4", liked ? "fill-[#ffde59] text-[#ffde59]" : "text-white")} />
            </button>
            <button
              onClick={handleShare}
              aria-label="Share"
              className="h-9 w-9 rounded-full bg-white/10 ring-1 ring-white/15 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <Share2 className="h-4 w-4 text-white" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative">
        <div className="relative w-full min-h-[78vh] lg:min-h-[88vh] overflow-hidden">
          {/* Full-bleed cinematic image */}
          <img
            src={heroImage}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
          {/* Layered gradient — darken top for the bar and bottom for the title, blending into the page */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(180deg, rgba(8,8,11,0.55) 0%, rgba(8,8,11,0) 26%, rgba(8,8,11,0.10) 52%, rgba(11,11,14,0.88) 84%, #0b0b0e 100%)",
            }}
          />
          <div className="hidden lg:block absolute inset-0 bg-gradient-to-r from-[#0b0b0e]/70 via-transparent to-[#0b0b0e]/25" />

          {/* Title block — overlaid bottom-left */}
          <div className="absolute bottom-0 inset-x-0 px-5 sm:px-8 lg:px-14 pb-8 lg:pb-12 lg:max-w-[55%]">
            {eyebrow && (
              <p className="text-[11px] sm:text-xs font-semibold tracking-[0.22em] uppercase text-[#ffde59] mb-2 sm:mb-3">
                {eyebrow}
              </p>
            )}
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold leading-[1.04] tracking-tight">
              {title}
            </h1>
            <div className="mt-3 sm:mt-4 flex items-baseline gap-3 flex-wrap">
              <span className="text-2xl sm:text-3xl font-bold">{fmtPrice(live.price)}</span>
              {live.onSale && (
                <>
                  <span className="text-lg text-white/40 line-through">
                    {fmtPrice(live.originalPrice as number)}
                  </span>
                  <span className="text-xs font-semibold text-black bg-[#ffde59] rounded-md px-2 py-0.5">
                    Save {live.percentOff}%
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Floating glass buy card — desktop, bottom-right (matches the mockup) */}
          <div className="hidden lg:flex absolute bottom-10 right-6 xl:right-10 w-[350px] flex-col rounded-3xl bg-black/40 backdrop-blur-2xl ring-1 ring-white/15 shadow-2xl shadow-black/60 p-6">
            <BuyCardBody
              isSold={isSold}
              isOwner={isOwner}
              live={live}
              product={product}
              heroStats={heroStats}
              buyActions={buyActions}
            />
          </div>
        </div>

        {/* Thumbnail strip */}
        {images.length > 1 && (
          <div className="mx-auto max-w-[1500px] px-4 sm:px-8 -mt-2 lg:mt-0 lg:pt-6">
            <div className="flex gap-2.5 overflow-x-auto pb-2 snap-x lg:max-w-[55%]">
              {images.map((img, i) => (
                <button
                  key={img + i}
                  onClick={() => setActiveIdx(i)}
                  className={cn(
                    "relative flex-shrink-0 h-16 w-20 sm:h-20 sm:w-24 rounded-xl overflow-hidden snap-start ring-1 transition-all",
                    i === activeIdx ? "ring-2 ring-[#ffde59]" : "ring-white/10 opacity-60 hover:opacity-100"
                  )}
                >
                  <span className="absolute inset-0 bg-[#16161b]" />
                  <img src={img} alt={`${title} view ${i + 1}`} className="relative h-full w-full object-contain p-1.5" />
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Buy card — mobile / tablet (below hero) */}
      <div className="lg:hidden px-4 sm:px-8 mt-4">
        <div className="rounded-3xl bg-white/[0.06] ring-1 ring-white/12 p-5">
          <BuyCardBody
            isSold={isSold}
            isOwner={isOwner}
            live={live}
            product={product}
            heroStats={heroStats}
            buyActions={buyActions}
          />
        </div>
      </div>

      {/* ── Feature panel 1 — image | overview (Apple-style) ──────────── */}
      <section className="mx-auto max-w-[1500px] mt-12 lg:mt-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 items-stretch">
          <div className="relative min-h-[300px] lg:min-h-[560px] bg-[#111114] overflow-hidden">
            <img src={featImageA} alt={title} className="absolute inset-0 h-full w-full object-cover" />
          </div>
          <div className="flex flex-col justify-center px-6 sm:px-10 lg:px-16 py-12 lg:py-0">
            {eyebrow && (
              <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-[#ffde59] mb-4">
                {eyebrow}
              </p>
            )}
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-[1.05] mb-5">{title}</h2>
            <div className="text-white/65 [&_*]:!text-white/65 [&_h3]:!text-white [&_h4]:!text-white [&_strong]:!text-white max-w-[460px]">
              {(product as any).product_description ? (
                <ProductDescription text={(product as any).product_description} />
              ) : (
                <p className="text-[15px] leading-[1.8] whitespace-pre-wrap">{product.description}</p>
              )}
            </div>
            {(product as any).seller_notes && (
              <div className="mt-6 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 p-5 max-w-[460px]">
                <p className="text-sm font-semibold text-white mb-1.5">Seller notes</p>
                <p className="text-sm leading-relaxed text-white/65 whitespace-pre-wrap">
                  {(product as any).seller_notes}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Yellow stats band ─────────────────────────────────────────── */}
      {heroStats.length > 0 && (
        <div className="bg-[#ffde59] text-[#0a0a0a]">
          <div className={cn("mx-auto max-w-[1500px] grid", statCols)}>
            {heroStats.map(([label, value]) => (
              <div
                key={label}
                className="px-6 py-8 sm:py-9 border-b border-black/10 sm:border-b-0 sm:border-r last:border-0 sm:[&:nth-child(4)]:border-r-0"
              >
                <p className="text-[11px] font-extrabold uppercase tracking-wider opacity-60">{label}</p>
                <p className="mt-2 text-2xl sm:text-[26px] font-black tracking-tight">{String(value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Feature panel 2 — specs | image (reversed) ────────────────── */}
      {(specs.length > 0 || (product as any).product_specs) && (
        <section className="mx-auto max-w-[1500px]">
          <div className="grid grid-cols-1 lg:grid-cols-2 items-stretch">
            <div className="order-2 lg:order-1 flex flex-col justify-center px-6 sm:px-10 lg:px-16 py-12 lg:py-0">
              <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-[#ffde59] mb-4">
                Specification
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-[1.05] mb-6">
                The full specification.
              </h2>
              {(product as any).product_specs ? (
                <div className="text-white/65 [&_*]:!text-white/65 [&_h3]:!text-white [&_h4]:!text-white [&_strong]:!text-white max-w-[460px]">
                  <ProductDescription text={(product as any).product_specs} />
                </div>
              ) : (
                <dl className="grid grid-cols-2 gap-x-8 gap-y-4 max-w-[460px]">
                  {specs.map(([label, value]) => (
                    <div key={label} className="border-b border-white/10 pb-3">
                      <dt className="text-[11px] uppercase tracking-wider text-white/40">{label}</dt>
                      <dd className="mt-1 text-[15px] font-semibold text-white">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
            <div className="order-1 lg:order-2 relative min-h-[300px] lg:min-h-[560px] bg-[#111114] overflow-hidden">
              <img src={featImageB} alt={title} className="absolute inset-0 h-full w-full object-cover" />
            </div>
          </div>
        </section>
      )}

      {/* ── Every angle — gallery strip ───────────────────────────────── */}
      {images.length > 1 && (
        <section className="mx-auto max-w-[1500px] px-5 sm:px-8 lg:px-14 pt-14 lg:pt-20">
          <h3 className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-white/40 mb-5">
            Every angle
          </h3>
          <div className="flex gap-3.5 overflow-x-auto pb-2 snap-x">
            {images.map((img, i) => (
              <div
                key={img + i}
                className="relative flex-none w-[280px] sm:w-[360px] aspect-[3/2] rounded-2xl overflow-hidden bg-[#141417] snap-start"
              >
                <img src={img} alt={`${title} view ${i + 1}`} className="absolute inset-0 h-full w-full object-cover" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Delivery ──────────────────────────────────────────────────── */}
      {((product as any).shipping_available || (product as any).pickup_location) && (
        <section className="mx-auto max-w-[1500px] px-5 sm:px-8 lg:px-14 pt-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-[760px]">
            {(product as any).shipping_available && (
              <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 p-4">
                <Truck className="h-5 w-5 text-[#ffde59]" />
                <div>
                  <p className="text-sm font-medium text-white">Shipping</p>
                  <p className="text-xs text-white/50">
                    {!(product as any).shipping_cost
                      ? "Free shipping"
                      : `${fmtPrice((product as any).shipping_cost)} shipping`}
                  </p>
                </div>
              </div>
            )}
            {(product as any).pickup_location && (
              <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 p-4">
                <MapPin className="h-5 w-5 text-[#ffde59]" />
                <div>
                  <p className="text-sm font-medium text-white">Local pickup</p>
                  <p className="text-xs text-white/50">{(product as any).pickup_location}</p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Seller band ───────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1500px] px-5 sm:px-8 lg:px-14 pt-12 pb-16 lg:pb-24">
        <Link
          href={storeHref}
          className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] transition-colors p-5 sm:p-6"
        >
          <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-full overflow-hidden bg-[#ffde59] ring-1 ring-white/15 flex items-center justify-center flex-shrink-0">
            {sellerLogo ? (
              <img src={sellerLogo} alt={sellerName ?? "Seller"} className="h-full w-full object-cover" />
            ) : (
              <span className="text-lg font-black text-black">{(sellerName || "S").charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-base sm:text-lg font-bold text-white truncate">
              {sellerName}
              {isStore && <BadgeCheck className="h-4 w-4 text-[#ffde59] flex-shrink-0" />}
            </p>
            <p className="text-xs sm:text-[13px] text-white/50 truncate">
              {[isStore ? "Verified bicycle store" : "Seller", (product as any).pickup_location, "Escrow protected"]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <span className="ml-auto flex items-center gap-1.5 text-sm font-bold text-[#ffde59] flex-shrink-0">
            <span className="hidden sm:inline">View store</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      </section>

      {/* ── Discovery carousels — light section under the dark hero ───── */}
      <div className="bg-white text-gray-900 rounded-t-[2.5rem]">
        <div className="mx-auto max-w-[1500px] px-5 sm:px-8 lg:px-14 py-12 lg:py-16">
          <RecommendationCarousel
            title="Similar items"
            products={similarProducts}
            isLoading={false}
            icon="sparkles"
          />
          <RecommendationCarousel
            title={sellerName ? `More from ${sellerName}` : "More from this seller"}
            products={sellerProducts}
            isLoading={false}
            icon="store"
            seeAllHref={storeHref}
            seeAllLabel="View all"
          />
          {brandName && (
            <RecommendationCarousel
              title={`More from ${brandName}`}
              products={brandProducts}
              isLoading={false}
              icon="sparkles"
              seeAllHref={`/marketplace?brand=${encodeURIComponent(brandName)}`}
              seeAllLabel={`All ${brandName}`}
            />
          )}
        </div>
      </div>

      {/* Sticky mobile buy bar */}
      {!isSold && !isOwner && (
        <div className="lg:hidden sticky bottom-0 z-30 border-t border-white/10 bg-[#0b0b0e]/95 backdrop-blur-md px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <p className="text-[11px] text-white/50 leading-none mb-1">Price</p>
              <p className="text-lg font-bold text-white leading-none">{fmtPrice(live.price)}</p>
            </div>
            <div className="flex-1">
              <BuyNowButton
                productId={product.id}
                productName={title}
                productPrice={live.price}
                sellerId={product.user_id}
                sellerName={product.store_name}
                uberDeliveryEligible={isUberDeliveryEligible}
                productImage={images[0] || null}
                maxQuantity={product.listing_type === "private_listing" ? 1 : Math.max(1, product.qoh ?? 1)}
                shippingAvailable={(product as any).shipping_available || false}
                shippingCost={(product as any).shipping_cost || 0}
                pickupLocation={(product as any).pickup_location || null}
                pickupOnly={(product as any).pickup_only || false}
                variant="default"
                size="lg"
                fullWidth
                className="h-11 rounded-xl bg-[#ffde59] text-black font-bold hover:bg-[#fcd535] border-0"
                showStripeBranding={false}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared buy-card body (desktop floating + mobile) ──────────────────────
function BuyCardBody({
  isSold,
  isOwner,
  live,
  product,
  heroStats,
  buyActions,
}: {
  isSold: boolean;
  isOwner: boolean;
  live: ReturnType<typeof resolveLivePrice>;
  product: MarketplaceProduct;
  heroStats: Array<[string, string | number]>;
  buyActions: React.ReactNode;
}) {
  return (
    <>
      <div className="flex items-baseline gap-2.5">
        <span className="text-3xl font-bold text-white">{fmtPrice(live.price)}</span>
        {live.onSale && (
          <span className="text-base text-white/40 line-through">{fmtPrice(live.originalPrice as number)}</span>
        )}
      </div>
      <p className="mt-1 text-xs text-white/50">
        {[
          (product as any).condition_rating,
          product.model_year,
          live.onSale ? `saves ${live.percentOff}%` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      <div className="mt-5">
        {isSold ? (
          <div className="rounded-xl bg-white/10 ring-1 ring-white/15 py-4 text-center">
            <p className="text-sm font-semibold text-white">Sold</p>
            <p className="text-xs text-white/50 mt-0.5">This item is no longer available</p>
          </div>
        ) : isOwner ? (
          <div className="rounded-xl bg-white/[0.06] ring-1 ring-white/12 py-3 px-4 text-center">
            <p className="text-sm font-medium text-white">This is your listing</p>
            <p className="text-xs text-white/50 mt-0.5">Manage it from your store dashboard</p>
          </div>
        ) : (
          buyActions
        )}
      </div>

      {/* Trust signals */}
      {!isSold && (
        <div className="mt-4 flex flex-col gap-2">
          {TRUST.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 text-xs text-white/60">
              <Icon className="h-3.5 w-3.5 text-emerald-400" />
              {label}
            </div>
          ))}
        </div>
      )}

      {/* Stat grid */}
      {heroStats.length > 0 && (
        <div className="mt-5 pt-5 border-t border-white/10 grid grid-cols-2 gap-x-4 gap-y-3">
          {heroStats.map(([label, value]) => (
            <div key={label}>
              <p className="text-[10px] uppercase tracking-wider text-white/40">{label}</p>
              <p className="text-sm font-medium text-white truncate">{String(value)}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
