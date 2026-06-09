import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { startGenieBackgroundResponse, type GenieBackgroundMessage } from '@/lib/genie/background-jobs'
import { ensureGenieConversation } from '@/lib/genie/ensure-genie-conversation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 600

async function requireStoreUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, profile: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('users')
    .select('account_type, bicycle_store, business_name')
    .eq('user_id', user.id)
    .single()

  if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
    return {
      supabase,
      user,
      profile: null,
      error: NextResponse.json({ error: 'Background Genie jobs are only available to verified bicycle stores.' }, { status: 403 }),
    }
  }

  return { supabase, user, profile, error: null }
}

function normalizeMessages(value: unknown): GenieBackgroundMessage[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((message): message is Record<string, unknown> => Boolean(message) && typeof message === 'object')
    .map(message => ({
      role: message.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: String(message.content ?? '').trim(),
    }))
    .filter(message => message.content)
    .slice(-40)
}

export async function GET() {
  try {
    const auth = await requireStoreUser()
    if (auth.error) return auth.error

    const { data, error } = await auth.supabase
      .from('genie_background_jobs')
      .select('id, conversation_id, route, status, prompt, result, error_message, openai_response_id, message, progress_phase, job_type, metadata, created_at, updated_at, started_at, completed_at')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error
    return NextResponse.json({ jobs: data ?? [] })
  } catch (error) {
    console.error('Error in GET /api/genie/background:', error)
    return NextResponse.json({ error: 'Failed to load Genie background jobs.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreUser()
    if (auth.error) return auth.error

    const body = await request.json()
    const messages = normalizeMessages(body.messages)
    const prompt = String(body.prompt ?? messages.at(-1)?.content ?? '').trim()
    if (!prompt) {
      return NextResponse.json({ error: 'prompt or messages are required.' }, { status: 400 })
    }

    const route = typeof body.route === 'string' ? body.route : null
    const requestedConversationId =
      typeof body.conversation_id === 'string' ? body.conversation_id : null
    const conversationId = await ensureGenieConversation(auth.supabase, {
      userId: auth.user.id,
      conversationId: requestedConversationId,
      messages,
      prompt,
    })
    const { data: job, error: insertError } = await auth.supabase
      .from('genie_background_jobs')
      .insert({
        user_id: auth.user.id,
        conversation_id: conversationId,
        route,
        status: 'queued',
        prompt,
        messages,
      })
      .select('id, conversation_id, route, status, prompt, result, error_message, openai_response_id, message, progress_phase, job_type, metadata, created_at, updated_at, started_at, completed_at')
      .single()

    if (insertError) throw insertError

    const start = await startGenieBackgroundResponse({
      storeName: auth.profile.business_name || 'your store',
      prompt,
      messages,
      route,
    }).catch((error) => ({
      response_id: null,
      status: 'queued' as const,
      result: null,
      error_message: error instanceof Error ? error.message : String(error),
    }))

    const now = new Date().toISOString()
    const { data: updated, error: updateError } = await auth.supabase
      .from('genie_background_jobs')
      .update({
        status: start.status,
        openai_response_id: start.response_id,
        result: start.result,
        error_message: start.error_message,
        started_at: start.response_id ? now : null,
        completed_at: start.status === 'completed' || start.status === 'failed' || start.status === 'cancelled' ? now : null,
        updated_at: now,
      })
      .eq('id', job.id)
      .eq('user_id', auth.user.id)
      .select('id, conversation_id, route, status, prompt, result, error_message, openai_response_id, message, progress_phase, job_type, metadata, created_at, updated_at, started_at, completed_at')
      .single()

    if (updateError) throw updateError

    return NextResponse.json({ job: updated }, { status: 202 })
  } catch (error) {
    console.error('Error in POST /api/genie/background:', error)
    return NextResponse.json({ error: 'Failed to create Genie background job.' }, { status: 500 })
  }
}
