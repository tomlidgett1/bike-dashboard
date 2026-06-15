"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, ChevronDown, Loader2, Sparkles } from "lucide-react";
import { LightspeedLogo } from "@/components/genie/lightspeed-logo";
import {
  getBentoShellStyles,
  bentoCardShellClassName,
  bentoOuterWrapClassName,
  type BentoShellVariant,
} from "@/components/settings/bento-variant-styles";
import {
  BentoInboxDismissButton,
  BentoInboxEmptyState,
  BentoInboxPrimaryButton,
  useDismissibleIds,
} from "@/components/settings/bento-inbox-item-actions";
import {
  fetchMissingCategoryProducts,
  saveProductCategory,
  suggestProductCategoriesBatch,
  suggestProductCategory,
} from "@/lib/missing-categories/client";
import type {
  CategorySuggestion,
  LightspeedCategoryOption,
  MissingCategoryProduct,
} from "@/lib/missing-categories/types";
import { cn } from "@/lib/utils";

type UncategorisedBentoVariant = BentoShellVariant;

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
  onAssignCategory,
  onDismiss,
  ignoring,
}: {
  product: MissingCategoryProduct;
  listItemBorder: string;
  suggestion?: CategorySuggestion | null;
  suggesting?: boolean;
  approving?: boolean;
  onApprove: (product: MissingCategoryProduct, categoryId: string) => void;
  onAssignCategory: (product: MissingCategoryProduct) => void;
  onDismiss: (product: MissingCategoryProduct) => void;
  ignoring?: boolean;
}) {
  const recommendedCategoryId = suggestion?.categoryId?.trim() || null;
  const recommendedLabel = suggestion?.categoryLabel?.trim() || null;
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
        <p className="mt-0.5 truncate text-[12px] font-medium text-gray-700">
          {product.sku}
          {product.brand ? ` · ${product.brand}` : ""}
        </p>
        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-gray-900">
          {suggesting ? (
            <span className="inline-block h-3 w-40 max-w-full animate-pulse rounded-md bg-gray-100" />
          ) : recommendedLabel ? (
            <>
              Suggested{" "}
              <span className="font-medium text-gray-950">{recommendedLabel}</span>
              <button
                type="button"
                onClick={() => onAssignCategory(product)}
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

      {recommendedCategoryId ? (
        <BentoInboxPrimaryButton
          label={approving ? "Saving…" : "Approve"}
          onClick={() => onApprove(product, recommendedCategoryId)}
          ignoring={busy}
        />
      ) : suggesting ? null : (
        <BentoInboxPrimaryButton
          label="Assign category"
          onClick={() => onAssignCategory(product)}
          ignoring={busy}
        />
      )}

      <BentoInboxDismissButton onDismiss={() => onDismiss(product)} ignoring={busy} />
    </div>
  );
}

function AssignCategoryFace({
  product,
  listItemBorder,
  categories,
  categoryId,
  onCategoryChange,
  onBack,
  onSave,
  onSuggest,
  saving,
  suggesting,
  suggestionSource,
  suggestionError,
}: {
  product: MissingCategoryProduct;
  listItemBorder: string;
  categories: LightspeedCategoryOption[];
  categoryId: string;
  onCategoryChange: (value: string) => void;
  onBack: () => void;
  onSave: () => void;
  onSuggest: () => void;
  saving: boolean;
  suggesting: boolean;
  suggestionSource: CategorySuggestion["source"] | null;
  suggestionError: string | null;
}) {
  const selectedLabel =
    categories.find((category) => category.categoryId === categoryId)?.label ?? "Select a category…";

  const suggestionHint =
    suggestionSource === "direct_match"
      ? "Matched from your Lightspeed category catalogue."
      : suggestionSource === "ai"
        ? "Suggested by AI — confirm before saving."
        : "Choose a category or use AI to suggest one.";

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
          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
            Why it needs a category
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-gray-900">{product.preview}</p>

          <div className="my-3 h-px bg-gray-100" />

          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
              Lightspeed category
            </p>
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
              {categories.map((category) => (
                <option key={category.categoryId} value={category.categoryId}>
                  {category.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>
          <p className="mt-2 text-[10px] text-gray-400">{suggestionHint}</p>
          {categoryId ? (
            <p className="mt-1 text-[10px] font-medium text-gray-600">Selected: {selectedLabel}</p>
          ) : null}
          {suggestionError ? (
            <p className="mt-1.5 text-[10px] text-red-600">{suggestionError}</p>
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
 * Lightspeed products missing a category — inline AI recommendations with one-click approve.
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
  const [products, setProducts] = React.useState<MissingCategoryProduct[]>([]);
  const [categories, setCategories] = React.useState<LightspeedCategoryOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [suggestions, setSuggestions] = React.useState<Record<string, CategorySuggestion | null>>({});
  const [suggestingIds, setSuggestingIds] = React.useState<Set<string>>(() => new Set());
  const [approvingIds, setApprovingIds] = React.useState<Set<string>>(() => new Set());
  const [showAssign, setShowAssign] = React.useState(false);
  const [activeProduct, setActiveProduct] = React.useState<MissingCategoryProduct | null>(null);
  const [categoryId, setCategoryId] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [suggestingDetail, setSuggestingDetail] = React.useState(false);
  const [suggestionSource, setSuggestionSource] = React.useState<CategorySuggestion["source"] | null>(
    null,
  );
  const [suggestionError, setSuggestionError] = React.useState<string | null>(null);

  const panelClassName = cn("flex min-h-0 flex-1 flex-col", shell.panelClassName);
  const panelBg = shell.panelBg;

  const loadSuggestions = React.useCallback(async (productIds: string[]) => {
    if (productIds.length === 0) return;

    setSuggestingIds(new Set(productIds));

    try {
      const data = await suggestProductCategoriesBatch(productIds);
      const next: Record<string, CategorySuggestion | null> = {};
      for (const entry of data.suggestions ?? []) {
        next[entry.productId] = entry.categoryId
          ? {
              categoryId: entry.categoryId,
              categoryLabel: entry.categoryLabel,
              confidence: entry.confidence,
              source: entry.source,
            }
          : null;
      }
      setSuggestions((current) => ({ ...current, ...next }));
    } catch (error) {
      console.error("[UncategorisedBento] batch suggest failed:", error);
    } finally {
      setSuggestingIds(new Set());
    }
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchMissingCategoryProducts(20);
      const loaded = data.products ?? [];
      setProducts(loaded);
      setCategories(data.categories ?? []);

      const seeded: Record<string, CategorySuggestion | null> = {};
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
  }, [loadSuggestions]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const runSuggestion = React.useCallback(
    async (product: MissingCategoryProduct) => {
      const existing = suggestions[product.id] ?? product.suggestion;
      if (existing?.categoryId) {
        setCategoryId(existing.categoryId);
        setSuggestionSource(existing.source ?? "ai");
        setSuggestionError(null);
        return;
      }

      setSuggestingDetail(true);
      setSuggestionError(null);
      try {
        const data = await suggestProductCategory(product.id);
        if (data.categoryId) {
          setCategoryId(data.categoryId);
          setSuggestionSource(
            data.source === "direct_match" || data.source === "ai" ? data.source : "none",
          );
          setSuggestions((current) => ({
            ...current,
            [product.id]: {
              categoryId: data.categoryId ?? null,
              categoryLabel: data.categoryLabel,
              confidence: data.confidence,
              source: data.source,
            },
          }));
        } else {
          setSuggestionSource("none");
          setSuggestionError("Could not confidently suggest a category. Choose one manually.");
        }
      } catch (error) {
        setSuggestionSource("none");
        setSuggestionError(error instanceof Error ? error.message : "Could not suggest a category.");
      } finally {
        setSuggestingDetail(false);
      }
    },
    [suggestions],
  );

  async function persistCategory(product: MissingCategoryProduct, nextCategoryId: string) {
    if (!nextCategoryId.trim()) return;

    await saveProductCategory(product.id, nextCategoryId.trim());
    setProducts((current) => current.filter((item) => item.id !== product.id));
    setSuggestions((current) => {
      const next = { ...current };
      delete next[product.id];
      return next;
    });
    dismiss(product.id);
  }

  async function handleApprove(product: MissingCategoryProduct, nextCategoryId: string) {
    if (approvingIds.has(product.id)) return;

    setApprovingIds((current) => new Set(current).add(product.id));
    setSuggestionError(null);

    try {
      await persistCategory(product, nextCategoryId);
      if (activeProduct?.id === product.id) {
        setShowAssign(false);
        setActiveProduct(null);
        setCategoryId("");
      }
    } catch (error) {
      setSuggestionError(error instanceof Error ? error.message : "Failed to save category.");
    } finally {
      setApprovingIds((current) => {
        const next = new Set(current);
        next.delete(product.id);
        return next;
      });
    }
  }

  function handleAssignCategory(product: MissingCategoryProduct) {
    setActiveProduct(product);
    const existing = suggestions[product.id] ?? product.suggestion;
    setCategoryId(existing?.categoryId ?? "");
    setSuggestionSource(existing?.source ?? null);
    setSuggestionError(null);
    setShowAssign(true);
    if (!existing?.categoryId) {
      void runSuggestion(product);
    }
  }

  function handleBack() {
    if (saving) return;
    setShowAssign(false);
    window.setTimeout(() => {
      setActiveProduct(null);
      setCategoryId("");
      setSuggestionSource(null);
      setSuggestionError(null);
    }, DISMISS_DELAY_MS);
  }

  async function handleSave() {
    if (!activeProduct || saving || !categoryId) return;
    setSaving(true);
    setSuggestionError(null);

    try {
      await persistCategory(activeProduct, categoryId);
      setShowAssign(false);
      window.setTimeout(() => {
        setActiveProduct(null);
        setCategoryId("");
        setSuggestionSource(null);
      }, DISMISS_DELAY_MS);
    } catch (error) {
      setSuggestionError(error instanceof Error ? error.message : "Failed to save category.");
    } finally {
      setSaving(false);
    }
  }

  function handleDismiss(product: MissingCategoryProduct) {
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
              <BentoInboxEmptyState message="No uncategorised products" />
            </motion.li>
          ) : (
            visibleProducts.map((product) => {
              const suggestion =
                product.id in suggestions ? suggestions[product.id] : product.suggestion;

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
                    onApprove={(item, id) => void handleApprove(item, id)}
                    onAssignCategory={handleAssignCategory}
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
    <AssignCategoryFace
      product={activeProduct}
      listItemBorder={shell.listItemBorder}
      categories={categories}
      categoryId={categoryId}
      onCategoryChange={setCategoryId}
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
