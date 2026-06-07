import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isBefore,
  parseISO,
  startOfDay,
  startOfMonth,
} from 'date-fns';

export type RentalBookingRange = {
  id?: string;
  start_date: string;
  end_date: string;
  status?: string;
};

const DATE_KEY = 'yyyy-MM-dd';

export function toDateKey(date: Date): string {
  return format(date, DATE_KEY);
}

export function parseDateKey(key: string): Date {
  return parseISO(key);
}

export function normaliseDateRange(start: string, end: string): { start: string; end: string } {
  if (start <= end) return { start, end };
  return { start: end, end: start };
}

export function rangesOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string,
): boolean {
  return start1 <= end2 && start2 <= end1;
}

export function expandRangeToDateKeys(start: string, end: string): string[] {
  const { start: rangeStart, end: rangeEnd } = normaliseDateRange(start, end);
  return eachDayOfInterval({
    start: parseISO(rangeStart),
    end: parseISO(rangeEnd),
  }).map((day) => format(day, DATE_KEY));
}

export function mergeBookedDates(bookings: RentalBookingRange[]): string[] {
  const set = new Set<string>();
  for (const booking of bookings) {
    for (const key of expandRangeToDateKeys(booking.start_date, booking.end_date)) {
      set.add(key);
    }
  }
  return Array.from(set).sort();
}

export function isRangeAvailable(
  start: string,
  end: string,
  bookings: RentalBookingRange[],
  excludeBookingId?: string,
): boolean {
  const { start: rangeStart, end: rangeEnd } = normaliseDateRange(start, end);
  for (const booking of bookings) {
    if (excludeBookingId && booking.id === excludeBookingId) continue;
    if (booking.status === 'cancelled') continue;
    if (rangesOverlap(rangeStart, rangeEnd, booking.start_date, booking.end_date)) {
      return false;
    }
  }
  return true;
}

export function isDateBooked(dateKey: string, bookedDateSet: Set<string>): boolean {
  return bookedDateSet.has(dateKey);
}

export function isPastDate(dateKey: string, todayKey = toDateKey(new Date())): boolean {
  return dateKey < todayKey;
}

export function getMonthGridDays(month: Date): (Date | null)[] {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const leadingEmpty = monthStart.getDay();
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  return [...Array.from({ length: leadingEmpty }, () => null), ...days];
}

export function shiftMonth(month: Date, delta: number): Date {
  return startOfMonth(addMonths(month, delta));
}

export function isDateInRange(
  dateKey: string,
  startKey: string | null,
  endKey: string | null,
): boolean {
  if (!startKey) return false;
  if (!endKey) return dateKey === startKey;
  const { start, end } = normaliseDateRange(startKey, endKey);
  return dateKey >= start && dateKey <= end;
}

export function todayStart(): Date {
  return startOfDay(new Date());
}

export function isBeforeToday(date: Date): boolean {
  return isBefore(startOfDay(date), todayStart());
}
