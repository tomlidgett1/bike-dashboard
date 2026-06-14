import { createHash } from 'crypto'
import OpenAI from 'openai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readGmailMessages, searchGmailEmails } from '@/lib/composio/gmail'
import type { EmailStyleProfile } from '@/lib/customer-inquiries/types'

const MODEL = 'gpt-4.1-mini'
const STYLE_REFRESH_HOURS = 24
const MAX_SENT_SAMPLES = 12

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

function defaultProfile(storeName?: string | null): EmailStyleProfile {
  const name = storeName?.trim() || 'the bike shop'
  return {
    greeting_style: 'Hi {first_name},',
    signoff_style: `Regards,\n${name}`,
    tone: 'Warm, practical, and professional',
    brevity: 'Concise but helpful',
    common_phrases: ['Thanks for getting in touch.', 'We will check and come back to you shortly.'],
    policy_notes: ['Do not invent stock, pricing, or appointment times.'],
    sample_excerpt: null,
  }
}

async function summariseSentStyle(args: {
  storeName?: string | null
  samples: Array<{ subject: string; body: string }>
}): Promise<EmailStyleProfile> {
  if (!openai || args.samples.length === 0) {
    return defaultProfile(args.storeName)
  }

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      max_tokens: 900,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Summarise how this Australian bicycle shop writes customer email replies.

Return JSON only:
{
  "greeting_style": "...",
  "signoff_style": "...",
  "tone": "...",
  "brevity": "...",
  "common_phrases": ["..."],
  "policy_notes": ["..."],
  "sample_excerpt": "short excerpt showing their voice"
}

Focus on reusable style guidance, not one-off content.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            store_name: args.storeName?.trim() || 'the bike shop',
            sent_samples: args.samples.slice(0, MAX_SENT_SAMPLES),
          }),
        },
      ],
    })

    const content = response.choices[0]?.message?.content
    if (!content) return defaultProfile(args.storeName)

    const parsed = JSON.parse(content) as Partial<EmailStyleProfile>
    return {
      greeting_style: String(parsed.greeting_style ?? defaultProfile(args.storeName).greeting_style),
      signoff_style: String(parsed.signoff_style ?? defaultProfile(args.storeName).signoff_style),
      tone: String(parsed.tone ?? defaultProfile(args.storeName).tone),
      brevity: String(parsed.brevity ?? defaultProfile(args.storeName).brevity),
      common_phrases: Array.isArray(parsed.common_phrases)
        ? parsed.common_phrases.map((item) => String(item)).filter(Boolean).slice(0, 8)
        : defaultProfile(args.storeName).common_phrases,
      policy_notes: Array.isArray(parsed.policy_notes)
        ? parsed.policy_notes.map((item) => String(item)).filter(Boolean).slice(0, 6)
        : defaultProfile(args.storeName).policy_notes,
      sample_excerpt: parsed.sample_excerpt ? String(parsed.sample_excerpt).slice(0, 500) : null,
    }
  } catch (error) {
    console.error('[customer-inquiries] style profile summarise failed:', error)
    return defaultProfile(args.storeName)
  }
}

export async function getOrRefreshEmailStyleProfile(
  supabase: SupabaseClient,
  userId: string,
  storeName?: string | null,
  options?: { force?: boolean },
): Promise<{ profile: EmailStyleProfile; version: number }> {
  const { data: existing } = await supabase
    .from('store_email_style_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  const refreshedAt = existing?.refreshed_at ? new Date(existing.refreshed_at).getTime() : 0
  const stale =
    options?.force === true ||
    !existing ||
    Date.now() - refreshedAt > STYLE_REFRESH_HOURS * 60 * 60 * 1000

  if (!stale && existing?.profile) {
    return {
      profile: existing.profile as EmailStyleProfile,
      version: Number(existing.message_count ?? 0),
    }
  }

  const payload = await searchGmailEmails(userId, {
    query: 'in:sent newer_than:60d -category:promotions',
    max_results: MAX_SENT_SAMPLES,
    scan_depth: 'quick',
  })

  const messageIds = payload.emails
    .map((email) => email.message_id)
    .filter(Boolean)
    .slice(0, MAX_SENT_SAMPLES)

  const bodies = messageIds.length
    ? await readGmailMessages(userId, {
        message_ids: messageIds,
        max_body_chars: 1800,
      })
    : []

  const samples = bodies
    .map((message) => ({
      subject: message.subject,
      body: message.body_text.slice(0, 1200),
    }))
    .filter((sample) => sample.body.trim().length > 40)

  const profile = await summariseSentStyle({ storeName, samples })
  const sampleHashes = samples.map((sample) => hashText(`${sample.subject}\n${sample.body}`))

  const row = {
    user_id: userId,
    profile,
    sample_message_ids: messageIds,
    sample_message_hashes: sampleHashes,
    message_count: samples.length,
    refreshed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase.from('store_email_style_profiles').upsert(row, {
    onConflict: 'user_id',
  })

  if (error) {
    console.warn('[customer-inquiries] style profile upsert failed:', error.message)
  }

  return { profile, version: samples.length }
}

export async function loadEmailStyleProfile(
  supabase: SupabaseClient,
  userId: string,
  storeName?: string | null,
): Promise<EmailStyleProfile> {
  const { data: existing } = await supabase
    .from('store_email_style_profiles')
    .select('profile')
    .eq('user_id', userId)
    .maybeSingle()

  if (existing?.profile && typeof existing.profile === 'object') {
    return existing.profile as EmailStyleProfile
  }

  return defaultProfile(storeName)
}

export async function updateEmailStyleProfileFields(
  supabase: SupabaseClient,
  userId: string,
  fields: { greeting_style?: string; signoff_style?: string },
  storeName?: string | null,
): Promise<EmailStyleProfile> {
  const { data: existing } = await supabase
    .from('store_email_style_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  const current =
    existing?.profile && typeof existing.profile === 'object'
      ? (existing.profile as EmailStyleProfile)
      : defaultProfile(storeName)

  const next: EmailStyleProfile = {
    ...current,
    ...(typeof fields.greeting_style === 'string'
      ? { greeting_style: fields.greeting_style.trim() }
      : {}),
    ...(typeof fields.signoff_style === 'string'
      ? { signoff_style: fields.signoff_style.trim() }
      : {}),
  }

  const row = {
    user_id: userId,
    profile: next,
    sample_message_ids: existing?.sample_message_ids ?? [],
    sample_message_hashes: existing?.sample_message_hashes ?? [],
    message_count: existing?.message_count ?? 0,
    refreshed_at: existing?.refreshed_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase.from('store_email_style_profiles').upsert(row, {
    onConflict: 'user_id',
  })

  if (error) {
    throw new Error(error.message || 'Could not save reply style.')
  }

  return next
}
