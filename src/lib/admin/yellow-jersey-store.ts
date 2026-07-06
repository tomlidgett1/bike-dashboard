import type { SupabaseClient } from '@supabase/supabase-js';

function sanitiseEnvValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

export function getYellowJerseyStoreUserIdFromEnv(): string | null {
  return sanitiseEnvValue(process.env.YELLOW_JERSEY_STORE_USER_ID);
}

export async function resolveYellowJerseyStoreUserId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const fromEnv = getYellowJerseyStoreUserIdFromEnv();
  if (fromEnv) return fromEnv;

  const lookups = [
    supabase
      .from('users')
      .select('user_id')
      .eq('nest_brand_key', 'ash')
      .eq('bicycle_store', true)
      .limit(1),
    supabase
      .from('users')
      .select('user_id')
      .eq('bicycle_store', true)
      .eq('account_type', 'bicycle_store')
      .ilike('business_name', '%yellow jersey%')
      .limit(1),
    supabase
      .from('users')
      .select('user_id')
      .eq('bicycle_store', true)
      .eq('account_type', 'bicycle_store')
      .ilike('business_name', '%ashburton cycles%')
      .limit(1),
  ];

  for (const lookup of lookups) {
    const { data, error } = await lookup;
    if (error) {
      console.error('[yellow-jersey-store] lookup failed:', error.message);
      continue;
    }
    if (data?.[0]?.user_id) return data[0].user_id;
  }

  return null;
}
