import type { SupabaseClient } from '@supabase/supabase-js';

export async function getUserUnreadMessageCount(
  supabase: SupabaseClient,
  userId: string
): Promise<{ count: number; error: Error | null }> {
  const { data, error } = await supabase
    .from('conversation_participants')
    .select('unread_count')
    .eq('user_id', userId)
    .eq('is_archived', false);

  if (error) {
    return { count: 0, error: new Error(error.message) };
  }

  const count = (data ?? []).reduce(
    (sum, row) => sum + (row.unread_count ?? 0),
    0
  );

  return { count, error: null };
}
