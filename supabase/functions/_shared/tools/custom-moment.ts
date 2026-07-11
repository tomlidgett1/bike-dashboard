import type { ToolContract, ToolContext, ToolOutput } from './types.ts';
import { getAdminClient } from '../supabase.ts';
import { provisionNotificationWebhookSubscriptions } from '../ensure-notification-webhooks.ts';

const DEFAULT_TZ = 'Australia/Sydney';
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
type DayName = typeof DAY_NAMES[number];
type CustomMomentFrequency = 'one_shot' | 'daily' | 'weekly' | 'weekday' | 'hourly';
type CustomMomentDelivery = 'text' | 'voice_memo';
type TriggerKind = 'scheduled' | 'event_watch' | 'email_watch';

export interface ParsedCustomMomentRequest {
  prompt: string;
  label: string;
  frequency: CustomMomentFrequency;
  triggerKind: TriggerKind;
  delivery: CustomMomentDelivery;
  timezone: string;
  time?: string;
  day?: DayName;
  nextRunAt: string;
  requiresLiveResearch: boolean;
  eventQuery?: string;
  emailMatchSender?: string;
}

export function normaliseCustomMomentEventKey(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

export function getDeliveredCustomMomentEventKeys(config: {
  delivered_event_keys?: unknown;
  last_event_key?: unknown;
}): string[] {
  const raw = Array.isArray(config.delivered_event_keys) ? config.delivered_event_keys : [];
  const keys = raw
    .filter((value): value is string => typeof value === 'string')
    .map(normaliseCustomMomentEventKey)
    .filter(Boolean);
  if (typeof config.last_event_key === 'string') {
    keys.push(normaliseCustomMomentEventKey(config.last_event_key));
  }
  return [...new Set(keys)].slice(0, 40);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function normaliseTime(hour: number, minute: number): string {
  return `${pad2(Math.max(0, Math.min(23, hour)))}:${pad2(Math.max(0, Math.min(59, minute)))}`;
}

function extractTime(text: string, defaultHour = 9): { hour: number; minute: number; time: string } {
  const lower = text.toLowerCase();
  if (/\bnoon\b/.test(lower)) return { hour: 12, minute: 0, time: '12:00' };
  if (/\bmidnight\b/.test(lower)) return { hour: 0, minute: 0, time: '00:00' };

  const match = lower.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?|am|pm)?\b/);
  if (!match) {
    const hour = lower.includes('morning') ? 8 : lower.includes('evening') ? 18 : defaultHour;
    return { hour, minute: 0, time: normaliseTime(hour, 0) };
  }

  let hour = Number.parseInt(match[1], 10);
  const minute = match[2] ? Number.parseInt(match[2], 10) : 0;
  const suffix = (match[3] ?? '').replace(/\./g, '');
  if (suffix === 'pm' && hour < 12) hour += 12;
  if (suffix === 'am' && hour === 12) hour = 0;
  return { hour, minute, time: normaliseTime(hour, minute) };
}

function localTimeToUtc(hour: number, minute: number, tz: string, daysAhead = 0): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => Number.parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);
  const tzYear = get('year');
  const tzMonth = get('month');
  const tzDay = get('day');
  const tzHour = get('hour');
  const tzMin = get('minute');
  const tzSec = get('second');
  const tzNowAsUtc = Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMin, tzSec);
  const offsetMs = tzNowAsUtc - now.getTime();
  const targetAsUtc = Date.UTC(tzYear, tzMonth - 1, tzDay + daysAhead, hour, minute, 0);
  return new Date(targetAsUtc - offsetMs);
}

function localDow(date: Date, tz: string): number {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(date);
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return dowMap[weekday] ?? date.getUTCDay();
}

function nextRunForSchedule(params: {
  frequency: CustomMomentFrequency;
  timezone: string;
  hour?: number;
  minute?: number;
  day?: DayName;
  delayMinutes?: number;
}): string {
  const { frequency, timezone } = params;
  if (frequency === 'one_shot' && params.delayMinutes && params.delayMinutes > 0) {
    return new Date(Date.now() + params.delayMinutes * 60_000).toISOString();
  }
  if (frequency === 'hourly') return new Date(Date.now() + 60_000).toISOString();

  const hour = params.hour ?? 9;
  const minute = params.minute ?? 0;
  let next = localTimeToUtc(hour, minute, timezone);
  if (next.getTime() <= Date.now()) next = localTimeToUtc(hour, minute, timezone, 1);

  if (frequency === 'weekly' && params.day) {
    const targetDow = DAY_NAMES.indexOf(params.day);
    let guard = 0;
    while (localDow(next, timezone) !== targetDow && guard++ < 8) {
      next = new Date(next.getTime() + 86_400_000);
    }
  }

  if (frequency === 'weekday') {
    while ([0, 6].includes(localDow(next, timezone))) next = new Date(next.getTime() + 86_400_000);
  }

  return next.toISOString();
}

function inferDay(text: string): DayName | undefined {
  const lower = text.toLowerCase();
  return DAY_NAMES.find((day) => lower.includes(day.toLowerCase()));
}

function inferRequiresLiveResearch(text: string): boolean {
  return /\b(latest|news|update|updates|financial|market|markets|racing|tips?|openai|open ai|product release|released|events?|things to do|fun things|weather|restaurants?|what'?s on)\b/i.test(text);
}

function inferEmailMatchSender(request: string): string | null {
  const patterns = [
    /\bemail\s+from\s+['"]?([^'".,]+(?:@[^'".,\s]+)?)['"]?/i,
    /\bfrom\s+['"]?([^'".,]+(?:@[^'".,\s]+)?)['"]?\s+emails?\s+me\b/i,
    /\bwhenever\s+['"]?([^'".,]+(?:@[^'".,\s]+)?)['"]?\s+emails?\s+me\b/i,
    /\bwhen\s+['"]?([^'".,]+(?:@[^'".,\s]+)?)['"]?\s+emails?\s+me\b/i,
  ];
  for (const pattern of patterns) {
    const match = request.match(pattern);
    const value = match?.[1]?.trim();
    if (value && value.length >= 2) return value;
  }
  return null;
}

function inferLabel(text: string): string {
  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/^(please\s+)?(can you\s+)?/i, '')
    .trim();
  return cleaned.length > 72 ? `${cleaned.slice(0, 69).trim()}...` : cleaned || 'Custom moment';
}

function cleanContentPrompt(value: string): string {
  return value
    .replace(/\b(?:as|in)\s+(?:a\s+)?(?:voice note|voice memo|audio|spoken brief)\b/gi, ' ')
    .replace(/\b(?:voice note|voice memo|audio)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[,.\-\s]+|[,.\-\s]+$/g, '')
    .trim();
}

export function extractCustomMomentContentPrompt(request: string, explicitPrompt?: string): string {
  const explicit = explicitPrompt?.trim();
  if (explicit && explicit !== request.trim()) return cleanContentPrompt(explicit);

  let text = request.trim();
  if (!text) return '';

  const aboutMatch = text.match(/\babout\s+(.+)$/i);
  if (aboutMatch?.[1]) return cleanContentPrompt(aboutMatch[1]);

  text = text
    .replace(/\bin\s+\d+\s*(?:minutes?|mins?|hours?|hrs?)\b/gi, ' ')
    .replace(
      /\b(?:every|each)\s+(?:weekday|day|morning|afternoon|evening|week|month|sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|am|pm)?)?/gi,
      ' ',
    )
    .replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|am|pm)\b/gi, ' ')
    .replace(/\b(?:straight away|right away)\b/gi, ' ');

  text = text
    .replace(/^\s*(?:please\s+)?(?:can you\s+)?(?:i want you to\s+)?/i, '')
    .replace(/^\s*(?:send me|give me|tell me|update me|let me know|please send me)\s+/i, '')
    .replace(/^\s*(?:a\s+)?(?:list of\s+)?/i, (match) => match.toLowerCase().includes('list') ? 'a list of ' : '')
    .trim();

  return cleanContentPrompt(text || request);
}

function extractEmailWatchPrompt(request: string, explicitPrompt?: string): string {
  const explicit = explicitPrompt?.trim();
  if (explicit && explicit !== request.trim()) return cleanContentPrompt(explicit);

  const actionMatch = request.match(/\b(?:send|give|tell|text)\s+(?:me\s+)?(?:a\s+)?(?:voice note|voice memo|message|text)?(?:\s+to\s+me)?\s+(?:about\s+|explaining\s+|explaining\s+the\s+|with\s+)?(.+)$/i);
  if (actionMatch?.[1]) {
    const cleaned = cleanContentPrompt(actionMatch[1]);
    if (cleaned) {
      return /^explain|^summari[sz]e|^tell/i.test(cleaned)
        ? cleaned
        : `explain ${cleaned}`;
    }
  }

  return 'tell me that the matching email arrived and explain why it matters';
}

export function parseCustomMomentRequest(input: {
  naturalLanguageRequest?: string;
  prompt?: string;
  schedule?: string;
  frequency?: string;
  time?: string;
  day?: string;
  delivery?: string;
  timezone?: string | null;
  label?: string;
}): ParsedCustomMomentRequest {
  const timezone = input.timezone?.trim() || DEFAULT_TZ;
  const source = `${input.schedule ?? ''} ${input.naturalLanguageRequest ?? ''}`.trim();
  const request = (input.naturalLanguageRequest || input.prompt || input.schedule || '').trim();
  const scheduleText = source || request;
  const lower = scheduleText.toLowerCase();
  const prompt = extractCustomMomentContentPrompt(request, input.prompt);
  const delivery: CustomMomentDelivery =
    input.delivery === 'voice_memo' || /\b(voice note|voice memo|audio|spoken)\b/i.test(request)
      ? 'voice_memo'
      : 'text';
  const emailWatch = /\b(email|emails|inbox|sender)\b/i.test(request) &&
    /\b(whenever|when|if|as soon as|let me know|notify me|alert me)\b/i.test(request);
  if (emailWatch) {
    const emailMatchSender = inferEmailMatchSender(request) ?? undefined;
    const emailPrompt = extractEmailWatchPrompt(request, input.prompt);
    return {
      prompt: emailPrompt,
      label: input.label?.trim() || inferLabel(request),
      frequency: 'hourly',
      triggerKind: 'email_watch',
      delivery,
      timezone,
      nextRunAt: new Date(Date.now() + 60_000).toISOString(),
      requiresLiveResearch: false,
      eventQuery: emailPrompt,
      ...(emailMatchSender ? { emailMatchSender } : {}),
    };
  }

  const eventWatch = /\b(whenever|as soon as|straight away|right away|when there is|when there'?s|if .*release|if .*launch|if .*happen)\b/i.test(request);
  if (eventWatch) {
    return {
      prompt,
      label: input.label?.trim() || inferLabel(request),
      frequency: 'hourly',
      triggerKind: 'event_watch',
      delivery,
      timezone,
      nextRunAt: new Date(Date.now() + 60_000).toISOString(),
      requiresLiveResearch: true,
      eventQuery: prompt,
    };
  }

  const delay = lower.match(/\bin\s+(\d+)\s*(minutes?|mins?|hours?|hrs?)\b/);
  if (delay) {
    const amount = Number.parseInt(delay[1], 10);
    const multiplier = delay[2].startsWith('hour') || delay[2].startsWith('hr') ? 60 : 1;
    return {
      prompt,
      label: input.label?.trim() || inferLabel(request),
      frequency: 'one_shot',
      triggerKind: 'scheduled',
      delivery,
      timezone,
      nextRunAt: nextRunForSchedule({ frequency: 'one_shot', timezone, delayMinutes: amount * multiplier }),
      requiresLiveResearch: inferRequiresLiveResearch(prompt),
    };
  }

  const timeParts = input.time && /^\d{2}:\d{2}$/.test(input.time)
    ? { hour: Number(input.time.slice(0, 2)), minute: Number(input.time.slice(3, 5)), time: input.time }
    : extractTime(scheduleText);
  const explicitDay = DAY_NAMES.find((day) => day.toLowerCase() === input.day?.toLowerCase());
  const day = explicitDay ?? inferDay(scheduleText);
  const rawFrequency = input.frequency?.toLowerCase();
  const frequency: CustomMomentFrequency =
    rawFrequency === 'weekday' || /\bevery weekday\b/i.test(scheduleText)
      ? 'weekday'
      : rawFrequency === 'weekly' || !!day || /\bevery week\b/i.test(scheduleText)
      ? 'weekly'
      : 'daily';

  return {
    prompt,
    label: input.label?.trim() || inferLabel(request),
    frequency,
    triggerKind: 'scheduled',
    delivery,
    timezone,
    time: timeParts.time,
    ...(day ? { day } : {}),
    nextRunAt: nextRunForSchedule({
      frequency,
      timezone,
      hour: timeParts.hour,
      minute: timeParts.minute,
      day,
    }),
    requiresLiveResearch: inferRequiresLiveResearch(prompt),
  };
}

async function handleCustomMoment(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutput> {
  const action = String(input.action ?? 'create');
  if (!ctx.authUserId) {
    const error = { error: 'No authenticated user is available for custom moments.' };
    return { content: JSON.stringify(error), structuredData: error };
  }

  const supabase = getAdminClient();

  if (action === 'list') {
    const { data, error } = await supabase
      .from('user_automations')
      .select('id, active, label, config, next_run_at, last_run_at, created_at')
      .eq('user_id', ctx.authUserId)
      .eq('automation_type', 'custom')
      .order('created_at', { ascending: false });
    if (error) return { content: JSON.stringify({ error: error.message }) };
    return { content: JSON.stringify({ custom_moments: data ?? [] }), structuredData: { count: data?.length ?? 0 } };
  }

  if (['delete', 'pause', 'resume'].includes(action)) {
    const id = String(input.automation_id ?? '').trim();
    if (!id) return { content: JSON.stringify({ error: 'automation_id is required.' }) };
    if (action === 'delete') {
      const { error } = await supabase.from('user_automations').delete().eq('id', id).eq('user_id', ctx.authUserId);
      if (error) return { content: JSON.stringify({ error: error.message }) };
      return { content: JSON.stringify({ status: 'deleted', automation_id: id }) };
    }
    const active = action === 'resume';
    const { data: current, error: currentError } = await supabase
      .from('user_automations')
      .select('config')
      .eq('id', id)
      .eq('user_id', ctx.authUserId)
      .maybeSingle();
    if (currentError) return { content: JSON.stringify({ error: currentError.message }) };
    const config = (current?.config ?? {}) as Record<string, unknown>;
    const parsed = parseCustomMomentRequest({
      prompt: String(config.prompt ?? ''),
      frequency: String(config.frequency ?? 'daily'),
      time: typeof config.time === 'string' ? config.time : undefined,
      day: typeof config.day === 'string' ? config.day : undefined,
      timezone: typeof config.timezone === 'string' ? config.timezone : ctx.timezone,
    });
    const { error } = await supabase
      .from('user_automations')
      .update({
        active,
        next_run_at: active ? parsed.nextRunAt : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', ctx.authUserId);
    if (error) return { content: JSON.stringify({ error: error.message }) };
    return { content: JSON.stringify({ status: active ? 'resumed' : 'paused', automation_id: id }) };
  }

  const parsed = parseCustomMomentRequest({
    naturalLanguageRequest: typeof input.natural_language_request === 'string' ? input.natural_language_request : undefined,
    prompt: typeof input.prompt === 'string' ? input.prompt : undefined,
    schedule: typeof input.schedule === 'string' ? input.schedule : undefined,
    frequency: typeof input.frequency === 'string' ? input.frequency : undefined,
    time: typeof input.time === 'string' ? input.time : undefined,
    day: typeof input.day === 'string' ? input.day : undefined,
    delivery: typeof input.delivery === 'string' ? input.delivery : undefined,
    timezone: typeof input.timezone === 'string' ? input.timezone : ctx.timezone,
    label: typeof input.label === 'string' ? input.label : undefined,
  });

  if (!parsed.prompt || parsed.prompt.length < 4) {
    const error = { error: 'prompt is required for a custom moment.' };
    return { content: JSON.stringify(error), structuredData: error };
  }

  const config: Record<string, unknown> = {
    prompt: parsed.prompt,
    timezone: parsed.timezone,
    frequency: parsed.frequency,
    trigger_kind: parsed.triggerKind,
    delivery: parsed.delivery,
    requires_live_research: parsed.requiresLiveResearch,
    created_via: 'chat',
    ...(parsed.time ? { time: parsed.time } : {}),
    ...(parsed.day ? { day: parsed.day } : {}),
    ...(parsed.eventQuery ? { event_query: parsed.eventQuery } : {}),
    ...(parsed.emailMatchSender ? { email_match_sender: parsed.emailMatchSender } : {}),
    ...(typeof input.natural_language_request === 'string' ? { original_request: input.natural_language_request } : {}),
  };

  if (parsed.triggerKind === 'email_watch') {
    const { data: triggerId, error: triggerError } = await supabase.rpc(
      'insert_notification_watch_trigger',
      {
        p_handle: ctx.senderHandle,
        p_name: parsed.label,
        p_description: parsed.prompt,
        p_trigger_type: parsed.emailMatchSender ? 'sender' : 'custom',
        p_source_type: 'email',
        p_account_email: null,
        p_provider: null,
        p_match_sender: parsed.emailMatchSender ?? null,
        p_match_subject_pattern: null,
        p_match_labels: null,
        p_use_ai_matching: true,
        p_ai_prompt: parsed.prompt,
        p_delivery_method: 'custom_moment',
        p_time_constraint: null,
      },
    );
    if (triggerError) {
      return { content: JSON.stringify({ error: triggerError.message }), structuredData: { error: triggerError.message } };
    }
    config.email_trigger_id = String(triggerId);
    await provisionNotificationWebhookSubscriptions(ctx.authUserId, ctx.senderHandle, 'email').catch((e) =>
      console.warn('[custom-moment] webhook provisioning failed:', (e as Error).message)
    );
  }

  const { data, error } = await supabase
    .from('user_automations')
    .insert({
      user_id: ctx.authUserId,
      automation_type: 'custom',
      active: true,
      label: parsed.label,
      config,
      next_run_at: parsed.triggerKind === 'email_watch' ? null : parsed.nextRunAt,
    })
    .select('id')
    .single();

  if (error) return { content: JSON.stringify({ error: error.message }), structuredData: { error: error.message } };

  const result = {
    status: 'created',
    automation_id: data.id,
    label: parsed.label,
    next_run_at: parsed.nextRunAt,
    frequency: parsed.frequency,
    trigger_kind: parsed.triggerKind,
    delivery: parsed.delivery,
    ...(parsed.triggerKind === 'email_watch' ? { email_trigger_id: config.email_trigger_id } : {}),
    _confirmation: `Custom moment created: "${parsed.label}".`,
  };
  return { content: JSON.stringify(result), structuredData: result };
}

export const customMomentTool: ToolContract = {
  name: 'manage_custom_moment',
  description:
    'Create, list, pause, resume, or delete custom Nest moments. Use when the user asks for recurring or one-off scheduled content like "every Wednesday send me financial news", "in 15 minutes send me things to do in Tokyo", or event watches like "whenever OpenAI releases a product, update me". Supports text or voice memo delivery.',
  namespace: 'reminders.manage',
  sideEffect: 'commit',
  idempotent: false,
  timeoutMs: 15000,
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['create', 'list', 'pause', 'resume', 'delete'], description: 'Action to perform. Default: create.' },
      natural_language_request: { type: 'string', description: 'The user request verbatim. Best for natural-language setup.' },
      prompt: { type: 'string', description: 'What Nest should send when the moment fires.' },
      schedule: { type: 'string', description: 'Schedule phrase, e.g. "every Wednesday at 10am" or "in 15 minutes".' },
      frequency: { type: 'string', enum: ['one_shot', 'daily', 'weekly', 'weekday', 'hourly'], description: 'Optional structured frequency override.' },
      time: { type: 'string', description: 'Optional local HH:mm time.' },
      day: { type: 'string', description: 'Optional weekday name for weekly moments.' },
      delivery: { type: 'string', enum: ['text', 'voice_memo'], description: 'Delivery mode. Use voice_memo when the user asks for a voice note/memo/audio.' },
      timezone: { type: 'string', description: 'IANA timezone. Default: user timezone.' },
      label: { type: 'string', description: 'Short label shown in the custom moments list.' },
      automation_id: { type: 'string', description: 'Required for pause, resume, or delete.' },
    },
    required: ['action'],
  },
  inputExamples: [
    { action: 'create', natural_language_request: 'Every Wednesday at 10am send me the latest financial news in a voice note' },
    { action: 'create', natural_language_request: "Whenever OpenAI releases a new product, update me straight away" },
    { action: 'create', natural_language_request: 'In 15 minutes send me fun things to do in Tokyo' },
  ],
  handler: handleCustomMoment,
};
