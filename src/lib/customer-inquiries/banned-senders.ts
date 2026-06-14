import type { SupabaseClient } from '@supabase/supabase-js'

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function listBannedSenderEmails(
  supabase: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('store_customer_inquiry_banned_senders')
    .select('sender_email')
    .eq('user_id', userId)

  if (error) {
    console.warn('[customer-inquiries] banned sender list failed:', error.message)
    return new Set()
  }

  return new Set(
    (data ?? [])
      .map((row) => normaliseEmail(String(row.sender_email ?? '')))
      .filter(Boolean),
  )
}

export async function banSenderEmail(
  supabase: SupabaseClient,
  args: {
    userId: string
    senderEmail: string
    inquiryId?: string | null
    note?: string | null
  },
): Promise<void> {
  const senderEmail = normaliseEmail(args.senderEmail)
  if (!senderEmail) return

  const { error } = await supabase.from('store_customer_inquiry_banned_senders').upsert(
    {
      user_id: args.userId,
      sender_email: senderEmail,
      banned_from_inquiry_id: args.inquiryId ?? null,
      note: args.note?.trim() || null,
    },
    { onConflict: 'user_id,sender_email' },
  )

  if (error) {
    throw new Error(error.message || 'Could not ban sender.')
  }
}

export function isBannedSender(email: string, banned: Set<string>): boolean {
  const normalised = normaliseEmail(email)
  return Boolean(normalised && banned.has(normalised))
}
