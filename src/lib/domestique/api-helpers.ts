// Shared guard for Domestique API routes — verified bicycle stores only.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface StoreUserResult {
  userId?: string;
  error?: { status: number; message: string };
}

export async function getVerifiedStoreUserId(supabase: SupabaseClient): Promise<StoreUserResult> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: { status: 401, message: "Unauthorised. Please log in first." } };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("account_type, bicycle_store")
    .eq("user_id", user.id)
    .single();

  if (!profile || profile.account_type !== "bicycle_store" || !profile.bicycle_store) {
    return {
      error: { status: 403, message: "Access denied. Only verified bicycle stores can use the Domestique." },
    };
  }

  return { userId: user.id };
}
