// Service-role Supabase client + tiny helpers shared by the agent functions.
import { createClient } from 'jsr:@supabase/supabase-js@2';

export function createAdminClient() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AdminDb = ReturnType<typeof createAdminClient>;

export function siteUrl(): string {
  const env = Deno.env.get('SITE_URL') || Deno.env.get('NEXT_PUBLIC_SITE_URL') || '';
  const trimmed = env.trim().replace(/\/+$/, '');
  if (trimmed.startsWith('https://') && !trimmed.includes('localhost')) return trimmed;
  return 'https://yellowjersey.store';
}

// Exact-count helper (returns 0 on error).
export async function countRows(
  db: AdminDb,
  table: string,
  apply: (q: ReturnType<AdminDb['from']>) => unknown,
): Promise<number> {
  // deno-lint-ignore no-explicit-any
  let q: any = db.from(table).select('id', { count: 'exact', head: true });
  q = apply(q) ?? q;
  const { count, error } = await q;
  if (error) {
    console.warn(`[seo-db] count ${table} failed:`, error.message);
    return 0;
  }
  return count ?? 0;
}
