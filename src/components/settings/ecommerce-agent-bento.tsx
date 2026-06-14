"use client";

import * as React from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, ChevronDown, Loader2, Package, Sparkles, TrendingDown } from "lucide-react";
import {
  getBentoShellStyles,
  bentoOuterWrapClassName,
  bentoWideCardShellClassName,
  type BentoShellVariant,
} from "@/components/settings/bento-variant-styles";
import {
  BentoInboxDismissButton,
  BentoInboxEmptyState,
  BentoInboxPrimaryButton,
  useDismissibleIds,
} from "@/components/settings/bento-inbox-item-actions";
import { cn } from "@/lib/utils";

const MOCK_SLOW_MOVERS = [
  {
    id: "1",
    name: "Orbea Alma M30 29\"",
    sku: "ORB-ALMA-M30-23",
    category: "Mountain · Hardtail",
    daysSinceSale: 168,
    stock: 4,
    price: 2499,
    suggestedDiscount: 20,
    lastSoldLabel: "Oct 2025",
    insight: "Same spec still selling online — a timed sale usually clears one unit per fortnight.",
  },
  {
    id: "2",
    name: "Giro Fixture MIPS Helmet",
    sku: "GIR-FIX-MIPS-XL",
    category: "Helmets · Road & MTB",
    daysSinceSale: 94,
    stock: 22,
    price: 89,
    suggestedDiscount: 30,
    lastSoldLabel: "Mar 2026",
    insight: "XL runs slow in-store; bundle with a fitting or match competitor helmet promos.",
  },
  {
    id: "3",
    name: "Shimano CN-HG701 Chain 116L",
    sku: "SHI-HG701-116",
    category: "Drivetrain · Chains",
    daysSinceSale: 201,
    stock: 45,
    price: 42,
    suggestedDiscount: 15,
    lastSoldLabel: "Nov 2025",
    insight: "High unit count — consider a service-package add-on rather than a straight markdown.",
  },
  {
    id: "4",
    name: "Specialized Body Geometry Saddle",
    sku: "SPE-BG-SADDLE-143",
    category: "Components · Saddles",
    daysSinceSale: 127,
    stock: 11,
    price: 129,
    suggestedDiscount: 25,
    lastSoldLabel: "Jan 2026",
    insight: "Fit-dependent SKU — demo days and comfort guarantees outperform blanket discounts.",
  },
  {
    id: "5",
    name: "Continental GP5000 28c (Pair)",
    sku: "CON-GP5K-28-PAIR",
    category: "Tyres · Road",
    daysSinceSale: 86,
    stock: 19,
    price: 149,
    suggestedDiscount: 20,
    lastSoldLabel: "Mar 2026",
    insight: "Seasonal dip — pair with tube + install to move volume without eroding margin.",
  },
] as const;

type SlowMover = (typeof MOCK_SLOW_MOVERS)[number];

type EcommerceAgentBentoVariant = BentoShellVariant;

const SLIDE_TRANSITION = { duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] as const };

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

function idleSeverity(days: number): "high" | "medium" {
  return days >= 120 ? "high" : "medium";
}

function SummaryStrip({ products }: { products: SlowMover[] }) {
  const totalUnits = products.reduce((sum, product) => sum + product.stock, 0);
  const avgDays = Math.round(
    products.reduce((sum, product) => sum + product.daysSinceSale, 0) / Math.max(products.length, 1),
  );
  const tiedUp = products.reduce((sum, product) => sum + product.stock * product.price, 0);

  return (
    <div className="mb-3 grid grid-cols-3 gap-2">
      {[
        { label: "Slow movers", value: String(products.length) },
        { label: "Units on hand", value: String(totalUnits) },
        { label: "Stock value", value: formatCurrency(tiedUp) },
      ].map((stat) => (
        <div
          key={stat.label}
          className="rounded-md border border-black/[0.06] bg-white px-2.5 py-2 shadow-sm"
        >
          <p className="text-[10px] font-medium text-gray-400">{stat.label}</p>
          <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-gray-900">{stat.value}</p>
        </div>
      ))}
      <p className="col-span-3 text-[10px] text-gray-500">
        Average idle time: {avgDays} days · Markdowns are conservative estimates
      </p>
    </div>
  );
}

function AgentInsightBanner() {
  return (
    <div className="mb-3 rounded-md border border-black/[0.06] bg-white px-3 py-2.5 shadow-sm">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#fafaf9] ring-1 ring-black/[0.06]">
          <Sparkles className="h-3.5 w-3.5 text-gray-600" />
        </span>
        <p className="text-[11px] leading-relaxed text-gray-600">
          These SKUs have not sold in 90+ days while holding above-average stock. Suggested discounts
          prioritise clearing aged inventory without racing to the bottom.
        </p>
      </div>
    </div>
  );
}

const DROPDOWN_TRANSITION = { duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] as const };

function DiscountOnlineDropdown({
  disabled,
  applying,
  label = "Discount online",
  fullWidth = false,
  align = "right",
  onSelect,
}: {
  disabled?: boolean;
  applying?: boolean;
  label?: string;
  fullWidth?: boolean;
  align?: "left" | "right";
  onSelect: (addToSpecialsCarousel: boolean) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function choose(addToSpecialsCarousel: boolean) {
    setOpen(false);
    onSelect(addToSpecialsCarousel);
  }

  return (
    <div ref={containerRef} className={cn("relative", fullWidth && "w-full")}>
      <button
        type="button"
        onClick={() => {
          if (!disabled && !applying) setOpen((current) => !current);
        }}
        disabled={disabled || applying}
        className={cn(
          "inline-flex items-center justify-center gap-1 rounded-md border border-gray-200 bg-white text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40",
          fullWidth ? "w-full px-4 py-2.5 text-[13px] bg-gray-900 text-white border-gray-900 hover:bg-gray-800 hover:opacity-90" : "px-2.5 py-1.5",
        )}
      >
        {applying ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Applying…
          </>
        ) : (
          <>
            {!fullWidth ? null : <TrendingDown className="h-3.5 w-3.5" />}
            {label}
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-200",
                fullWidth ? "text-white/80" : "text-gray-400",
                open && "rotate-180",
              )}
            />
          </>
        )}
      </button>

      <AnimatePresence>
        {open && !applying ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={DROPDOWN_TRANSITION}
            className={cn(
              "absolute top-full z-30 mt-1 overflow-hidden rounded-md border border-gray-200 bg-white shadow-md",
              fullWidth ? "left-0 right-0" : "w-[210px]",
              align === "right" ? "right-0" : "left-0",
            )}
          >
            <div className="py-1">
              <button
                type="button"
                onClick={() => choose(true)}
                className="flex w-full flex-col items-start px-3 py-2 text-left transition-colors hover:bg-gray-50"
              >
                <span className="text-[12px] font-medium text-gray-800">Add to specials carousel</span>
                <span className="mt-0.5 text-[10px] text-gray-500">Discount online + homepage carousel</span>
              </button>
              <button
                type="button"
                onClick={() => choose(false)}
                className="flex w-full flex-col items-start px-3 py-2 text-left transition-colors hover:bg-gray-50"
              >
                <span className="text-[12px] font-medium text-gray-800">Discount only</span>
                <span className="mt-0.5 text-[10px] text-gray-500">Update online price, skip carousel</span>
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

type ProductActionState = {
  discountedOnline: boolean;
  inSpecialsCarousel: boolean;
  appliedDiscount: number;
};

function SlowMoverRow({
  product,
  listItemBorder,
  actionState,
  onReview,
  onDiscountOnline,
  onDismiss,
  ignoring,
  applying,
}: {
  product: SlowMover;
  listItemBorder: string;
  actionState?: ProductActionState;
  onReview: (product: SlowMover) => void;
  onDiscountOnline: (product: SlowMover, addToSpecialsCarousel: boolean) => void;
  onDismiss: (product: SlowMover) => void;
  ignoring?: boolean;
  applying?: boolean;
}) {
  const severity = idleSeverity(product.daysSinceSale);
  const salePrice = Math.round(product.price * (1 - product.suggestedDiscount / 100));

  return (
    <div
      className={cn(
        "group relative grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[18px] border bg-white p-3 shadow-sm sm:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,0.55fr))_auto] sm:gap-x-4",
        listItemBorder,
        ignoring && "pointer-events-none opacity-40",
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#faf7f2] ring-1 ring-black/[0.06]">
          <Package className="h-3.5 w-3.5 text-gray-500" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-gray-900">{product.name}</p>
          <p className="mt-0.5 truncate text-[11px] text-gray-500">
            {product.sku} · {product.category}
          </p>
          {actionState?.discountedOnline ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
                Live online · −{actionState.appliedDiscount}%
              </span>
              {actionState.inSpecialsCarousel ? (
                <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
                  Specials carousel
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:hidden">
            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
              {product.daysSinceSale}d idle
            </span>
            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
              {product.stock} in stock
            </span>
            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-800">
              −{product.suggestedDiscount}%
            </span>
          </div>
        </div>
      </div>

      <div className="hidden min-w-0 sm:block">
        <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Last sold</p>
        <p
          className={cn(
            "mt-0.5 text-[12px] font-medium tabular-nums",
            severity === "high" ? "text-gray-900" : "text-gray-700",
          )}
        >
          {product.daysSinceSale} days
        </p>
        <p className="text-[10px] text-gray-400">{product.lastSoldLabel}</p>
      </div>

      <div className="hidden min-w-0 sm:block">
        <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Stock</p>
        <p className="mt-0.5 text-[12px] font-semibold tabular-nums text-gray-900">{product.stock}</p>
        <p className="text-[10px] text-gray-400">units</p>
      </div>

      <div className="hidden min-w-0 sm:block">
        <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Suggested</p>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-[11px] text-gray-400 line-through">{formatCurrency(product.price)}</span>
          <span className="text-[12px] font-semibold tabular-nums text-gray-900">
            {formatCurrency(salePrice)}
          </span>
        </div>
        <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
          <TrendingDown className="h-3 w-3" />
          {product.suggestedDiscount}% off
        </span>
      </div>

      <div className="col-span-2 flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:col-span-1">
        {!actionState?.discountedOnline ? (
          <DiscountOnlineDropdown
            applying={applying}
            disabled={ignoring}
            onSelect={(addToSpecialsCarousel) => onDiscountOnline(product, addToSpecialsCarousel)}
          />
        ) : null}
        <BentoInboxPrimaryButton
          label="Review"
          onClick={() => onReview(product)}
          ignoring={ignoring || applying}
        />
      </div>

      <BentoInboxDismissButton onDismiss={() => onDismiss(product)} ignoring={ignoring} />
    </div>
  );
}

function ReviewFace({
  product,
  listItemBorder,
  actionState,
  onBack,
  onApply,
  applying,
}: {
  product: SlowMover;
  listItemBorder: string;
  actionState?: ProductActionState;
  onBack: () => void;
  onApply: (args: { discountPercent: number; addToSpecialsCarousel: boolean }) => Promise<void>;
  applying: boolean;
}) {
  const [discountPercent, setDiscountPercent] = React.useState(
    actionState?.appliedDiscount ?? product.suggestedDiscount,
  );
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    setDiscountPercent(actionState?.appliedDiscount ?? product.suggestedDiscount);
    setSuccessMessage(null);
  }, [product.id, actionState?.appliedDiscount, product.suggestedDiscount]);

  const salePrice = Math.round(product.price * (1 - discountPercent / 100));
  const alreadyLive = actionState?.discountedOnline ?? false;

  async function handleApply(addToSpecialsCarousel: boolean) {
    setSuccessMessage(null);
    await onApply({ discountPercent, addToSpecialsCarousel });
    setSuccessMessage(
      addToSpecialsCarousel
        ? `Discount is live online and added to the specials carousel.`
        : `Discount is live on your online store.`,
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={applying}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
          aria-label="Back to slow movers"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-gray-900">{product.name}</p>
          <p className="truncate text-[11px] text-gray-500">{product.sku}</p>
        </div>
        <Sparkles className="h-4 w-4 shrink-0 text-gray-500" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18, duration: 0.35, ease: [0.04, 0.62, 0.23, 0.98] }}
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] border bg-white shadow-sm",
          listItemBorder,
        )}
      >
        <div className="grid shrink-0 grid-cols-2 gap-px border-b border-gray-100 bg-gray-100 sm:grid-cols-4">
          {[
            { label: "Idle", value: `${product.daysSinceSale} days` },
            { label: "Stock", value: `${product.stock} units` },
            { label: "Was", value: formatCurrency(product.price) },
            { label: "Proposed", value: formatCurrency(salePrice) },
          ].map((cell) => (
            <div key={cell.label} className="bg-white px-3 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{cell.label}</p>
              <p className="mt-0.5 text-[12px] font-semibold text-gray-900">{cell.value}</p>
            </div>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Agent note</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-gray-600">{product.insight}</p>

          <div className="my-3 h-px bg-gray-100" />

          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Online discount</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="number"
                min={5}
                max={60}
                value={discountPercent}
                onChange={(event) => setDiscountPercent(Number(event.target.value) || 0)}
                disabled={applying}
                className="w-full rounded-md border border-gray-200 bg-gray-50/80 px-2.5 py-2 pr-8 text-[12px] font-medium tabular-nums text-gray-900 outline-none transition-colors focus:border-gray-300 focus:bg-white disabled:opacity-60"
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">
                %
              </span>
            </div>
            <span className="shrink-0 text-[11px] text-gray-500">
              → {formatCurrency(salePrice)}
            </span>
          </div>

          {alreadyLive ? (
            <div className="mt-3 rounded-md border border-gray-200 bg-white px-3 py-2.5">
              <p className="text-[11px] text-gray-600">
                This SKU already has an online discount
                {actionState?.inSpecialsCarousel ? " and is in the specials carousel" : ""}. Apply
                again to update the price.
              </p>
            </div>
          ) : null}

          {successMessage ? (
            <div className="mt-3 rounded-md border border-gray-200 bg-white px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[11px] font-medium text-gray-800">
                <Check className="h-3.5 w-3.5 shrink-0" />
                {successMessage}
              </p>
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-gray-100 p-3">
          <DiscountOnlineDropdown
            fullWidth
            applying={applying}
            disabled={discountPercent < 5 || discountPercent > 60}
            label={alreadyLive ? "Update discount online" : "Discount online"}
            onSelect={(addToSpecialsCarousel) => void handleApply(addToSpecialsCarousel)}
          />
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Wide Overivewo bento — mock slow-moving stock with suggested clearance pricing.
 */
export function EcommerceAgentBento({
  className,
  variant = "default",
}: {
  className?: string;
  variant?: EcommerceAgentBentoVariant;
}) {
  const shell = getBentoShellStyles(variant);
  const { ignoringId, isDismissed, dismiss } = useDismissibleIds();
  const [showReview, setShowReview] = React.useState(false);
  const [activeProduct, setActiveProduct] = React.useState<SlowMover | null>(null);
  const [applyingId, setApplyingId] = React.useState<string | null>(null);
  const [productActions, setProductActions] = React.useState<Record<string, ProductActionState>>({});

  const panelClassName = cn("flex min-h-0 flex-1 flex-col", shell.panelClassName);
  const panelBg = shell.panelBg;
  const dismissDelayMs = 400;

  const visibleProducts = MOCK_SLOW_MOVERS.filter((product) => !isDismissed(product.id));

  async function applyDiscountOnline(
    product: SlowMover,
    args: { discountPercent: number; addToSpecialsCarousel: boolean },
  ) {
    setApplyingId(product.id);
    await new Promise((resolve) => window.setTimeout(resolve, 900));
    setProductActions((current) => ({
      ...current,
      [product.id]: {
        discountedOnline: true,
        inSpecialsCarousel: args.addToSpecialsCarousel,
        appliedDiscount: args.discountPercent,
      },
    }));
    setApplyingId(null);
  }

  function handleReview(product: SlowMover) {
    setActiveProduct(product);
    setShowReview(true);
  }

  function handleQuickDiscountOnline(product: SlowMover, addToSpecialsCarousel: boolean) {
    void applyDiscountOnline(product, {
      discountPercent: product.suggestedDiscount,
      addToSpecialsCarousel,
    });
  }

  function handleBack() {
    if (applyingId) return;
    setShowReview(false);
    window.setTimeout(() => setActiveProduct(null), dismissDelayMs);
  }

  function handleDismiss(product: SlowMover) {
    if (activeProduct?.id === product.id) handleBack();
    dismiss(product.id);
  }

  async function handleReviewApply(args: { discountPercent: number; addToSpecialsCarousel: boolean }) {
    if (!activeProduct) return;
    await applyDiscountOnline(activeProduct, args);
  }

  const productList = (
    <>
      {visibleProducts.length > 0 ? (
        <>
          <SummaryStrip products={visibleProducts} />
          <AgentInsightBanner />
        </>
      ) : null}
      <ul className="-mx-3 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-0">
        <AnimatePresence initial={false}>
          {visibleProducts.length === 0 ? (
            <motion.li
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
            >
              <BentoInboxEmptyState message="No slow movers flagged" />
            </motion.li>
          ) : (
            visibleProducts.map((product) => (
              <motion.li
                key={product.id}
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.28, ease: [0.04, 0.62, 0.23, 0.98] }}
                className="shrink-0"
              >
                <SlowMoverRow
                  product={product}
                  listItemBorder={shell.listItemBorder}
                  actionState={productActions[product.id]}
                  onReview={handleReview}
                  onDiscountOnline={handleQuickDiscountOnline}
                  onDismiss={handleDismiss}
                  ignoring={ignoringId === product.id}
                  applying={applyingId === product.id}
                />
              </motion.li>
            ))
          )}
        </AnimatePresence>
      </ul>
    </>
  );

  const reviewContent = activeProduct ? (
    <ReviewFace
      product={activeProduct}
      listItemBorder={shell.listItemBorder}
      actionState={productActions[activeProduct.id]}
      onBack={handleBack}
      onApply={handleReviewApply}
      applying={applyingId === activeProduct.id}
    />
  ) : null;

  return (
    <div className={bentoWideCardShellClassName(className)}>
      <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-gray-900">Ecommerce Agent</h2>
          <p className="mt-0.5 text-[11px] text-gray-500">Slow stock · suggested markdowns</p>
        </div>
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-black/[0.06]">
          <Image
            src="/yjsmall.png"
            alt=""
            width={32}
            height={32}
            className="size-[22px] rounded-md object-contain"
            priority
          />
        </span>
      </div>

      <div className={bentoOuterWrapClassName(variant)}>
        <div className={cn("relative flex h-full min-h-0 flex-col", panelClassName)}>
          {productList}
          <AnimatePresence>
            {showReview && activeProduct ? (
              <motion.div
                key={activeProduct.id}
                className={cn("absolute inset-0 z-10 flex min-h-0 flex-col overflow-hidden rounded-[32px]", panelBg)}
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={SLIDE_TRANSITION}
              >
                <div className="flex min-h-0 flex-1 flex-col p-3">{reviewContent}</div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
