import type { VercelRequest, VercelResponse } from '@/lib/nest-portal/vercel-adapter'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createHmac } from 'node:crypto'
import {
  fetchLiveOutboundWorkorderById,
  invalidateOutboundWorkorderListCache,
  loadLiveFinishedOutboundWorkordersForBrand,
} from '../lib/lightspeed-live-outbound-workorders'
import { getLightspeedAccess } from './brand-portal-config'
import { pickServerEnv } from '../lib/server-env'

const ACTIVE_CALL_STATUSES = ['queued', 'calling', 'connected'] as const

type NestOutboundCallStatus =
  | 'queued'
  | 'calling'
  | 'connected'
  | 'no_answer'
  | 'completed'
  | 'failed'
  | 'cancelled'

function pickEnv(names: string[]): string | undefined {
  for (const name of names) {
    const v = process.env[name]
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return undefined
}

function getSupabaseAdmin(): SupabaseClient | null {
  const url = pickEnv(['SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_URL'])
  const key = pickEnv(['SUPABASE_SECRET_KEY', 'NEW_SUPABASE_SECRET_KEY'])
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function internalEdgeJsonHeaders(): Record<string, string> {
  const secret = pickEnv(['INTERNAL_EDGE_SHARED_SECRET', 'NEST_INTERNAL_EDGE_SHARED_SECRET']) ?? ''
  if (!secret) throw new Error('INTERNAL_EDGE_SHARED_SECRET is not configured')
  return { 'Content-Type': 'application/json', 'x-internal-secret': secret }
}

function getFunctionsBaseUrl(): string | null {
  const explicit = pickEnv(['SUPABASE_FUNCTIONS_URL', 'NEST_SUPABASE_FUNCTIONS_URL'])
  if (explicit) return explicit.replace(/\/$/, '')
  const supabaseUrl = pickEnv(['SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'])
  if (!supabaseUrl) return null
  try {
    return `${new URL(supabaseUrl).origin}/functions/v1`
  } catch {
    return null
  }
}

async function resolvePortalSession(
  supabase: SupabaseClient,
  req: VercelRequest,
): Promise<{ brandKey: string; sessionId: string } | null> {
  const auth = (req.headers.authorization || '') as string
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const { data, error } = await supabase
    .from('nest_brand_portal_sessions')
    .select('brand_key, expires_at')
    .eq('id', token)
    .maybeSingle()
  if (error || !data?.brand_key || !data.expires_at) return null
  if (new Date(data.expires_at).getTime() < Date.now()) return null
  return { brandKey: data.brand_key, sessionId: token }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function parseString(value: unknown): string | null {
  if (typeof value === 'string') {
    const t = value.trim()
    return t.length > 0 ? t : null
  }
  return null
}

function formatMelbourneShortDate(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null
  try {
    const d = new Date(iso.trim())
    if (Number.isNaN(d.getTime())) return null
    return new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Melbourne',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d)
  } catch {
    return null
  }
}

function formatMelbourneDateTime(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null
  try {
    const d = new Date(iso.trim())
    if (Number.isNaN(d.getTime())) return null
    return new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Melbourne',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d)
  } catch {
    return null
  }
}

function buildRecordingUrl(jobId: string): string | null {
  const base = getFunctionsBaseUrl()
  const secret = pickEnv(['INTERNAL_EDGE_SHARED_SECRET', 'NEST_INTERNAL_EDGE_SHARED_SECRET'])
  if (!base || !secret) return null
  const expires = String(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const sig = createHmac('sha256', secret).update(`${jobId}.${expires}`).digest('hex')
  const params = new URLSearchParams({ jobId, expires, sig })
  return `${base}/nest-outbound-recording-audio?${params.toString()}`
}

function mapCallSummary(row: Record<string, unknown>) {
  const summary = asRecord(row.summary)
  const status = parseString(row.status) as NestOutboundCallStatus | null
  const recordingAvailable = row.recording_available === true
  const dynamicVars = asRecord(row.dynamic_vars)
  const proxyFromVars = parseString(dynamicVars?.recording_proxy_url)
  return {
    id: String(row.id),
    workorderId: Number(row.workorder_id),
    status: status ?? 'failed',
    answered: typeof row.answered === 'boolean' ? row.answered : null,
    initiatedAt: typeof row.initiated_at === 'string' ? row.initiated_at : null,
    connectedAt: typeof row.connected_at === 'string' ? row.connected_at : null,
    completedAt: typeof row.completed_at === 'string' ? row.completed_at : null,
    durationSeconds: typeof row.duration_seconds === 'number' ? row.duration_seconds : null,
    failureReason: typeof row.failure_reason === 'string' ? row.failure_reason : null,
    recordingAvailable,
    outcomeSummary:
      summary && typeof summary.outcome_summary === 'string' ? summary.outcome_summary : null,
    recordingUrl:
      recordingAvailable
        ? proxyFromVars ?? buildRecordingUrl(String(row.id))
        : null,
  }
}

async function agentHasPhoneNumber(apiKey: string, agentId: string): Promise<boolean> {
  const response = await fetch('https://api.elevenlabs.io/v1/convai/phone-numbers/', {
    headers: { 'xi-api-key': apiKey },
  })
  if (!response.ok) return false
  const payload = await response.json()
  const numbers = Array.isArray(payload) ? payload : (payload.phone_numbers || payload.phoneNumbers || [])
  return numbers.some(
    (n: Record<string, unknown>) =>
      (n.assigned_agent as Record<string, unknown> | undefined)?.agent_id === agentId,
  )
}

async function loadSetupStatus(supabase: SupabaseClient, brandKey: string) {
  const apiKey = pickEnv(['ELEVENLABS_API_KEY', 'NEST_ELEVENLABS_API_KEY'])
  const { data: config } = await supabase
    .from('nest_brand_chat_config')
    .select('elevenlabs_voice_agent_id')
    .eq('brand_key', brandKey)
    .maybeSingle()
  const agentId = parseString(config?.elevenlabs_voice_agent_id)
  const agentLinked = Boolean(agentId)
  let phoneLinked = false
  if (agentLinked && apiKey && agentId) {
    phoneLinked = await agentHasPhoneNumber(apiKey, agentId)
  }
  return {
    ready: agentLinked && phoneLinked && Boolean(apiKey),
    agentLinked,
    phoneLinked,
    elevenLabsConfigured: Boolean(apiKey),
    agentId,
  }
}

async function invokeOutboundRunner(jobId: string): Promise<void> {
  const fnBase = getFunctionsBaseUrl()
  if (!fnBase) throw new Error('Supabase Edge Functions are not configured')
  const resp = await fetch(`${fnBase}/nest-outbound-call-runner`, {
    method: 'POST',
    headers: internalEdgeJsonHeaders(),
    body: JSON.stringify({ jobId }),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(text || `Runner failed: ${resp.status}`)
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.status(204).end()
    return
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    res.status(500).json({ error: 'Server database is not configured' })
    return
  }

  const session = await resolvePortalSession(supabase, req)
  if (!session) {
    res.status(401).json({ error: 'Unauthorised' })
    return
  }

  try {
    if (req.method === 'GET') {
      if (req.query.setup === '1') {
        const setup = await loadSetupStatus(supabase, session.brandKey)
        res.status(200).json({ setup })
        return
      }

      const callJobId = Array.isArray(req.query.callJobId)
        ? req.query.callJobId[0]
        : req.query.callJobId
      if (typeof callJobId === 'string' && callJobId.trim()) {
        const { data: job, error } = await supabase
          .from('nest_outbound_call_jobs')
          .select('*')
          .eq('id', callJobId.trim())
          .eq('brand_key', session.brandKey)
          .maybeSingle()
        if (error || !job) {
          res.status(404).json({ error: 'Call not found' })
          return
        }
        const summary = mapCallSummary(job as Record<string, unknown>)
        const transcriptRaw = asRecord(job.summary)?.transcript
        const transcript = Array.isArray(transcriptRaw)
          ? transcriptRaw
              .map((entry) => {
                const row = asRecord(entry)
                if (!row) return null
                const role = row.role === 'agent' || row.role === 'user' ? row.role : null
                const message = parseString(row.message)
                if (!role || !message) return null
                const timeSecs = typeof row.time_in_call_secs === 'number' ? row.time_in_call_secs : 0
                return { role, message, timeMs: Math.round(timeSecs * 1000) }
              })
              .filter((x): x is { role: 'agent' | 'user'; message: string; timeMs: number } => x != null)
          : []

        const dynamicVars = asRecord(job.dynamic_vars)
        res.status(200).json({
          call: {
            ...summary,
            transcript,
            timestamps: {
              initiated: formatMelbourneDateTime(summary.initiatedAt),
              connected: formatMelbourneDateTime(summary.connectedAt),
              completed: formatMelbourneDateTime(summary.completedAt),
            },
            workorderSnapshot: {
              itemSummary: parseString(dynamicVars?.item_summary),
              totalDisplay: parseString(dynamicVars?.total_price_display),
              notes: parseString(dynamicVars?.notes) || null,
            },
          },
        })
        return
      }

      const workorderIdRaw = Array.isArray(req.query.workorderId)
        ? req.query.workorderId[0]
        : req.query.workorderId
      const callsOnly = req.query.calls === '1'
      if (typeof workorderIdRaw === 'string' && workorderIdRaw.trim() && callsOnly) {
        const workorderId = Math.trunc(Number(workorderIdRaw))
        const { data: jobs, error } = await supabase
          .from('nest_outbound_call_jobs')
          .select('*')
          .eq('brand_key', session.brandKey)
          .eq('workorder_id', workorderId)
          .order('created_at', { ascending: false })
          .limit(50)
        if (error) {
          res.status(500).json({ error: 'Could not load call history' })
          return
        }
        res.status(200).json({ calls: (jobs ?? []).map((j) => mapCallSummary(j as Record<string, unknown>)) })
        return
      }

      if (req.query.workorders === '1') {
        const refresh = req.query.refresh === '1' || req.query.refresh === 'true'
        if (refresh) {
          invalidateOutboundWorkorderListCache(session.brandKey)
        }
        const live = await loadLiveFinishedOutboundWorkordersForBrand(supabase, session.brandKey, {
          refresh,
        })
        if (!live.connected) {
          res.status(409).json({
            error: 'Connect Lightspeed under Team → Connections to load finished work orders.',
            connected: false,
          })
          return
        }

        const workorderIds = live.workorders.map((r) => r.workorderId)
        const latestByWorkorder = new Map<number, ReturnType<typeof mapCallSummary>>()

        if (workorderIds.length > 0) {
          const { data: jobs } = await supabase
            .from('nest_outbound_call_jobs')
            .select('*')
            .eq('brand_key', session.brandKey)
            .in('workorder_id', workorderIds)
            .order('created_at', { ascending: false })

          for (const job of jobs ?? []) {
            const woId = Number(job.workorder_id)
            if (!latestByWorkorder.has(woId)) {
              latestByWorkorder.set(woId, mapCallSummary(job as Record<string, unknown>))
            }
          }
        }

        const workorders = live.workorders.map((row) => ({
          ...row,
          latestCall: latestByWorkorder.get(row.workorderId) ?? null,
        }))

        res.status(200).json({
          workorders,
          source: live.source,
          stale: live.stale === true,
          warning: live.warning ?? null,
        })
        return
      }

      res.status(400).json({ error: 'Unknown GET request' })
      return
    }

    if (req.method === 'POST') {
      let body: { action?: string; workorderId?: number; callJobId?: string } = {}
      try {
        if (typeof req.body === 'string' && req.body.trim()) {
          body = JSON.parse(req.body) as typeof body
        } else if (req.body && typeof req.body === 'object') {
          body = req.body as typeof body
        }
      } catch {
        res.status(400).json({ error: 'Invalid JSON body' })
        return
      }

      if (body.action === 'cancel') {
        const callJobId = typeof body.callJobId === 'string' ? body.callJobId.trim() : ''
        if (!callJobId) {
          res.status(400).json({ error: 'callJobId required' })
          return
        }
        const { data: job } = await supabase
          .from('nest_outbound_call_jobs')
          .select('*')
          .eq('id', callJobId)
          .eq('brand_key', session.brandKey)
          .maybeSingle()
        if (!job) {
          res.status(404).json({ error: 'Call not found' })
          return
        }
        if (job.status !== 'queued') {
          res.status(409).json({ error: 'Only queued calls can be cancelled' })
          return
        }
        const { data: updated, error } = await supabase
          .from('nest_outbound_call_jobs')
          .update({ status: 'cancelled', completed_at: new Date().toISOString() })
          .eq('id', callJobId)
          .select('*')
          .single()
        if (error || !updated) {
          res.status(500).json({ error: 'Could not cancel call' })
          return
        }
        res.status(200).json({ call: mapCallSummary(updated as Record<string, unknown>) })
        return
      }

      if (body.action === 'call_now') {
        const workorderId = Math.trunc(Number(body.workorderId))
        if (!Number.isFinite(workorderId) || workorderId <= 0) {
          res.status(400).json({ error: 'Invalid workorderId' })
          return
        }

        const setup = await loadSetupStatus(supabase, session.brandKey)
        if (!setup.ready) {
          res.status(409).json({
            error: 'Outbound calling is not set up yet',
            setup,
          })
          return
        }

        const { data: active } = await supabase
          .from('nest_outbound_call_jobs')
          .select('id')
          .eq('brand_key', session.brandKey)
          .eq('workorder_id', workorderId)
          .in('status', [...ACTIVE_CALL_STATUSES])
          .limit(1)
        if (active && active.length > 0) {
          res.status(409).json({ error: 'A call is already in progress for this work order' })
          return
        }

        const access = await getLightspeedAccess(supabase, session.brandKey)
        if (!access) {
          res.status(409).json({ error: 'Connect Lightspeed before placing outbound calls.' })
          return
        }
        const wo = await fetchLiveOutboundWorkorderById(
          access.accessToken,
          access.accountId,
          workorderId,
        )
        if (!wo?.customerPhoneE164) {
          res.status(400).json({
            error: wo
              ? 'This work order is not finished, is archived, or has no customer mobile number.'
              : 'Work order not found in Lightspeed.',
          })
          return
        }

        const { data: inserted, error: insErr } = await supabase
          .from('nest_outbound_call_jobs')
          .insert({
            brand_key: session.brandKey,
            workorder_id: workorderId,
            customer_name: wo.customerName,
            customer_phone_e164: wo.customerPhoneE164,
            status: 'queued',
            trigger_source: 'portal_manual',
            triggered_by_session_id: session.sessionId,
            elevenlabs_agent_id: setup.agentId,
            dynamic_vars: {
              nest_outbound_live_context: {
                itemSummary: wo.itemSummary,
                notes: wo.notes,
                saleTotal: wo.saleTotal,
                dueDateDisplay: wo.dueOn ?? wo.etaOutMelbourne,
              },
            },
          })
          .select('*')
          .single()

        if (insErr || !inserted) {
          res.status(500).json({ error: insErr?.message || 'Could not create call job' })
          return
        }

        try {
          await invokeOutboundRunner(String(inserted.id))
        } catch (e) {
          await supabase
            .from('nest_outbound_call_jobs')
            .update({
              status: 'failed',
              failure_reason: e instanceof Error ? e.message : 'Could not start call runner',
              completed_at: new Date().toISOString(),
            })
            .eq('id', inserted.id)
          res.status(502).json({ error: e instanceof Error ? e.message : 'Could not start call' })
          return
        }

        const { data: refreshed } = await supabase
          .from('nest_outbound_call_jobs')
          .select('*')
          .eq('id', inserted.id)
          .single()

        res.status(200).json({
          call: mapCallSummary((refreshed ?? inserted) as Record<string, unknown>),
        })
        return
      }

      res.status(400).json({ error: 'Unknown action' })
      return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[brand-portal-outbound]', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' })
  }
}
