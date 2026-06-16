import type { CustomerInquiryListItem } from "@/lib/customer-inquiries/types";
import type { NestConversationListItem } from "@/lib/nest/types";

const STORAGE_KEY = "yj_unified_inbox_v1";

export type UnifiedInboxClientCache = {
  inquiries: CustomerInquiryListItem[];
  nestChats: NestConversationListItem[];
  nestReadMap: Record<string, string>;
  gmailReadMap: Record<string, string>;
  gmail?: {
    configured?: boolean;
    connected?: boolean;
    accounts?: Array<{
      id: string;
      label: string;
      email_address: string | null;
      status: string;
    }>;
  };
  nestConfigured?: boolean;
  fetchedAt: string;
};

export function loadUnifiedInboxFromStorage(): UnifiedInboxClientCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UnifiedInboxClientCache;
    if (!parsed?.fetchedAt) return null;
    return {
      inquiries: Array.isArray(parsed.inquiries) ? parsed.inquiries : [],
      nestChats: Array.isArray(parsed.nestChats) ? parsed.nestChats : [],
      nestReadMap:
        parsed.nestReadMap && typeof parsed.nestReadMap === "object" ? parsed.nestReadMap : {},
      gmailReadMap:
        parsed.gmailReadMap && typeof parsed.gmailReadMap === "object" ? parsed.gmailReadMap : {},
      gmail: parsed.gmail,
      nestConfigured: parsed.nestConfigured ?? true,
      fetchedAt: parsed.fetchedAt,
    };
  } catch {
    return null;
  }
}

export function saveUnifiedInboxToStorage(cache: UnifiedInboxClientCache): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // ignore quota errors
  }
}

export function clearUnifiedInboxStorage(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
