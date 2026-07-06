import { NextRequest, NextResponse } from 'next/server'
import { requireStoreUser } from '@/lib/customer-inquiries/auth'
import { loadNestCloseMapFromSupabase } from '@/lib/nest/inbox-supabase'
import {
  deriveNestChannel,
  filterNestCustomerChats,
  nestConversationNeedsAction,
  type NestChannel,
  type NestFirstMessageHint,
} from '@/lib/nest/types'

export const dynamic = 'force-dynamic'

type InboxChannel = NestChannel | 'email'

type ConversationRow = {
  chat_id: string
  preview_role: string
  last_message_at: string
  last_customer_message_at: string | null
  has_manual_messages: boolean
  latest_manual_message_at: string | null
  source: 'customer' | 'portal_test'
  triggered_by_twilio: boolean
}

type MessageRow = {
  chat_id: string
  role: string
  handle: string | null
  created_at: string
  source: string | null
}

type RangeKey = '7d' | '30d' | '90d' | 'all'

const RANGE_DAYS: Record<Exclude<RangeKey, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 }

function isManualStaffMessage(m: Pick<MessageRow, 'role' | 'handle' | 'source'>): boolean {
  return (
    m.handle?.startsWith('staff@') === true ||
    m.source?.startsWith('brand_portal_') === true
  )
}

/** YYYY-MM-DD of a timestamp in Melbourne time. */
function melbourneYmd(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

/** Hour (0-23) and ISO weekday index (0 = Monday) of a timestamp in Melbourne time. */
function melbourneHourAndWeekday(at: Date): { hour: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    hour: 'numeric',
    hour12: false,
    weekday: 'short',
  }).formatToParts(at)
  const hourRaw = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  const weekdayName = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon'
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekdayName)
  return { hour: Number.isFinite(hourRaw) ? hourRaw % 24 : 0, weekday: weekday >= 0 ? weekday : 0 }
}

/** Median of a non-empty numeric array; null when empty. */
function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireStoreUser()
    if ('error' in auth) return auth.error

    const rangeParam = (request.nextUrl.searchParams.get('range') ?? '30d') as RangeKey
    const rangeDays = rangeParam === 'all' ? null : (RANGE_DAYS[rangeParam] ?? 30)
    const rangeStart = rangeDays ? new Date(Date.now() - rangeDays * 86_400_000) : null

    const [conversationsRes, messagesRes, inquiriesRes, closeMap] = await Promise.all([
      auth.supabase
        .from('store_nest_conversations')
        .select(
          'chat_id, preview_role, last_message_at, last_customer_message_at, has_manual_messages, latest_manual_message_at, source, triggered_by_twilio',
        )
        .eq('user_id', auth.user.id)
        .limit(2000),
      auth.supabase
        .from('store_nest_messages')
        .select('chat_id, role, handle, created_at, source:metadata->>source')
        .eq('user_id', auth.user.id)
        .order('created_at', { ascending: true })
        .limit(20000),
      auth.supabase
        .from('store_customer_inquiries')
        .select('received_at, status')
        .eq('user_id', auth.user.id)
        .limit(2000),
      loadNestCloseMapFromSupabase(auth.supabase, auth.user.id),
    ])

    if (conversationsRes.error || messagesRes.error || inquiriesRes.error) {
      const message =
        conversationsRes.error?.message ??
        messagesRes.error?.message ??
        inquiriesRes.error?.message
      console.error('[inquiries-analytics] load failed:', message)
      return NextResponse.json({ error: 'Could not load enquiry analytics.' }, { status: 500 })
    }

    const allChats = filterNestCustomerChats(
      ((conversationsRes.data ?? []) as ConversationRow[]).map((row) => ({
        chatId: row.chat_id,
        title: '',
        displayName: null,
        participantHandle: null,
        preview: '',
        previewRole: row.preview_role,
        lastMessageAt: row.last_message_at,
        lastCustomerMessageAt: row.last_customer_message_at,
        hasManualMessages: row.has_manual_messages,
        latestManualMessageAt: row.latest_manual_message_at,
        source: row.source,
        triggeredByTwilio: row.triggered_by_twilio,
      })),
    )
    const chatIds = new Set(allChats.map((c) => c.chatId))

    // Group messages per chat (already ordered oldest-first).
    const messagesByChat = new Map<string, MessageRow[]>()
    for (const raw of (messagesRes.data ?? []) as MessageRow[]) {
      if (!chatIds.has(raw.chat_id)) continue
      const list = messagesByChat.get(raw.chat_id)
      if (list) list.push(raw)
      else messagesByChat.set(raw.chat_id, [raw])
    }

    const chatStartedAt = (chatId: string, fallback: string): Date => {
      const first = messagesByChat.get(chatId)?.[0]
      return new Date(first?.created_at ?? fallback)
    }

    // Range filter: a Nest conversation belongs to the range if it STARTED in it.
    const chats = allChats.filter(
      (c) => !rangeStart || chatStartedAt(c.chatId, c.lastMessageAt) >= rangeStart,
    )

    const emailInquiries = ((inquiriesRes.data ?? []) as { received_at: string | null; status: string }[]).filter(
      (i) => !rangeStart || (i.received_at ? new Date(i.received_at) >= rangeStart : false),
    )

    // ── Channel breakdown ──
    const channelCounts: Record<InboxChannel, number> = {
      website_chat: 0,
      missed_call: 0,
      store_outreach: 0,
      email: emailInquiries.length,
    }
    const channelByChat = new Map<string, NestChannel>()
    for (const chat of chats) {
      const first = messagesByChat.get(chat.chatId)?.[0]
      const hint: NestFirstMessageHint | null = first
        ? { role: first.role, handle: first.handle, source: first.source }
        : null
      const channel = deriveNestChannel(chat, hint)
      channelByChat.set(chat.chatId, channel)
      channelCounts[channel] += 1
    }

    // ── Message + conversation stats ──
    let customerMessages = 0
    let nestAutoMessages = 0
    let manualStaffMessages = 0
    const messagesPerConversation: number[] = []
    const durationsMinutes: number[] = []
    const firstReplySeconds: number[] = []
    const hourHistogram = new Array<number>(24).fill(0)
    const weekdayHistogram = new Array<number>(7).fill(0) // 0 = Monday
    let missedCallTotal = 0
    let missedCallEngaged = 0
    let awaitingReply = 0

    for (const chat of chats) {
      const msgs = messagesByChat.get(chat.chatId) ?? []
      const visible = msgs.filter((m) => m.role === 'user' || m.role === 'assistant')
      if (visible.length > 0) messagesPerConversation.push(visible.length)

      let firstCustomerAt: Date | null = null
      let measuredFirstReply = false
      for (const m of visible) {
        if (m.role === 'user') {
          customerMessages += 1
          const at = new Date(m.created_at)
          if (!firstCustomerAt) firstCustomerAt = at
          const { hour, weekday } = melbourneHourAndWeekday(at)
          hourHistogram[hour] += 1
          weekdayHistogram[weekday] += 1
        } else if (isManualStaffMessage(m)) {
          manualStaffMessages += 1
        } else {
          nestAutoMessages += 1
        }
        // First reply per conversation: time from the customer's first message
        // to the first shop-side answer that follows it.
        if (!measuredFirstReply && firstCustomerAt && m.role === 'assistant') {
          const delta = (new Date(m.created_at).getTime() - firstCustomerAt.getTime()) / 1000
          if (delta >= 0) {
            firstReplySeconds.push(delta)
            measuredFirstReply = true
          }
        }
      }

      if (visible.length >= 2) {
        const first = new Date(visible[0].created_at).getTime()
        const last = new Date(visible[visible.length - 1].created_at).getTime()
        if (last > first) durationsMinutes.push((last - first) / 60_000)
      }

      if (chat.triggeredByTwilio) {
        missedCallTotal += 1
        if (visible.some((m) => m.role === 'user')) missedCallEngaged += 1
      }

      if (nestConversationNeedsAction(chat, closeMap[chat.chatId] ?? null)) {
        awaitingReply += 1
      }
    }

    // ── Daily volume series (new conversations per day, last N days) ──
    const seriesDays = rangeDays ?? 90
    const daily: { date: string; nest: number; email: number }[] = []
    const dayIndex = new Map<string, number>()
    for (let i = seriesDays - 1; i >= 0; i--) {
      const key = melbourneYmd(new Date(Date.now() - i * 86_400_000))
      dayIndex.set(key, daily.length)
      daily.push({ date: key, nest: 0, email: 0 })
    }
    for (const chat of chats) {
      const key = melbourneYmd(chatStartedAt(chat.chatId, chat.lastMessageAt))
      const idx = dayIndex.get(key)
      if (idx != null) daily[idx].nest += 1
    }
    for (const inquiry of emailInquiries) {
      if (!inquiry.received_at) continue
      const idx = dayIndex.get(melbourneYmd(new Date(inquiry.received_at)))
      if (idx != null) daily[idx].email += 1
    }

    const emailAwaiting = emailInquiries.filter((i) =>
      ['new', 'processing', 'draft_ready', 'error'].includes(i.status),
    ).length

    const totalShopMessages = nestAutoMessages + manualStaffMessages

    return NextResponse.json({
      range: rangeParam,
      totals: {
        conversations: chats.length + emailInquiries.length,
        nestConversations: chats.length,
        emailInquiries: emailInquiries.length,
        awaitingReply: awaitingReply + emailAwaiting,
      },
      channels: channelCounts,
      messages: {
        customer: customerMessages,
        nestAuto: nestAutoMessages,
        manualStaff: manualStaffMessages,
        automationRate: totalShopMessages > 0 ? nestAutoMessages / totalShopMessages : null,
      },
      conversationLength: {
        avgMessages:
          messagesPerConversation.length > 0
            ? messagesPerConversation.reduce((a, b) => a + b, 0) / messagesPerConversation.length
            : null,
        medianMessages: median(messagesPerConversation),
        avgDurationMinutes:
          durationsMinutes.length > 0
            ? durationsMinutes.reduce((a, b) => a + b, 0) / durationsMinutes.length
            : null,
        medianDurationMinutes: median(durationsMinutes),
      },
      response: {
        medianFirstReplySeconds: median(firstReplySeconds),
      },
      missedCalls: {
        total: missedCallTotal,
        engaged: missedCallEngaged,
        engagementRate: missedCallTotal > 0 ? missedCallEngaged / missedCallTotal : null,
      },
      activity: {
        daily,
        hourHistogram,
        weekdayHistogram,
      },
    })
  } catch (error) {
    console.error('[inquiries-analytics] GET failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load enquiry analytics.' },
      { status: 500 },
    )
  }
}
