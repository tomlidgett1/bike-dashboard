/**
 * Shared source of truth for the Nest dashboard "Moments" automations.
 *
 * Both the user-facing dashboard sheet (`src/pages/nest/Automations.tsx`) and
 * the admin Moments Portal (`src/pages/MomentsPortal.tsx`) import from here.
 * The website API (`api/admin-moments-v2.ts`) also imports from here so
 * server-side defaults stay aligned with what the user sees.
 *
 * NO JSX or React icons in this file — pure data so it can be imported by
 * both the Vite frontend bundle and the Vercel Node API runtime.
 *
 * Icons live in `src/lib/automation-icons.tsx` and are looked up by `iconKey`.
 *
 * The Nest engine has its own copy of allowed types in
 * `Nest/supabase/functions/_shared/user-automations.ts`. Drift between that
 * file and this catalogue is asserted by the catalog-parity test.
 */

export type AutomationFrequency = 'daily' | 'weekly' | 'always'

export type AutomationSection = 'email' | 'calendar' | 'daily' | 'weekly' | 'news' | 'internal'

/** Delivery mechanism. Used by the admin portal to render the right editor. */
export type AutomationDelivery =
  /** Driven by user_automations cron path (config.time/day/timezone matter). */
  | 'user_cron'
  /** Always-on, event-driven (no time picker; Active toggle only). */
  | 'always_on_event'
  /** Delivered by a system V1 moment, not user_automations. Admin can flip
   *  active=true/false but time/day/timezone fields are read-only because
   *  changes there silently no-op (engine returns null for this type). */
  | 'system_moment'

export interface AutomationDefinition {
  type: string
  title: string
  description: string
  detail: string
  iconKey: string
  section: AutomationSection
  frequency: AutomationFrequency
  alwaysOn: boolean
  /** Default local time for scheduled types (HH:mm 24h). */
  defaultTime: string
  defaultDay?: string
  /** 12-hour parts for the dashboard time picker. Server uses defaultTime. */
  defaultHour: number
  defaultMinute: number
  defaultPeriod: 'AM' | 'PM'
  /** Microcopy used by the dashboard sheet, e.g. "Deliver every day at". */
  sheetLabel: string
  /** How the engine actually delivers this automation. */
  delivery: AutomationDelivery
  /** If false, the admin portal renders an explainer modal with no editable
   *  time/day/timezone fields. Active toggle still works. */
  editableSchedule: boolean
}

export const AUTOMATION_SECTIONS: Array<{ id: AutomationSection; title: string }> = [
  { id: 'email', title: 'Email' },
  { id: 'calendar', title: 'Calendar' },
  { id: 'daily', title: 'Daily' },
  { id: 'weekly', title: 'Weekly' },
  { id: 'news', title: 'News' },
]

export const AUTOMATION_DEFINITIONS: AutomationDefinition[] = [
  // ── Email ───────────────────────────────────────────────────────────
  {
    type: 'email_summary',
    title: 'Inbox Summary',
    description: 'Morning email digest',
    detail: 'Scans your unread emails across Gmail and Outlook, then texts you a conversational summary highlighting anything urgent or personal.',
    iconKey: 'mail',
    section: 'email',
    frequency: 'daily',
    alwaysOn: false,
    defaultTime: '08:00',
    defaultHour: 8,
    defaultMinute: 0,
    defaultPeriod: 'AM',
    sheetLabel: 'Deliver every day at',
    delivery: 'user_cron',
    editableSchedule: true,
  },
  {
    type: 'follow_up_nudge',
    title: 'Follow-Up Nudge',
    description: 'Unanswered threads',
    detail: 'Checks for emails you sent in the last 3 days that haven\'t received a reply, and gently reminds you who might need a follow-up.',
    iconKey: 'message',
    section: 'email',
    frequency: 'daily',
    alwaysOn: false,
    defaultTime: '14:00',
    defaultHour: 2,
    defaultMinute: 0,
    defaultPeriod: 'PM',
    sheetLabel: 'Check for follow-ups at',
    delivery: 'user_cron',
    editableSchedule: true,
  },
  {
    type: 'email_monitor',
    title: 'Urgent Alerts',
    description: 'Important email alerts',
    detail: 'Continuously monitors your inbox for emails marked important or from key contacts. Sends you an instant alert when something urgent lands.',
    iconKey: 'bell',
    section: 'email',
    frequency: 'always',
    alwaysOn: true,
    defaultTime: '09:00',
    defaultHour: 9,
    defaultMinute: 0,
    defaultPeriod: 'AM',
    sheetLabel: '',
    delivery: 'always_on_event',
    editableSchedule: false,
  },
  {
    type: 'bill_reminders',
    title: 'Bill reminders',
    description: 'Upcoming, due and overdue bills',
    detail: 'Uses inbox webhooks so when an email arrives about an upcoming bill, a payment due date, a scheduled charge, or an overdue balance, Nest texts you promptly. Works across your connected Gmail and Outlook accounts.',
    iconKey: 'receipt',
    section: 'email',
    frequency: 'always',
    alwaysOn: true,
    defaultTime: '08:00',
    defaultHour: 8,
    defaultMinute: 0,
    defaultPeriod: 'AM',
    sheetLabel: '',
    delivery: 'always_on_event',
    editableSchedule: false,
  },
  // ── Calendar ────────────────────────────────────────────────────────
  {
    type: 'calendar_heads_up',
    title: 'Calendar Heads-Up',
    description: 'Reminder before each meeting',
    detail: 'Texts you a heads-up 20–75 minutes before each calendar event, with attendee context and any related emails so you walk in prepared.',
    iconKey: 'calendar',
    section: 'calendar',
    frequency: 'always',
    alwaysOn: true,
    defaultTime: '09:00',
    defaultHour: 9,
    defaultMinute: 0,
    defaultPeriod: 'AM',
    sheetLabel: '',
    delivery: 'system_moment',
    editableSchedule: false,
  },
  {
    type: 'meeting_intel',
    title: 'Meeting Prep',
    description: 'Evening brief for tomorrow',
    detail: 'Reviews tomorrow\'s calendar events, looks up attendees in your memories, and sends you a prep brief so you walk into every meeting informed.',
    iconKey: 'calendar',
    section: 'calendar',
    frequency: 'daily',
    alwaysOn: false,
    defaultTime: '20:00',
    defaultHour: 8,
    defaultMinute: 0,
    defaultPeriod: 'PM',
    sheetLabel: 'Send meeting brief at',
    delivery: 'user_cron',
    editableSchedule: true,
  },
  // ── Daily ───────────────────────────────────────────────────────────
  {
    type: 'morning_briefing',
    title: 'Morning Briefing',
    description: 'Voice note for your morning',
    detail: 'A spoken morning briefing that pulls together today\'s calendar, inbox, weather, open loops and background context into one concise voice memo.',
    iconKey: 'sunrise',
    section: 'daily',
    frequency: 'daily',
    alwaysOn: false,
    defaultTime: '07:30',
    defaultHour: 7,
    defaultMinute: 30,
    defaultPeriod: 'AM',
    sheetLabel: 'Send briefing at',
    delivery: 'user_cron',
    editableSchedule: true,
  },
  {
    type: 'midday_briefing',
    title: 'Midday Briefing',
    description: 'Voice check-in for your midday',
    detail: 'A spoken midday brief that builds on your morning briefing — what\'s landed since, what\'s still untouched, and what\'s genuinely worth getting in front of this afternoon. Reasoning over your full inbox, calendar, semantic email history, and earlier briefs.',
    iconKey: 'sun',
    section: 'daily',
    frequency: 'daily',
    alwaysOn: false,
    defaultTime: '12:30',
    defaultHour: 12,
    defaultMinute: 30,
    defaultPeriod: 'PM',
    sheetLabel: 'Send midday brief at',
    delivery: 'user_cron',
    editableSchedule: true,
  },
  {
    type: 'evening_briefing',
    title: 'Evening Briefing',
    description: 'Voice wrap-up for your evening',
    detail: 'A spoken evening brief that wraps the day cleanly and orients you for tomorrow. Reasons over both earlier briefs, what you actioned, what\'s still hot, semantic prior context on open threads, and tomorrow\'s calendar so you walk into the morning prepared.',
    iconKey: 'moon',
    section: 'daily',
    frequency: 'daily',
    alwaysOn: false,
    defaultTime: '18:30',
    defaultHour: 6,
    defaultMinute: 30,
    defaultPeriod: 'PM',
    sheetLabel: 'Send evening brief at',
    delivery: 'user_cron',
    editableSchedule: true,
  },
  {
    type: 'daily_wrap',
    title: 'Daily Wrap',
    description: 'End-of-day debrief',
    detail: 'Reviews your day, what happened on the calendar, notable emails, and a preview of tomorrow so you can switch off with peace of mind.',
    iconKey: 'sunset',
    section: 'daily',
    frequency: 'daily',
    alwaysOn: false,
    defaultTime: '18:00',
    defaultHour: 6,
    defaultMinute: 0,
    defaultPeriod: 'PM',
    sheetLabel: 'Send wrap-up at',
    delivery: 'user_cron',
    editableSchedule: true,
  },
  // ── Weekly ──────────────────────────────────────────────────────────
  {
    type: 'weekly_digest',
    title: 'Weekly Digest',
    description: 'Full week review',
    detail: 'A Sunday evening recap of your week, how many events, key emails, topics you discussed with Nest, and a look ahead at next week.',
    iconKey: 'chart',
    section: 'weekly',
    frequency: 'weekly',
    alwaysOn: false,
    defaultTime: '19:00',
    defaultDay: 'Sunday',
    defaultHour: 7,
    defaultMinute: 0,
    defaultPeriod: 'PM',
    sheetLabel: 'Send digest every',
    delivery: 'user_cron',
    editableSchedule: true,
  },
  {
    type: 'relationship_radar',
    title: 'Relationship Radar',
    description: 'Who needs a check-in',
    detail: 'Looks through your contacts and memories to find people you haven\'t been in touch with recently, and suggests who might appreciate a message.',
    iconKey: 'users',
    section: 'weekly',
    frequency: 'weekly',
    alwaysOn: false,
    defaultTime: '18:00',
    defaultDay: 'Sunday',
    defaultHour: 6,
    defaultMinute: 0,
    defaultPeriod: 'PM',
    sheetLabel: 'Send radar every',
    delivery: 'user_cron',
    editableSchedule: true,
  },
  // ── News ────────────────────────────────────────────────────────────
  {
    type: 'news_briefing',
    title: 'News Briefing',
    description: 'Personalised news digest',
    detail: 'A curated summary of the day\'s top news stories tailored to your interests, delivered as a quick conversational text.',
    iconKey: 'newspaper',
    section: 'news',
    frequency: 'daily',
    alwaysOn: false,
    defaultTime: '07:00',
    defaultHour: 7,
    defaultMinute: 0,
    defaultPeriod: 'AM',
    sheetLabel: 'Send news at',
    delivery: 'user_cron',
    editableSchedule: true,
  },
  {
    type: 'market_snapshot',
    title: 'Market Snapshot',
    description: 'Stocks & crypto overview',
    detail: 'A quick morning snapshot of market movements, major indices, and any stocks or crypto you\'ve mentioned to Nest before.',
    iconKey: 'trending',
    section: 'news',
    frequency: 'daily',
    alwaysOn: false,
    defaultTime: '07:30',
    defaultHour: 7,
    defaultMinute: 30,
    defaultPeriod: 'AM',
    sheetLabel: 'Send snapshot at',
    delivery: 'user_cron',
    editableSchedule: true,
  },
  // ── Internal (not rendered on the user-facing dashboard) ────────────
  {
    type: 'proactive_agent',
    title: 'Proactive Agent',
    description: 'Autonomous proactive messages',
    detail: 'Every minute, evaluates the user\'s recent conversations for time-anchored intents ("I\'ll do X tomorrow evening") and sends a gentle follow-up when the moment arrives. Internal pilot — not exposed on the user dashboard.',
    iconKey: 'bell',
    section: 'internal',
    frequency: 'always',
    alwaysOn: true,
    defaultTime: '09:00',
    defaultHour: 9,
    defaultMinute: 0,
    defaultPeriod: 'AM',
    sheetLabel: '',
    delivery: 'always_on_event',
    editableSchedule: false,
  },
]

export const ALLOWED_AUTOMATION_TYPES = new Set(AUTOMATION_DEFINITIONS.map(d => d.type))

export function getAutomationDefinition(type: string): AutomationDefinition | undefined {
  return AUTOMATION_DEFINITIONS.find(d => d.type === type)
}

/** Validate a config object against the definition's schema. */
export function validateAutomationConfig(
  type: string,
  config: Record<string, unknown> | undefined,
): { valid: true; cleaned: Record<string, unknown> } | { valid: false; error: string } {
  const def = getAutomationDefinition(type)
  if (!def) return { valid: false, error: `Unknown automation_type: ${type}` }
  if (!config) return { valid: true, cleaned: {} }

  const cleaned: Record<string, unknown> = {}

  if ('time' in config && config.time !== undefined && config.time !== null) {
    const t = String(config.time)
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) {
      return { valid: false, error: `Invalid time "${t}" — expected HH:MM (00:00-23:59)` }
    }
    cleaned.time = t
  }

  if ('timezone' in config && config.timezone !== undefined && config.timezone !== null) {
    const tz = String(config.timezone).trim()
    if (!isValidTimezone(tz)) {
      return { valid: false, error: `Invalid timezone "${tz}" — must be a valid IANA timezone` }
    }
    cleaned.timezone = tz
  }

  if ('day' in config && config.day !== undefined && config.day !== null) {
    const day = String(config.day)
    const allowedDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    if (!allowedDays.includes(day)) {
      return { valid: false, error: `Invalid day "${day}" — must be one of ${allowedDays.join(', ')}` }
    }
    if (def.frequency !== 'weekly') {
      return { valid: false, error: `day is only valid for weekly automations (got frequency=${def.frequency})` }
    }
    cleaned.day = day
  }

  // Pass-through fields (frequency, prompt, watch_filters, etc.) — preserved
  // so we don't accidentally wipe non-user-editable config server-stored data.
  for (const [k, v] of Object.entries(config)) {
    if (!['time', 'timezone', 'day'].includes(k) && v !== undefined) {
      // length-cap any string field
      if (typeof v === 'string' && v.length > 4000) {
        return { valid: false, error: `Field "${k}" exceeds 4000-char limit` }
      }
      cleaned[k] = v
    }
  }

  return { valid: true, cleaned }
}

function isValidTimezone(tz: string): boolean {
  if (!tz) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}
