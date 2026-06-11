// Supplier invoice inbox monitor. GET lists tracked invoices and (with
// ?scan=1) re-scans the connected Gmail inbox for new PDF invoices — the
// homepage pill polls this every 2 minutes. POST dismisses an invoice.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isComposioConfigured } from '@/lib/composio/client'
import { listGmailConnections } from '@/lib/composio/gmail'
import { scanGmailForSupplierInvoices } from '@/lib/genie/supplier-invoices'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type StoreAuth = {
  supabase: Awaited<ReturnType<typeof createClient>>
  user: { id: string }
}

async function requireStoreUser(): Promise<StoreAuth | { error: NextResponse }> {
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
    .select('account_type, bicycle_store')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profileError) {
    return { error: NextResponse.json({ error: 'Could not load store profile.' }, { status: 500 }) }
  }
  if (profile?.account_type !== 'bicycle_store' || profile?.bicycle_store !== true) {
    return { error: NextResponse.json({ error: 'Store access required.' }, { status: 403 }) }
  }

  return { supabase, user: { id: user.id } }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireStoreUser()
    if ('error' in auth) return auth.error

    const shouldScan = request.nextUrl.searchParams.get('scan') === '1'
    let scan: { scanned: number; new_invoices: number } | null = null
    let gmailConnected = false

    if (isComposioConfigured()) {
      try {
        const connections = await listGmailConnections(auth.user.id)
        gmailConnected = connections.length > 0
        if (shouldScan && gmailConnected) {
          scan = await scanGmailForSupplierInvoices(auth.supabase, auth.user.id)
        }
      } catch (error) {
        console.warn('[supplier-invoices] scan failed:', error)
      }
    }

    const { data, error } = await auth.supabase
      .from('store_supplier_invoices')
      .select('id, source, attachment_filename, email_subject, email_from, email_date, status, lightspeed_order_id, lightspeed_order_url, created_at')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(25)

    if (error) {
      return NextResponse.json({ error: 'Could not load supplier invoices.' }, { status: 500 })
    }

    const invoices = data ?? []
    return NextResponse.json({
      gmail_connected: gmailConnected,
      scan,
      pending: invoices.filter((row) => row.status === 'detected' || row.status === 'failed'),
      processing: invoices.filter((row) => row.status === 'processing'),
      recent: invoices.filter((row) => row.status === 'po_created').slice(0, 5),
    })
  } catch (error) {
    console.error('[supplier-invoices] GET failed:', error)
    return NextResponse.json({ error: 'Could not check supplier invoices.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreUser()
    if ('error' in auth) return auth.error

    const body = (await request.json()) as { action?: string; invoice_id?: string }
    if (body.action !== 'dismiss' || !body.invoice_id?.trim()) {
      return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 })
    }

    const { error } = await auth.supabase
      .from('store_supplier_invoices')
      .update({ status: 'dismissed', updated_at: new Date().toISOString() })
      .eq('user_id', auth.user.id)
      .eq('id', body.invoice_id.trim())

    if (error) {
      return NextResponse.json({ error: 'Could not dismiss the invoice.' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[supplier-invoices] POST failed:', error)
    return NextResponse.json({ error: 'Could not update the invoice.' }, { status: 500 })
  }
}
