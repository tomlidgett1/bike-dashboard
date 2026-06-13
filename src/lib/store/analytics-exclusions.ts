import type { createServiceRoleClient } from "@/lib/supabase/server";

type StoreAnalyticsServiceClient = ReturnType<typeof createServiceRoleClient>;

const INTERNAL_EMAIL_FRAGMENT = "lidgett";

type InternalUserRow = {
  user_id: string | null;
};

export function isInternalAnalyticsEmail(email: string | null | undefined) {
  return typeof email === "string" && email.toLowerCase().includes(INTERNAL_EMAIL_FRAGMENT);
}

export async function getInternalAnalyticsUserIds(service: StoreAnalyticsServiceClient) {
  const excludedUserIds = new Set<string>();
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await service
      .from("users")
      .select("user_id")
      .ilike("email", `%${INTERNAL_EMAIL_FRAGMENT}%`)
      .range(from, from + pageSize - 1);

    if (error) throw error;

    for (const row of (data ?? []) as InternalUserRow[]) {
      if (row.user_id) excludedUserIds.add(row.user_id);
    }

    if (!data || data.length < pageSize) break;
  }

  return excludedUserIds;
}

export function isExcludedAnalyticsUser(
  userId: string | null | undefined,
  storeOwnerId: string,
  internalUserIds: Set<string>,
) {
  return Boolean(userId && (userId === storeOwnerId || internalUserIds.has(userId)));
}
