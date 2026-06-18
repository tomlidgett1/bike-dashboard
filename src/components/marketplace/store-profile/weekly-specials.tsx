"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  ShoppingBag,
  Tag,
  ThumbsDown,
  ThumbsUp,
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
// Weekly Specials — a mobile-only "swipe the sale" experience.
//
// Renders a tappable entry card on the store homepage. Tapping it opens a
// full-screen, Tinder-style swipe deck of every product that is currently on
// sale, with a bold was → now price reveal on each card. Swipe right to save a
// deal, left to skip; saved deals are summarised at the end with quick add-to-
// cart / view actions.
//
// Desktop is intentionally untouched for now (everything here is `sm:hidden`).
// ============================================================

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

function stampOpacity(x: number, side: "save" | "skip"): number {
  if (side === "save") return Math.min(1, Math.max(0, (x - 30) / 100));
  return Math.min(1, Math.max(0, (-x - 30) / 100));
}

function cardTransform(x: number): string {
  return `translate3d(${x}px, 0, 0) rotate(${rotateForOffset(x)}deg)`;
}

const SWIPE_CARD_CSS = `
@keyframes weekly-specials-card-enter {
  from {
    opacity: 0;
    transform: translate3d(0, 14px, 0) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
}
.weekly-specials-card {
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  backface-visibility: hidden;
  transform: translate3d(0, 0, 0);
  will-change: transform, opacity;
}
.weekly-specials-card-enter {
  animation: weekly-specials-card-enter 0.38s cubic-bezier(0.22, 1, 0.36, 1) both;
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

// ── Public entry point ──────────────────────────────────────
export function WeeklySpecials({
  store,
  accent,
  contentShell,
}: {
  store: StoreProfile;
  accent: string;
  contentShell: string;
}) {
  const deals = React.useMemo(() => {
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
  }, [store.categories]);

  const [open, setOpen] = React.useState(false);

  if (deals.length === 0) return null;

  return (
    <>
      <section className={cn(contentShell, "mt-4 sm:hidden")}>
        <SpecialsEntryCard
          deals={deals}
          onOpen={() => setOpen(true)}
        />
      </section>

      <AnimatePresence>
        {open && (
          <SpecialsSwipe
            deals={deals}
            accent={accent}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ── Entry card (homepage banner) ────────────────────────────
function SpecialsEntryCard({
  deals,
  onOpen,
}: {
  deals: Deal[];
  onOpen: () => void;
}) {
  const preview = deals[0];
  const topPct = Math.max(...deals.map((d) => d.price.percentOff));

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-[0_4px_20px_rgba(17,17,17,0.06)] transition-opacity active:opacity-90"
    >
      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-gray-50 ring-1 ring-black/[0.04]">
        {preview?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview.image}
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
        <p className="font-handwriting text-[22px] font-bold leading-none tracking-tight text-gray-900">
          Weekly specials
        </p>
        <p className="mt-0.5 text-[17px] font-semibold leading-snug tracking-tight text-gray-900">
          {deals.length} deal{deals.length === 1 ? "" : "s"} · up to {topPct}% off
        </p>
        <p className="mt-0.5 text-[13px] text-gray-500">Changes weekly</p>
      </div>

      <ChevronRight className="h-5 w-5 flex-shrink-0 text-gray-300" aria-hidden="true" />
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
    <div className="fixed inset-0 z-[130] sm:hidden" role="dialog" aria-modal="true">
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

      {/* Panel — funky dark deck so the white cards pop */}
      <motion.div
        className="absolute inset-0 flex flex-col overflow-hidden text-white"
        style={{
          background:
            "radial-gradient(120% 80% at 50% 0%, #1c1c22 0%, #121214 55%, #0b0b0d 100%)",
        }}
        initial={{ y: 24, scale: 0.96, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 24, scale: 0.97, opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Title */}
        <div className="flex-shrink-0 px-5 pb-2 pt-[max(16px,env(safe-area-inset-top))] text-center">
          <h2 className="text-lg font-bold tracking-tight text-white">Weekly specials</h2>
        </div>

        {/* Deck */}
        <div className="relative flex-1 px-5 py-3">
          {!finished && (
            <div className="relative mx-auto h-full w-full max-w-sm">
              {deals[index + 2] && (
                <DeckShadowCard image={deals[index + 2].image} depth={2} />
              )}
              {deals[index + 1] && (
                <DeckShadowCard image={deals[index + 1].image} depth={1} />
              )}
              {current && (
                <SwipeCard
                  ref={swipeRef}
                  key={current.product.id}
                  deal={current}
                  accent={accent}
                  onSwipeComplete={handleSwipeComplete}
                />
              )}
            </div>
          )}
        </div>

        {/* Thumbs */}
        {!finished && (
          <div className="flex flex-shrink-0 items-center justify-center gap-12 px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-2">
            <button
              type="button"
              onClick={() => requestSwipe(-1)}
              aria-label="Skip"
              className="grid h-14 w-14 place-items-center rounded-full border border-white/15 bg-white/10 text-white transition-transform active:scale-90"
            >
              <ThumbsDown className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={() => requestSwipe(1)}
              aria-label="Like"
              className="grid h-14 w-14 place-items-center rounded-full border border-white/15 bg-white/10 text-white transition-transform active:scale-90"
            >
              <ThumbsUp className="h-6 w-6" />
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
  }
>(function SwipeCard({ deal, accent, onSwipeComplete }, ref) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const likeRef = React.useRef<HTMLDivElement>(null);
  const skipRef = React.useRef<HTMLDivElement>(null);
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

  const { product, price, image } = deal;
  const title = product.display_name || product.description;
  const subtitle = product.brand || product.marketplace_category || null;

  const applyOffset = React.useCallback((x: number, animate: boolean) => {
    const card = cardRef.current;
    if (!card) return;
    card.style.transition = animate ? SWIPE_TRANSITION : "none";
    card.style.transform = cardTransform(x);
    if (likeRef.current) likeRef.current.style.opacity = String(stampOpacity(x, "save"));
    if (skipRef.current) skipRef.current.style.opacity = String(stampOpacity(x, "skip"));
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

      const targetX = dir * SWIPE_FLY_DISTANCE;
      applyOffset(targetX, true);
      card.style.opacity = "0";

      const onDone = (event: TransitionEvent) => {
        if (event.propertyName !== "transform") return;
        card.removeEventListener("transitionend", onDone);
        window.clearTimeout(fallback);
        onSwipeComplete(dir);
      };
      card.addEventListener("transitionend", onDone);
      const fallback = window.setTimeout(() => {
        card.removeEventListener("transitionend", onDone);
        onSwipeComplete(dir);
      }, 400);
    },
    [applyOffset, onSwipeComplete],
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
    if (likeRef.current) likeRef.current.style.opacity = "0";
    if (skipRef.current) skipRef.current.style.opacity = "0";

    requestAnimationFrame(() => {
      card.classList.remove("weekly-specials-card-enter");
      // Force reflow so the animation can replay on the next card.
      void card.offsetWidth;
      card.classList.add("weekly-specials-card-enter");
    });
  }, [deal.product.id]);

  const finishDrag = React.useCallback(() => {
    const drag = dragRef.current;
    if (!drag.active || exitingRef.current) return;

    drag.active = false;
    const card = cardRef.current;
    card?.releasePointerCapture(drag.pointerId);

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

  const onPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (exitingRef.current) return;
      // Let buttons/links handle their own taps.
      if ((event.target as HTMLElement).closest("button,a")) return;

      const drag = dragRef.current;
      drag.active = true;
      drag.pointerId = event.pointerId;
      drag.startX = event.clientX;
      drag.offsetX = 0;
      drag.lastX = event.clientX;
      drag.lastTime = performance.now();
      drag.velocityX = 0;

      event.currentTarget.setPointerCapture(event.pointerId);
      applyOffset(0, false);
      cardRef.current?.classList.add("is-dragging");
    },
    [applyOffset],
  );

  const onPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag.active || event.pointerId !== drag.pointerId) return;

      const now = performance.now();
      const dt = Math.max(now - drag.lastTime, 1);
      const nextX = event.clientX - drag.startX;
      drag.velocityX = (event.clientX - drag.lastX) / dt;
      drag.lastX = event.clientX;
      drag.lastTime = now;
      drag.offsetX = nextX;

      applyOffset(nextX, false);
    },
    [applyOffset],
  );

  const onPointerEnd = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag.active || event.pointerId !== drag.pointerId) return;
      cardRef.current?.classList.remove("is-dragging");
      finishDrag();
    },
    [finishDrag],
  );

  return (
    <div
      ref={cardRef}
      className="weekly-specials-card absolute inset-0 z-10 flex cursor-grab flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        {/* Product image */}
        <div className="relative flex-1 bg-white">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={title}
              className="pointer-events-none absolute inset-0 h-full w-full object-contain p-5"
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-gray-50 text-gray-300">
              <ShoppingBag className="h-12 w-12" />
            </div>
          )}

          {/* funky % off disc */}
          <div className="pointer-events-none absolute left-4 top-4 grid h-16 w-16 -rotate-12 place-items-center rounded-full bg-red-600 text-white shadow-lg">
            <div className="text-center leading-none">
              <div className="text-lg font-extrabold">-{price.percentOff}%</div>
              <div className="text-[9px] font-bold uppercase tracking-wider opacity-90">off</div>
            </div>
          </div>

          {/* drag stamps — opacity driven by native transform offset */}
          <div
            ref={likeRef}
            className="pointer-events-none absolute right-4 top-5 rotate-12 rounded-md border-[3px] border-emerald-500 px-3 py-1 text-xl font-extrabold uppercase tracking-wider text-emerald-500 opacity-0"
            style={{ transition: "opacity 0.12s linear" }}
          >
            Save
          </div>
          <div
            ref={skipRef}
            className="pointer-events-none absolute left-4 top-5 -rotate-12 rounded-md border-[3px] border-rose-500 px-3 py-1 text-xl font-extrabold uppercase tracking-wider text-rose-500 opacity-0"
            style={{ transition: "opacity 0.12s linear" }}
          >
            Skip
          </div>
        </div>

        {/* Info + was/now pricing */}
        <div className="flex-shrink-0 border-t border-gray-100 p-5">
          {subtitle && (
            <p className="mb-1 truncate text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              {subtitle}
            </p>
          )}
          <h3 className="line-clamp-2 text-lg font-bold leading-snug text-gray-900">{title}</h3>

          <div className="mt-3 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Was
                </span>
                <span className="text-sm font-medium text-gray-400 line-through">
                  {formatPriceAUDFull(price.was)}
                </span>
              </div>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wide text-red-500">
                  Now
                </span>
                <span className="text-3xl font-extrabold leading-none text-red-600">
                  {formatPriceAUDFull(price.now)}
                </span>
              </div>
            </div>
            <span
              className="flex-shrink-0 rounded-md px-2.5 py-1.5 text-center text-xs font-bold leading-tight text-gray-900"
              style={{ backgroundColor: accent }}
            >
              Save
              <br />
              {formatPriceAUD(price.save)}
            </span>
          </div>
        </div>
      </div>
  );
});

// ── Static depth card shown behind the active card ──────────
function DeckShadowCard({ image, depth }: { image: string | null; depth: 1 | 2 }) {
  return (
    <div
      className="absolute inset-0 overflow-hidden rounded-3xl bg-white shadow-xl"
      style={{
        zIndex: 1,
        transform: `translateY(${depth * 12}px) scale(${1 - depth * 0.05})`,
        opacity: depth === 1 ? 0.9 : 0.7,
      }}
      aria-hidden
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-full w-full object-contain p-5 opacity-90" />
      ) : (
        <div className="h-full w-full bg-gray-50" />
      )}
    </div>
  );
}
