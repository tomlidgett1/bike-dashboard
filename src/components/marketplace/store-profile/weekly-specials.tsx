"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  Heart,
  ShoppingBag,
  Tag,
  X,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";
import type { StoreProfile } from "@/lib/types/store";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import {
  resolveLivePrice,
  formatPriceAUD,
  formatPriceAUDFull,
} from "@/lib/marketplace/pricing";
import {
  buildCloudinaryImageUrl,
  extractCloudinaryPublicId,
} from "@/lib/utils/cloudinary-transforms";
import { useCart, type CartItem } from "@/components/providers/cart-provider";

// ============================================================
// Store banners — promotional row cards on the home tab.
//
// Includes the weekly specials swipe deck (sale items only) plus any custom
// banners the store owner adds in Landing page settings.
// ============================================================

import type { HomeBanner, StoreHomepageConfig } from "@/lib/types/store";

interface DealPrice {
  now: number;
  was: number;
  save: number;
  percentOff: number;
}

/** A sale product paired with its resolved live pricing. */
interface Deal {
  product: MarketplaceProduct;
  price: DealPrice;
  image: string | null;
}

const SWIPE_THRESHOLD = 110;
const SWIPE_VELOCITY = 0.45; // px/ms
const SWIPE_ROTATION_RANGE = 220;
const SWIPE_MAX_ROTATION = 16;
const SWIPE_FLY_DISTANCE = 520;
const SWIPE_TRANSITION = "transform 0.34s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.34s ease";

function rotateForOffset(x: number): number {
  return Math.max(-SWIPE_MAX_ROTATION, Math.min(SWIPE_MAX_ROTATION, (x / SWIPE_ROTATION_RANGE) * SWIPE_MAX_ROTATION));
}

/** Collect up to 5 gallery URLs for the card image dots. */
function dealImages(product: MarketplaceProduct, fallback: string | null): string[] {
  const urls: string[] = [];
  if (Array.isArray(product.all_images)) {
    for (const url of product.all_images) {
      if (typeof url === "string" && url.trim()) urls.push(url);
    }
  }
  if (urls.length === 0 && fallback) urls.push(fallback);
  return urls.slice(0, 5);
}

/** Short product title + secondary line for the card body. */
function dealCopy(product: MarketplaceProduct) {
  const full = product.display_name || product.description || "Sale item";
  const brand = product.brand?.trim() || null;
  const subtitle =
    product.marketplace_subcategory ||
    product.category_name ||
    product.marketplace_category ||
    null;
  return { title: full, brand, subtitle };
}

function cardTransform(x: number): string {
  return `translate3d(${x}px, 0, 0) rotate(${rotateForOffset(x)}deg)`;
}

const SWIPE_CARD_CSS = `
@keyframes weekly-specials-card-enter {
  from { opacity: 0; }
  to { opacity: 1; }
}
.weekly-specials-card {
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  backface-visibility: hidden;
  will-change: transform, opacity;
}
.weekly-specials-card-enter {
  animation: weekly-specials-card-enter 0.32s ease-out both;
}
.weekly-specials-card.is-dragging {
  cursor: grabbing;
}
`;

/** Best available product image for a large swipe card (padded white hero). */
function dealImage(product: MarketplaceProduct): string | null {
  const publicId =
    product.cloudinary_public_id ||
    extractCloudinaryPublicId(product.card_url) ||
    extractCloudinaryPublicId(product.detail_url) ||
    extractCloudinaryPublicId(product.primary_image_url);

  return (
    buildCloudinaryImageUrl(publicId, "mobile_hero") ||
    product.detail_url ||
    product.card_url ||
    product.primary_image_url ||
    null
  );
}

function toDeal(product: MarketplaceProduct): Deal | null {
  const live = resolveLivePrice(product);
  if (!live.onSale || live.originalPrice == null) return null;
  const now = live.price;
  const was = live.originalPrice;
  return {
    product,
    price: {
      now,
      was,
      save: Math.max(0, was - now),
      percentOff: live.percentOff ?? Math.round(((was - now) / was) * 100),
    },
    image: dealImage(product),
  };
}

function toCartItem(deal: Deal): CartItem {
  const { product, price } = deal;
  return {
    productId: product.id,
    name: product.display_name || product.description || "Item",
    image: product.card_url || product.primary_image_url || null,
    price: price.now,
    sellerId: product.user_id,
    sellerName: product.store_name || "Store",
    uberDeliveryEligible:
      product.uber_delivery_enabled === true &&
      product.store_account_type === "bicycle_store" &&
      product.store_bicycle_store === true,
    quantity: 1,
    maxQuantity: Math.max(1, Math.floor(Number(product.qoh) || 1)),
  };
}

/** Light, guarded haptic tap — silently no-ops where unsupported. */
function buzz(ms: number) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(ms);
    } catch {
      /* ignore */
    }
  }
}

function collectDeals(store: StoreProfile): Deal[] {
  const seen = new Set<string>();
  const out: Deal[] = [];
  for (const category of store.categories ?? []) {
    for (const product of category.products ?? []) {
      if (seen.has(product.id)) continue;
      const deal = toDeal(product);
      if (deal) {
        seen.add(product.id);
        out.push(deal);
      }
    }
  }
  return out;
}

function resolveBannerCopy(banner: HomeBanner, deals: Deal[]) {
  if (banner.kind === "weekly_specials") {
    const topPct = deals.length > 0 ? Math.max(...deals.map((d) => d.price.percentOff)) : 0;
    return {
      title: banner.title || "Weekly specials",
      subtitle:
        banner.subtitle.trim() ||
        (deals.length > 0
          ? `${deals.length} deal${deals.length === 1 ? "" : "s"} · up to ${topPct}% off`
          : ""),
      footerText: banner.footer_text || "Changes weekly",
      image: banner.image_url || deals[0]?.image || null,
    };
  }

  return {
    title: banner.title,
    subtitle: banner.subtitle,
    footerText: banner.footer_text,
    image: banner.image_url,
  };
}

// ── Public entry point ──────────────────────────────────────
export function StoreBanners({
  store,
  bannersConfig,
  accent,
  contentShell,
  onNavigate,
}: {
  store: StoreProfile;
  bannersConfig: StoreHomepageConfig["banners"];
  accent: string;
  contentShell: string;
  onNavigate: (href: string) => void;
}) {
  const deals = React.useMemo(() => collectDeals(store), [store]);
  const [swipeOpen, setSwipeOpen] = React.useState(false);

  const visibleBanners = React.useMemo(() => {
    if (!bannersConfig.enabled) return [];
    return bannersConfig.items.filter((banner) => {
      if (!banner.enabled) return false;
      if (banner.kind === "weekly_specials") return deals.length > 0;
      return banner.title.trim().length > 0;
    });
  }, [bannersConfig, deals]);

  const handleBannerClick = React.useCallback(
    (banner: HomeBanner) => {
      const href = banner.href || (banner.kind === "weekly_specials" ? "weekly_specials" : "products");
      if (href === "weekly_specials") {
        if (deals.length > 0) setSwipeOpen(true);
        return;
      }
      onNavigate(href);
    },
    [deals.length, onNavigate],
  );

  if (visibleBanners.length === 0) return null;

  const slides = visibleBanners.map((banner) => ({
    banner,
    copy: resolveBannerCopy(banner, deals),
  }));

  return (
    <>
      <section className={cn(contentShell, "mt-4")}>
        <div className="sm:hidden -mr-4 min-w-0 overflow-hidden">
          <BannerCarousel slides={slides} onBannerClick={handleBannerClick} />
        </div>

        <div className="hidden w-full sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 justify-items-start">
          {slides.map(({ banner, copy }) => (
            <BannerEntryCard
              key={banner.id}
              title={copy.title}
              subtitle={copy.subtitle}
              footerText={copy.footerText}
              image={copy.image}
              onOpen={() => handleBannerClick(banner)}
            />
          ))}
        </div>
      </section>

      <AnimatePresence>
        {swipeOpen && deals.length > 0 && (
          <SpecialsSwipe
            deals={deals}
            accent={accent}
            onClose={() => setSwipeOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/** @deprecated Use StoreBanners */
export function WeeklySpecials(props: {
  store: StoreProfile;
  accent: string;
  contentShell: string;
}) {
  const deals = React.useMemo(() => collectDeals(props.store), [props.store]);
  const bannersConfig: StoreHomepageConfig["banners"] = {
    enabled: true,
    items: [
      {
        id: "banner-weekly-specials",
        enabled: true,
        kind: "weekly_specials",
        title: "Weekly specials",
        subtitle: "",
        footer_text: "Changes weekly",
        image_url: null,
        href: "weekly_specials",
      },
    ],
  };

  if (deals.length === 0) return null;

  return (
    <StoreBanners
      store={props.store}
      bannersConfig={bannersConfig}
      accent={props.accent}
      contentShell={props.contentShell}
      onNavigate={() => {}}
    />
  );
}

// ── Swipeable auto-rotating banner carousel (mobile) ────────
const BANNER_ROTATE_MS = 5000;
/**
 * Fixed mobile slide width — same for every banner.
 * Sits inside the page's horizontal padding with the next slide peeking on the right.
 */
const MOBILE_BANNER_SLIDE_WIDTH = "w-[calc(100vw-4.5rem)]";

function BannerCarousel({
  slides,
  onBannerClick,
}: {
  slides: Array<{
    banner: HomeBanner;
    copy: {
      title: string;
      subtitle: string;
      footerText: string;
      image: string | null;
    };
  }>;
  onBannerClick: (banner: HomeBanner) => void;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [index, setIndex] = React.useState(0);
  const count = slides.length;

  React.useEffect(() => {
    setIndex((current) => (current >= count ? 0 : current));
  }, [count]);

  const scrollToIndex = React.useCallback((targetIndex: number, behavior: ScrollBehavior = "smooth") => {
    const track = scrollRef.current?.firstElementChild;
    const slide = track?.children[targetIndex] as HTMLElement | undefined;
    slide?.scrollIntoView({ behavior, inline: "start", block: "nearest" });
  }, []);

  const navigate = React.useCallback(
    (dir: number) => {
      if (count <= 1) return;
      const next = dir > 0 ? (index + 1) % count : (index - 1 + count) % count;
      setIndex(next);
      scrollToIndex(next);
    },
    [count, index, scrollToIndex],
  );

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || count <= 1) return;

    const onScroll = () => {
      const track = el.firstElementChild;
      if (!track) return;

      const scrollLeft = el.scrollLeft;
      let closest = 0;
      let closestDist = Infinity;

      Array.from(track.children).forEach((child, i) => {
        const dist = Math.abs((child as HTMLElement).offsetLeft - scrollLeft);
        if (dist < closestDist) {
          closestDist = dist;
          closest = i;
        }
      });

      setIndex(closest);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [count]);

  React.useEffect(() => {
    if (count <= 1) return;
    const interval = window.setInterval(() => navigate(1), BANNER_ROTATE_MS);
    return () => window.clearInterval(interval);
  }, [count, navigate, index]);

  if (count === 1) {
    const slide = slides[0];
    return (
      <BannerSlide widthClass={MOBILE_BANNER_SLIDE_WIDTH}>
        <BannerEntryCard
          title={slide.copy.title}
          subtitle={slide.copy.subtitle}
          footerText={slide.copy.footerText}
          image={slide.copy.image}
          onOpen={() => onBannerClick(slide.banner)}
        />
      </BannerSlide>
    );
  }

  return (
    <div className="min-w-0 max-w-full overflow-x-hidden">
      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-hidden overscroll-x-contain scrollbar-hide snap-x snap-mandatory"
        style={
          {
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            WebkitOverflowScrolling: "touch",
          } as React.CSSProperties
        }
      >
        <div className="inline-flex items-stretch gap-2 pr-4">
          {slides.map(({ banner, copy }) => (
            <BannerSlide key={banner.id} widthClass={MOBILE_BANNER_SLIDE_WIDTH}>
              <BannerEntryCard
                title={copy.title}
                subtitle={copy.subtitle}
                footerText={copy.footerText}
                image={copy.image}
                onOpen={() => onBannerClick(banner)}
              />
            </BannerSlide>
          ))}
        </div>
      </div>
    </div>
  );
}

function BannerSlide({
  widthClass,
  children,
}: {
  widthClass: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(widthClass, "flex-shrink-0 snap-start")}>
      {children}
    </div>
  );
}

// ── Entry banner (horizontal row) ───────────────────────────
function BannerEntryCard({
  title,
  subtitle,
  footerText,
  image,
  onOpen,
}: {
  title: string;
  subtitle: string;
  footerText: string;
  image: string | null;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-full w-full items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3.5 text-left transition-opacity hover:opacity-95 active:opacity-95 sm:gap-3 sm:p-3.5 sm:shadow-[0_4px_20px_rgba(17,17,17,0.06)] lg:gap-4 lg:p-4"
    >
      <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl bg-white lg:h-16 lg:w-16">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Tag className="h-5 w-5 text-gray-300" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 font-handwriting text-[20px] font-bold leading-none tracking-tight text-gray-900 sm:text-lg lg:text-[22px]">
          {title}
        </p>
        {subtitle ? (
          <p className="mt-0.5 line-clamp-1 text-[15px] font-semibold leading-snug tracking-tight text-gray-900 sm:text-sm lg:text-[15px]">
            {subtitle}
          </p>
        ) : null}
        {footerText ? (
          <p className="mt-0.5 line-clamp-1 text-xs text-gray-500 sm:text-[11px] lg:text-xs">
            {footerText}
          </p>
        ) : null}
      </div>

      <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300 lg:h-5 lg:w-5" aria-hidden="true" />
    </button>
  );
}

// ── Full-screen swipe deck ──────────────────────────────────
function SpecialsSwipe({
  deals,
  accent,
  onClose,
}: {
  deals: Deal[];
  accent: string;
  onClose: () => void;
}) {
  const { addItem, openCart } = useCart();
  const [index, setIndex] = React.useState(0);
  const [saved, setSaved] = React.useState<Deal[]>([]);
  const swipeRef = React.useRef<SwipeCardHandle>(null);

  const finished = index >= deals.length;
  const current = deals[index];

  // Lock background scroll + wire up Escape to close.
  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const handleSwipeComplete = React.useCallback(
    (dir: 1 | -1) => {
      const deal = deals[index];
      if (!deal) return;
      buzz(dir === 1 ? 16 : 9);
      if (dir === 1) {
        setSaved((prev) =>
          prev.some((d) => d.product.id === deal.product.id) ? prev : [...prev, deal],
        );
      }
      setIndex((i) => i + 1);
    },
    [deals, index],
  );

  const requestSwipe = React.useCallback((dir: 1 | -1) => {
    swipeRef.current?.flyOut(dir);
  }, []);

  // Deck complete — add liked items to cart, then close.
  React.useEffect(() => {
    if (!finished) return;
    if (saved.length > 0) {
      for (const deal of saved) {
        addItem(toCartItem(deal));
      }
      openCart();
    }
    onClose();
  }, [finished, saved, addItem, openCart, onClose]);

  return (
    <div className="fixed inset-0 z-[130]" role="dialog" aria-modal="true">
      <style>{SWIPE_CARD_CSS}</style>
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />

      {/* Panel — full screen on mobile, centred sheet on desktop */}
      <motion.div
        className="absolute inset-0 flex flex-col overflow-hidden bg-[#141414] text-white sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[min(760px,92vh)] sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:shadow-2xl"
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sheet handle */}
        <div className="flex flex-shrink-0 justify-center pt-[max(10px,env(safe-area-inset-top))]">
          <div className="h-1 w-10 rounded-full bg-white/25" aria-hidden />
        </div>

        {/* Header */}
        <div className="relative flex-shrink-0 px-5 pb-4 pt-1">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute left-5 top-1 grid h-10 w-10 place-items-center rounded-full bg-[#2a2a2a] text-white/90 transition-colors active:bg-[#333333]"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="px-12 pt-7 text-center">
            <h2 className="text-xl font-bold tracking-tight text-white">Curated picks for you</h2>
            <p className="mt-1 text-sm text-white/50">Swipe to explore</p>
          </div>
        </div>

        {/* Deck */}
        <div className="relative min-h-0 flex-1 px-5">
          {!finished && (
            <div className="relative mx-auto h-full w-full max-w-[340px]">
              {deals[index + 1] && (
                <DeckShadowCard deal={deals[index + 1]} accent={accent} />
              )}
              {current && (
                <SwipeCard
                  ref={swipeRef}
                  key={current.product.id}
                  deal={current}
                  accent={accent}
                  onSwipeComplete={handleSwipeComplete}
                  onLike={() => requestSwipe(1)}
                />
              )}
            </div>
          )}
        </div>

        {/* Skip / like */}
        {!finished && (
          <div className="flex flex-shrink-0 items-center justify-center gap-10 px-6 pb-[max(28px,env(safe-area-inset-bottom))] pt-5">
            <button
              type="button"
              onClick={() => requestSwipe(-1)}
              aria-label="Skip"
              className="grid h-16 w-16 place-items-center rounded-full bg-[#2a2a2a] text-white shadow-lg transition-transform active:scale-95"
            >
              <X className="h-7 w-7" />
            </button>
            <button
              type="button"
              onClick={() => requestSwipe(1)}
              aria-label="Save deal"
              className="grid h-16 w-16 place-items-center rounded-full bg-[#2a2a2a] text-white shadow-lg transition-transform active:scale-95"
            >
              <Heart className="h-7 w-7" />
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ── Native CSS swipe card (GPU transform + pointer events) ───
type SwipeCardHandle = { flyOut: (dir: 1 | -1) => void };

const SwipeCard = React.forwardRef<
  SwipeCardHandle,
  {
    deal: Deal;
    accent: string;
    onSwipeComplete: (dir: 1 | -1) => void;
    onLike: () => void;
  }
>(function SwipeCard({ deal, accent, onSwipeComplete, onLike }, ref) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    offsetX: 0,
    lastX: 0,
    lastTime: 0,
    velocityX: 0,
  });
  const exitingRef = React.useRef(false);
  const [imageIndex, setImageIndex] = React.useState(0);

  const { product, price, image } = deal;
  const gallery = React.useMemo(() => dealImages(product, image), [product, image]);
  const activeImage = gallery[imageIndex] ?? image;
  const { title, brand, subtitle } = dealCopy(product);

  React.useEffect(() => {
    setImageIndex(0);
  }, [deal.product.id]);

  const applyOffset = React.useCallback((x: number, animate: boolean) => {
    const card = cardRef.current;
    if (!card) return;
    card.style.transition = animate ? SWIPE_TRANSITION : "none";
    card.style.transform = cardTransform(x);
  }, []);

  const clearEnterAnimation = React.useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    card.classList.remove("weekly-specials-card-enter");
    card.style.animation = "none";
  }, []);

  const flyOut = React.useCallback(
    (dir: 1 | -1) => {
      if (exitingRef.current) return;
      exitingRef.current = true;
      const card = cardRef.current;
      if (!card) {
        onSwipeComplete(dir);
        return;
      }

      clearEnterAnimation();
      dragRef.current.active = false;

      const targetX = dir * SWIPE_FLY_DISTANCE;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        card.removeEventListener("transitionend", onTransitionEnd);
        onSwipeComplete(dir);
      };

      const onTransitionEnd = (event: TransitionEvent) => {
        if (event.target !== card || event.propertyName !== "transform") return;
        finish();
      };

      // Force reflow so the browser picks up the new transition from the current drag offset.
      applyOffset(dragRef.current.offsetX, false);
      void card.offsetWidth;
      applyOffset(targetX, true);
      card.style.opacity = "0";
      card.addEventListener("transitionend", onTransitionEnd);
      window.setTimeout(finish, 450);
    },
    [applyOffset, clearEnterAnimation, onSwipeComplete],
  );

  React.useImperativeHandle(ref, () => ({ flyOut }), [flyOut]);

  // Fresh enter animation whenever the deal changes.
  React.useEffect(() => {
    exitingRef.current = false;
    const card = cardRef.current;
    if (!card) return;

    card.style.opacity = "1";
    card.style.transition = "none";
    card.style.transform = cardTransform(0);
    card.style.animation = "";
    card.classList.remove("weekly-specials-card-enter");

    const onAnimEnd = () => {
      card.classList.remove("weekly-specials-card-enter");
      card.style.animation = "";
    };

    requestAnimationFrame(() => {
      card.classList.remove("weekly-specials-card-enter");
      void card.offsetWidth;
      card.classList.add("weekly-specials-card-enter");
      card.addEventListener("animationend", onAnimEnd, { once: true });
    });

    return () => {
      card.removeEventListener("animationend", onAnimEnd);
    };
  }, [deal.product.id]);

  const finishDrag = React.useCallback(() => {
    const drag = dragRef.current;
    if (!drag.active || exitingRef.current) return;

    drag.active = false;
    const card = cardRef.current;
    if (card && drag.pointerId >= 0) {
      try {
        card.releasePointerCapture(drag.pointerId);
      } catch {
        /* pointer may already be released */
      }
    }
    cardRef.current?.classList.remove("is-dragging");

    const { offsetX, velocityX } = drag;
    if (offsetX > SWIPE_THRESHOLD || velocityX > SWIPE_VELOCITY) {
      flyOut(1);
      return;
    }
    if (offsetX < -SWIPE_THRESHOLD || velocityX < -SWIPE_VELOCITY) {
      flyOut(-1);
      return;
    }
    applyOffset(0, true);
  }, [applyOffset, flyOut]);

  const beginDrag = React.useCallback(
    (clientX: number, pointerId: number) => {
      if (exitingRef.current) return;
      clearEnterAnimation();

      const drag = dragRef.current;
      drag.active = true;
      drag.pointerId = pointerId;
      drag.startX = clientX;
      drag.offsetX = 0;
      drag.lastX = clientX;
      drag.lastTime = performance.now();
      drag.velocityX = 0;

      applyOffset(0, false);
      cardRef.current?.classList.add("is-dragging");
    },
    [applyOffset, clearEnterAnimation],
  );

  const moveDrag = React.useCallback(
    (clientX: number) => {
      const drag = dragRef.current;
      if (!drag.active || exitingRef.current) return;

      const now = performance.now();
      const dt = Math.max(now - drag.lastTime, 1);
      const nextX = clientX - drag.startX;
      drag.velocityX = (clientX - drag.lastX) / dt;
      drag.lastX = clientX;
      drag.lastTime = now;
      drag.offsetX = nextX;

      applyOffset(nextX, false);
    },
    [applyOffset],
  );

  const onPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (exitingRef.current) return;
      if ((event.target as HTMLElement).closest("button,a")) return;

      event.currentTarget.setPointerCapture(event.pointerId);
      beginDrag(event.clientX, event.pointerId);
    },
    [beginDrag],
  );

  const onPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag.active || event.pointerId !== drag.pointerId) return;
      moveDrag(event.clientX);
    },
    [moveDrag],
  );

  const onPointerEnd = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag.active || event.pointerId !== drag.pointerId) return;
      finishDrag();
    },
    [finishDrag],
  );

  return (
    <div
      ref={cardRef}
      className="weekly-specials-card absolute inset-0 z-10 flex cursor-grab flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_12px_48px_rgba(0,0,0,0.35)]"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      {/* Image area */}
      <div className="relative min-h-0 flex-1 bg-white px-4 pt-4">
        <span className="absolute left-6 top-6 z-10 rounded-full bg-red-500 px-2.5 py-1 text-xs font-bold text-white shadow-sm">
          -{price.percentOff}%
        </span>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onLike();
          }}
          aria-label="Save deal"
          className="absolute right-5 top-5 z-10 grid h-9 w-9 place-items-center rounded-full bg-white text-gray-700 shadow-md transition-transform active:scale-95"
        >
          <Heart className="h-4 w-4" />
        </button>

        <div className="flex h-full min-h-[220px] items-center justify-center pb-2 pt-8">
          {activeImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={activeImage}
              alt={title}
              className="pointer-events-none max-h-full w-full object-contain"
              draggable={false}
            />
          ) : (
            <ShoppingBag className="h-12 w-12 text-gray-300" />
          )}
        </div>

        {gallery.length > 1 && (
          <div className="flex justify-center gap-1.5 pb-3 pt-1">
            {gallery.map((_, i) => (
              <button
                key={i}
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setImageIndex(i);
                }}
                aria-label={`Image ${i + 1}`}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === imageIndex ? "w-4 bg-gray-800" : "w-1.5 bg-gray-300",
                )}
              />
            ))}
          </div>
        )}
      </div>

      {/* Details */}
      <div className="flex-shrink-0 px-5 pb-5 pt-1">
        {brand && (
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{brand}</p>
        )}
        <h3 className="mt-0.5 line-clamp-2 text-lg font-bold leading-snug text-gray-900">{title}</h3>
        {subtitle && (
          <p className="mt-0.5 line-clamp-1 text-sm text-gray-500">{subtitle}</p>
        )}

        <div className="mt-4 flex items-end justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="text-2xl font-bold leading-none text-red-500">
              {formatPriceAUDFull(price.now)}
            </span>
            <span className="text-sm text-gray-400 line-through">
              {formatPriceAUDFull(price.was)}
            </span>
          </div>
          <span
            className="flex-shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold text-gray-900"
            style={{ backgroundColor: accent }}
          >
            Save {formatPriceAUD(price.save)}
          </span>
        </div>
      </div>
    </div>
  );
});

// ── Next card peeking behind the active card ────────────────
function DeckShadowCard({ deal, accent }: { deal: Deal; accent: string }) {
  const { title, brand } = dealCopy(deal.product);

  return (
    <div
      className="absolute inset-0 overflow-hidden rounded-[28px] bg-white shadow-[0_8px_32px_rgba(0,0,0,0.2)]"
      style={{
        zIndex: 1,
        transform: "translateX(14px) rotate(2deg) scale(0.96)",
        opacity: 0.92,
      }}
      aria-hidden
    >
      <div className="flex h-[58%] items-center justify-center bg-white px-6 pt-8">
        {deal.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={deal.image}
            alt=""
            className="max-h-full w-full object-contain opacity-80"
          />
        ) : (
          <div className="h-full w-full bg-gray-50" />
        )}
      </div>
      <div className="px-5 pb-5 pt-3">
        {brand && (
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-300">{brand}</p>
        )}
        <p className="mt-1 line-clamp-1 text-base font-bold text-gray-300">{title}</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-lg font-bold text-red-300">
            {formatPriceAUDFull(deal.price.now)}
          </span>
          <span
            className="rounded-lg px-2 py-1 text-[10px] font-bold text-gray-900 opacity-60"
            style={{ backgroundColor: accent }}
          >
            Save {formatPriceAUD(deal.price.save)}
          </span>
        </div>
      </div>
    </div>
  );
}
