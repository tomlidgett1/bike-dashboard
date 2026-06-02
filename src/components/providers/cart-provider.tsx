"use client";

// ============================================================
// Cart Provider
// ============================================================
// Client-side cart for the marketplace, persisted in localStorage.
// Hard rule: a cart may only contain items from ONE seller, because
// each seller has their own Stripe Connect account / payout. Adding an
// item from a different seller surfaces a "replace cart" decision rather
// than silently mixing sellers.
//
// The stored price is a snapshot for display only. Availability and price
// are always re-validated server-side at checkout (see create-cart-checkout).

import * as React from "react";

export const MAX_CART_ITEMS = 12;
const STORAGE_KEY = "yj_cart_v1";

export interface CartItem {
  productId: string;
  name: string;
  image: string | null;
  /** Unit price — display snapshot only; re-validated server-side at checkout. */
  price: number;
  sellerId: string;
  sellerName: string;
  /** Snapshot used only to guide checkout UI. Re-validated server-side. */
  uberDeliveryEligible?: boolean;
  /** Units of this product in the cart (>= 1). */
  quantity: number;
  /**
   * Max purchasable units (stock on hand). 1 for unique/used listings; the
   * shop's stock for inventory items. The quantity stepper clamps to this, and
   * it is re-validated server-side at checkout.
   */
  maxQuantity: number;
}

/** Clamp a quantity into the valid [1, max] range, coercing junk to 1. */
function clampQty(qty: number, max: number): number {
  const n = Math.floor(Number(qty));
  const ceiling = Math.max(1, Math.floor(Number(max) || 1));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, ceiling);
}

export type AddToCartResult = "added" | "exists" | "needs_replace" | "full";

interface CartContextValue {
  items: CartItem[];
  /** Distinct line count (number of products). Capped at MAX_CART_ITEMS. */
  count: number;
  /** Total units across all lines (sum of quantities) — used for the header badge. */
  totalQuantity: number;
  subtotal: number;
  sellerId: string | null;
  sellerName: string | null;
  hydrated: boolean;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addItem: (item: CartItem) => AddToCartResult;
  removeItem: (productId: string) => void;
  /** Set the unit count for a line (or the buy-now item), clamped to its maxQuantity. */
  setQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
  has: (productId: string) => boolean;
  /** The item awaiting a cross-seller replace confirmation, if any. */
  pendingReplacement: CartItem | null;
  confirmReplacement: () => void;
  cancelReplacement: () => void;
  /**
   * Buy Now drives the same drawer + checkout as the cart, but for a single
   * item that is NOT added to (or persisted in) the real cart. While set, the
   * drawer shows only this item. `count`/`subtotal`/`items` always reflect the
   * real persisted cart so the header badge stays correct.
   */
  buyNowItem: CartItem | null;
  isBuyNow: boolean;
  startBuyNow: (item: CartItem) => void;
  exitBuyNow: () => void;
}

const CartContext = React.createContext<CartContextValue | null>(null);

function readStorage(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (i): i is CartItem =>
          !!i && typeof i.productId === "string" && typeof i.sellerId === "string"
      )
      .map((i) => {
        // Coerce/clamp persisted quantities — older carts (pre-quantity) won't
        // have these fields, and localStorage is user-editable.
        const maxQuantity = Math.max(1, Math.floor(Number(i.maxQuantity) || 1));
        return { ...i, maxQuantity, quantity: clampQty(i.quantity ?? 1, maxQuantity) };
      });
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<CartItem[]>([]);
  const [hydrated, setHydrated] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState(false);
  const [pendingReplacement, setPendingReplacement] = React.useState<CartItem | null>(null);
  // Buy Now: a single item shown in the drawer without touching the real cart.
  // Intentionally NOT persisted to localStorage.
  const [buyNowItem, setBuyNowItem] = React.useState<CartItem | null>(null);

  // Hydrate from localStorage after mount (avoids SSR mismatch).
  React.useEffect(() => {
    setItems(readStorage());
    setHydrated(true);
  }, []);

  // Persist on change (only after hydration, so we never clobber stored data with []).
  React.useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }, [items, hydrated]);

  // Keep multiple tabs in sync.
  React.useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setItems(readStorage());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Opening via the cart icon always shows the real cart, never a buy-now item.
  const openCart = React.useCallback(() => {
    setBuyNowItem(null);
    setIsOpen(true);
  }, []);
  // Don't clear buyNowItem here — that would flicker the drawer empty during the
  // close animation. It's reset on the next openCart / overwritten by startBuyNow.
  const closeCart = React.useCallback(() => setIsOpen(false), []);

  const startBuyNow = React.useCallback((item: CartItem) => {
    setBuyNowItem(item);
    setIsOpen(true);
  }, []);
  const exitBuyNow = React.useCallback(() => setBuyNowItem(null), []);

  const addItem = React.useCallback(
    (item: CartItem): AddToCartResult => {
      // Wrapped in an object so the assignments inside the updater survive
      // TypeScript's control-flow narrowing of a plain outer variable.
      const outcome = { value: "added" as AddToCartResult };
      setItems((prev) => {
        if (prev.some((i) => i.productId === item.productId)) {
          outcome.value = "exists";
          return prev;
        }
        // Single-seller rule: a populated cart from another seller needs a replace decision.
        if (prev.length > 0 && prev[0].sellerId !== item.sellerId) {
          outcome.value = "needs_replace";
          return prev;
        }
        if (prev.length >= MAX_CART_ITEMS) {
          outcome.value = "full";
          return prev;
        }
        // Normalize on the way in: default quantity to 1, clamp to a valid max.
        const maxQuantity = Math.max(1, Math.floor(Number(item.maxQuantity) || 1));
        return [...prev, { ...item, maxQuantity, quantity: clampQty(item.quantity ?? 1, maxQuantity) }];
      });
      if (outcome.value === "needs_replace") setPendingReplacement(item);
      return outcome.value;
    },
    []
  );

  const removeItem = React.useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  // Set the unit count for a line, clamped to its maxQuantity. Mirrors the
  // change onto buyNowItem when it's the same product, so the Buy Now drawer
  // stepper stays in sync with the (separate) single-item state.
  const setQuantity = React.useCallback((productId: string, quantity: number) => {
    setItems((prev) =>
      prev.map((i) =>
        i.productId === productId ? { ...i, quantity: clampQty(quantity, i.maxQuantity) } : i
      )
    );
    setBuyNowItem((prev) =>
      prev && prev.productId === productId
        ? { ...prev, quantity: clampQty(quantity, prev.maxQuantity) }
        : prev
    );
  }, []);

  const clear = React.useCallback(() => setItems([]), []);

  const has = React.useCallback(
    (productId: string) => items.some((i) => i.productId === productId),
    [items]
  );

  const confirmReplacement = React.useCallback(() => {
    setPendingReplacement((pending) => {
      if (pending) {
        setItems([pending]);
        setIsOpen(true);
      }
      return null;
    });
  }, []);

  const cancelReplacement = React.useCallback(() => setPendingReplacement(null), []);

  const subtotal = React.useMemo(
    () => items.reduce((sum, i) => sum + (Number(i.price) || 0) * i.quantity, 0),
    [items]
  );

  // Total units across all lines (sum of quantities) — drives the header badge.
  const totalQuantity = React.useMemo(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items]
  );

  const value = React.useMemo<CartContextValue>(
    () => ({
      items,
      count: items.length,
      totalQuantity,
      subtotal,
      sellerId: items[0]?.sellerId ?? null,
      sellerName: items[0]?.sellerName ?? null,
      hydrated,
      isOpen,
      openCart,
      closeCart,
      addItem,
      removeItem,
      setQuantity,
      clear,
      has,
      pendingReplacement,
      confirmReplacement,
      cancelReplacement,
      buyNowItem,
      isBuyNow: buyNowItem !== null,
      startBuyNow,
      exitBuyNow,
    }),
    [items, totalQuantity, subtotal, hydrated, isOpen, openCart, closeCart, addItem, removeItem, setQuantity, clear, has, pendingReplacement, confirmReplacement, cancelReplacement, buyNowItem, startBuyNow, exitBuyNow]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = React.useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
