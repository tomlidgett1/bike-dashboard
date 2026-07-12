"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useUserProfile } from "@/components/providers/profile-provider";
import {
  LightspeedActionRequiredPopup,
  type LightspeedActionPreview,
} from "@/components/settings/lightspeed-action-required-popup";
import { saveProductBrand, suggestProductBrand } from "@/lib/missing-brands/client";
import {
  fetchMissingCategoryProducts,
  saveProductCategory,
  suggestProductCategory,
} from "@/lib/missing-categories/client";
import type { LightspeedCategoryOption } from "@/lib/missing-categories/types";
import {
  claimActionRequiredSurface,
  isActionRequiredCooldownElapsed,
  releaseActionRequiredSurface,
  writeActionRequiredLastShownAt,
} from "@/lib/store/lightspeed-action-required-gate";
import {
  fetchOpenActionsSnapshot,
  readOpenActionsSnapshot,
  updateOpenActionsSnapshot,
  type OpenActionsSnapshot,
} from "@/lib/store/open-actions-client";
import { notifyOpenActionsChanged } from "@/lib/store/open-actions-events";
import { countOpenStoreActions } from "@/lib/store/open-store-actions";
import {
  playActionRequiredAppearSound,
} from "@/lib/ui/play-success-sound";

const INITIAL_DELAY_MS = 4_000;
const POLL_MS = 30_000;

function shouldSkipPath(pathname: string | null): boolean {
  if (!pathname) return true;
  if (pathname.startsWith("/login")) return true;
  if (pathname.startsWith("/auth")) return true;
  if (pathname.startsWith("/onboarding")) return true;
  return false;
}

function pickRandomAction(snapshot: OpenActionsSnapshot): LightspeedActionPreview | null {
  type Candidate = {
    kind: LightspeedActionPreview["kind"];
    productId: string;
    title: string;
    subtitle: string;
    suggestionLabel: string | null;
    suggestionId: string | null;
  };

  const candidates: Candidate[] = [];

  for (const product of snapshot.brandProducts) {
    candidates.push({
      kind: "missing-brand",
      productId: product.id,
      title: product.name,
      subtitle: product.sku,
      suggestionLabel: product.suggestion?.brand?.trim() || null,
      suggestionId: null,
    });
  }

  for (const product of snapshot.categoryProducts) {
    candidates.push({
      kind: "assign-category",
      productId: product.id,
      title: product.name,
      subtitle: [product.sku, product.brand].filter(Boolean).join(" · "),
      suggestionLabel: product.suggestion?.categoryLabel?.trim() || null,
      suggestionId: product.suggestion?.categoryId?.trim() || null,
    });
  }

  if (candidates.length === 0) return null;

  const pick = candidates[Math.floor(Math.random() * candidates.length)]!;
  return {
    key: `${pick.kind}:${pick.productId}`,
    kind: pick.kind,
    title: pick.title,
    subtitle: pick.subtitle,
    suggestionLabel: pick.suggestionLabel,
    suggestionId: pick.suggestionId,
    productId: pick.productId,
  };
}

async function enrichAction(
  action: LightspeedActionPreview,
): Promise<LightspeedActionPreview> {
  if (action.kind === "missing-brand" && !action.suggestionLabel?.trim() && action.productId) {
    try {
      const suggestion = await suggestProductBrand(action.productId);
      if (suggestion.brand?.trim()) {
        return { ...action, suggestionLabel: suggestion.brand.trim() };
      }
    } catch {
      // Manual entry still available in the popup.
    }
  }

  if (
    action.kind === "assign-category" &&
    (!action.suggestionId?.trim() || !action.suggestionLabel?.trim()) &&
    action.productId
  ) {
    try {
      const suggestion = await suggestProductCategory(action.productId);
      if (suggestion.categoryId?.trim()) {
        return {
          ...action,
          suggestionId: suggestion.categoryId.trim(),
          suggestionLabel:
            suggestion.categoryLabel?.trim() || action.suggestionLabel,
        };
      }
    } catch {
      // Manual Lightspeed select still available in the popup.
    }
  }

  return action;
}

export function LightspeedActionRequiredHost() {
  const pathname = usePathname();
  const { profile } = useUserProfile();
  const scope = profile?.user_id || null;
  const isVerifiedStore =
    profile?.account_type === "bicycle_store" && profile?.bicycle_store === true;

  const [open, setOpen] = React.useState(false);
  const [action, setAction] = React.useState<LightspeedActionPreview | null>(null);
  const [categories, setCategories] = React.useState<LightspeedCategoryOption[]>([]);
  const [categoriesLoading, setCategoriesLoading] = React.useState(false);
  const openRef = React.useRef(false);
  const presentingRef = React.useRef(false);
  const claimedRef = React.useRef(false);

  const releaseClaim = React.useCallback(() => {
    if (!claimedRef.current) return;
    claimedRef.current = false;
    releaseActionRequiredSurface();
  }, []);

  const closePopup = React.useCallback(() => {
    openRef.current = false;
    setOpen(false);
    setAction(null);
    releaseClaim();
  }, [releaseClaim]);

  const ensureCategories = React.useCallback(async () => {
    if (categories.length > 0 || categoriesLoading) return;
    setCategoriesLoading(true);
    try {
      const cached = scope ? readOpenActionsSnapshot(scope) : null;
      if (cached?.categoryOptions?.length) {
        setCategories(cached.categoryOptions);
        return;
      }
      const data = await fetchMissingCategoryProducts(1);
      const options = data.categories ?? [];
      setCategories(options);
      if (scope) {
        updateOpenActionsSnapshot(scope, (current) => ({
          ...current,
          categoryOptions: options,
        }));
      }
    } catch {
      // Popup still works; user may need to retry Assign category.
    } finally {
      setCategoriesLoading(false);
    }
  }, [categories.length, categoriesLoading, scope]);

  const tryPresent = React.useCallback(async () => {
    if (!scope || !isVerifiedStore) return;
    if (shouldSkipPath(pathname)) return;
    if (openRef.current || presentingRef.current) return;
    if (!isActionRequiredCooldownElapsed(scope)) return;

    presentingRef.current = true;
    try {
      if (!claimActionRequiredSurface()) return;
      claimedRef.current = true;

      const snapshot = await fetchOpenActionsSnapshot(scope);
      const remaining = countOpenStoreActions(snapshot);
      if (remaining <= 0) {
        releaseClaim();
        return;
      }

      const picked = pickRandomAction(snapshot);
      if (!picked) {
        releaseClaim();
        return;
      }

      const enriched = await enrichAction(picked);
      if (enriched.kind === "assign-category") {
        void ensureCategories();
      }

      writeActionRequiredLastShownAt(scope);
      openRef.current = true;
      setAction(enriched);
      setOpen(true);
      void playActionRequiredAppearSound();
    } catch {
      releaseClaim();
    } finally {
      presentingRef.current = false;
    }
  }, [ensureCategories, isVerifiedStore, pathname, releaseClaim, scope]);

  React.useEffect(() => {
    if (!scope || !isVerifiedStore) return;
    if (shouldSkipPath(pathname)) return;

    const initial = window.setTimeout(() => {
      void tryPresent();
    }, INITIAL_DELAY_MS);
    const interval = window.setInterval(() => {
      void tryPresent();
    }, POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void tryPresent();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [isVerifiedStore, pathname, scope, tryPresent]);

  React.useEffect(() => {
    return () => {
      if (openRef.current) {
        openRef.current = false;
        releaseClaim();
      }
    };
  }, [releaseClaim]);

  async function handleApprove(next: LightspeedActionPreview) {
    const productId = next.productId?.trim();
    if (!productId) {
      throw new Error("Missing product id.");
    }

    if (next.kind === "missing-brand") {
      const brand = next.suggestionLabel?.trim();
      if (!brand) throw new Error("Enter a brand first.");
      await saveProductBrand(productId, brand);
      if (scope) {
        updateOpenActionsSnapshot(scope, (current) => ({
          ...current,
          brandProducts: current.brandProducts.filter((item) => item.id !== productId),
        }));
        const snapshot = readOpenActionsSnapshot(scope);
        notifyOpenActionsChanged(
          snapshot ? countOpenStoreActions(snapshot) : undefined,
        );
      }
    } else {
      const categoryId = next.suggestionId?.trim();
      if (!categoryId) throw new Error("Select a Lightspeed category first.");
      await saveProductCategory(productId, categoryId, next.suggestionLabel);
      if (scope) {
        updateOpenActionsSnapshot(scope, (current) => ({
          ...current,
          categoryProducts: current.categoryProducts.filter(
            (item) => item.id !== productId,
          ),
        }));
        const snapshot = readOpenActionsSnapshot(scope);
        notifyOpenActionsChanged(
          snapshot ? countOpenStoreActions(snapshot) : undefined,
        );
      }
    }

    closePopup();
  }

  function handleReject() {
    closePopup();
  }

  if (!isVerifiedStore) return null;

  return (
    <LightspeedActionRequiredPopup
      open={open}
      action={action}
      categories={categories}
      categoriesLoading={categoriesLoading}
      onRequestCategories={() => void ensureCategories()}
      onClose={closePopup}
      onApprove={handleApprove}
      onReject={handleReject}
    />
  );
}
