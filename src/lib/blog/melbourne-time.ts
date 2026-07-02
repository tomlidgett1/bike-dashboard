export const MELBOURNE_TIME_ZONE = 'Australia/Melbourne';

const MELBOURNE_TZ = MELBOURNE_TIME_ZONE;

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour'),
    value('minute'),
    value('second'),
  );
  return asUtc - date.getTime();
}

/** Convert a datetime-local value (wall clock) in Melbourne to UTC ISO string. */
export function melbourneLocalDateTimeToIso(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) throw new Error('Choose a valid send date and time');

  const [, year, month, day, hour, minute] = match;
  const wallTimeMs = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0,
  );
  let utcMs = wallTimeMs;

  // Recalculate once for DST boundaries where the offset changes around the selected time.
  for (let i = 0; i < 2; i += 1) {
    utcMs = wallTimeMs - getTimeZoneOffsetMs(new Date(utcMs), MELBOURNE_TZ);
  }

  return new Date(utcMs).toISOString();
}

function melbourneParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: MELBOURNE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value;

  return {
    year: get('year') ?? '',
    month: get('month') ?? '',
    day: get('day') ?? '',
    hour: Number(get('hour') ?? 0),
    minute: Number(get('minute') ?? 0),
  };
}

/** Calendar day in Melbourne, e.g. 2026-06-28 */
export function melbourneDayKey(date = new Date()): string {
  const { year, month, day } = melbourneParts(date);
  return `${year}-${month}-${day}`;
}

/** True during the 7:00am Melbourne window (cron fires at :00; allow a small buffer). */
export function isMelbourne7amWindow(date = new Date()): boolean {
  const { hour, minute } = melbourneParts(date);
  return hour === 7 && minute < 15;
}

export function formatMelbourneTime(date = new Date()): string {
  return date.toLocaleString('en-AU', {
    timeZone: MELBOURNE_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
