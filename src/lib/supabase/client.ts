import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

export function createClient(): SupabaseClient {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Fresh client per call avoids stale PKCE state after sign-out (see supabase/ssr#55).
      isSingleton: false,
      auth: {
        detectSessionInUrl: false,
      },
    }
  )
}





