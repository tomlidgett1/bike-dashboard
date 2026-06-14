import { NextRequest, NextResponse } from 'next/server'
import {
  isComposioConfigured,
  listGmailConnections,
  mintGmailConnectLink,
} from '@/lib/composio/gmail'
import { requireStoreUser } from '@/lib/customer-inquiries/auth'
import {
  mapCustomerInquiryRow,
  refreshCustomerInquiriesForUser,
} from '@/lib/customer-inquiries/sync'
import { serializeInquiryListItem } from '@/lib/customer-inquiries/serialize'
import type { CustomerInquiryStatus } from '@/lib/customer-inquiries/types'

export const dynamic = 'force-dynamic'

const VALID_STATUSES: CustomerInquiryStatus[] = [
  'new',
  'processing',
  'draft_ready',
  'sent',
  'ignored',
  'error',
]

export async function GET(request: NextRequest) {
  try {
    const auth = await requireStoreUser()
    if ('error' in auth) return auth.error

    const statusParam = request.nextUrl.searchParams.get('status')?.trim()
    let query = auth.supabase
      .from('store_customer_inquiries')
      .select('*')
      .eq('user_id', auth.user.id)
      .order('received_at', { ascending: false, nullsFirst: false })
      .limit(100)

    if (statusParam && statusParam !== 'all' && VALID_STATUSES.includes(statusParam as CustomerInquiryStatus)) {
      query = query.eq('status', statusParam)
    }

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: 'Could not load customer inquiries.' }, { status: 500 })
    }

    const configured = isComposioConfigured()
    const connections = configured ? await listGmailConnections(auth.user.id).catch(() => []) : []

    return NextResponse.json({
      inquiries: (data ?? []).map((row) =>
        serializeInquiryListItem(mapCustomerInquiryRow(row as Record<string, unknown>)),
      ),
      gmail: {
        configured,
        connected: connections.length > 0,
        connectUrl: null,
        accounts: connections.map((connection) => ({
          id: connection.id,
          label: connection.label,
          email_address: connection.email_address ?? null,
          status: connection.status,
        })),
      },
    })
  } catch (error) {
    console.error('[customer-inquiries] GET failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load customer inquiries.' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreUser()
    if ('error' in auth) return auth.error

    const body = (await request.json()) as { action?: string }
    const action = String(body.action ?? '').trim()

    if (action === 'connect') {
      if (!isComposioConfigured()) {
        return NextResponse.json({ error: 'Gmail integration is not configured.' }, { status: 503 })
      }
      const link = await mintGmailConnectLink(auth.user.id)
      return NextResponse.json({ connectUrl: link.url })
    }

    if (action === 'refresh') {
      if (!isComposioConfigured()) {
        return NextResponse.json({ error: 'Gmail integration is not configured.' }, { status: 503 })
      }

      const connections = await listGmailConnections(auth.user.id)
      if (connections.length === 0) {
        return NextResponse.json({ error: 'Connect Gmail before refreshing inquiries.' }, { status: 409 })
      }

      const sync = await refreshCustomerInquiriesForUser(
        auth.supabase,
        auth.user.id,
        auth.profile.business_name,
      )

      const { data, error } = await auth.supabase
        .from('store_customer_inquiries')
        .select('*')
        .eq('user_id', auth.user.id)
        .order('received_at', { ascending: false, nullsFirst: false })
        .limit(100)

      if (error) {
        return NextResponse.json({ error: 'Could not load customer inquiries.' }, { status: 500 })
      }

      return NextResponse.json({
        inquiries: (data ?? []).map((row) =>
          serializeInquiryListItem(mapCustomerInquiryRow(row as Record<string, unknown>)),
        ),
        sync,
        gmail: {
          configured: true,
          connected: true,
          connectUrl: null,
          accounts: connections.map((connection) => ({
            id: connection.id,
            label: connection.label,
            email_address: connection.email_address ?? null,
            status: connection.status,
          })),
        },
      })
    }

    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 })
  } catch (error) {
    console.error('[customer-inquiries] POST failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not update customer inquiries.' },
      { status: 500 },
    )
  }
}
