import type { SpecialsCadence } from '@/lib/types/specials';

/**
 * Timezone-aware rotation windows for the specials carousel.
 *
 * Cycles flip at a fixed store-local hour (and weekday, for weekly cadence) so a
 * "daily" rotation always turns over at, say, 3am Melbourne time regardless of
 * DST. We snap each boundary to the local wall-clock hour rather than adding
 * fixed millisecond offsets, which keeps boundaries stable across DST changes.
 */

export interface CycleWindow {
  starts_at: string;
  ends_at: string;
}

interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  /** 0 = Monday … 6 = Sunday */
  weekday: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    weekday: 'short',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
  };
}

/** Offset (ms) of `timeZone` from UTC at the given instant. */
function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUTC - date.getTime();
}

/** Instant for a local wall-clock (y, m, d, hour) in the given timezone. */
function zonedTimeToUtc(
  y: number,
  m: number,
  d: number,
  hour: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(y, m - 1, d, hour, 0, 0);
  const offset = timeZoneOffsetMs(new Date(guess), timeZone);
  return new Date(guess - offset);
}

/** Add whole local days to a calendar date (DST-safe; date-only arithmetic). */
function addDays(y: number, m: number, d: number, days: number) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export interface CycleWindowConfig {
  cadence: SpecialsCadence;
  rotation_hour: number;
  rotation_weekday: number;
  timezone: string;
}

/** Start of the cycle currently containing `now`. */
export function currentCycleStart(config: CycleWindowConfig, now: Date): Date {
  const tz = config.timezone || 'Australia/Melbourne';
  const hour = Math.min(23, Math.max(0, config.rotation_hour));
  const parts = getZonedParts(now, tz);

  if (config.cadence === 'daily') {
    const base =
      parts.hour < hour ? addDays(parts.year, parts.month, parts.day, -1) : { y: parts.year, m: parts.month, d: parts.day };
    return zonedTimeToUtc(base.y, base.m, base.d, hour, tz);
  }

  // Weekly: walk back to the most recent rotation weekday at the rotation hour.
  const weekday = Math.min(6, Math.max(0, config.rotation_weekday));
  let daysBack = (parts.weekday - weekday + 7) % 7;
  if (daysBack === 0 && parts.hour < hour) daysBack = 7;
  const base = addDays(parts.year, parts.month, parts.day, -daysBack);
  return zonedTimeToUtc(base.y, base.m, base.d, hour, tz);
}

/**
 * Contiguous rotation windows starting with the cycle containing `now`.
 * windows[0] is the active window; windows[1..] are upcoming.
 */
export function computeCycleWindows(
  config: CycleWindowConfig,
  count: number,
  now: Date = new Date(),
): CycleWindow[] {
  const tz = config.timezone || 'Australia/Melbourne';
  const hour = Math.min(23, Math.max(0, config.rotation_hour));
  const step = config.cadence === 'weekly' ? 7 : 1;

  const start0 = currentCycleStart(config, now);
  const start0Parts = getZonedParts(start0, tz);

  const boundaries: Date[] = [];
  for (let i = 0; i <= Math.max(1, count); i++) {
    const d = addDays(start0Parts.year, start0Parts.month, start0Parts.day, i * step);
    boundaries.push(zonedTimeToUtc(d.y, d.m, d.d, hour, tz));
  }

  const windows: CycleWindow[] = [];
  for (let i = 0; i < count; i++) {
    windows.push({
      starts_at: boundaries[i].toISOString(),
      ends_at: boundaries[i + 1].toISOString(),
    });
  }
  return windows;
}
