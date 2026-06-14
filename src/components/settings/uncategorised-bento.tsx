"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, ChevronDown } from "lucide-react";
import { LightspeedLogo } from "@/components/genie/lightspeed-logo";
import { getBentoShellStyles, bentoCardShellClassName, bentoOuterWrapClassName, type BentoShellVariant } from "@/components/settings/bento-variant-styles";
import {
  BentoInboxDismissButton,
  BentoInboxEmptyState,
  BentoInboxPrimaryButton,
  useDismissibleIds,
} from "@/components/settings/bento-inbox-item-actions";
import { cn } from "@/lib/utils";

const MOCK_UNCATEGORISED_PRODUCTS = [
  {
    id: "1",
    name: "Premium Chain Lube 120ml",
    sku: "LS-44102",
    brand: "Muc-Off",
    preview: "Imported from PO #5102 — no Lightspeed category on receipt.",
    suggestedCategoryId: "cat-drivetrain",
    suggestedCategoryLabel: "Drivetrain · Lubricants",
  },
  {
    id: "2",
    name: "Tubeless Valves (Pair)",
    sku: "LS-22891",
    brand: "Stans",
    preview: "Quick-add SKU — category was skipped during stocktake.",
    suggestedCategoryId: "cat-wheels",
    suggestedCategoryLabel: "Wheels · Tubeless",
  },
  {
    id: "3",
    name: "Gravel Bar Tape",
    sku: "LS-77304",
    brand: "Supacaz",
    preview: "New variant — parent item exists but category not inherited.",
    suggestedCategoryId: "cat-cockpit",
    suggestedCategoryLabel: "Components · Bar tape",
  },
  {
    id: "4",
    name: "Workshop Apron",
    sku: "LS-99012",
    brand: "Generic",
    preview: "Non-bike SKU added for in-store use — needs a catalogue category.",
    suggestedCategoryId: "cat-accessories",
    suggestedCategoryLabel: "Accessories · Workshop",
  },
];

const MOCK_LIGHTSPEED_CATEGORIES = [
  { id: "cat-drivetrain", label: "Drivetrain · Lubricants" },
  { id: "cat-wheels", label: "Wheels · Tubeless" },
  { id: "cat-cockpit", label: "Components · Bar tape" },
  { id: "cat-accessories", label: "Accessories · Workshop" },
  { id: "cat-helmets", label: "Safety · Helmets" },
  { id: "cat-apparel", label: "Apparel · Jerseys" },
];

type UncategorisedProduct = (typeof MOCK_UNCATEGORISED_PRODUCTS)[number];

type UncategorisedBentoVariant = BentoShellVariant;

const SLIDE_TRANSITION = { duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] as const };

function ProductListItem({
  product,
  listItemBorder,
  onAssignCategory,
  onDismiss,
  ignoring,
}: {
  product: UncategorisedProduct;
  listItemBorder: string;
  onAssignCategory: (product: UncategorisedProduct) => void;
  onDismiss: (product: UncategorisedProduct) => void;
  ignoring?: boolean;
}) {
  return (
    <div
      className={cn(
        "group relative flex w-full items-start gap-2.5 rounded-[18px] border bg-white p-3 shadow-sm transition-opacity duration-200",
        listItemBorder,
        ignoring && "pointer-events-none opacity-40",
      )}
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-black/[0.06]">
        <LightspeedLogo className="h-[18px] w-[18px]" />
      </span>

      <div className="min-w-0 flex-1 pr-1">
        <p className="truncate text-[13px] font-semibold text-gray-900">{product.name}</p>
        <p className="mt-0.5 truncate text-[12px] font-medium text-gray-700">
          {product.sku}
          {product.brand ? ` · ${product.brand}` : ""}
        </p>
        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-gray-500">{product.preview}</p>
      </div>

      <BentoInboxPrimaryButton
        label="Assign Category"
        onClick={() => onAssignCategory(product)}
        ignoring={ignoring}
      />

      <BentoInboxDismissButton onDismiss={() => onDismiss(product)} ignoring={ignoring} />
    </div>
  );
}

function AssignCategoryFace({
  product,
  listItemBorder,
  categoryId,
  onCategoryChange,
  onBack,
  onSave,
  saving,
}: {
  product: UncategorisedProduct;
  listItemBorder: string;
  categoryId: string;
  onCategoryChange: (value: string) => void;
  onBack: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const selectedLabel =
    MOCK_LIGHTSPEED_CATEGORIES.find((category) => category.id === categoryId)?.label ?? "Select a category…";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={saving}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
          aria-label="Back to products"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-gray-900">{product.name}</p>
          <p className="truncate text-[11px] text-gray-500">{product.sku}</p>
        </div>
        <LightspeedLogo className="h-[18px] w-[18px] shrink-0" />
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
        <div className="shrink-0 border-b border-gray-100 px-3 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Brand</p>
          <p className="mt-0.5 text-[12px] font-medium text-gray-800">{product.brand || "—"}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Why it needs a category</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-gray-600">{product.preview}</p>

          <div className="my-3 h-px bg-gray-100" />

          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Lightspeed category</p>
          <div className="relative mt-1.5">
            <select
              value={categoryId}
              onChange={(event) => onCategoryChange(event.target.value)}
              disabled={saving}
              className="w-full appearance-none rounded-md border border-gray-200 bg-gray-50/80 py-2 pl-2.5 pr-8 text-[11px] text-gray-800 outline-none transition-colors focus:border-gray-300 focus:bg-white disabled:opacity-60"
            >
              <option value="" disabled>
                Select a category…
              </option>
              {MOCK_LIGHTSPEED_CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>
          <p className="mt-2 text-[10px] text-gray-400">
            Suggested: {product.suggestedCategoryLabel}
          </p>
          {categoryId ? (
            <p className="mt-1 text-[10px] font-medium text-gray-600">Selected: {selectedLabel}</p>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-gray-100 p-3">
          <motion.button
            type="button"
            onClick={onSave}
            disabled={saving || !categoryId}
            whileTap={{ scale: 0.97 }}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-gray-900 px-4 py-2.5 text-[13px] font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? (
              <motion.span
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              >
                Saving…
              </motion.span>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" />
                Save to Lightspeed
              </>
            )}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Test footy-card bento — Lightspeed products missing a category, slide-up assign flow.
 */
export function UncategorisedBento({
  className,
  variant = "default",
}: {
  className?: string;
  variant?: UncategorisedBentoVariant;
}) {
  const shell = getBentoShellStyles(variant);
  const { ignoringId, isDismissed, dismiss } = useDismissibleIds();
  const [showAssign, setShowAssign] = React.useState(false);
  const [activeProduct, setActiveProduct] = React.useState<UncategorisedProduct | null>(null);
  const [categoryId, setCategoryId] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const panelClassName = cn("flex min-h-0 flex-1 flex-col", shell.panelClassName);
  const panelBg = shell.panelBg;

  function handleAssignCategory(product: UncategorisedProduct) {
    setActiveProduct(product);
    setCategoryId(product.suggestedCategoryId);
    setShowAssign(true);
  }

  const dismissDelayMs = 400;

  function handleBack() {
    if (saving) return;
    setShowAssign(false);
    window.setTimeout(() => {
      setActiveProduct(null);
      setCategoryId("");
    }, dismissDelayMs);
  }

  async function handleSave() {
    if (!activeProduct || saving || !categoryId) return;
    setSaving(true);
    await new Promise((resolve) => window.setTimeout(resolve, 900));
    setSaving(false);
    setShowAssign(false);
    dismiss(activeProduct.id);
    window.setTimeout(() => {
      setActiveProduct(null);
      setCategoryId("");
    }, dismissDelayMs);
  }

  function handleDismiss(product: UncategorisedProduct) {
    if (activeProduct?.id === product.id) {
      handleBack();
    }
    dismiss(product.id);
  }

  const visibleProducts = MOCK_UNCATEGORISED_PRODUCTS.filter((product) => !isDismissed(product.id));

  const productList = (
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
            <BentoInboxEmptyState message="No uncategorised products" />
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
              <ProductListItem
                product={product}
                listItemBorder={shell.listItemBorder}
                onAssignCategory={handleAssignCategory}
                onDismiss={handleDismiss}
                ignoring={ignoringId === product.id}
              />
            </motion.li>
          ))
        )}
      </AnimatePresence>
    </ul>
  );

  const assignContent = activeProduct ? (
    <AssignCategoryFace
      product={activeProduct}
      listItemBorder={shell.listItemBorder}
      categoryId={categoryId}
      onCategoryChange={setCategoryId}
      onBack={handleBack}
      onSave={handleSave}
      saving={saving}
    />
  ) : null;

  return (
    <div className={bentoCardShellClassName(className)}>
      <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-5">
        <h2 className="text-[15px] font-semibold tracking-tight text-gray-900">Assign Category</h2>
        <LightspeedLogo className="mt-0.5 h-[20px] w-[20px] shrink-0" />
      </div>

      <div className={bentoOuterWrapClassName(variant)}>
          <div className={cn("relative flex h-full min-h-0 flex-col", panelClassName)}>
            {productList}
            <AnimatePresence>
              {showAssign && activeProduct ? (
                <motion.div
                  key={activeProduct.id}
                  className={cn("absolute inset-0 flex min-h-0 flex-col overflow-hidden", panelBg)}
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={SLIDE_TRANSITION}
                >
                  <div className="flex min-h-0 flex-1 flex-col p-3">{assignContent}</div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
      </div>
    </div>
  );
}
