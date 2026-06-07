import { NextRequest, NextResponse } from 'next/server'
import {
  executeGmailCreateDraft,
  getGmailConnection,
  isComposioConfigured,
  listGmailConnections,
  mintGmailConnectLink,
  searchGmailEmails,
} from '@/lib/composio/gmail'
import {
  buildGmailResponseSuggestions,
  gmailReplySubject,
  gmailSuggestionToHiddenRow,
  parseGmailSender,
  type GmailResponseSuggestion,
  type GmailSuggestionIntent,
  type GmailSuggestionPriority,
} from '@/lib/composio/gmail-response-suggestions'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type StoreAuth = {
  supabase: Awaited<ReturnType<typeof createClient>>
  user: { id: string }
  profile: { business_name: string | null }
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

async function loadHiddenMessageIds(auth: StoreAuth): Promise<Set<string>> {
  const hiddenIds = new Set<string>()
  const { data, error } = await auth.supabase
    .from('store_gmail_hidden_response_suggestions')
    .select('message_id')
    .eq('user_id', auth.user.id)

  if (error) {
    console.warn('[homev2-gmail-suggestions] hidden filter unavailable:', error.message)
    return hiddenIds
  }

  for (const row of data ?? []) {
    const messageId = String(row.message_id ?? '').trim()
    if (messageId) hiddenIds.add(messageId)
  }
  return hiddenIds
}

function pickString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normaliseIntent(value: unknown): GmailSuggestionIntent {
  const raw = pickString(value)
  if (
    raw === 'service_booking' ||
    raw === 'stock_check' ||
    raw === 'quote_request' ||
    raw === 'warranty' ||
    raw === 'order_status' ||
    raw === 'general_reply'
  ) {
    return raw
  }
  return 'general_reply'
}

function normalisePriority(value: unknown): GmailSuggestionPriority {
  const raw = pickString(value)
  return raw === 'urgent' || raw === 'low' ? raw : 'normal'
}

function parseSuggestion(value: unknown): GmailResponseSuggestion | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const messageId = pickString(row.messageId ?? row.message_id ?? row.id)
  const from = pickString(row.from)
  const sender = parseGmailSender(from)
  const senderEmail = pickString(row.senderEmail ?? row.sender_email) || sender.email
  if (!messageId || !senderEmail) return null

  const senderName = pickString(row.senderName ?? row.sender_name) || sender.name || senderEmail
  const responseDraft = pickString(row.responseDraft ?? row.response_draft)

  return {
    id: messageId,
    messageId,
    threadId: pickString(row.threadId ?? row.thread_id) || null,
    from,
    senderName,
    senderEmail,
    subject: pickString(row.subject),
    snippet: pickString(row.snippet),
    dateLabel: pickString(row.dateLabel ?? row.date_label) || null,
    intent: normaliseIntent(row.intent),
    priority: normalisePriority(row.priority),
    label: pickString(row.label) || `Reply to ${senderName}`,
    reason: pickString(row.reason),
    responseDraft,
    canDraft: true,
  }
}

async function persistSuggestion(
  auth: StoreAuth,
  suggestion: GmailResponseSuggestion,
  action: 'hidden' | 'drafted',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await auth.supabase
    .from('store_gmail_hidden_response_suggestions')
    .upsert(gmailSuggestionToHiddenRow(auth.user.id, suggestion, action), {
      onConflict: 'user_id,message_id',
    })

  if (error) {
    console.warn('[homev2-gmail-suggestions] persist failed:', error.message)
    return { ok: false, error: error.message }
  }

  return { ok: true }
}

export async function GET() {
  try {
    const auth = await requireStoreUser()
    if ('error' in auth) return auth.error

    if (!isComposioConfigured()) {
      return NextResponse.json({
        suggestions: [],
        gmail: { configured: false, connected: false, connectUrl: null },
      })
    }

    const connections = await listGmailConnections(auth.user.id)
    if (connections.length === 0) {
      const link = await mintGmailConnectLink(auth.user.id).catch((error) => {
        console.warn('[homev2-gmail-suggestions] connect link unavailable:', error)
        return null
      })
      return NextResponse.json({
        suggestions: [],
        gmail: {
          configured: true,
          connected: false,
          connectUrl: link?.url ?? null,
          accounts: [],
        },
      })
    }

    const hiddenMessageIds = await loadHiddenMessageIds(auth)
    const payload = await searchGmailEmails(auth.user.id, {
      query: 'in:inbox newer_than:14d -category:promotions -category:social',
      max_results: 12,
    })

    const suggestions = await buildGmailResponseSuggestions({
      emails: payload.emails,
      storeName: auth.profile.business_name,
      hiddenMessageIds,
      limit: 4,
    })

    return NextResponse.json({
      suggestions,
      gmail: {
        configured: true,
        connected: true,
        connectUrl: (await mintGmailConnectLink(auth.user.id).catch(() => null))?.url ?? null,
        accounts: connections.map((connection) => ({
          id: connection.id,
          label: connection.label,
          email_address: connection.email_address ?? null,
          status: connection.status,
        })),
      },
    })
  } catch (error) {
    console.error('[homev2-gmail-suggestions] GET failed:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Could not load Gmail suggestions.',
        suggestions: [],
        gmail: { configured: isComposioConfigured(), connected: false, connectUrl: null },
      },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreUser()
    if ('error' in auth) return auth.error

    const body = (await request.json()) as {
      action?: string
      suggestion?: unknown
      responseDraft?: string
    }
    const action = pickString(body.action)
    const suggestion = parseSuggestion(body.suggestion)

    if (!suggestion) {
      return NextResponse.json({ error: 'Invalid Gmail suggestion payload.' }, { status: 400 })
    }

    if (action === 'hide') {
      const persisted = await persistSuggestion(auth, suggestion, 'hidden')
      if (!persisted.ok) {
        return NextResponse.json({ error: 'Could not hide Gmail suggestion.' }, { status: 500 })
      }
      return NextResponse.json({ ok: true })
    }

    if (action === 'draft') {
      if (!isComposioConfigured()) {
        return NextResponse.json({ error: 'Gmail integration is not configured.' }, { status: 503 })
      }

      const connection =
        (suggestion.connectedAccountId
          ? await getGmailConnection(auth.user.id, suggestion.connectedAccountId)
          : null) ?? (await getGmailConnection(auth.user.id))
      if (!connection || connection.status !== 'ACTIVE') {
        return NextResponse.json({ error: 'Connect Gmail before creating drafts.' }, { status: 409 })
      }

      const responseDraft = pickString(body.responseDraft) || suggestion.responseDraft
      if (!responseDraft) {
        return NextResponse.json({ error: 'Draft body is required.' }, { status: 400 })
      }

      const finalSuggestion = { ...suggestion, responseDraft }
      const result = await executeGmailCreateDraft(auth.user.id, {
        recipient_email: suggestion.senderEmail,
        subject: gmailReplySubject(suggestion.subject),
        body: responseDraft,
        connected_account_id: connection.id,
      })
      await persistSuggestion(auth, finalSuggestion, 'drafted')

      return NextResponse.json({
        ok: true,
        message: `Created Gmail draft to ${suggestion.senderEmail}.`,
        result,
      })
    }

    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 })
  } catch (error) {
    console.error('[homev2-gmail-suggestions] POST failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not update Gmail suggestion.' },
      { status: 500 },
    )
  }
}
