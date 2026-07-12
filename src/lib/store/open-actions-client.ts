import { fetchCustomerInquiries } from "@/lib/customer-inquiries/client";
import type { CustomerInquiryListItem } from "@/lib/customer-inquiries/types";
import { fetchMissingBrandProducts } from "@/lib/missing-brands/client";
import type { MissingBrandProduct } from "@/lib/missing-brands/types";
import { fetchMissingCategoryProducts } from "@/lib/missing-categories/client";
import type {
  LightspeedCategoryOption,
  MissingCategoryProduct,
} from "@/lib/missing-categories/types";
import { fetchNestListForActions } from "@/lib/nest/fetch-nest-list";
import type { NestConversationListItem } from "@/lib/nest/types";
import { OPEN_ACTIONS_CATALOG_LIMIT } from "@/lib/store/open-store-actions";

export type OpenActionsSnapshot = {
  enquiries: CustomerInquiryListItem[];
  nestChats: NestConversationListItem[];
  brandProducts: MissingBrandProduct[];
  categoryProducts: MissingCategoryProduct[];
  categoryOptions: LightspeedCategoryOption[];
  fetchedAt: number;
};

const STORAGE_PREFIX = "store-open-actions:v2:";
const MAX_STALE_CACHE_MS = 30 * 60 * 1000;
const memoryCache = new Map<string, OpenActionsSnapshot>();
const inFlightLoads = new Map<string, Promise<OpenActionsSnapshot>>();

function isSnapshot(value: unknown): value is OpenActionsSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OpenActionsSnapshot>;
  return (
    Array.isArray(candidate.enquiries) &&
    Array.isArray(candidate.nestChats) &&
    Array.isArray(candidate.brandProducts) &&
    Array.isArray(candidate.categoryProducts) &&
    Array.isArray(candidate.categoryOptions) &&
    typeof candidate.fetchedAt === "number"
  );
}

function storageKey(scope: string): string {
  return `${STORAGE_PREFIX}${scope}`;
}

export function readOpenActionsSnapshot(scope: string | null): OpenActionsSnapshot | null {
  if (!scope) return null;

  const memory = memoryCache.get(scope);
  if (memory && Date.now() - memory.fetchedAt <= MAX_STALE_CACHE_MS) return memory;

  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(storageKey(scope));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isSnapshot(parsed) || Date.now() - parsed.fetchedAt > MAX_STALE_CACHE_MS) {
      window.sessionStorage.removeItem(storageKey(scope));
      return null;
    }
    memoryCache.set(scope, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeOpenActionsSnapshot(scope: string, snapshot: OpenActionsSnapshot): void {
  memoryCache.set(scope, snapshot);
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(storageKey(scope), JSON.stringify(snapshot));
  } catch {
    // Memory caching still gives same-navigation request deduplication.
  }
}

function fulfilledValue<T>(
  result: PromiseSettledResult<T>,
  fallback: T,
): T {
  return result.status === "fulfilled" ? result.value : fallback;
}

export function fetchOpenActionsSnapshot(scope: string): Promise<OpenActionsSnapshot> {
  const existingLoad = inFlightLoads.get(scope);
  if (existingLoad) return existingLoad;

  const previous = readOpenActionsSnapshot(scope);
  const request = Promise.allSettled([
    fetchCustomerInquiries("draft_ready", { summary: true }),
    fetchNestListForActions(),
    fetchMissingBrandProducts(OPEN_ACTIONS_CATALOG_LIMIT),
    fetchMissingCategoryProducts(OPEN_ACTIONS_CATALOG_LIMIT, {
      includeCategories: false,
    }),
  ])
    .then(([enquiryResult, nestResult, brandResult, categoryResult]) => {
      const failed = [enquiryResult, nestResult, brandResult, categoryResult].filter(
        (result) => result.status === "rejected",
      );
      if (failed.length === 4 && !previous) {
        const reason = failed[0]?.status === "rejected" ? failed[0].reason : null;
        throw reason instanceof Error ? reason : new Error("Could not load actions.");
      }

      const enquiryData = fulfilledValue(enquiryResult, {
        inquiries: previous?.enquiries ?? [],
      });
      const nestChats = fulfilledValue(nestResult, previous?.nestChats ?? []);
      const brandData = fulfilledValue(brandResult, {
        products: previous?.brandProducts ?? [],
      });
      const categoryData = fulfilledValue(categoryResult, {
        products: previous?.categoryProducts ?? [],
        categories: previous?.categoryOptions ?? [],
      });

      const snapshot: OpenActionsSnapshot = {
        enquiries: enquiryData.inquiries ?? [],
        nestChats,
        brandProducts: brandData.products ?? [],
        categoryProducts: categoryData.products ?? [],
        categoryOptions: categoryData.categories ?? previous?.categoryOptions ?? [],
        fetchedAt: Date.now(),
      };
      writeOpenActionsSnapshot(scope, snapshot);
      return snapshot;
    })
    .finally(() => {
      inFlightLoads.delete(scope);
    });

  inFlightLoads.set(scope, request);
  return request;
}

export function updateOpenActionsSnapshot(
  scope: string,
  update: (current: OpenActionsSnapshot) => OpenActionsSnapshot,
): void {
  const current = readOpenActionsSnapshot(scope);
  if (!current) return;
  writeOpenActionsSnapshot(scope, update(current));
}
