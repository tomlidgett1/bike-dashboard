import { createClient } from '@/lib/supabase/server';

export type BicycleStoreSupabase = Awaited<ReturnType<typeof createClient>>;

export async function requireBicycleStore() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: 'Unauthorised' as const, status: 401 as const };
  }

  const { data: profile } = await supabase
    .from('users')
    .select('account_type, bicycle_store')
    .eq('user_id', user.id)
    .single();

  if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
    return { error: 'Forbidden' as const, status: 403 as const };
  }

  return { supabase, user };
}
