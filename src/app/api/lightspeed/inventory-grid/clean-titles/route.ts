import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const MAX_ITEMS_PER_JOB = 500
const TERMINAL_JOB_STATUSES = new Set(['completed', 'completed_with_errors', 'failed', 'cancelled'])

interface InventoryQueueRow {
  lightspeed_item_id: string
  description: string | null
}

async function getAuthenticatedUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return { supabase, user: null }
  }

  return { supabase, user }
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const jobId = request.nextUrl.searchParams.get('jobId')

    if (jobId) {
      const { data: job, error: jobError } = await supabase
        .from('lightspeed_title_cleaning_jobs')
        .select('*')
        .eq('user_id', user.id)
        .eq('id', jobId)
        .single()

      if (jobError || !job) {
        return NextResponse.json({ error: 'Title cleaning job not found' }, { status: 404 })
      }

      const { data: items, error: itemsError } = await supabase
        .from('lightspeed_title_cleaning_queue')
        .select('*')
        .eq('user_id', user.id)
        .eq('job_id', jobId)
        .order('created_at', { ascending: true })

      if (itemsError) {
        return NextResponse.json({ error: 'Failed to load title cleaning job items' }, { status: 500 })
      }

      return NextResponse.json({ job, items: items || [] })
    }

    const { data: jobs, error: jobsError } = await supabase
      .from('lightspeed_title_cleaning_jobs')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(10)

    if (jobsError) {
      return NextResponse.json({ error: 'Failed to load title cleaning jobs' }, { status: 500 })
    }

    const activeJob = (jobs || []).find((job) => !TERMINAL_JOB_STATUSES.has(job.status)) || null
    const visibleJob = activeJob || jobs?.[0] || null
    let items: unknown[] = []

    if (visibleJob) {
      const { data: visibleItems, error: itemsError } = await supabase
        .from('lightspeed_title_cleaning_queue')
        .select('*')
        .eq('user_id', user.id)
        .eq('job_id', visibleJob.id)
        .order('created_at', { ascending: true })

      if (itemsError) {
        return NextResponse.json({ error: 'Failed to load title cleaning items' }, { status: 500 })
      }

      items = visibleItems || []
    }

    return NextResponse.json({ jobs: jobs || [], activeJob, job: visibleJob, items })
  } catch (error) {
    console.error('[Inventory Clean Titles] GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load title cleaning status' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const body = (await request.json()) as { itemIds?: unknown[] }
    const itemIds = Array.from(
      new Set(
        Array.isArray(body.itemIds)
          ? body.itemIds.map((id) => String(id).trim()).filter(Boolean)
          : []
      )
    ).slice(0, MAX_ITEMS_PER_JOB)

    if (itemIds.length === 0) {
      return NextResponse.json({ error: 'No Lightspeed item IDs provided' }, { status: 400 })
    }

    const { data: inventoryRows, error: rowsError } = await supabase
      .from('products_all_ls')
      .select('lightspeed_item_id, description')
      .eq('user_id', user.id)
      .in('lightspeed_item_id', itemIds)

    if (rowsError) {
      return NextResponse.json({ error: 'Failed to validate selected inventory rows' }, { status: 500 })
    }

    const rows = (inventoryRows || []) as InventoryQueueRow[]
    if (rows.length === 0) {
      return NextResponse.json({ error: 'No selected inventory rows were found' }, { status: 404 })
    }

    const admin = createServiceRoleClient()
    const { data: job, error: jobError } = await admin
      .from('lightspeed_title_cleaning_jobs')
      .insert({
        user_id: user.id,
        status: 'queued',
        total_items: rows.length,
        pending_count: rows.length,
      })
      .select('*')
      .single()

    if (jobError || !job) {
      console.error('[Inventory Clean Titles] Job insert error:', jobError)
      return NextResponse.json({ error: 'Failed to create title cleaning job' }, { status: 500 })
    }

    const queueRows = rows.map((row) => ({
      job_id: job.id,
      user_id: user.id,
      lightspeed_item_id: row.lightspeed_item_id,
      original_description: row.description,
      status: 'pending',
    }))

    const { data: items, error: queueError } = await admin
      .from('lightspeed_title_cleaning_queue')
      .insert(queueRows)
      .select('*')

    if (queueError) {
      console.error('[Inventory Clean Titles] Queue insert error:', queueError)
      await admin.from('lightspeed_title_cleaning_jobs').delete().eq('id', job.id)
      return NextResponse.json({ error: 'Failed to queue selected products' }, { status: 500 })
    }

    const queuedIds = new Set(rows.map((row) => row.lightspeed_item_id))
    const missingItemIds = itemIds.filter((itemId) => !queuedIds.has(itemId))

    return NextResponse.json({
      success: true,
      job,
      items: items || [],
      requested: itemIds.length,
      queued: rows.length,
      missingItemIds,
    })
  } catch (error) {
    console.error('[Inventory Clean Titles] POST error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to queue title cleaning job' },
      { status: 500 }
    )
  }
}
