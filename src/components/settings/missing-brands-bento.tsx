"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, Loader2, Sparkles } from "lucide-react";
import { LightspeedLogo } from "@/components/genie/lightspeed-logo";
import { getBentoShellStyles, bentoCardShellClassName, bentoOuterWrapClassName, type BentoShellVariant } from "@/components/settings/bento-variant-styles";
import {
  BentoInboxDismissButton,
  BentoInboxEmptyState,
  BentoInboxPrimaryButton,
  useDismissibleIds,
} from "@/components/settings/bento-inbox-item-actions";
import {
  fetchMissingBrandProducts,
  saveProductBrand,
  suggestProductBrand,
  suggestProductBrandsBatch,
} from "@/lib/missing-brands/client";
import type { BrandSuggestion, MissingBrandProduct } from "@/lib/missing-brands/types";
import { cn } from "@/lib/utils";

const MARKETING_PREVIEW_PRODUCTS: MissingBrandProduct[] = [
  {
    id: "mk-1",
    name: "XT M8100 Rear Derailleur",
    sku: "LS-88421",
    category: "Drivetrain · Derailleurs",
    preview: "Supplier import — brand field empty in Lightspeed.",
    lightspeedItemId: null,
    suggestion: { brand: "Shimano", confidence: "high", source: "ai" },
  },
  {
    id: "mk-2",
    name: "Alloy Bar Ends (Pair)",
    sku: "LS-12094",
    category: "Components · Cockpit",
    preview: "Listed as generic stock — needs a brand before publishing.",
    lightspeedItemId: null,
    suggestion: { brand: "Supacaz", confidence: "medium", source: "ai" },
  },
  {
    id: "mk-3",
    name: "Carbon Bottle Cage",
    sku: "LS-33108",
    category: "Accessories · Bottles",
    preview: "New SKU from PO #4821 — brand not set on receipt.",
    lightspeedItemId: null,
    suggestion: { brand: "Elite", confidence: "high", source: "direct_match" },
  },
  {
    id: "mk-4",
    name: "29×2.4 MTB Inner Tube",
    sku: "LS-55201",
    category: "Tyres & Tubes · Tubes",
    preview: "Bulk tube stock — manufacturer missing from item record.",
    lightspeedItemId: null,
    suggestion: { brand: "Schwalbe", confidence: "high", source: "ai" },
  },
];

type MissingBrandsBentoVariant = BentoShellVariant;

const SLIDE_TRANSITION = { duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] as const };
const DISMISS_DELAY_MS = 400;

function ProductListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-[88px] animate-pulse rounded-[18px] border border-black/[0.05] bg-white/70"
        />
      ))}
    </div>
  );
}

function ProductListItem({
  product,
  listItemBorder,
  suggestion,
  suggesting,
  approving,
  onApprove,
  onAddBrand,
  onDismiss,
  ignoring,
}: {
  product: MissingBrandProduct;
  listItemBorder: string;
  suggestion?: BrandSuggestion | null;
  suggesting?: boolean;
  approving?: boolean;
  onApprove: (product: MissingBrandProduct, brand: string) => void;
  onAddBrand: (product: MissingBrandProduct) => void;
  onDismiss: (product: MissingBrandProduct) => void;
  ignoring?: boolean;
}) {
  const recommendedBrand = suggestion?.brand?.trim() || null;
  const busy = ignoring || approving;

  return (
    <div
      className={cn(
        "group relative flex w-full items-start gap-2.5 rounded-[18px] border bg-white p-3 shadow-sm transition-opacity duration-200",
        listItemBorder,
        busy && "pointer-events-none opacity-40",
      )}
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-black/[0.06]">
        <LightspeedLogo className="h-[18px] w-[18px]" />
      </span>

      <div className="min-w-0 flex-1 pr-1">
        <p className="truncate text-[13px] font-semibold text-gray-900">{product.name}</p>
        <p className="mt-0.5 truncate text-[12px] font-medium text-gray-700">{product.sku}</p>
        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-gray-500">
          {suggesting ? (
            <span className="inline-block h-3 w-32 max-w-full animate-pulse rounded-md bg-gray-100" />
          ) : recommendedBrand ? (
            <>
              Suggested{" "}
              <span className="font-medium text-gray-700">{recommendedBrand}</span>
              <button
                type="button"
                onClick={() => onAddBrand(product)}
                disabled={busy}
                className="ml-1 text-gray-400 transition-colors hover:text-gray-600 disabled:opacity-40"
              >
                · change
              </button>
            </>
          ) : (
            product.preview
          )}
        </p>
      </div>

      {recommendedBrand ? (
        <BentoInboxPrimaryButton
          label={approving ? "Saving…" : "Approve"}
          onClick={() => onApprove(product, recommendedBrand)}
          ignoring={busy}
        />
      ) : suggesting ? null : (
        <BentoInboxPrimaryButton label="Add brand" onClick={() => onAddBrand(product)} ignoring={busy} />
      )}

      <BentoInboxDismissButton onDismiss={() => onDismiss(product)} ignoring={busy} />
    </div>
  );
}

function AssignBrandFace({
  product,
  listItemBorder,
  brandName,
  onBrandChange,
  onBack,
  onSave,
  onSuggest,
  saving,
  suggesting,
  suggestionSource,
  suggestionError,
}: {
  product: MissingBrandProduct;
  listItemBorder: string;
  brandName: string;
  onBrandChange: (value: string) => void;
  onBack: () => void;
  onSave: () => void;
  onSuggest: () => void;
  saving: boolean;
  suggesting: boolean;
  suggestionSource: BrandSuggestion["source"] | null;
  suggestionError: string | null;
}) {
  const suggestionHint =
    suggestionSource === "direct_match"
      ? "Matched from your Lightspeed brand catalogue."
      : suggestionSource === "ai"
        ? "Suggested by AI — confirm before saving."
        : "Enter a brand or use AI to suggest one.";

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
          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Category</p>
          <p className="mt-0.5 text-[12px] font-medium text-gray-800">{product.category || "—"}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Issue</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-gray-600">{product.preview}</p>

          <div className="my-3 h-px bg-gray-100" />

          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Brand name</p>
            <button
              type="button"
              onClick={onSuggest}
              disabled={saving || suggesting}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              {suggesting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              Suggest
            </button>
          </div>
          <input
            type="text"
            value={brandName}
            onChange={(event) => onBrandChange(event.target.value)}
            disabled={saving}
            placeholder="Enter brand…"
            className="mt-1.5 w-full rounded-md border border-gray-200 bg-gray-50/80 px-2.5 py-2 text-[11px] text-gray-800 outline-none transition-colors focus:border-gray-300 focus:bg-white disabled:opacity-60"
          />
          <p className="mt-2 text-[10px] text-gray-400">{suggestionHint}</p>
          {suggestionError ? (
            <p className="mt-1.5 text-[10px] text-red-600">{suggestionError}</p>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-gray-100 p-3">
          <motion.button
            type="button"
            onClick={onSave}
            disabled={saving || !brandName.trim()}
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
 * Lightspeed products missing brands — inline AI recommendations with one-click approve.
 */
export function MissingBrandsBento({
  className,
  variant = "default",
  marketingPreview = false,
}: {
  className?: string;
  variant?: MissingBrandsBentoVariant;
  marketingPreview?: boolean;
}) {
  const shell = getBentoShellStyles(variant);
  const { ignoringId, isDismissed, dismiss } = useDismissibleIds();
  const [products, setProducts] = React.useState<MissingBrandProduct[]>(
    marketingPreview ? MARKETING_PREVIEW_PRODUCTS : [],
  );
  const [loading, setLoading] = React.useState(!marketingPreview);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [suggestions, setSuggestions] = React.useState<Record<string, BrandSuggestion | null>>({});
  const [suggestingIds, setSuggestingIds] = React.useState<Set<string>>(() => new Set());
  const [approvingIds, setApprovingIds] = React.useState<Set<string>>(() => new Set());
  const [showAssign, setShowAssign] = React.useState(false);
  const [activeProduct, setActiveProduct] = React.useState<MissingBrandProduct | null>(null);
  const [brandName, setBrandName] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [suggestingDetail, setSuggestingDetail] = React.useState(false);
  const [suggestionSource, setSuggestionSource] = React.useState<BrandSuggestion["source"] | null>(null);
  const [suggestionError, setSuggestionError] = React.useState<string | null>(null);

  const panelClassName = cn("flex min-h-0 flex-1 flex-col", shell.panelClassName);
  const panelBg = shell.panelBg;

  const loadSuggestions = React.useCallback(
    async (productIds: string[]) => {
      if (marketingPreview || productIds.length === 0) return;

      setSuggestingIds(new Set(productIds));

      try {
        const data = await suggestProductBrandsBatch(productIds);
        const next: Record<string, BrandSuggestion | null> = {};
        for (const entry of data.suggestions ?? []) {
          next[entry.productId] = entry.brand
            ? {
                brand: entry.brand,
                manufacturerId: entry.manufacturerId,
                confidence: entry.confidence,
                source: entry.source,
              }
            : null;
        }
        setSuggestions((current) => ({ ...current, ...next }));
      } catch (error) {
        console.error("[MissingBrandsBento] batch suggest failed:", error);
      } finally {
        setSuggestingIds(new Set());
      }
    },
    [marketingPreview],
  );

  const load = React.useCallback(async () => {
    if (marketingPreview) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchMissingBrandProducts(20);
      const loaded = data.products ?? [];
      setProducts(loaded);

      const seeded: Record<string, BrandSuggestion | null> = {};
      const uncachedIds: string[] = [];

      for (const item of loaded) {
        if (item.suggestion !== undefined) {
          seeded[item.id] = item.suggestion;
        } else {
          uncachedIds.push(item.id);
        }
      }

      setSuggestions(seeded);
      void loadSuggestions(uncachedIds);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load products.");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [marketingPreview, loadSuggestions]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const runSuggestion = React.useCallback(
    async (product: MissingBrandProduct) => {
      const existing = suggestions[product.id] ?? product.suggestion;
      if (existing?.brand) {
        setBrandName(existing.brand);
        setSuggestionSource(existing.source ?? "ai");
        setSuggestionError(null);
        return;
      }

      if (marketingPreview) {
        setBrandName("");
        setSuggestionSource(null);
        setSuggestionError(null);
        return;
      }

      setSuggestingDetail(true);
      setSuggestionError(null);
      try {
        const data = await suggestProductBrand(product.id);
        if (data.brand) {
          setBrandName(data.brand);
          setSuggestionSource(data.source === "direct_match" || data.source === "ai" ? data.source : "none");
          setSuggestions((current) => ({
            ...current,
            [product.id]: {
              brand: data.brand ?? null,
              manufacturerId: data.manufacturerId,
              confidence: data.confidence,
              source: data.source,
            },
          }));
        } else {
          setSuggestionSource("none");
          setSuggestionError("Could not confidently suggest a brand. Enter one manually.");
        }
      } catch (error) {
        setSuggestionSource("none");
        setSuggestionError(error instanceof Error ? error.message : "Could not suggest a brand.");
      } finally {
        setSuggestingDetail(false);
      }
    },
    [marketingPreview, suggestions],
  );

  async function persistBrand(product: MissingBrandProduct, brand: string) {
    if (!brand.trim()) return;

    if (!marketingPreview) {
      await saveProductBrand(product.id, brand.trim());
      setProducts((current) => current.filter((item) => item.id !== product.id));
      setSuggestions((current) => {
        const next = { ...current };
        delete next[product.id];
        return next;
      });
    }

    dismiss(product.id);
  }

  async function handleApprove(product: MissingBrandProduct, brand: string) {
    if (approvingIds.has(product.id)) return;

    setApprovingIds((current) => new Set(current).add(product.id));
    setSuggestionError(null);

    try {
      await persistBrand(product, brand);
      if (activeProduct?.id === product.id) {
        setShowAssign(false);
        setActiveProduct(null);
        setBrandName("");
      }
    } catch (error) {
      setSuggestionError(error instanceof Error ? error.message : "Failed to save brand.");
    } finally {
      setApprovingIds((current) => {
        const next = new Set(current);
        next.delete(product.id);
        return next;
      });
    }
  }

  function handleAddBrand(product: MissingBrandProduct) {
    setActiveProduct(product);
    const existing = suggestions[product.id] ?? product.suggestion;
    setBrandName(existing?.brand ?? "");
    setSuggestionSource(existing?.source ?? null);
    setSuggestionError(null);
    setShowAssign(true);
    if (!existing?.brand) {
      void runSuggestion(product);
    }
  }

  function handleBack() {
    if (saving) return;
    setShowAssign(false);
    window.setTimeout(() => {
      setActiveProduct(null);
      setBrandName("");
      setSuggestionSource(null);
      setSuggestionError(null);
    }, DISMISS_DELAY_MS);
  }

  async function handleSave() {
    if (!activeProduct || saving || !brandName.trim()) return;
    setSaving(true);
    setSuggestionError(null);

    try {
      await persistBrand(activeProduct, brandName.trim());
      setShowAssign(false);
      window.setTimeout(() => {
        setActiveProduct(null);
        setBrandName("");
        setSuggestionSource(null);
      }, DISMISS_DELAY_MS);
    } catch (error) {
      setSuggestionError(error instanceof Error ? error.message : "Failed to save brand.");
    } finally {
      setSaving(false);
    }
  }

  function handleDismiss(product: MissingBrandProduct) {
    if (activeProduct?.id === product.id) {
      handleBack();
    }
    dismiss(product.id);
  }

  const visibleProducts = products.filter((product) => !isDismissed(product.id));

  const productList = (
    <ul className="-mx-3 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-0">
      {loading ? (
        <li>
          <ProductListSkeleton />
        </li>
      ) : loadError ? (
        <li>
          <div className="rounded-md border border-red-100 bg-white px-3 py-4 text-center">
            <p className="text-[12px] font-medium text-red-700">{loadError}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-2 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
            >
              Retry
            </button>
          </div>
        </li>
      ) : (
        <AnimatePresence initial={false}>
          {visibleProducts.length === 0 ? (
            <motion.li
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
            >
              <BentoInboxEmptyState message="No missing brands to review" />
            </motion.li>
          ) : (
            visibleProducts.map((product) => {
              const suggestion = marketingPreview
                ? product.suggestion
                : product.id in suggestions
                  ? suggestions[product.id]
                  : product.suggestion;

              return (
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
                    suggestion={suggestion}
                    suggesting={suggestingIds.has(product.id)}
                    approving={approvingIds.has(product.id)}
                    onApprove={(item, brand) => void handleApprove(item, brand)}
                    onAddBrand={handleAddBrand}
                    onDismiss={handleDismiss}
                    ignoring={ignoringId === product.id}
                  />
                </motion.li>
              );
            })
          )}
        </AnimatePresence>
      )}
    </ul>
  );

  const assignContent = activeProduct ? (
    <AssignBrandFace
      product={activeProduct}
      listItemBorder={shell.listItemBorder}
      brandName={brandName}
      onBrandChange={setBrandName}
      onBack={handleBack}
      onSave={() => void handleSave()}
      onSuggest={() => activeProduct && void runSuggestion(activeProduct)}
      saving={saving}
      suggesting={suggestingDetail}
      suggestionSource={suggestionSource}
      suggestionError={suggestionError}
    />
  ) : null;

  return (
    <div className={bentoCardShellClassName(className)}>
      <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-5">
        <h2 className="text-[15px] font-semibold tracking-tight text-gray-900">Missing Brands</h2>
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
