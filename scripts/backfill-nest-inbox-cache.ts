import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import {
  applyResolvedInquiryCustomerNames,
  applyResolvedNestDisplayNames,
  extractPhoneFromInquirySender,
  extractPhoneFromNestChat,
  nestChatNeedsNameEnrichment,
  normalizePhoneForDirectory,
  upsertPhoneContactToDb,
} from "../src/lib/customer-inquiries/lightspeed-phone-directory";
import type { CustomerInquiryListItem } from "../src/lib/customer-inquiries/types";
import type { NestConversationListItem } from "../src/lib/nest/types";
import { resolveStoreNestBrandKey } from "../src/lib/nest/resolve-store-brand-key";
import {
  getLightspeedPhoneNameIndex,
  resolveLightspeedNamesFromIndex,
} from "../src/lib/services/lightspeed/customer-search";
import {
  loadCachedNestList,
  syncNestInboxFromPortal,
} from "../src/lib/store/unified-inbox-sync";

type StoreProfile = {
  user_id: string;
  business_name: string | null;
  nest_brand_key: string | null;
};

type InquiryNameRow = {
  id: string;
  sender_name: string | null;
  sender_email: string | null;
  lightspeed_customer_name: string | null;
};

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() || null : null;
}

function numericArg(name: string, fallback: number): number {
  const value = argValue(name);
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function getServiceRoleClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function loadStoreProfiles(
  supabase: ReturnType<typeof getServiceRoleClient>,
  userId: string | null,
): Promise<StoreProfile[]> {
  let query = supabase
    .from("users")
    .select("user_id, business_name, nest_brand_key")
    .eq("account_type", "bicycle_store")
    .eq("bicycle_store", true);

  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;
  if (error) throw new Error(`Could not load store users: ${error.message}`);
  return (data ?? []) as StoreProfile[];
}

async function loadInquiryNameRows(
  supabase: ReturnType<typeof getServiceRoleClient>,
  userId: string,
): Promise<CustomerInquiryListItem[]> {
  const { data, error } = await supabase
    .from("store_customer_inquiries")
    .select("id, sender_name, sender_email, lightspeed_customer_name")
    .eq("user_id", userId);

  if (error) {
    console.error("[backfill-nest-inbox-cache] inquiry load failed:", error.message);
    return [];
  }

  return ((data ?? []) as InquiryNameRow[]).map((row) => ({
    id: row.id,
    sender_name: row.sender_name ?? "",
    sender_email: row.sender_email ?? "",
    lightspeed_customer_name: row.lightspeed_customer_name,
  })) as CustomerInquiryListItem[];
}

function collectPhonesNeedingNames(
  nestChats: NestConversationListItem[],
  inquiries: CustomerInquiryListItem[],
): string[] {
  const phones = new Set<string>();

  for (const chat of nestChats) {
    if (!nestChatNeedsNameEnrichment(chat)) continue;
    const phone = extractPhoneFromNestChat(chat);
    if (phone) phones.add(phone);
  }

  for (const inquiry of inquiries) {
    if (inquiry.lightspeed_customer_name?.trim()) continue;
    const phone = extractPhoneFromInquirySender(inquiry.sender_email, inquiry.sender_name);
    if (phone) phones.add(phone);
  }

  return Array.from(phones);
}

async function persistResolvedPhoneNames(
  supabase: ReturnType<typeof getServiceRoleClient>,
  userId: string,
  namesByPhone: Map<string, string>,
): Promise<void> {
  for (const [phone, displayName] of namesByPhone) {
    const phoneNormalized = normalizePhoneForDirectory(phone);
    if (!phoneNormalized || !displayName.trim()) continue;
    await upsertPhoneContactToDb(supabase, userId, phone, {
      phoneNormalized,
      firstName: null,
      lastName: null,
      displayName,
      lightspeedCustomerId: null,
    });
  }
}

async function main() {
  const userId = argValue("user");
  const threadLimit = numericArg("threads", 500);
  const apiLimit = numericArg("api-limit", 0);
  const indexTimeoutMs = numericArg("index-timeout-ms", 90_000);
  const supabase = getServiceRoleClient();
  const profiles = await loadStoreProfiles(supabase, userId);

  if (profiles.length === 0) {
    console.log("No matching bicycle store users found.");
    return;
  }

  for (const profile of profiles) {
    const brandKey = resolveStoreNestBrandKey(profile);
    console.log(`Backfilling ${profile.business_name ?? profile.user_id} (${brandKey})`);

    let syncedChats: NestConversationListItem[] = [];
    try {
      syncedChats = await syncNestInboxFromPortal(supabase, profile.user_id, brandKey, {
        enrichLightspeed: true,
        syncThreads: true,
        forceThreadSync: true,
        threadLimit,
      });
    } catch (error) {
      console.error(
        `[backfill-nest-inbox-cache] Nest sync failed for ${brandKey}; continuing with cached rows:`,
        error instanceof Error ? error.message : error,
      );
    }

    const [cachedNestChats, inquiries] = await Promise.all([
      loadCachedNestList(supabase, profile.user_id),
      loadInquiryNameRows(supabase, profile.user_id),
    ]);
    const nestChats = cachedNestChats.length > 0 ? cachedNestChats : syncedChats;
    const phones = collectPhonesNeedingNames(nestChats, inquiries);

    console.log(
      `Resolving ${phones.length} phone numbers from ${nestChats.length} Nest chats and ${inquiries.length} enquiries.`,
    );

    const phoneIndex = await getLightspeedPhoneNameIndex(profile.user_id, {
      timeoutMs: indexTimeoutMs,
    });
    console.log(
      `Lightspeed phone index contains ${phoneIndex.size} entries; deep lookup limit ${apiLimit}.`,
    );

    const namesByPhone = await resolveLightspeedNamesFromIndex(
      profile.user_id,
      phones,
      phoneIndex,
      {
        allowScan: apiLimit > 0,
        directLookupLimit: apiLimit,
      },
    );

    await persistResolvedPhoneNames(supabase, profile.user_id, namesByPhone);
    await Promise.all([
      applyResolvedNestDisplayNames(supabase, profile.user_id, nestChats, namesByPhone),
      applyResolvedInquiryCustomerNames(supabase, profile.user_id, inquiries, namesByPhone),
    ]);

    console.log(
      `Done ${profile.business_name ?? profile.user_id}: ${syncedChats.length} Nest chats synced, ${namesByPhone.size}/${phones.length} phone names resolved.`,
    );
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
