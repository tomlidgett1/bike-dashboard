"use client";

import * as React from "react";

export type StoreDesign = "classic" | "atelier";

const STORAGE_PREFIX = "yj:store-design:";

function storageKey(storeId: string): string {
  return `${STORAGE_PREFIX}${storeId}`;
}

function readDesign(storeId: string): StoreDesign {
  if (typeof window === "undefined") return "classic";
  try {
    const v = window.localStorage.getItem(storageKey(storeId));
    return v === "atelier" ? "atelier" : "classic";
  } catch {
    return "classic";
  }
}

function writeDesign(storeId: string, design: StoreDesign): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(storeId), design);
  } catch {
    /* ignore quota / privacy mode */
  }
}

/**
 * Per-store storefront design preference, persisted to localStorage so a
 * returning visitor keeps the design they picked. Hydrates after mount to
 * avoid SSR/CSR markup mismatch.
 */
export function useStoreDesign(storeId: string): {
  design: StoreDesign;
  setDesign: (design: StoreDesign) => void;
  hydrated: boolean;
} {
  const [design, setDesignState] = React.useState<StoreDesign>("classic");
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    setDesignState(readDesign(storeId));
    setHydrated(true);
  }, [storeId]);

  const setDesign = React.useCallback(
    (next: StoreDesign) => {
      setDesignState(next);
      writeDesign(storeId, next);
    },
    [storeId],
  );

  return { design, setDesign, hydrated };
}
