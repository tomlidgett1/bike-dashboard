import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export type StoreAuth = {
  supabase: Awaited<ReturnType<typeof createClient>>
  actorUserId: string
  storeId: string | null
  role: 'owner' | 'manager' | 'sales' | 'service' | 'staff'
  user: { id: string }
  profile: {
    business_name: string | null
    nest_brand_key: string | null
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
    .select('account_type, bicycle_store, business_name, nest_brand_key')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profileError) {
    return {
      error: NextResponse.json({ error: 'Could not load store profile.' }, { status: 500 }),
    }
  }

  if (profile?.account_type !== 'bicycle_store' || profile?.bicycle_store !== true) {
    const { data: membership, error: membershipError } = await supabase
      .from('store_memberships')
      .select('store_id, role, stores(owner_user_id)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    if (membershipError || !membership) {
      return { error: NextResponse.json({ error: 'Store access required.' }, { status: 403 }) }
    }

    const storeRelation = Array.isArray(membership.stores)
      ? membership.stores[0]
      : membership.stores
    const ownerUserId = storeRelation?.owner_user_id
    if (!ownerUserId) {
      return { error: NextResponse.json({ error: 'Store access required.' }, { status: 403 }) }
    }

    const admin = createServiceRoleClient()
    const { data: ownerProfile, error: ownerProfileError } = await admin
      .from('users')
      .select('business_name, nest_brand_key')
      .eq('user_id', ownerUserId)
      .maybeSingle()
    if (ownerProfileError || !ownerProfile) {
      return {
        error: NextResponse.json({ error: 'Could not load store profile.' }, { status: 500 }),
      }
    }

    const role = ['owner', 'manager', 'sales', 'service', 'staff'].includes(String(membership.role))
      ? membership.role as StoreAuth['role']
      : 'staff'
    return {
      supabase,
      actorUserId: user.id,
      storeId: String(membership.store_id),
      role,
      user: { id: String(ownerUserId) },
      profile: {
        business_name: ownerProfile.business_name ?? null,
        nest_brand_key: ownerProfile.nest_brand_key ?? null,
      },
    }
  }

  return {
    supabase,
    actorUserId: user.id,
    storeId: null,
    role: 'owner',
    user: { id: user.id },
    profile: {
      business_name: profile.business_name ?? null,
      nest_brand_key: profile.nest_brand_key ?? null,
    },
  }
}
