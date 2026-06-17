const STORAGE_KEY = "yj_seller_default_pickup_location";

export function getSavedSellerPickupLocation(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function saveSellerPickupLocation(location: string): void {
  if (typeof window === "undefined") return;
  const trimmed = location.trim();
  if (!trimmed) return;
  try {
    localStorage.setItem(STORAGE_KEY, trimmed);
  } catch {
    // Storage unavailable (private mode, etc.)
  }
}

export function withDefaultPickupLocation<T extends { pickupLocation?: string }>(draft: T): T {
  const saved = getSavedSellerPickupLocation();
  if (!saved || draft.pickupLocation?.trim()) return draft;
  return { ...draft, pickupLocation: saved };
}
