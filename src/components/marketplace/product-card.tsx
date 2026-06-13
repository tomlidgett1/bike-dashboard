"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, Plus, Check, Sparkles, Store, BadgeCheck, ShoppingBag, Loader2, Wand2 } from "lucide-react";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { trackInteraction } from "@/lib/tracking/interaction-tracker";
import { useAuth } from "@/components/providers/auth-provider";
import { useAuthModal } from "@/components/providers/auth-modal-provider";
import { useCart, type CartItem } from "@/components/providers/cart-provider";
import { getCardImageUrl } from "@/lib/utils/cloudinary";
import { cloudinaryCardLoader, extractCloudinaryPublicId } from "@/lib/utils/cloudinary-transforms";
import { resolveLivePrice, formatPriceAUD, formatPriceAUDFull } from "@/lib/marketplace/pricing";
import { cn } from "@/lib/utils";

// 1x1 light-grey SVG used as the blur-up placeholder for card images
const CARD_BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgZmlsbD0iI2Y3ZjdmNyIvPjwvc3ZnPg==";

// ============================================================
// Product Card - Image-First Design
// Large image with floating price, minimal clutter
// Uses Cloudinary CDN for ultra-fast image delivery (~200ms)
// ============================================================

interface ProductCardProps {
  product: MarketplaceProduct;
  priority?: boolean;
  featuredMobile?: boolean;
  /** Row layout for marketplace list view */
  layout?: "grid" | "list";
  isAdmin?: boolean;
  /** Hide store badge + relative time (use on store profile where they're redundant) */
  hideStoreMeta?: boolean;
  /** Compact density — smaller text for 8-col grid */
  compact?: boolean;
  onNavigate?: () => void;
  onImageDiscoveryClick?: (productId: string) => void;
  onBackgroundRemove?: (product: MarketplaceProduct) => void;
  backgroundRemoveBusy?: boolean;
  /** When set, appends ?store={storeId} to the product URL for store-context header */
  storeId?: string;
  /** Fixed-height horizontal carousel — disables the 300px content-visibility placeholder */
  inCarousel?: boolean;
}

type ListingImage = {
  url: string;
  cardUrl?: string;
  publicId?: string;
  cloudinaryPublicId?: string;
  isPrimary?: boolean;
};

type ProductCardData = MarketplaceProduct & {
  store_name?: string;
  card_url?: string | null;
  cloudinary_public_id?: string | null;
  images?: ListingImage[] | null;
};

function getCardActionImage(product: ProductCardData): string | null {
  return product.card_url || product.primary_image_url || null;
}

function getPrimaryListingImageSignature(images: ListingImage[] | null | undefined): string {
  if (!Array.isArray(images) || images.length === 0) return "";
  const image = images.find((img) => img.isPrimary) || images[0];
  if (!image) return "";

  return [
    image.cloudinaryPublicId || "",
    image.publicId || "",
    image.cardUrl || "",
    image.url || "",
    image.isPrimary ? "primary" : "",
  ].join("|");
}

function getCardActionMaxQuantity(product: ProductCardData): number {
  if (product.listing_type === "private_listing") return 1;
  return Math.max(1, Math.floor(Number(product.qoh) || 1));
}

function buildCardCartItem(product: ProductCardData): CartItem {
  const live = resolveLivePrice(product);

  return {
    productId: product.id,
    name: product.display_name || product.description || "Item",
    image: getCardActionImage(product),
    price: live.price,
    sellerId: product.user_id,
    sellerName: product.store_name || "Store",
    uberDeliveryEligible:
      product.uber_delivery_enabled === true &&
      product.store_account_type === "bicycle_store" &&
      product.store_bicycle_store === true,
    quantity: 1,
    maxQuantity: getCardActionMaxQuantity(product),
  };
}

// ── Add-to-cart overlay button ──────────────────────────────
// Kept outside the memoized ProductCard so cart-state changes (in/out of
// cart) cause this tiny component to re-render without busting the whole card.
function CartOverlayButton({ product }: { product: ProductCardData }) {
  const { has, addItem, openCart } = useCart();
  const inCart = has(product.id);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (inCart) { openCart(); return; }
    const result = addItem(buildCardCartItem(product));
    if (result === "added" || result === "exists") openCart();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={inCart ? "View cart" : "Add to cart"}
      title={inCart ? "View cart" : "Add to cart"}
      className={cn(
        "w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white shadow-sm sm:shadow-md flex items-center justify-center transition-all duration-200 cursor-pointer hover:scale-110",
        inCart ? "opacity-100" : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
      )}
    >
      {inCart
        ? <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-green-600" />
        : <Plus className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-gray-700" />
      }
    </button>
  );
}

function UberDeliveryBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-gray-900 px-1.5 py-0.5">
      <Image
        src="/uberwhite.png"
        alt="Uber"
        width={22}
        height={8}
        quality={100}
        className="object-contain"
      />
      <span className="text-[9px] font-semibold leading-none text-green-500">1hr</span>
    </span>
  );
}

function BuyNowOverlayButton({ product }: { product: ProductCardData }) {
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { startBuyNow } = useCart();

  if (user?.id === product.user_id) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      openAuthModal();
      return;
    }

    startBuyNow(buildCardCartItem(product));
    trackInteraction("click", {
      productId: product.id,
      metadata: {
        source: "product_card_buy_now",
        category: product.marketplace_category,
        price: resolveLivePrice(product).price,
      },
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Buy now: ${product.display_name || product.description}`}
      title="Buy now"
      className="h-6 w-6 sm:h-7 sm:w-auto sm:px-2.5 rounded-full bg-gray-900/95 text-[10px] sm:text-[11px] font-semibold text-white shadow-sm sm:shadow-md flex items-center justify-center sm:justify-start gap-0 sm:gap-1.5 transition-all duration-200 cursor-pointer hover:scale-105 hover:bg-black opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
    >
      <ShoppingBag className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
      <span className="hidden sm:inline leading-none">Buy now</span>
    </button>
  );
}

// Memoized product card to prevent unnecessary re-renders
export const ProductCard = React.memo<ProductCardProps>(function ProductCard({
  product,
  priority = false,
  featuredMobile = false,
  layout = "grid",
  isAdmin = false,
  hideStoreMeta = false,
  compact = false,
  onNavigate,
  onImageDiscoveryClick,
  onBackgroundRemove,
  backgroundRemoveBusy = false,
  storeId,
  inCarousel = false,
}) {
  const router = useRouter();
  const [cardPublicIdError, setCardPublicIdError] = React.useState(false);
  const [directImageError, setDirectImageError] = React.useState(false);
  const [isVisible, setIsVisible] = React.useState(priority);
  const imageRef = React.useRef<HTMLDivElement>(null);
  const productData = product as ProductCardData;

  React.useEffect(() => {
    if (priority) {
      setIsVisible(true);
    }
  }, [priority]);

  // Get relative time for new listings (show for products < 24 hours old)
  const relativeTime = React.useMemo(() => {
    if (!product.created_at) return null;
    const createdAt = new Date(product.created_at);
    const now = new Date();
    const hoursDiff = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

    // Only show for products listed in last 24 hours
    if (hoursDiff > 24) return null;

    if (hoursDiff < 1) {
      const minutes = Math.floor(hoursDiff * 60);
      return `${minutes}m ago`;
    } else {
      return `${Math.floor(hoursDiff)}h ago`;
    }
  }, [product.created_at]);

  // Intersection Observer for lazy loading
  React.useEffect(() => {
    if (priority || inCarousel || isVisible) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsVisible(true);
        }
      },
      {
        rootMargin: '400px', // Increased for earlier prefetching
        threshold: 0.01,
      }
    );

    const target = imageRef.current;
    if (target) {
      observer.observe(target);
    }

    return () => {
      if (target) {
        observer.unobserve(target);
      }
    };
  }, [priority, inCarousel, isVisible]);

  // Image URL - uses card_url from product_images table (source of truth)
  // The API fetches the primary image and passes it as card_url
  const imageUrl = React.useMemo(() => {
    // Priority 1: card_url from API (fetched from product_images table)
    if (productData.card_url) {
      return productData.card_url;
    }

    // Priority 2: For private listings with images array (legacy fallback)
    if (productData.listing_type === 'private_listing' && Array.isArray(productData.images)) {
      const primaryImage = productData.images.find(img => img.isPrimary) || productData.images[0];

      if (primaryImage) {
        return getCardImageUrl(primaryImage);
      }
    }

    // Priority 3: Legacy primary_image_url fallback
    if (product.primary_image_url && !product.primary_image_url.startsWith('blob:')) {
      return product.primary_image_url;
    }

    return null;
  }, [product.primary_image_url, productData.card_url, productData.images, productData.listing_type]);

  // Cloudinary public_id is the single source of truth. When present we render a
  // real DPR-aware AVIF srcset via the loader; otherwise we fall back to the
  // single pre-built URL (legacy/external images that were never on Cloudinary).
  const cardPublicId = React.useMemo(
    () => productData.cloudinary_public_id || extractCloudinaryPublicId(imageUrl),
    [productData.cloudinary_public_id, imageUrl]
  );

  React.useEffect(() => {
    setCardPublicIdError(false);
    setDirectImageError(false);
  }, [cardPublicId, imageUrl]);

  const useCloudinaryLoader = !!cardPublicId && !cardPublicIdError;
  const useDirectImage = !!imageUrl && (!cardPublicId || cardPublicIdError) && !directImageError;
  const shouldMountImage = isVisible || inCarousel;

  // Width the card occupies at each breakpoint, so the browser fetches the
  // smallest sufficient variant. Grid: 2-col mobile, 3 md, 4 lg, 6 xl.
  const cardSizes = layout === "list"
    ? "128px"
    : inCarousel
      ? "(max-width: 640px) 160px, (max-width: 768px) 180px, (max-width: 1024px) 200px, 220px"
      : featuredMobile
        ? "(max-width: 640px) 100vw, (min-width: 1280px) 16vw, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
        : "(min-width: 1280px) 16vw, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw";

  // Memoize click handler to prevent recreating on every render
  const handleClick = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();

    // Trigger full-page loading overlay
    if (onNavigate) {
      onNavigate();
    }

    trackInteraction('click', {
      productId: product.id,
      metadata: {
        source: 'product_card',
        category: product.marketplace_category,
        price: product.price,
      }
    });

    // Navigate to product page
    const productUrl = storeId
      ? `/marketplace/product/${product.id}?store=${storeId}`
      : `/marketplace/product/${product.id}`;
    router.push(productUrl);
  }, [product.id, product.marketplace_category, product.price, router, onNavigate, storeId]);

  const isList = layout === "list";
  // Resolve live price once so both the photo badge and the price row can use it.
  const live = resolveLivePrice(product);
  const isUberDeliveryEligible =
    productData.uber_delivery_enabled === true &&
    productData.store_account_type === "bicycle_store" &&
    productData.store_bicycle_store === true;
  const conditionBadge =
    productData.listing_type === 'private_listing' && productData.condition_rating
      ? productData.condition_rating
      : null;

  return (
    <Link
      href={storeId ? `/marketplace/product/${product.id}?store=${storeId}` : `/marketplace/product/${product.id}`}
      onClick={handleClick}
      className={cn(
        "product-card-root block",
        inCarousel && "product-card-root--in-carousel w-full",
        isList && "w-full",
        !isList && featuredMobile && "sm:col-span-1"
      )}
    >
      <div
        id={`product-${product.id}`}
        className={cn(
          "group cursor-pointer relative",
          isList && "flex flex-row gap-3 items-stretch w-full rounded-md border border-gray-200/80 bg-white p-2 sm:p-3"
        )}
      >
        {/* Image Container - Main focus */}
        <div
          ref={imageRef}
          className={cn(
            "relative overflow-hidden rounded-md bg-gray-100 border border-gray-200/80",
            isList
              ? "w-28 sm:w-32 flex-shrink-0 aspect-square mb-0"
              : cn("w-full", inCarousel ? "mb-0" : "mb-0.5"),
            !isList &&
              (featuredMobile && !inCarousel
                ? "aspect-square sm:aspect-[4/3]"
                : "aspect-square")
          )}
        >
          {shouldMountImage && (useCloudinaryLoader || useDirectImage) ? (
            useCloudinaryLoader ? (
              <Image
                loader={cloudinaryCardLoader}
                src={cardPublicId!}
                alt={product.description}
                fill
                sizes={cardSizes}
                className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                loading={priority ? 'eager' : 'lazy'}
                priority={priority}
                placeholder="blur"
                blurDataURL={CARD_BLUR_DATA_URL}
                onError={() => setCardPublicIdError(true)}
              />
            ) : (
              <Image
                src={imageUrl!}
                alt={product.description}
                fill
                unoptimized // legacy/external image — already a finished URL, skip Next processing
                className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                loading={priority ? 'eager' : 'lazy'}
                priority={priority}
                placeholder="blur"
                blurDataURL={CARD_BLUR_DATA_URL}
                onError={() => setDirectImageError(true)}
              />
            )
          ) : !shouldMountImage ? (
            <div className="flex h-full w-full items-center justify-center">
              <div className="animate-pulse h-full w-full bg-gray-200/50" />
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="h-12 w-12 text-gray-300" />
            </div>
          )}

          {/* Quick action overlays */}
          <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 z-10 flex items-center gap-1 sm:gap-1.5">
            <CartOverlayButton product={productData} />
            <BuyNowOverlayButton product={productData} />
          </div>

          {onBackgroundRemove && !isList && (
            <button
              type="button"
              disabled={backgroundRemoveBusy}
              title={backgroundRemoveBusy ? "Fixing background..." : "Fix background"}
              aria-label={backgroundRemoveBusy ? "Fixing background" : "Fix background"}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onBackgroundRemove(product);
              }}
              className={cn(
                "absolute left-2 top-2 z-20 inline-flex items-center gap-1.5 rounded-md border border-gray-200/80 bg-white/95 px-2 py-1 text-[11px] font-medium text-gray-700 shadow-sm backdrop-blur-sm transition-all duration-200 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20 disabled:cursor-wait",
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
              <span className="sm:hidden">Fix</span>
            </button>
          )}

          {/* Bottom-left badges: Online Only + Sale stacked */}
          {(productData.listing_source === 'online_catalog' || live.onSale) && (
            <div className="absolute bottom-2 left-2 z-10 pointer-events-none flex flex-col gap-1 items-start">
              {productData.listing_source === 'online_catalog' && (
                <span className="inline-block rounded-md bg-[#ffde59]/70 backdrop-blur-sm px-1.5 py-0.5 text-[10px] font-semibold text-gray-900 shadow-sm tracking-wide">
                  Online Only
                </span>
              )}
              {live.onSale && (
                <span className="inline-block rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm tracking-wide">
                  Sale
                </span>
              )}
            </div>
          )}

          {/* Admin: Image Discovery Button */}
          {isAdmin && onImageDiscoveryClick && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onImageDiscoveryClick(product.id);
              }}
              className="absolute top-2.5 left-2.5 bg-white/95 backdrop-blur-sm px-2 py-1 rounded-md shadow-sm opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-white z-20"
            >
              <div className="flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-purple-600" />
                <span className="text-xs font-medium text-gray-700">New Image</span>
              </div>
            </button>
          )}
        </div>

        {/* Product Info - Improved text layout */}
	        <div
	          className={cn(
	            isList && "flex flex-1 flex-col justify-center min-w-0 py-0",
	            !isList &&
	              !hideStoreMeta &&
	              (featuredMobile
	                ? "px-0.5 mb-1 sm:pt-1 sm:mb-2 md:mb-3"
	                : "px-0.5 mb-1 sm:mb-2"),
	            !isList &&
	              hideStoreMeta &&
	              inCarousel &&
	              "px-0.5 h-11 overflow-hidden mb-0",
	            !isList &&
	              hideStoreMeta &&
	              !inCarousel &&
	              (featuredMobile
	                ? "h-9 sm:h-11 overflow-hidden mb-0.5"
	                : "h-[3.25rem] overflow-hidden mb-0.5")
	          )}
	        >
          {/* Product Title - Enhanced typography */}
          <h3
            className={cn(
              "text-gray-900 leading-tight line-clamp-2",
              isList && "text-sm font-semibold mb-1",
              !isList &&
                (inCarousel && hideStoreMeta
                  ? "text-sm font-medium line-clamp-1 mb-0"
                  : featuredMobile
                    ? "text-xs sm:text-base font-medium sm:font-semibold line-clamp-1 mb-0 sm:mb-0.5"
                    : compact
                      ? "text-xs sm:text-[11px] font-medium line-clamp-1 mb-0"
                      : hideStoreMeta
                        ? "text-xs font-medium line-clamp-1 mb-0"
                        : "text-sm font-medium line-clamp-1 mb-0")
            )}
          >
            {productData.display_name || product.description}
          </h3>

          {/* Price - Below title, size between title and location.
              Shows discounted price + struck-through original + % badge when on sale.
              Both sale prices use formatPriceAUDFull (2dp) for precision and consistency. */}
          {(() => {
            const priceSizeClass = cn(
              "font-semibold leading-tight",
              isList && "text-sm",
              !isList &&
                (inCarousel && hideStoreMeta
                  ? "text-sm"
                  : featuredMobile
                    ? "text-xs sm:text-sm"
                    : "text-xs")
            );
            const priceConditionBadge = conditionBadge ? (
              <span className="inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium leading-none text-gray-700">
                {conditionBadge}
              </span>
            ) : null;

            if (live.onSale) {
              return (
	                <div className={cn("flex items-center gap-1.5 mb-0", hideStoreMeta ? "flex-nowrap overflow-hidden" : "flex-wrap")}>
	                  <p className={cn(priceSizeClass, "text-red-600 mb-0 shrink-0")}>
	                    {formatPriceAUDFull(live.price)}
	                  </p>
	                  {isUberDeliveryEligible && <UberDeliveryBadge />}
	                  {priceConditionBadge}
	                  <p className={cn(priceSizeClass, "text-gray-400 font-normal line-through mb-0", hideStoreMeta && "truncate")}>
	                    {formatPriceAUDFull(live.originalPrice as number)}
	                  </p>
	                </div>
              );
            }
            return (
	              <div className={cn("flex items-center gap-1.5 mb-0", hideStoreMeta ? "flex-nowrap overflow-hidden" : "flex-wrap")}>
	                <p className={cn(priceSizeClass, "text-gray-900 mb-0 shrink-0")}>
	                  {formatPriceAUD(live.price)}
	                </p>
                {isUberDeliveryEligible && <UberDeliveryBadge />}
                {priceConditionBadge}
              </div>
            );
          })()}

          {/* Seller info - Better organized layout */}
          {!hideStoreMeta && (
          <div className={cn("flex items-center gap-0.5 flex-wrap", isList ? "mt-1" : "mt-0.5")}>
            {/* Store badge for store inventory items (not online_catalog) */}
            {productData.listing_type === 'store_inventory' && productData.listing_source !== 'online_catalog' && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-medium rounded-md">
                <Store className="h-2.5 w-2.5" />
                Store
              </span>
            )}

            {/* Seller name/location with verified badge */}
            <div className="flex items-center gap-0.5 flex-1 min-w-0">
              <p className="text-xs text-gray-600 font-medium truncate">
                {(() => {
                  // For private listings, show pickup location instead of seller name
                  if (productData.listing_type === 'private_listing') {
                    return productData.pickup_location || 'Melbourne';
                  }
                  // For bike stores, show business name or "Bike Store"
                  if (productData.store_account_type === 'bicycle_store' || productData.listing_type === 'store_inventory') {
                    return product.store_name || 'Bike Store';
                  }
                  // For individual users (fallback), show "FirstName L."
                  if (productData.first_name && productData.last_name) {
                    return `${productData.first_name} ${productData.last_name.charAt(0)}.`;
                  }
                  // Fallback to store_name
                  return product.store_name || 'Seller';
                })()}
              </p>
              {/* Verified badge for Ashburton Cycles */}
              {product.store_name === 'Ashburton Cycles' && (
                <BadgeCheck className="h-3 w-3 text-blue-500 flex-shrink-0" />
              )}
            </div>

            {/* Secondary info - Time */}
            {relativeTime && (
              <div className="flex items-center gap-0.5 text-xs">
                <span className="text-emerald-600 font-medium whitespace-nowrap">
                  {relativeTime}
                </span>
              </div>
            )}
          </div>
          )}
        </div>
      </div>
    </Link>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for React.memo.
  // Re-render on fields that affect the visible card. Image fields are included
  // so a refreshed card URL/public id cannot stay stuck behind the memo boundary.
  return prevProps.product.id === nextProps.product.id &&
         prevProps.product.description === nextProps.product.description &&
         prevProps.product.primary_image_url === nextProps.product.primary_image_url &&
         (prevProps.product as ProductCardData).card_url === (nextProps.product as ProductCardData).card_url &&
         (prevProps.product as ProductCardData).cloudinary_public_id === (nextProps.product as ProductCardData).cloudinary_public_id &&
         getPrimaryListingImageSignature((prevProps.product as ProductCardData).images) ===
           getPrimaryListingImageSignature((nextProps.product as ProductCardData).images) &&
         prevProps.product.price === nextProps.product.price &&
         prevProps.product.sale_price === nextProps.product.sale_price &&
         prevProps.product.discount_active === nextProps.product.discount_active &&
         prevProps.product.discount_percent === nextProps.product.discount_percent &&
         prevProps.product.discount_ends_at === nextProps.product.discount_ends_at &&
         prevProps.product.qoh === nextProps.product.qoh &&
         prevProps.product.listing_type === nextProps.product.listing_type &&
         prevProps.product.listing_source === nextProps.product.listing_source &&
         prevProps.product.condition_rating === nextProps.product.condition_rating &&
         prevProps.product.display_name === nextProps.product.display_name &&
         prevProps.product.store_name === nextProps.product.store_name &&
         prevProps.product.store_account_type === nextProps.product.store_account_type &&
         prevProps.product.uber_delivery_enabled === nextProps.product.uber_delivery_enabled &&
         prevProps.product.store_bicycle_store === nextProps.product.store_bicycle_store &&
         prevProps.product.pickup_location === nextProps.product.pickup_location &&
         prevProps.product.first_name === nextProps.product.first_name &&
         prevProps.product.last_name === nextProps.product.last_name &&
         prevProps.hideStoreMeta === nextProps.hideStoreMeta &&
         prevProps.compact === nextProps.compact &&
         prevProps.isAdmin === nextProps.isAdmin &&
         prevProps.backgroundRemoveBusy === nextProps.backgroundRemoveBusy &&
         Boolean(prevProps.onBackgroundRemove) === Boolean(nextProps.onBackgroundRemove) &&
         prevProps.storeId === nextProps.storeId &&
         prevProps.inCarousel === nextProps.inCarousel &&
         prevProps.priority === nextProps.priority &&
         prevProps.featuredMobile === nextProps.featuredMobile &&
         prevProps.layout === nextProps.layout;
});

// ============================================================
// Product Card Skeleton - Matching image-first design
// ============================================================

export function ProductCardSkeleton({
  layout = "grid",
  hideStoreMeta = false,
}: {
  layout?: "grid" | "list";
  /** Carousel / store row — title + price only (no seller line). */
  hideStoreMeta?: boolean;
}) {
  if (layout === "list") {
    return (
      <div className="flex flex-row gap-3 w-full rounded-md border border-gray-200/80 bg-white p-2 sm:p-3">
        <div className="w-28 sm:w-32 flex-shrink-0 aspect-square rounded-md bg-gray-100 animate-pulse border border-gray-200" />
        <div className="flex-1 min-w-0 flex flex-col justify-center space-y-2 py-0.5">
          <div className="h-4 w-[85%] bg-gray-100 rounded animate-pulse" />
          <div className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
          <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
        </div>
      </div>
    );
  }
  return (
    <div>
      {/* Image Skeleton */}
      <div
        className={cn(
          "relative w-full rounded-xl bg-gray-100 animate-pulse border border-gray-200",
          hideStoreMeta ? "mb-0" : "mb-0.5",
        )}
        style={{ aspectRatio: "1 / 1" }}
      >
      </div>

      {/* Content Skeleton — carousel rows match live cards (title + price, 40px block) */}
      <div
        className={cn(
          "px-0.5 overflow-hidden",
          hideStoreMeta ? "h-11 mb-0" : "space-y-0 mb-0.5",
        )}
      >
        <div className="h-4 w-full bg-gray-100 rounded animate-pulse mb-0" />
        <div className="h-3 w-20 bg-gray-100 rounded animate-pulse mb-0" />
        {!hideStoreMeta && (
          <div className="h-3 w-16 bg-gray-100 rounded animate-pulse" />
        )}
      </div>
    </div>
  );
}
