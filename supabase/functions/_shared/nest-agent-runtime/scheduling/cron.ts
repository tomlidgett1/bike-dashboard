function zonedParts(date: Date, timezone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const out: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return out;
}

function zonedTimeToUtc(args: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  timezone: string;
}): Date {
  const guess = new Date(Date.UTC(args.year, args.month - 1, args.day, args.hour, args.minute, 0));
  const actual = zonedParts(guess, args.timezone);
  const wantedAsUtc = Date.UTC(args.year, args.month - 1, args.day, args.hour, args.minute, 0);
  const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second ?? 0);
  return new Date(guess.getTime() + (wantedAsUtc - actualAsUtc));
}

export function nextRunFromCron(
  cronExpression: string,
  timezone = "Australia/Melbourne",
  from = new Date(),
): string {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Unsupported cron expression: ${cronExpression}`);
  const [minuteRaw, hourRaw, dayRaw, monthRaw, weekdayRaw] = parts;
  if (dayRaw !== "*" || monthRaw !== "*" || weekdayRaw !== "*") {
    throw new Error(`Only daily cron is supported in v1: ${cronExpression}`);
  }
  const minute = Number(minuteRaw);
  const hour = Number(hourRaw);
  if (!Number.isInteger(minute) || !Number.isInteger(hour) || minute < 0 || minute > 59 || hour < 0 || hour > 23) {
    throw new Error(`Invalid daily cron time: ${cronExpression}`);
  }

  const local = zonedParts(from, timezone);
  let candidate = zonedTimeToUtc({
    year: local.year,
    month: local.month,
    day: local.day,
    hour,
    minute,
    timezone,
  });

  if (candidate <= from) {
    const nextLocalDate = new Date(Date.UTC(local.year, local.month - 1, local.day + 1, 12, 0, 0));
    const nextLocal = zonedParts(nextLocalDate, timezone);
    candidate = zonedTimeToUtc({
      year: nextLocal.year,
      month: nextLocal.month,
      day: nextLocal.day,
      hour,
      minute,
      timezone,
    });
  }

  return candidate.toISOString();
}
