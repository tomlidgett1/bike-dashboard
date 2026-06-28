const MELBOURNE_TZ = 'Australia/Melbourne';

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
