export interface StoreSplashSeed {
  storeId: string;
  storeName: string;
  logoUrl: string | null;
  createdAt: number;
}

const STORE_SPLASH_KEY = "yj:store-splash";
const STORE_SPLASH_TTL_MS = 15_000;

export function saveStoreSplashSeed(seed: Omit<StoreSplashSeed, "createdAt">) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(
      STORE_SPLASH_KEY,
      JSON.stringify({ ...seed, createdAt: Date.now() })
    );
  } catch {
    // Session storage is opportunistic; navigation must still work without it.
  }
}

export function readStoreSplashSeed(storeId: string): StoreSplashSeed | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(STORE_SPLASH_KEY);
    if (!raw) return null;

    const seed = JSON.parse(raw) as Partial<StoreSplashSeed>;
    const createdAt = seed.createdAt;
    const isFresh =
      typeof createdAt === "number" &&
      Date.now() - createdAt < STORE_SPLASH_TTL_MS;

    if (
      seed.storeId !== storeId ||
      typeof seed.storeName !== "string" ||
      !isFresh
    ) {
      window.sessionStorage.removeItem(STORE_SPLASH_KEY);
      return null;
    }

    return {
      storeId: seed.storeId,
      storeName: seed.storeName,
      logoUrl: typeof seed.logoUrl === "string" ? seed.logoUrl : null,
      createdAt,
    };
  } catch {
    window.sessionStorage.removeItem(STORE_SPLASH_KEY);
    return null;
  }
}

export function clearStoreSplashSeed() {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(STORE_SPLASH_KEY);
  } catch {
    // Ignore storage failures.
  }
}
