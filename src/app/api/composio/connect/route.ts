import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isComposioConfigured } from '@/lib/composio/client'
import { mintGmailConnectLink } from '@/lib/composio/gmail'
import { composioToolkitLabel, mintToolkitConnectLink } from '@/lib/composio/toolkit'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('account_type, bicycle_store')
      .eq('user_id', user.id)
      .single()

    if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
      return NextResponse.json({ error: 'Store access only.' }, { status: 403 })
    }

    if (!isComposioConfigured()) {
      return NextResponse.json({ error: 'Composio is not configured yet.' }, { status: 503 })
    }

    let toolkit = 'gmail'
    try {
      const body = await request.json() as { toolkit?: string }
      if (body.toolkit?.trim()) toolkit = body.toolkit.trim().toLowerCase()
    } catch {
      // Empty body defaults to Gmail for backwards compatibility.
    }

    if (toolkit === 'gmail') {
      const { url } = await mintGmailConnectLink(user.id)
      return NextResponse.json({ url, toolkit, label: composioToolkitLabel(toolkit) })
    }

    const link = await mintToolkitConnectLink(user.id, toolkit)
    return NextResponse.json({
      url: link.url,
      toolkit: link.toolkit,
      label: composioToolkitLabel(link.toolkit),
    })
  } catch (error) {
    console.error('[composio/connect] failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not start connection.' },
      { status: 500 },
    )
  }
}
