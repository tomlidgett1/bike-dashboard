import { getOptionalEnv } from './env.ts';
import { getAdminClient } from './supabase.ts';
import { enrichOutboundGoalWithKnowledge } from './brand-knowledge.ts';
import { getBrandAsync } from './brand-registry.ts';
import { summarizeWorkCompletedForOutbound } from './nest-outbound-work-summary.ts';
import {
  type ElevenLabsAgentRestoreSnapshot,
  prepareElevenLabsAgentForNestOutbound,
  restoreElevenLabsAgentAfterNestOutbound,
} from './elevenlabs-agent-sync.ts';
import {
  buildJobRecordingProxyUrl,
  extractTwilioCallSidFromSummary,
  fetchElevenLabsConversation,
  fetchTwilioCallStatus,
  parseConversationOutcome,
  resolvePhoneNumberId,
  startElevenLabsOutboundCall,
} from './elevenlabs-outbound.ts';

export type NestOutboundCallStatus =
  | 'queued'
  | 'calling'
  | 'connected'
  | 'no_answer'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface NestOutboundCallJobRow {
  id: string;
  brand_key: string;
  workorder_id: number;
  customer_name: string | null;
  customer_phone_e164: string;
  status: NestOutboundCallStatus;
  trigger_source: string;
  triggered_by_session_id: string | null;
  elevenlabs_agent_id: string | null;
  elevenlabs_phone_number_id: string | null;
  elevenlabs_conversation_id: string | null;
  twilio_call_sid: string | null;
  goal_prompt: string | null;
  dynamic_vars: Record<string, unknown> | null;
  initiated_at: string | null;
  connected_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  answered: boolean | null;
  failure_reason: string | null;
  summary: Record<string, unknown> | null;
  recording_available: boolean;
  created_at: string;
  updated_at: string;
}

const JOB_SELECT = `
  id, brand_key, workorder_id, customer_name, customer_phone_e164, status,
  trigger_source, triggered_by_session_id, elevenlabs_agent_id, elevenlabs_phone_number_id,
  elevenlabs_conversation_id, twilio_call_sid, goal_prompt, dynamic_vars,
  initiated_at, connected_at, completed_at, duration_seconds, answered,
  failure_reason, summary, recording_available, created_at, updated_at
`;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseString(value: unknown): string | null {
  if (typeof value === 'string') {
    const t = value.trim();
    return t.length > 0 ? t : null;
  }
  return null;
}

function formatAudMoney(amount: number | null): string {
  if (amount == null || !Number.isFinite(amount)) return 'the amount on your invoice';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount);
}

function customerFirstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed || trimmed.toLowerCase() === 'there') return 'there';
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

async function loadBrandOpeningHoursSummary(brandKey: string): Promise<string> {
  try {
    const brand = await getBrandAsync(brandKey);
    const hours = brand?.businessBaseline?.hours?.trim();
    if (hours) return hours.replace(/\n+/g, '; ');
  } catch (err) {
    console.warn('[nest-outbound] opening hours lookup failed:', err);
  }
  return 'Monday to Friday 9 am to 6 pm, Saturday 9 am to 4 pm, and Sunday 10 am to 3 pm';
}

function extractItemSummary(lineItems: unknown, payload: Record<string, unknown>, notes: string | null): string {
  if (Array.isArray(lineItems)) {
    for (const raw of lineItems) {
      const row = asRecord(raw);
      if (!row) continue;
      for (const key of ['display_label', 'description', 'note'] as const) {
        const value = parseString(row[key]);
        if (value) return value.split('\n')[0].slice(0, 160);
      }
    }
  }
  const lines = payload.WorkorderLines ?? payload.workorderLines;
  if (Array.isArray(lines)) {
    for (const raw of lines) {
      const row = asRecord(raw);
      const note = parseString(row?.note ?? row?.Note);
      if (note) return note.split('\n')[0].slice(0, 160);
    }
  }
  if (notes) {
    const first = notes.split('\n').map((l) => l.trim()).find((l) => l.length > 0);
    if (first) return first.slice(0, 160);
  }
  return 'your item';
}

async function loadBrandDisplayName(brandKey: string): Promise<string> {
  const supabase = getAdminClient();
  const { data } = await supabase
    .from('nest_brand_chat_config')
    .select('business_display_name')
    .eq('brand_key', brandKey)
    .maybeSingle();
  const name = parseString(data?.business_display_name);
  return name ?? brandKey;
}

export type NestOutboundCallContextOverrides = {
  customerPhoneE164?: string | null;
  customerName?: string | null;
  itemSummary?: string | null;
  notes?: string | null;
  saleTotal?: number | null;
  dueDateDisplay?: string | null;
  lineItems?: unknown;
  payload?: Record<string, unknown>;
};

function callContextOverridesFromJob(job: NestOutboundCallJobRow): NestOutboundCallContextOverrides {
  const live = asRecord(asRecord(job.dynamic_vars)?.nest_outbound_live_context);
  return {
    customerPhoneE164: job.customer_phone_e164,
    customerName: job.customer_name,
    itemSummary: parseString(live?.itemSummary),
    notes: parseString(live?.notes),
    saleTotal: typeof live?.saleTotal === 'number' && Number.isFinite(live.saleTotal)
      ? live.saleTotal
      : null,
    dueDateDisplay: parseString(live?.dueDateDisplay),
  };
}

async function buildCallContext(
  brandKey: string,
  workorderId: number,
  overrides?: NestOutboundCallContextOverrides,
): Promise<{
  brandName: string;
  customerName: string;
  customerPhoneE164: string;
  itemSummary: string;
  totalDisplay: string;
  notes: string | null;
  tasksSummary: string;
  dueDateDisplay: string | null;
  goalPrompt: string;
  dynamicVars: Record<string, unknown>;
}> {
  const payload = overrides?.payload ?? {};
  const lineItems = overrides?.lineItems ?? null;
  const notes = parseString(overrides?.notes);
  const brandName = await loadBrandDisplayName(brandKey);
  const customerName = parseString(overrides?.customerName) ?? 'there';
  const customerFirst = customerFirstName(customerName);
  const customerPhoneE164 = parseString(overrides?.customerPhoneE164);
  if (!customerPhoneE164) throw new Error('Customer mobile number is missing for this work order');

  const itemSummary =
    parseString(overrides?.itemSummary) ?? extractItemSummary(lineItems, payload, notes);
  const saleTotal =
    overrides?.saleTotal != null && Number.isFinite(overrides.saleTotal)
      ? overrides.saleTotal
      : null;
  const totalDisplay = formatAudMoney(saleTotal);
  const workCompleted = await summarizeWorkCompletedForOutbound({
    lineItems,
    payload,
    notes,
    itemSummary,
  });
  const tasksShort = workCompleted.short;
  const tasksSummary = workCompleted.detail;
  const openingHoursSummary = await loadBrandOpeningHoursSummary(brandKey);
  const dueDateDisplay = parseString(overrides?.dueDateDisplay);

  const baseGoal = [
    '# Call objective',
    `You are calling on behalf of ${brandName}. Your job on this call is to tell ${customerFirst} (full name ${customerName}) their work order is finished and ready for collection, and to give them the details they need to pick up.`,
    '',
    '# Facts for this work order (use only these)',
    `- Work order number: ${workorderId}`,
    `- Customer: ${customerName} (use first name ${customerFirst} in conversation)`,
    `- Item / job: ${itemSummary}`,
    `- Total to pay on collection: ${totalDisplay}`,
    dueDateDisplay ? `- Collection timing: ${dueDateDisplay}` : '',
    notes ? `- Workshop notes: ${notes.slice(0, 500)}` : '',
    `- Work completed: ${tasksSummary}`,
    `- Opening hours for collection: ${openingHoursSummary}`,
    '',
    '# How to run the call',
    '1. Wait until the customer answers and says hello — do not speak over the ring tone.',
    `2. Introduce yourself as calling from ${brandName}.`,
    '3. Tell them clearly their bike is finished and ready to collect (do not mention the work order number unless they ask).',
    `4. State the total (${totalDisplay}) and describe what was done in plain language (not a list of line items): ${tasksSummary}`,
    '5. Ask if they have any questions about the work or picking up.',
    '6. Confirm they understand, thank them, then end the call.',
    '',
    '# Important',
    '- Do not hang up after only a greeting or intro — you must deliver the collection message and total before ending.',
    '- Do not say the work order number out loud unless the customer asks for it.',
    '- Do not invent prices, dates, or work that are not listed above.',
    '- Keep it concise and friendly. Use Australian English.',
  ].filter(Boolean).join('\n');

  const supabase = getAdminClient();
  const goalPrompt = await enrichOutboundGoalWithKnowledge(supabase, brandKey, baseGoal);

  const dynamicVars = {
    brand_name: brandName,
    customer_name: customerName,
    customer_first_name: customerFirst,
    item_summary: itemSummary,
    total_price_display: totalDisplay,
    notes: notes ?? '',
    completed_tasks: tasksSummary,
    completed_tasks_short: tasksShort,
    opening_hours_summary: openingHoursSummary,
    due_date_display: dueDateDisplay ?? '',
    workorder_id: String(workorderId),
    goal: goalPrompt,
    call_goal: goalPrompt,
    outbound_goal: goalPrompt,
  };

  return {
    brandName,
    customerName,
    customerPhoneE164,
    itemSummary,
    totalDisplay,
    notes,
    tasksSummary,
    dueDateDisplay,
    goalPrompt,
    dynamicVars,
  };
}

const OUTBOUND_MIN_RING_MS = 12_000;
/** Do not treat ElevenLabs "done" as terminal while the customer is on the line. */
const OUTBOUND_MIN_CONNECTED_DURATION_SEC = 8;
const NEST_VOICE_RESTORE_KEY = '_nest_voice_agent_restore';

function parseVoiceRestoreSnapshot(
  dynamicVars: Record<string, unknown> | null | undefined,
): ElevenLabsAgentRestoreSnapshot | null {
  const raw = dynamicVars?.[NEST_VOICE_RESTORE_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const first = (raw as Record<string, unknown>).first_message;
  return typeof first === 'string' ? { first_message: first } : null;
}

async function releaseNestOutboundVoiceAgent(job: NestOutboundCallJobRow): Promise<void> {
  const agentId = job.elevenlabs_agent_id;
  const snapshot = parseVoiceRestoreSnapshot(job.dynamic_vars);
  if (!agentId || !snapshot) return;
  try {
    await restoreElevenLabsAgentAfterNestOutbound(agentId, snapshot);
  } catch (err) {
    console.warn('[nest-outbound] Failed to restore voice agent after outbound:', err);
  }
}

function outboundCallAgeMs(job: NestOutboundCallJobRow): number {
  const anchor = job.initiated_at ?? job.created_at;
  if (!anchor) return Number.POSITIVE_INFINITY;
  const ms = new Date(anchor).getTime();
  if (Number.isNaN(ms)) return Number.POSITIVE_INFINITY;
  return Date.now() - ms;
}

export async function executeNestOutboundCall(jobId: string): Promise<void> {
  const supabase = getAdminClient();
  let { data: job, error } = await supabase
    .from('nest_outbound_call_jobs')
    .select(JOB_SELECT)
    .eq('id', jobId)
    .single<NestOutboundCallJobRow>();

  if (error || !job) throw new Error(error?.message || 'Outbound call job not found');
  if (job.status === 'cancelled') return;
  if (job.status !== 'queued') return;
  if (job.elevenlabs_conversation_id || job.twilio_call_sid) return;

  const initiatedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from('nest_outbound_call_jobs')
    .update({
      status: 'calling',
      initiated_at: job.initiated_at ?? initiatedAt,
    })
    .eq('id', job.id)
    .eq('status', 'queued')
    .is('elevenlabs_conversation_id', null)
    .is('twilio_call_sid', null)
    .select(JOB_SELECT)
    .maybeSingle<NestOutboundCallJobRow>();

  if (claimError) throw new Error(claimError.message);
  if (!claimed) return;

  job = claimed;

  const { data: config, error: configErr } = await supabase
    .from('nest_brand_chat_config')
    .select('elevenlabs_voice_agent_id')
    .eq('brand_key', job.brand_key)
    .maybeSingle();

  if (configErr) throw new Error(configErr.message);
  const agentId = parseString(config?.elevenlabs_voice_agent_id);
  if (!agentId) {
    await supabase.from('nest_outbound_call_jobs').update({
      status: 'failed',
      failure_reason: 'No Phone Assistant agent linked for this brand. Set one up on the Voice Agent tab.',
    }).eq('id', job.id);
    return;
  }

  let phoneNumberId = job.elevenlabs_phone_number_id;
  if (!phoneNumberId) {
    try {
      phoneNumberId = await resolvePhoneNumberId(agentId, { preferAgentAssignment: true });
    } catch (err) {
      const reason = (err as Error).message;
      await supabase.from('nest_outbound_call_jobs').update({
        status: 'failed',
        failure_reason: reason,
      }).eq('id', job.id);
      return;
    }
  }

  let goalPrompt = job.goal_prompt;
  let dynamicVars = job.dynamic_vars ?? {};

  if (!goalPrompt) {
    const ctx = await buildCallContext(
      job.brand_key,
      job.workorder_id,
      callContextOverridesFromJob(job),
    );
    goalPrompt = ctx.goalPrompt;
    dynamicVars = { ...ctx.dynamicVars, nest_outbound_job_id: job.id };
    await supabase.from('nest_outbound_call_jobs').update({
      goal_prompt: goalPrompt,
      dynamic_vars: dynamicVars,
      elevenlabs_agent_id: agentId,
      elevenlabs_phone_number_id: phoneNumberId,
    }).eq('id', job.id);
  } else {
    dynamicVars = {
      ...dynamicVars,
      nest_outbound_job_id: job.id,
      goal: goalPrompt,
      call_goal: goalPrompt,
      outbound_goal: goalPrompt,
    };
  }

  await supabase.from('nest_outbound_call_jobs').update({
    elevenlabs_agent_id: agentId,
    elevenlabs_phone_number_id: phoneNumberId,
  }).eq('id', job.id);

  const useSipTrunk = (getOptionalEnv('NEST_OUTBOUND_USE_SIP_TRUNK') || 'false') === 'true';
  const sipPhoneNumberId = useSipTrunk
    ? getOptionalEnv('ELEVENLABS_SIP_AGENT_PHONE_NUMBER_ID')
    : null;

  try {
    const voiceRestore = await prepareElevenLabsAgentForNestOutbound(agentId, job.brand_key, supabase);
    dynamicVars = {
      ...dynamicVars,
      [NEST_VOICE_RESTORE_KEY]: voiceRestore,
    };
    await supabase.from('nest_outbound_call_jobs').update({ dynamic_vars: dynamicVars }).eq('id', job.id);
  } catch (syncErr) {
    console.warn('[nest-outbound] Agent prepare failed (continuing dial):', syncErr);
  }

  const jobForRelease = { ...job, elevenlabs_agent_id: agentId, dynamic_vars: dynamicVars };

  try {
    const result = await startElevenLabsOutboundCall({
      agentId,
      phoneNumberId,
      toNumber: job.customer_phone_e164,
      dynamicVariables: dynamicVars,
      sipPhoneNumberId,
    });

    await supabase.from('nest_outbound_call_jobs').update({
      status: 'calling',
      elevenlabs_conversation_id: result.conversationId,
      twilio_call_sid: result.callSid,
      dynamic_vars: {
        ...dynamicVars,
        elevenlabs_response: result.raw,
        telephony_provider: result.telephonyProvider,
      },
    }).eq('id', job.id);
  } catch (err) {
    const reason = (err as Error).message;
    await supabase.from('nest_outbound_call_jobs').update({
      status: 'failed',
      failure_reason: reason,
      completed_at: new Date().toISOString(),
    }).eq('id', job.id);
    await releaseNestOutboundVoiceAgent(jobForRelease);
  }
}

async function completeNestOutboundJobFromConversation(
  job: NestOutboundCallJobRow,
  data: Record<string, unknown>,
): Promise<void> {
  const supabase = getAdminClient();
  const outcome = parseConversationOutcome(data);
  if (outcome.terminalStatus === 'calling') return;

  const durationSec = outcome.durationSeconds ?? 0;
  const endedVeryEarly = durationSec < 3;
  if (
    outboundCallAgeMs(job) < OUTBOUND_MIN_RING_MS &&
    endedVeryEarly &&
    (outcome.terminalStatus === 'no_answer' || outcome.terminalStatus === 'failed')
  ) {
    return;
  }
  if (
    job.status === 'connected' &&
    durationSec < OUTBOUND_MIN_CONNECTED_DURATION_SEC
  ) {
    return;
  }

  const conversationId = typeof data.conversation_id === 'string'
    ? data.conversation_id
    : job.elevenlabs_conversation_id;
  const callSid = job.twilio_call_sid || extractTwilioCallSidFromSummary(outcome.summary);
  const recordingUrl = outcome.recordingAvailable && conversationId
    ? await buildJobRecordingProxyUrl(job.id, 'nest-outbound-recording-audio')
    : null;

  const status: NestOutboundCallStatus = outcome.terminalStatus === 'failed'
    ? 'failed'
    : outcome.terminalStatus === 'no_answer'
    ? 'no_answer'
    : 'completed';

  await supabase.from('nest_outbound_call_jobs').update({
    status,
    completed_at: new Date().toISOString(),
    duration_seconds: outcome.durationSeconds,
    answered: outcome.answered,
    summary: outcome.summary,
    recording_available: outcome.recordingAvailable,
    twilio_call_sid: callSid,
    failure_reason: status === 'failed' ? 'ElevenLabs conversation failed' : null,
    dynamic_vars: {
      ...(job.dynamic_vars ?? {}),
      recording_proxy_url: recordingUrl,
    },
  }).eq('id', job.id);

  await releaseNestOutboundVoiceAgent(job);
}

export async function handleNestOutboundPostCall(payload: Record<string, unknown>): Promise<boolean> {
  const data = (payload.data || payload) as Record<string, unknown>;
  const conversationId = typeof data.conversation_id === 'string' ? data.conversation_id : '';
  if (!conversationId) return false;

  const supabase = getAdminClient();
  const { data: job, error } = await supabase
    .from('nest_outbound_call_jobs')
    .select(JOB_SELECT)
    .eq('elevenlabs_conversation_id', conversationId)
    .maybeSingle<NestOutboundCallJobRow>();

  if (error || !job) return false;
  await completeNestOutboundJobFromConversation(job, data);
  return true;
}

export async function pollNestOutboundCalls(limit = 25): Promise<{ processed: number }> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('nest_outbound_call_jobs')
    .select(JOB_SELECT)
    .in('status', ['queued', 'calling', 'connected'])
    .order('updated_at', { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  let processed = 0;
  for (const job of (data ?? []) as NestOutboundCallJobRow[]) {
    processed++;
    if (job.status === 'queued') {
      await executeNestOutboundCall(job.id);
      continue;
    }

    if (job.twilio_call_sid && job.status === 'calling') {
      const twilioStatus = await fetchTwilioCallStatus(job.twilio_call_sid);
      if (twilioStatus === 'in-progress') {
        await supabase.from('nest_outbound_call_jobs').update({
          status: 'connected',
          connected_at: job.connected_at ?? new Date().toISOString(),
        }).eq('id', job.id);
      } else if (
        twilioStatus &&
        ['busy', 'failed', 'no-answer', 'canceled'].includes(twilioStatus) &&
        outboundCallAgeMs(job) >= OUTBOUND_MIN_RING_MS
      ) {
        await supabase.from('nest_outbound_call_jobs').update({
          status: 'no_answer',
          answered: false,
          completed_at: new Date().toISOString(),
          failure_reason: twilioStatus,
        }).eq('id', job.id);
        await releaseNestOutboundVoiceAgent(job);
        continue;
      }
    }

    if (job.elevenlabs_conversation_id) {
      try {
        const conversation = await fetchElevenLabsConversation(job.elevenlabs_conversation_id);
        const outcome = parseConversationOutcome(conversation);
        if (outcome.terminalStatus !== 'calling') {
          const callAgeMs = outboundCallAgeMs(job);
          const durationSec = outcome.durationSeconds ?? 0;
          const endedVeryEarly = durationSec < 3;
          if (callAgeMs < OUTBOUND_MIN_RING_MS && endedVeryEarly) {
            continue;
          }
          if (job.status === 'connected' && durationSec < OUTBOUND_MIN_CONNECTED_DURATION_SEC) {
            continue;
          }
          await completeNestOutboundJobFromConversation(job, conversation);
        }
      } catch (err) {
        console.warn('[nest-outbound] conversation poll failed:', (err as Error).message);
      }
    }
  }

  return { processed };
}

export async function prepareNestOutboundCallJob(input: {
  brandKey: string;
  workorderId: number;
  sessionId: string;
}): Promise<NestOutboundCallJobRow> {
  const supabase = getAdminClient();

  const { data: active } = await supabase
    .from('nest_outbound_call_jobs')
    .select('id, status')
    .eq('brand_key', input.brandKey)
    .eq('workorder_id', input.workorderId)
    .in('status', ['queued', 'calling', 'connected'])
    .limit(1);

  if (active && active.length > 0) {
    throw new Error('A call is already in progress for this work order');
  }

  const ctx = await buildCallContext(input.brandKey, input.workorderId);

  const { data: config } = await supabase
    .from('nest_brand_chat_config')
    .select('elevenlabs_voice_agent_id')
    .eq('brand_key', input.brandKey)
    .maybeSingle();

  const agentId = parseString(config?.elevenlabs_voice_agent_id);
  if (!agentId) {
    throw new Error('Link a Phone Assistant agent on the Voice Agent tab before placing outbound calls');
  }

  let phoneNumberId: string | null = null;
  try {
    phoneNumberId = await resolvePhoneNumberId(agentId, { preferAgentAssignment: true });
  } catch {
    phoneNumberId = null;
  }

  const { data: inserted, error } = await supabase
    .from('nest_outbound_call_jobs')
    .insert({
      brand_key: input.brandKey,
      workorder_id: input.workorderId,
      customer_name: ctx.customerName,
      customer_phone_e164: ctx.customerPhoneE164,
      status: 'queued',
      trigger_source: 'portal_manual',
      triggered_by_session_id: input.sessionId,
      elevenlabs_agent_id: agentId,
      elevenlabs_phone_number_id: phoneNumberId,
      goal_prompt: ctx.goalPrompt,
      dynamic_vars: { ...ctx.dynamicVars, nest_outbound_job_id: null },
    })
    .select(JOB_SELECT)
    .single<NestOutboundCallJobRow>();

  if (error || !inserted) throw new Error(error?.message || 'Could not create outbound call job');
  return inserted;
}

export function nestOutboundEnabled(): boolean {
  return (getOptionalEnv('NEST_OUTBOUND_CALLS_ENABLED') || 'true') === 'true';
}
