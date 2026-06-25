"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, Plus } from "@/components/layout/app-sidebar/dashboard-icons";
import { useCart, type CartItem } from "@/components/providers/cart-provider";
import {
  formatPriceAUDFull,
  resolveLivePrice,
} from "@/lib/marketplace/pricing";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { getCardImageUrl } from "@/lib/utils/cloudinary";
import {
  cloudinaryCardLoader,
  extractCloudinaryPublicId,
} from "@/lib/utils/cloudinary-transforms";
import { trackStoreBehaviourEvent } from "@/lib/tracking/store-analytics";
import { cn } from "@/lib/utils";
import { STUDIO, DISPLAY_FONT, MONO_FONT } from "./atelier-theme";

type ListingImage = {
  url: string;
  cardUrl?: string;
  publicId?: string;
  cloudinaryPublicId?: string;
  isPrimary?: boolean;
};

type StudioCardData = MarketplaceProduct & {
  store_name?: string;
  card_url?: string | null;
  cloudinary_public_id?: string | null;
  images?: ListingImage[] | null;
};

const PLACEHOLDER_BLUR =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgZmlsbD0iI2Y3ZjdmNiIvPjwvc3ZnPg==";

function resolveImageUrl(product: StudioCardData): string | null {
  if (product.card_url) return product.card_url;
  if (product.listing_type === "private_listing" && Array.isArray(product.images)) {
    const primary = product.images.find((img) => img.isPrimary) || product.images[0];
    if (primary) return getCardImageUrl(primary);
  }
  if (product.primary_image_url && !product.primary_image_url.startsWith("blob:")) {
    return product.primary_image_url;
  }
  return null;
}

function buildCartItem(product: StudioCardData, storeName: string): CartItem {
  const live = resolveLivePrice(product);
  return {
    productId: product.id,
    name: product.display_name || product.description || "Item",
    image: product.card_url || product.primary_image_url || null,
    price: live.price,
    sellerId: product.user_id,
    sellerName: storeName,
    uberDeliveryEligible:
      product.uber_delivery_enabled === true &&
      product.store_account_type === "bicycle_store" &&
      product.store_bicycle_store === true,
    quantity: 1,
    maxQuantity: Math.max(1, Math.floor(Number(product.qoh) || 1)),
  };
}

export interface AtelierProductCardProps {
  product: MarketplaceProduct;
  storeId: string;
  storeName?: string;
  priority?: boolean;
  feature?: boolean;
}

export const AtelierProductCard = React.memo<AtelierProductCardProps>(function AtelierProductCard({
  product,
  storeId,
  storeName: storeNameProp,
  priority = false,
  feature: _feature = false,
}) {
  const { has, addItem, openCart } = useCart();
  const data = product as StudioCardData;
  const storeName = storeNameProp || data.store_name || "Store";
  const inCart = has(product.id);
  const live = resolveLivePrice(product);
  const title = product.display_name || product.description || "Product";
  const brand = product.brand?.trim() || null;
  const href = `/marketplace/product/${product.id}?store=${storeId}`;

  const imageUrl = React.useMemo(() => resolveImageUrl(data), [data]);
  const cardPublicId = React.useMemo(
    () => data.cloudinary_public_id || extractCloudinaryPublicId(imageUrl),
    [data.cloudinary_public_id, imageUrl],
  );

  const [cardPublicIdError, setCardPublicIdError] = React.useState(false);
  const [directImageError, setDirectImageError] = React.useState(false);
  const [isVisible, setIsVisible] = React.useState(priority);
  const imageRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setCardPublicIdError(false);
    setDirectImageError(false);
  }, [cardPublicId, imageUrl]);

  React.useEffect(() => {
    if (priority) setIsVisible(true);
  }, [priority]);

  React.useEffect(() => {
    if (priority || isVisible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setIsVisible(true);
      },
      { rootMargin: "400px", threshold: 0.01 },
    );
    const target = imageRef.current;
    if (target) observer.observe(target);
    return () => {
      if (target) observer.unobserve(target);
    };
  }, [priority, isVisible]);

  const useCloudinaryLoader = !!cardPublicId && !cardPublicIdError;
  const useDirectImage = !!imageUrl && (!cardPublicId || cardPublicIdError) && !directImageError;
  const shouldMountImage = isVisible;

  const sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw";

  const handleAdd = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (inCart) {
      openCart();
      return;
    }
    addItem(buildCartItem(data, storeName));
    trackStoreBehaviourEvent(
      storeId,
      "add_to_cart_click",
      {
        action: "add_to_cart",
        label: "Add to cart",
        source: "studio_product_card",
        category: product.marketplace_category,
        price: live.price,
      },
      product.id,
    );
    openCart();
  };

  return (
    <Link href={href} className="group block" data-analytics-product-id={product.id}>
      <article className="flex flex-col">
        {/* Image */}
        <div
          ref={imageRef}
          className="relative w-full overflow-hidden aspect-square"
          style={{ backgroundColor: STUDIO.surfaceAlt }}
        >
          {/* Sale badge — top-left, red */}
          {live.onSale && live.percentOff != null && (
            <span
              className="absolute left-3 top-3 z-10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.04em]"
              style={{ backgroundColor: STUDIO.sale, color: "#fff", borderRadius: 2 }}
            >
              Save {live.percentOff}%
            </span>
          )}

          {shouldMountImage && (useCloudinaryLoader || useDirectImage) ? (
            useCloudinaryLoader ? (
              <Image
                loader={cloudinaryCardLoader}
                src={cardPublicId!}
                alt={title}
                fill
                sizes={sizes}
                className="object-contain p-6 transition-transform duration-700 ease-[cubic-bezier(0.04,0.62,0.23,0.98)] group-hover:scale-[1.04]"
                loading={priority ? "eager" : "lazy"}
                priority={priority}
                placeholder="blur"
                blurDataURL={PLACEHOLDER_BLUR}
                onError={() => setCardPublicIdError(true)}
              />
            ) : (
              <Image
                src={imageUrl!}
                alt={title}
                fill
                unoptimized
                sizes={sizes}
                className="object-contain p-6 transition-transform duration-700 ease-[cubic-bezier(0.04,0.62,0.23,0.98)] group-hover:scale-[1.04]"
                loading={priority ? "eager" : "lazy"}
                priority={priority}
                placeholder="blur"
                blurDataURL={PLACEHOLDER_BLUR}
                onError={() => setDirectImageError(true)}
              />
            )
          ) : !shouldMountImage ? (
            <div className="h-full w-full animate-pulse" style={{ backgroundColor: STUDIO.surfaceAlt }} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: STUDIO.faint }}>
                No image
              </span>
            </div>
          )}

          {/* Hover add-to-cart bar — slides up from bottom */}
          <div
            className="absolute inset-x-0 bottom-0 z-10 translate-y-full opacity-0 transition-all duration-300 ease-[cubic-bezier(0.04,0.62,0.23,0.98)] group-hover:translate-y-0 group-hover:opacity-100"
          >
            <button
              type="button"
              onClick={handleAdd}
              className="flex w-full items-center justify-center gap-2 py-3 text-[12px] font-semibold uppercase tracking-[0.08em] transition-colors"
              style={{ backgroundColor: STUDIO.ink, color: "#fff", fontFamily: DISPLAY_FONT }}
            >
              {inCart ? (
                <>
                  <Check className="h-3.5 w-3.5" /> In cart
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" /> Add to cart
                </>
              )}
            </button>
          </div>
        </div>

        {/* Caption */}
        <div className="pt-3">
          {brand && (
            <p
              className="truncate text-[11px] uppercase tracking-[0.06em]"
              style={{ color: STUDIO.muted, fontFamily: DISPLAY_FONT, fontWeight: 500 }}
            >
              {brand}
            </p>
          )}
          <h3
            className={cn("mt-1 line-clamp-2 leading-snug")}
            style={{ fontFamily: DISPLAY_FONT, color: STUDIO.ink, fontWeight: 500, fontSize: 14 }}
          >
            {title}
          </h3>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span
              className="text-[15px] font-semibold"
              style={{ fontFamily: DISPLAY_FONT, color: live.onSale ? STUDIO.sale : STUDIO.ink }}
            >
              {formatPriceAUDFull(live.price)}
            </span>
            {live.onSale && live.originalPrice != null && (
              <span
                className="text-[13px] line-through"
                style={{ color: STUDIO.faint, fontFamily: DISPLAY_FONT }}
              >
                {formatPriceAUDFull(live.originalPrice)}
              </span>
            )}
          </div>
        </div>
      </article>
    </Link>
  );
});
