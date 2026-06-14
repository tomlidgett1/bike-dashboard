import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export type StoreAuth = {
  supabase: Awaited<ReturnType<typeof createClient>>
  user: { id: string }
  profile: {
    business_name: string | null
  }
}

export async function requireStoreUser(): Promise<StoreAuth | { error: NextResponse }> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }) }
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('account_type, bicycle_store, business_name')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profileError) {
    return {
      error: NextResponse.json({ error: 'Could not load store profile.' }, { status: 500 }),
    }
  }

  if (profile?.account_type !== 'bicycle_store' || profile?.bicycle_store !== true) {
    return { error: NextResponse.json({ error: 'Store access required.' }, { status: 403 }) }
  }

  return {
    supabase,
    user: { id: user.id },
    profile: { business_name: profile.business_name ?? null },
  }
}
