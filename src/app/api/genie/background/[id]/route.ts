import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cancelGenieBackgroundResponse, retrieveGenieBackgroundResponse } from '@/lib/genie/background-jobs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 600

async function requireStoreUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('users')
    .select('account_type, bicycle_store')
    .eq('user_id', user.id)
    .single()

  if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
    return {
      supabase,
      user,
      error: NextResponse.json({ error: 'Background Genie jobs are only available to verified bicycle stores.' }, { status: 403 }),
    }
  }

  return { supabase, user, error: null }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireStoreUser()
    if (auth.error) return auth.error
    const { id } = await params

    const { data: job, error } = await auth.supabase
      .from('genie_background_jobs')
      .select('id, conversation_id, route, status, prompt, result, error_message, openai_response_id, message, progress_phase, job_type, metadata, created_at, updated_at, started_at, completed_at')
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .single()

    if (error) throw error

    if (job.openai_response_id && (job.status === 'queued' || job.status === 'running')) {
      const refreshed = await retrieveGenieBackgroundResponse(job.openai_response_id).catch((refreshError) => ({
        response_id: job.openai_response_id,
        status: job.status,
        result: job.result,
        error_message: refreshError instanceof Error ? refreshError.message : String(refreshError),
      }))

      const terminal = refreshed.status === 'completed' || refreshed.status === 'failed' || refreshed.status === 'cancelled'
      const now = new Date().toISOString()
      const { data: updated, error: updateError } = await auth.supabase
        .from('genie_background_jobs')
        .update({
          status: refreshed.status,
          result: refreshed.result,
          error_message: refreshed.error_message,
          completed_at: terminal ? now : job.completed_at,
          updated_at: now,
        })
        .eq('id', id)
        .eq('user_id', auth.user.id)
        .select('id, conversation_id, route, status, prompt, result, error_message, openai_response_id, message, progress_phase, job_type, metadata, created_at, updated_at, started_at, completed_at')
        .single()

      if (updateError) throw updateError
      return NextResponse.json({ job: updated })
    }

    return NextResponse.json({ job })
  } catch (error) {
    console.error('Error in GET /api/genie/background/[id]:', error)
    return NextResponse.json({ error: 'Failed to load Genie background job.' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireStoreUser()
    if (auth.error) return auth.error
    const { id } = await params
    const now = new Date().toISOString()

    const { data: existing, error: loadError } = await auth.supabase
      .from('genie_background_jobs')
      .select('id, openai_response_id')
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .single()

    if (loadError) throw loadError
    if (existing.openai_response_id) {
      await cancelGenieBackgroundResponse(existing.openai_response_id)
    }

    const { data: job, error } = await auth.supabase
      .from('genie_background_jobs')
      .update({
        status: 'cancelled',
        completed_at: now,
        updated_at: now,
      })
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .select('id, conversation_id, route, status, prompt, result, error_message, openai_response_id, message, progress_phase, job_type, metadata, created_at, updated_at, started_at, completed_at')
      .single()

    if (error) throw error
    return NextResponse.json({ job })
  } catch (error) {
    console.error('Error in DELETE /api/genie/background/[id]:', error)
    return NextResponse.json({ error: 'Failed to cancel Genie background job.' }, { status: 500 })
  }
}
