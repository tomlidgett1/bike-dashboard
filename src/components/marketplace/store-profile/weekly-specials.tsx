"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  type PanInfo,
  type Variants,
} from "framer-motion";
import {
  ArrowRight,
  ChevronRight,
  Eye,
  Heart,
  ShoppingBag,
  Sparkles,
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
const SWIPE_VELOCITY = 700;

// Exit flings the card off-screen in the swipe direction; rotation is driven by
// the live `x` transform (below), so the card spins naturally as it leaves.
const cardVariants: Variants = {
  enter: { scale: 0.96, y: 14, opacity: 0 },
  center: { scale: 1, y: 0, opacity: 1 },
  exit: (dir: number) => ({
    x: (dir || 1) * 560,
    opacity: 0,
    transition: { duration: 0.3, ease: "easeOut" },
  }),
};

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
  accentText,
  contentShell,
  onBrowseAll,
}: {
  store: StoreProfile;
  accent: string;
  accentText: string;
  contentShell: string;
  /** Navigate to the full products listing (used for "browse all"). */
  onBrowseAll: () => void;
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
      <section className={cn(contentShell, "mt-8 sm:hidden")}>
        <SpecialsEntryCard
          deals={deals}
          accent={accent}
          accentText={accentText}
          onOpen={() => setOpen(true)}
        />
      </section>

      <AnimatePresence>
        {open && (
          <SpecialsSwipe
            deals={deals}
            accent={accent}
            accentText={accentText}
            storeId={store.id}
            onClose={() => setOpen(false)}
            onBrowseAll={() => {
              setOpen(false);
              onBrowseAll();
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ── Entry card (homepage banner) ────────────────────────────
function SpecialsEntryCard({
  deals,
  accent,
  accentText,
  onOpen,
}: {
  deals: Deal[];
  accent: string;
  accentText: string;
  onOpen: () => void;
}) {
  const preview = deals.slice(0, 3);
  const topPct = Math.max(...deals.map((d) => d.price.percentOff));

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative block w-full overflow-hidden rounded-3xl border border-gray-200/80 bg-white p-5 text-left shadow-[0_8px_30px_rgba(17,17,17,0.06)] transition-transform active:scale-[0.99]"
    >
      {/* soft accent glow, kept very subtle */}
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-50 blur-3xl"
        style={{ background: `${accent}55` }}
        aria-hidden
      />

      <div className="relative flex items-stretch gap-4">
        <div className="flex min-w-0 flex-1 flex-col">
          <span
            className="inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wide"
            style={{ backgroundColor: accent, color: accentText }}
          >
            <Tag className="h-3 w-3" />
            Weekly specials
          </span>

          <h2 className="mt-3 text-2xl font-bold leading-tight tracking-tight text-gray-900">
            Swipe the deals
          </h2>
          <p className="mt-1 text-sm leading-snug text-gray-500">
            {deals.length} item{deals.length === 1 ? "" : "s"} on sale this week — up to{" "}
            <span className="font-semibold text-red-600">{topPct}% off</span>. Swipe through
            the markdowns.
          </p>

          <span
            className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition-transform group-active:translate-y-0.5"
            style={{ backgroundColor: accent, color: accentText }}
          >
            <Sparkles className="h-4 w-4" />
            Start swiping
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>

        {/* peeking preview deck — telegraphs the swipe mechanic */}
        <div className="relative h-[120px] w-[96px] flex-shrink-0 self-center">
          {preview.map((deal, i) => {
            const offset = preview.length - 1 - i; // 0 = front
            const rotations = [0, -6, 6];
            const rot = rotations[offset] ?? 0;
            return (
              <div
                key={deal.product.id}
                className="absolute inset-0 overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-md"
                style={{
                  zIndex: 10 - offset,
                  transform: `translateX(${offset * 7}px) translateY(${offset * 4}px) rotate(${rot}deg) scale(${
                    1 - offset * 0.06
                  })`,
                }}
              >
                {deal.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={deal.image}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-full w-full bg-gray-100" />
                )}
                {offset === 0 && (
                  <span className="absolute bottom-1 left-1 rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                    -{deal.price.percentOff}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </button>
  );
}

// ── Full-screen swipe deck ──────────────────────────────────
function SpecialsSwipe({
  deals,
  accent,
  accentText,
  storeId,
  onClose,
  onBrowseAll,
}: {
  deals: Deal[];
  accent: string;
  accentText: string;
  storeId: string;
  onClose: () => void;
  onBrowseAll: () => void;
}) {
  const router = useRouter();
  const { addItem, openCart } = useCart();
  const [index, setIndex] = React.useState(0);
  const [exitDir, setExitDir] = React.useState(0);
  const [saved, setSaved] = React.useState<Deal[]>([]);

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

  const decide = React.useCallback(
    (dir: 1 | -1) => {
      const deal = deals[index];
      if (!deal) return;
      buzz(dir === 1 ? 16 : 9);
      if (dir === 1) {
        setSaved((prev) =>
          prev.some((d) => d.product.id === deal.product.id) ? prev : [...prev, deal],
        );
      }
      setExitDir(dir);
      setIndex((i) => i + 1);
    },
    [deals, index],
  );

  const openProduct = React.useCallback(
    (productId: string) => {
      router.push(`/marketplace/product/${productId}?store=${storeId}`);
    },
    [router, storeId],
  );

  const restart = React.useCallback(() => {
    setSaved([]);
    setExitDir(0);
    setIndex(0);
  }, []);

  const addAllToCart = React.useCallback(() => {
    let added = 0;
    for (const deal of saved) {
      const result = addItem(toCartItem(deal));
      if (result === "added" || result === "exists") added += 1;
    }
    if (added > 0) {
      buzz(20);
      openCart();
      onClose();
    }
  }, [saved, addItem, openCart, onClose]);

  return (
    <div className="fixed inset-0 z-[130] sm:hidden" role="dialog" aria-modal="true">
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
        {/* Header */}
        <div className="flex-shrink-0 px-5 pt-[max(14px,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white/80 transition-colors active:bg-white/20"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Tag className="h-4 w-4" style={{ color: accent }} />
              Weekly specials
            </div>
            <span className="inline-flex h-9 min-w-[2.25rem] items-center justify-center gap-1 rounded-full bg-white/10 px-2.5 text-xs font-semibold text-white/90">
              <Heart className="h-3.5 w-3.5" style={{ color: accent }} />
              {saved.length}
            </span>
          </div>

          {/* Segmented progress */}
          <div className="mt-3 flex gap-1">
            {deals.map((deal, i) => (
              <span
                key={deal.product.id}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors duration-300",
                  i < index ? "" : "bg-white/15",
                )}
                style={i < index ? { backgroundColor: accent } : undefined}
              />
            ))}
          </div>
          <p className="mt-2 text-center text-xs font-medium text-white/45">
            {finished ? `${deals.length} of ${deals.length}` : `${index + 1} of ${deals.length}`}
          </p>
        </div>

        {/* Deck / summary */}
        <div className="relative flex-1 px-5 py-3">
          {finished ? (
            <SpecialsSummary
              deals={deals}
              saved={saved}
              accent={accent}
              accentText={accentText}
              onAddAll={addAllToCart}
              onBrowseAll={onBrowseAll}
              onRestart={restart}
              onView={openProduct}
            />
          ) : (
            <div className="relative mx-auto h-full w-full max-w-sm">
              {/* depth cards behind the active one */}
              {deals[index + 2] && (
                <DeckShadowCard image={deals[index + 2].image} depth={2} />
              )}
              {deals[index + 1] && (
                <DeckShadowCard image={deals[index + 1].image} depth={1} />
              )}
              <AnimatePresence custom={exitDir} mode="popLayout">
                {current && (
                  <SwipeCard
                    key={current.product.id}
                    deal={current}
                    exitDir={exitDir}
                    accent={accent}
                    onDecide={decide}
                    onView={() => openProduct(current.product.id)}
                  />
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Action bar */}
        {!finished && (
          <div className="flex-shrink-0 px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-1">
            <div className="flex items-center justify-center gap-5">
              <button
                type="button"
                onClick={() => decide(-1)}
                aria-label="Skip"
                className="grid h-14 w-14 place-items-center rounded-full border border-white/15 bg-white/5 text-white/80 transition-all active:scale-90"
              >
                <X className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={() => current && openProduct(current.product.id)}
                aria-label="View item"
                className="grid h-12 w-12 place-items-center rounded-full border border-white/15 bg-white/5 text-white/70 transition-all active:scale-90"
              >
                <Eye className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => decide(1)}
                aria-label="Save deal"
                className="grid h-14 w-14 place-items-center rounded-full text-gray-900 shadow-lg transition-all active:scale-90"
                style={{ backgroundColor: accent }}
              >
                <Heart className="h-6 w-6" />
              </button>
            </div>
            <p className="mt-3 text-center text-xs text-white/40">
              Swipe right to save · left to skip
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ── A single draggable deal card ────────────────────────────
function SwipeCard({
  deal,
  exitDir,
  accent,
  onDecide,
  onView,
}: {
  deal: Deal;
  exitDir: number;
  accent: string;
  onDecide: (dir: 1 | -1) => void;
  onView: () => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-220, 0, 220], [-16, 0, 16]);
  const likeOpacity = useTransform(x, [30, 130], [0, 1]);
  const nopeOpacity = useTransform(x, [-130, -30], [1, 0]);

  const { product, price, image } = deal;
  const title = product.display_name || product.description;
  const subtitle = product.brand || product.marketplace_category || null;

  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    if (info.offset.x > SWIPE_THRESHOLD || info.velocity.x > SWIPE_VELOCITY) {
      onDecide(1);
    } else if (info.offset.x < -SWIPE_THRESHOLD || info.velocity.x < -SWIPE_VELOCITY) {
      onDecide(-1);
    }
  };

  return (
    <motion.div
      className="absolute inset-0 z-10 flex cursor-grab flex-col overflow-hidden rounded-3xl bg-white shadow-2xl active:cursor-grabbing"
      style={{ x, rotate }}
      custom={exitDir}
      variants={cardVariants}
      initial="enter"
      animate="center"
      exit="exit"
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.85}
      onDragEnd={handleDragEnd}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
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
        <div className="absolute left-4 top-4 grid h-16 w-16 -rotate-12 place-items-center rounded-full bg-red-600 text-white shadow-lg">
          <div className="text-center leading-none">
            <div className="text-lg font-extrabold">-{price.percentOff}%</div>
            <div className="text-[9px] font-bold uppercase tracking-wider opacity-90">off</div>
          </div>
        </div>

        {/* drag stamps */}
        <motion.div
          style={{ opacity: likeOpacity }}
          className="absolute right-4 top-5 rotate-12 rounded-md border-[3px] border-emerald-500 px-3 py-1 text-xl font-extrabold uppercase tracking-wider text-emerald-500"
        >
          Save
        </motion.div>
        <motion.div
          style={{ opacity: nopeOpacity }}
          className="absolute left-4 top-5 -rotate-12 rounded-md border-[3px] border-rose-500 px-3 py-1 text-xl font-extrabold uppercase tracking-wider text-rose-500"
        >
          Skip
        </motion.div>
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

        <button
          type="button"
          onPointerDownCapture={(e) => e.stopPropagation()}
          onClick={onView}
          className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-900 transition-colors active:bg-gray-50"
        >
          <Eye className="h-4 w-4" />
          View item
        </button>
      </div>
    </motion.div>
  );
}

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

// ── End-of-deck summary ─────────────────────────────────────
function SpecialsSummary({
  deals,
  saved,
  accent,
  accentText,
  onAddAll,
  onBrowseAll,
  onRestart,
  onView,
}: {
  deals: Deal[];
  saved: Deal[];
  accent: string;
  accentText: string;
  onAddAll: () => void;
  onBrowseAll: () => void;
  onRestart: () => void;
  onView: (productId: string) => void;
}) {
  const totalSaved = saved.reduce((sum, d) => sum + d.price.save, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto flex h-full w-full max-w-sm flex-col"
    >
      <div className="flex-shrink-0 text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.05 }}
          className="mx-auto grid h-16 w-16 place-items-center rounded-full text-gray-900"
          style={{ backgroundColor: accent }}
        >
          <Sparkles className="h-8 w-8" />
        </motion.div>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-white">
          {saved.length > 0 ? "Your saved deals" : "That's every deal"}
        </h2>
        <p className="mt-1 text-sm text-white/55">
          {saved.length > 0
            ? `${saved.length} saved · ${formatPriceAUD(totalSaved)} in savings`
            : `You've seen all ${deals.length} specials this week.`}
        </p>
      </div>

      {saved.length > 0 ? (
        <div className="mt-5 min-h-0 flex-1 space-y-2.5 overflow-y-auto pb-2">
          {saved.map((deal) => (
            <div
              key={deal.product.id}
              className="flex items-center gap-3 rounded-2xl bg-white/10 p-2.5"
            >
              <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl bg-white">
                {deal.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={deal.image} alt="" className="h-full w-full object-contain p-1" />
                ) : (
                  <div className="h-full w-full bg-gray-100" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">
                  {deal.product.display_name || deal.product.description}
                </p>
                <p className="text-xs">
                  <span className="font-bold text-white">{formatPriceAUDFull(deal.price.now)}</span>{" "}
                  <span className="text-white/40 line-through">
                    {formatPriceAUDFull(deal.price.was)}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => onView(deal.product.id)}
                className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-white/10 text-white/80 transition-colors active:bg-white/20"
                aria-label="View item"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* Actions */}
      <div className="flex-shrink-0 space-y-2.5 pb-[max(8px,env(safe-area-inset-bottom))] pt-3">
        {saved.length > 0 && (
          <button
            type="button"
            onClick={onAddAll}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold shadow-sm transition-transform active:translate-y-0.5"
            style={{ backgroundColor: accent, color: accentText }}
          >
            <ShoppingBag className="h-4 w-4" />
            Add {saved.length} to cart
          </button>
        )}
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onRestart}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-white/15 bg-white/5 py-3 text-sm font-semibold text-white transition-colors active:bg-white/10"
          >
            Start over
          </button>
          <button
            type="button"
            onClick={onBrowseAll}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-white/15 bg-white/5 py-3 text-sm font-semibold text-white transition-colors active:bg-white/10"
          >
            Browse all
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
