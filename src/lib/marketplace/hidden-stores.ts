const HIDDEN_MARKETPLACE_STORE_IDS = new Set([
  "0a773f17-15a3-47d5-9fa2-bddf903c5eab", // Mercedes
]);

const HIDDEN_MARKETPLACE_STORE_NAMES = new Set(["mercedes"]);

type MarketplaceStoreLike = {
  id?: string | null;
  user_id?: string | null;
  store_name?: string | null;
  business_name?: string | null;
  name?: string | null;
};

function normaliseStoreName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function getHiddenMarketplaceStoreIds(): string[] {
  return [...HIDDEN_MARKETPLACE_STORE_IDS];
}

export function isHiddenMarketplaceStoreUserId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return HIDDEN_MARKETPLACE_STORE_IDS.has(userId);
}

export function isHiddenMarketplaceStore(store: MarketplaceStoreLike): boolean {
  const id = store.id ?? store.user_id;
  if (id && HIDDEN_MARKETPLACE_STORE_IDS.has(id)) return true;

  const name = normaliseStoreName(store.store_name ?? store.business_name ?? store.name);
  return HIDDEN_MARKETPLACE_STORE_NAMES.has(name);
}

export function filterVisibleMarketplaceStores<T extends MarketplaceStoreLike>(stores: T[]): T[] {
  return stores.filter((store) => !isHiddenMarketplaceStore(store));
}

export function filterVisibleMarketplaceStoreProducts<
  T extends { user_id?: string | null; store_name?: string | null },
>(products: T[]): T[] {
  return products.filter(
    (product) =>
      !isHiddenMarketplaceStoreUserId(product.user_id) &&
      !HIDDEN_MARKETPLACE_STORE_NAMES.has(normaliseStoreName(product.store_name)),
  );
}
