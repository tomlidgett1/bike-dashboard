import type { BikeDraft } from "@/app/marketplace/sell-redesign/_components/data";

const STORAGE_KEY = "yj-single-item-photo-draft";

export type SingleItemPhotoDraft = Pick<BikeDraft, "images" | "uploadedImages">;

export function stashSingleItemPhotoDraft(draft: SingleItemPhotoDraft) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // ignore quota errors
  }
}

export function readSingleItemPhotoDraft(): SingleItemPhotoDraft | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    const parsed = JSON.parse(raw) as SingleItemPhotoDraft;
    if (!parsed?.images?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSingleItemPhotoDraft() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
