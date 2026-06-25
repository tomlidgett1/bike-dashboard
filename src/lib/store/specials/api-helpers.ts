import type { SupabaseClient } from '@supabase/supabase-js';

export interface StoreUserResult {
  userId?: string;
  error?: { status: number; message: string };
}

/**
 * Resolve the authenticated user and verify they are a verified bicycle store —
 * the shared guard for every specials API route (mirrors the store/categories
 * route's checks).
 */
export async function getVerifiedStoreUserId(
  supabase: SupabaseClient,
): Promise<StoreUserResult> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: { status: 401, message: 'Unauthorized. Please log in first.' } };
  }

  const { data: profile } = await supabase
    .from('users')
    .select('account_type, bicycle_store')
    .eq('user_id', user.id)
    .single();

  if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
    return {
      error: { status: 403, message: 'Access denied. Only verified bicycle stores can manage specials.' },
    };
  }

  return { userId: user.id };
}
