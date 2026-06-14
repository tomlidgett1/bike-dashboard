import { NextRequest, NextResponse } from 'next/server'
import { requireStoreUser } from '@/lib/customer-inquiries/auth'
import {
  loadEmailStyleProfile,
  updateEmailStyleProfileFields,
} from '@/lib/customer-inquiries/style-profile'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const auth = await requireStoreUser()
    if ('error' in auth) return auth.error

    const profile = await loadEmailStyleProfile(
      auth.supabase,
      auth.user.id,
      auth.profile.business_name,
    )

    return NextResponse.json({ profile })
  } catch (error) {
    console.error('[customer-inquiries/style-profile] GET failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load reply style.' },
      { status: 500 },
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireStoreUser()
    if ('error' in auth) return auth.error

    const body = (await request.json()) as {
      greeting_style?: string
      signoff_style?: string
    }

    if (typeof body.greeting_style !== 'string' && typeof body.signoff_style !== 'string') {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
    }

    const profile = await updateEmailStyleProfileFields(
      auth.supabase,
      auth.user.id,
      {
        greeting_style: body.greeting_style,
        signoff_style: body.signoff_style,
      },
      auth.profile.business_name,
    )

    return NextResponse.json({ profile })
  } catch (error) {
    console.error('[customer-inquiries/style-profile] PATCH failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not save reply style.' },
      { status: 500 },
    )
  }
}
