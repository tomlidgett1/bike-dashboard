"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Check,
  Loader2,
  Package,
  Plus,
  Wand2,
} from "@/components/layout/app-sidebar/dashboard-icons";
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

const CARD_BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgZmlsbD0iI2Y3ZjdmNyIvPjwvc3ZnPg==";

type ListingImage = {
  url: string;
  cardUrl?: string;
  publicId?: string;
  cloudinaryPublicId?: string;
  isPrimary?: boolean;
};

type StoreProductCardData = MarketplaceProduct & {
  store_name?: string;
  card_url?: string | null;
  cloudinary_public_id?: string | null;
  images?: ListingImage[] | null;
};

export interface StoreProductCardProps {
  product: MarketplaceProduct;
  storeId: string;
  storeName?: string;
  priority?: boolean;
  inCarousel?: boolean;
  onBackgroundRemove?: (product: MarketplaceProduct) => void;
  backgroundRemoveBusy?: boolean;
}

function getCardActionImage(product: StoreProductCardData): string | null {
  return product.card_url || product.primary_image_url || null;
}

function buildCartItem(product: StoreProductCardData, storeName: string): CartItem {
  const live = resolveLivePrice(product);
  return {
    productId: product.id,
    name: product.display_name || product.description || "Item",
    image: getCardActionImage(product),
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

function resolveImageUrl(product: StoreProductCardData): string | null {
  if (product.card_url) return product.card_url;

  if (product.listing_type === "private_listing" && Array.isArray(product.images)) {
    const primaryImage = product.images.find((img) => img.isPrimary) || product.images[0];
    if (primaryImage) return getCardImageUrl(primaryImage);
  }

  if (product.primary_image_url && !product.primary_image_url.startsWith("blob:")) {
    return product.primary_image_url;
  }

  return null;
}

export const StoreProductCard = React.memo<StoreProductCardProps>(function StoreProductCard({
  product,
  storeId,
  storeName: storeNameProp,
  priority = false,
  inCarousel = false,
  onBackgroundRemove,
  backgroundRemoveBusy = false,
}) {
  const { has, addItem, openCart } = useCart();
  const productData = product as StoreProductCardData;
  const storeName = storeNameProp || productData.store_name || "Store";
  const inCart = has(product.id);
  const live = resolveLivePrice(product);
  const title = product.display_name || product.description || "Product";
  const href = `/marketplace/product/${product.id}?store=${storeId}`;
  const isUberDeliveryEligible =
    productData.uber_delivery_enabled === true &&
    productData.store_account_type === "bicycle_store" &&
    productData.store_bicycle_store === true;

  const [cardPublicIdError, setCardPublicIdError] = React.useState(false);
  const [directImageError, setDirectImageError] = React.useState(false);
  const [isVisible, setIsVisible] = React.useState(priority);
  const imageRef = React.useRef<HTMLDivElement>(null);

  const imageUrl = React.useMemo(() => resolveImageUrl(productData), [productData]);

  const cardPublicId = React.useMemo(
    () => productData.cloudinary_public_id || extractCloudinaryPublicId(imageUrl),
    [productData.cloudinary_public_id, imageUrl],
  );

  React.useEffect(() => {
    setCardPublicIdError(false);
    setDirectImageError(false);
  }, [cardPublicId, imageUrl]);

  React.useEffect(() => {
    if (priority) setIsVisible(true);
  }, [priority]);

  React.useEffect(() => {
    if (priority || inCarousel || isVisible) return;

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
  }, [priority, inCarousel, isVisible]);

  const useCloudinaryLoader = !!cardPublicId && !cardPublicIdError;
  const useDirectImage = !!imageUrl && (!cardPublicId || cardPublicIdError) && !directImageError;
  const shouldMountImage = isVisible || inCarousel;

  const cardSizes = inCarousel
    ? "42vw"
    : "(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 220px";

  const handleAdd = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (inCart) {
      openCart();
      return;
    }
    addItem(buildCartItem(productData, storeName));
    trackStoreBehaviourEvent(
      storeId,
      "add_to_cart_click",
      {
        action: "add_to_cart",
        label: "Add to cart",
        source: "store_product_card",
        category: product.marketplace_category,
        price: live.price,
      },
      product.id,
    );
    openCart();
  };

  return (
    <Link
      href={href}
      className={cn(
        "block w-full",
        inCarousel && "touch-pan-x",
        inCarousel ? "product-card-root--in-carousel h-auto" : "h-full",
      )}
      data-analytics-product-id={product.id}
    >
      <article
        className={cn(
          "group flex w-full flex-col overflow-hidden border border-gray-200 bg-white",
          inCarousel ? "h-auto rounded-2xl p-2" : "h-full rounded-3xl p-3 sm:p-4",
        )}
      >
        <div
          ref={imageRef}
          className={cn(
            "relative w-full shrink-0 overflow-hidden bg-white",
            inCarousel
              ? "mb-1 aspect-square rounded-xl"
              : "mb-3 aspect-square rounded-2xl",
          )}
        >
          {live.onSale && (
            <span
              className={cn(
                "absolute left-2 top-2 z-10 rounded-full bg-red-600 font-bold text-white",
                inCarousel ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
              )}
            >
              Sale
            </span>
          )}

          {onBackgroundRemove && (
            <button
              type="button"
              disabled={backgroundRemoveBusy}
              title={backgroundRemoveBusy ? "Fixing background..." : "Fix background"}
              aria-label={backgroundRemoveBusy ? "Fixing background" : "Fix background"}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onBackgroundRemove(product);
              }}
              className={cn(
                "absolute left-2 top-2 z-20 inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20 disabled:cursor-wait",
                live.onSale && "top-9",
                backgroundRemoveBusy
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
              )}
            >
              {backgroundRemoveBusy ? (
                <Loader2 className="h-3 w-3 animate-spin text-gray-500" />
              ) : (
                <Wand2 className="h-3 w-3 text-gray-500" />
              )}
              <span className="hidden sm:inline">Fix BG</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleAdd}
            aria-label={inCart ? "View cart" : "Add to cart"}
            className={cn(
              "absolute right-2 top-2 z-10 flex items-center justify-center rounded-full bg-white text-gray-900 shadow-md transition-transform hover:scale-105",
              inCarousel ? "h-7 w-7" : "h-9 w-9 sm:h-10 sm:w-10",
            )}
          >
            {inCart ? (
              <Check className={cn(inCarousel ? "h-3.5 w-3.5" : "h-4 w-4", "text-green-600")} />
            ) : (
              <Plus className={inCarousel ? "h-4 w-4" : "h-5 w-5"} />
            )}
          </button>

          {shouldMountImage && (useCloudinaryLoader || useDirectImage) ? (
            useCloudinaryLoader ? (
              <Image
                loader={cloudinaryCardLoader}
                src={cardPublicId!}
                alt={title}
                fill
                sizes={cardSizes}
                className="object-contain p-1.5 sm:p-2"
                loading={priority ? "eager" : "lazy"}
                priority={priority}
                placeholder="blur"
                blurDataURL={CARD_BLUR_DATA_URL}
                onError={() => setCardPublicIdError(true)}
              />
            ) : (
              <Image
                src={imageUrl!}
                alt={title}
                fill
                unoptimized
                sizes={cardSizes}
                className="object-contain p-1.5 sm:p-2"
                loading={priority ? "eager" : "lazy"}
                priority={priority}
                placeholder="blur"
                blurDataURL={CARD_BLUR_DATA_URL}
                onError={() => setDirectImageError(true)}
              />
            )
          ) : !shouldMountImage ? (
            <div className="flex h-full items-center justify-center bg-white">
              <div className="h-full w-full animate-pulse bg-gray-100/60" />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center bg-white">
              <Package className="h-8 w-8 text-gray-300" />
            </div>
          )}
        </div>

        <div
          className={cn(
            inCarousel ? "shrink-0 pb-0.5" : "flex min-h-0 flex-1 flex-col",
          )}
        >
          <h3
            className={cn(
              "font-bold leading-snug tracking-tight text-gray-900",
              inCarousel
                ? "line-clamp-1 text-[11px] leading-tight"
                : "line-clamp-2 text-sm",
            )}
          >
            {title}
          </h3>

          <div
            className={cn(
              "border-t border-gray-200",
              inCarousel ? "mt-1 pt-1" : "mt-auto pt-2.5 sm:pt-3",
            )}
          >
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex min-w-0 items-baseline gap-1">
                <span
                  className={cn(
                    "shrink-0 font-bold text-gray-900",
                    inCarousel ? "text-xs" : "text-base sm:text-xl",
                  )}
                >
                  {formatPriceAUDFull(live.price)}
                </span>
                {live.onSale && live.originalPrice != null && (
                  <span
                    className={cn(
                      "truncate text-gray-400 line-through",
                      inCarousel ? "text-[10px]" : "text-xs sm:text-sm",
                    )}
                  >
                    {formatPriceAUDFull(live.originalPrice)}
                  </span>
                )}
              </div>
              {isUberDeliveryEligible && (
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-full border border-gray-200 bg-white font-medium text-gray-700",
                    inCarousel
                      ? "px-1.5 py-0.5 text-[9px]"
                      : "gap-1.5 px-2 py-1 text-[10px] sm:px-2.5 sm:text-[11px]",
                  )}
                >
                  <Image
                    src="/uber.png"
                    alt="Uber"
                    width={32}
                    height={12}
                    unoptimized
                    className={cn(
                      "w-auto object-contain",
                      inCarousel ? "h-2.5" : "h-3 sm:h-3.5",
                    )}
                  />
                  <span className="sm:hidden">
                    {inCarousel ? "Fast" : "Fast Delivery"}
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
});
