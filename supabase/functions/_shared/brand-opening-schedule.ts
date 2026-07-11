export const DEFAULT_BUSINESS_TIMEZONE = 'Australia/Melbourne';

export const OPENING_SCHEDULE_DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type OpeningScheduleDay = (typeof OPENING_SCHEDULE_DAYS)[number];

export interface OpeningScheduleRule {
  id: string;
  days: OpeningScheduleDay[];
  startMinute: number;
  endMinute: number;
  message: string;
}

export interface OpeningSchedule {
  enabled: boolean;
  rules: OpeningScheduleRule[];
}

export interface OpeningMessageConfigLike {
  opening_line?: string | null;
  business_timezone?: string | null;
  opening_schedule?: unknown;
}

export interface OpeningMessageResolution {
  message: string | null;
  source: 'schedule' | 'fallback' | 'none';
  matchedRule: OpeningScheduleRule | null;
  timezone: string;
  localDay: OpeningScheduleDay;
  minuteOfDay: number;
  localNowLabel: string;
}

export const OPENING_DAY_LABELS: Record<OpeningScheduleDay, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

function safeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function clampMinute(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 24 * 60) return 24 * 60;
  return Math.floor(value);
}

function normaliseDays(raw: unknown): OpeningScheduleDay[] {
  if (!Array.isArray(raw)) return [];
  const out: OpeningScheduleDay[] = [];
  const seen = new Set<OpeningScheduleDay>();
  for (const value of raw) {
    const key = String(value ?? '').trim().toLowerCase() as OpeningScheduleDay;
    if (!OPENING_SCHEDULE_DAYS.includes(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function normaliseRule(raw: unknown, index: number): OpeningScheduleRule | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  return {
    id: safeString(record.id).trim() || `opening-rule-${index + 1}`,
    days: normaliseDays(record.days),
    startMinute: clampMinute(Number(record.startMinute ?? 0)),
    endMinute: clampMinute(Number(record.endMinute ?? 0)),
    message: safeString(record.message).trim(),
  };
}

export function emptyOpeningSchedule(): OpeningSchedule {
  return { enabled: false, rules: [] };
}

export function normaliseOpeningSchedule(raw: unknown): OpeningSchedule {
  if (!raw || typeof raw !== 'object') return emptyOpeningSchedule();
  const record = raw as Record<string, unknown>;
  const rules = Array.isArray(record.rules)
    ? record.rules
        .map((rule, index) => normaliseRule(rule, index))
        .filter((rule): rule is OpeningScheduleRule => Boolean(rule))
    : [];
  return {
    enabled: Boolean(record.enabled),
    rules,
  };
}

export function isValidIanaTimezone(timezone: string): boolean {
  const value = timezone.trim();
  if (!value) return false;
  try {
    new Intl.DateTimeFormat('en-AU', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function normaliseBusinessTimezone(timezone: string | null | undefined): string {
  const trimmed = (timezone ?? '').trim();
  return isValidIanaTimezone(trimmed) ? trimmed : DEFAULT_BUSINESS_TIMEZONE;
}

function weekdayToKey(weekday: string): OpeningScheduleDay {
  const key = weekday.trim().toLowerCase() as OpeningScheduleDay;
  return OPENING_SCHEDULE_DAYS.includes(key) ? key : 'monday';
}

function getLocalWeekday(now: Date, timezone: string): OpeningScheduleDay {
  return weekdayToKey(
    now.toLocaleDateString('en-AU', {
      timeZone: timezone,
      weekday: 'long',
    }),
  );
}

function getLocalMinuteOfDay(now: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

export function formatMinuteOfDay(minuteOfDay: number): string {
  const total = clampMinute(minuteOfDay);
  const hour24 = Math.floor(total / 60);
  const minute = total % 60;
  const suffix = hour24 >= 12 ? 'pm' : 'am';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')}${suffix}`;
}

export function formatScheduleDays(days: OpeningScheduleDay[]): string {
  if (days.length === OPENING_SCHEDULE_DAYS.length) return 'Every day';
  return days.map((day) => OPENING_DAY_LABELS[day]).join(', ');
}

function findMatchingRule(schedule: OpeningSchedule, localDay: OpeningScheduleDay, minuteOfDay: number): OpeningScheduleRule | null {
  return schedule.rules.find(
    (rule) =>
      rule.days.includes(localDay) &&
      minuteOfDay >= rule.startMinute &&
      minuteOfDay < rule.endMinute &&
      rule.message.trim().length > 0,
  ) ?? null;
}

export function resolveOpeningMessage(
  config: OpeningMessageConfigLike,
  now: Date = new Date(),
): OpeningMessageResolution {
  const timezone = normaliseBusinessTimezone(config.business_timezone);
  const schedule = normaliseOpeningSchedule(config.opening_schedule);
  const localDay = getLocalWeekday(now, timezone);
  const minuteOfDay = getLocalMinuteOfDay(now, timezone);
  const fallback = safeString(config.opening_line).trim();
  const matchedRule = schedule.enabled ? findMatchingRule(schedule, localDay, minuteOfDay) : null;
  const localNowLabel = now.toLocaleString('en-AU', {
    timeZone: timezone,
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  });

  if (matchedRule) {
    return {
      message: matchedRule.message.trim(),
      source: 'schedule',
      matchedRule,
      timezone,
      localDay,
      minuteOfDay,
      localNowLabel,
    };
  }

  if (fallback) {
    return {
      message: fallback,
      source: 'fallback',
      matchedRule: null,
      timezone,
      localDay,
      minuteOfDay,
      localNowLabel,
    };
  }

  return {
    message: null,
    source: 'none',
    matchedRule: null,
    timezone,
    localDay,
    minuteOfDay,
    localNowLabel,
  };
}

export function validateOpeningSchedule(schedule: OpeningSchedule): string[] {
  const errors: string[] = [];

  if (schedule.rules.length > 24) {
    errors.push('Use up to 24 opening message rules.');
  }

  for (const rule of schedule.rules) {
    if (rule.days.length === 0) {
      errors.push('Each opening message rule needs at least one day.');
    }
    if (rule.startMinute >= rule.endMinute) {
      errors.push('Each opening message rule must end after it starts.');
    }
    if (!rule.message.trim()) {
      errors.push('Each opening message rule needs a message.');
    }
  }

  for (const day of OPENING_SCHEDULE_DAYS) {
    const dayRules = schedule.rules
      .filter((rule) => rule.days.includes(day))
      .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);

    for (let index = 1; index < dayRules.length; index += 1) {
      const previous = dayRules[index - 1];
      const current = dayRules[index];
      if (current.startMinute < previous.endMinute) {
        errors.push(
          `${OPENING_DAY_LABELS[day]} has overlapping rules (${formatMinuteOfDay(previous.startMinute)}-${formatMinuteOfDay(previous.endMinute)} and ${formatMinuteOfDay(current.startMinute)}-${formatMinuteOfDay(current.endMinute)}).`,
        );
      }
    }
  }

  return Array.from(new Set(errors));
}

export function scheduleHasContent(schedule: OpeningSchedule): boolean {
  return schedule.rules.some((rule) => rule.message.trim().length > 0 && rule.days.length > 0);
}

export function formatScheduleRuleSummary(rule: OpeningScheduleRule): string {
  return `${formatScheduleDays(rule.days)} · ${formatMinuteOfDay(rule.startMinute)}-${formatMinuteOfDay(rule.endMinute)}`;
}

export function buildOpeningSchedulePromptBlock(
  config: OpeningMessageConfigLike,
  now: Date = new Date(),
): string | null {
  const schedule = normaliseOpeningSchedule(config.opening_schedule);
  if (!schedule.enabled || !scheduleHasContent(schedule)) return null;

  const fallback = safeString(config.opening_line).trim();
  const resolved = resolveOpeningMessage(config, now);
  const lines = [
    '### Opening message schedule (portal)',
    `Business timezone: ${resolved.timezone}.`,
    'When greeting a customer in a new thread, use the first matching schedule rule below based on the business local time.',
    `Local business time now: ${resolved.localNowLabel}.`,
    resolved.message
      ? `Active greeting right now: "${resolved.message}".`
      : 'No scheduled greeting matches right now.',
    fallback
      ? `Fallback outside scheduled windows: "${fallback}".`
      : 'No fallback greeting is set outside the scheduled windows.',
    'Scheduled windows:',
    ...schedule.rules.map((rule) => `- ${formatScheduleRuleSummary(rule)}: ${rule.message.trim()}`),
  ];
  return lines.join('\n');
}
