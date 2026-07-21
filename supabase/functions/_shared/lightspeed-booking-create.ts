export type BookingCreateInput = {
  brandKey: string;
  chatId: string;
  customerName: string;
  customerPhoneE164: string;
  bike: string | null;
  comments: string;
  dropOffDate: string;
  dropOffTime?: string | null;
  defaultNote: string;
};

export type ResolvedWorkorderContext = {
  customerId: number;
  shopId: number;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_24_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * A time-specific arrival invitation implies that the workshop accepted the
 * booking, even when it avoids words such as "booked" or "locked in".
 */
export const UNCOMMITTED_VISIT_TIME_CLAIM_RE =
  /\b(?:(?:you\s+can|no\s+worries|yep|yeah|sure)[^.!?\n]{0,50})?(?:come\s+(?:by|in)|drop(?:\s+it)?\s+off)\s+(?:at|around)\s+\d{1,2}(?::[0-5]\d)?\s*(?:am|pm)\b/i;

const FRESH_BOOKING_CONFIRMATION_RE =
  /^(yes|yep|yeah|yup|yess+|sure|ok(?:ay)?|confirm(?:ed)?|please\s+do|book\s+it(?:\s+in)?|go\s+ahead|do\s+it|sounds\s+good|that'?s\s+(?:right|good|perfect|fine)|perfect|great|cheers|lock\s+it\s+in|let'?s\s+do\s+it|all\s+good|that\s+works)(?:[,;]?\s+(?:please|thanks|thank\s+you|mate|then|cheers))?[.!\s]*$/i;

export function isFreshBookingConfirmation(message: string | null | undefined): boolean {
  const trimmed = message?.trim() ?? '';
  if (!trimmed || trimmed.length > 50 || trimmed.includes('?')) return false;
  if (
    /\b(but|however|wait|actually|hold\s+on|change|instead|add|also|except|cancel|nope|not)\b/i
      .test(trimmed)
  ) {
    return false;
  }
  return FRESH_BOOKING_CONFIRMATION_RE.test(trimmed);
}

function cleanLine(value: string, max: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

export function normaliseDropOffTime(
  explicitTime: string | null | undefined,
  comments: string,
): string | null {
  const explicit = explicitTime?.trim() ?? '';
  const explicitMatch = explicit.match(TIME_24_RE);
  if (explicitMatch) return `${explicitMatch[1]}:${explicitMatch[2]}`;

  const twelveHour = comments.match(
    /\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/i,
  );
  if (twelveHour) {
    let hour = Number(twelveHour[1]) % 12;
    if (twelveHour[3].toLowerCase() === 'pm') hour += 12;
    return `${String(hour).padStart(2, '0')}:${twelveHour[2] ?? '00'}`;
  }

  const twentyFourHour = comments.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (twentyFourHour) {
    return `${String(Number(twentyFourHour[1])).padStart(2, '0')}:${twentyFourHour[2]}`;
  }

  return null;
}

function melbourneOffsetForDate(date: string): string {
  const probe = new Date(`${date}T12:00:00Z`);
  const offsetPart = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    timeZoneName: 'longOffset',
  }).formatToParts(probe).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+10:00';
  const match = offsetPart.match(/GMT([+-]\d{2}:\d{2})/);
  return match?.[1] ?? '+10:00';
}

export function melbourneDropOffIso(date: string, time: string | null): string {
  if (!DATE_RE.test(date)) throw new Error('drop_off_date must be YYYY-MM-DD');
  const resolvedTime = time && TIME_24_RE.test(time) ? time : '09:00';
  return `${date}T${resolvedTime}:00${melbourneOffsetForDate(date)}`;
}

/**
 * Lightspeed rejects workorders whose ETA Out is not after Time In, and when a
 * future-dated timeIn is sent without an etaOut it defaults ETA Out to "now"
 * and 422s ("ETA Out must be greater than Time In"). Promise end of the
 * drop-off day, or two hours after a late drop-off.
 */
export function melbourneEtaOutIso(date: string, time: string | null): string {
  if (!DATE_RE.test(date)) throw new Error('drop_off_date must be YYYY-MM-DD');
  const dropOffHour =
    time && TIME_24_RE.test(time) ? Number(time.slice(0, 2)) : 9;
  const etaHour = Math.min(Math.max(17, dropOffHour + 2), 23);
  return `${date}T${String(etaHour).padStart(2, '0')}:00:00${melbourneOffsetForDate(date)}`;
}

export function buildBookingMarker(chatId: string): string {
  const safeChatId = chatId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  if (!safeChatId) throw new Error('chat_id is required for booking idempotency');
  return `[Nest booking ${safeChatId}]`;
}

function formatRequestedDropOff(date: string, time: string | null): string {
  const dateValue = new Date(`${date}T12:00:00Z`);
  const dateLabel = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(dateValue);
  if (!time) return dateLabel;

  const [hour, minute] = time.split(':').map(Number);
  const period = hour >= 12 ? 'pm' : 'am';
  const displayHour = hour % 12 || 12;
  return `${dateLabel} at ${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
}

export function buildLightspeedWorkorderPayload(
  input: BookingCreateInput,
  resolved: ResolvedWorkorderContext,
): {
  marker: string;
  requestedTime: string | null;
  payload: Record<string, unknown>;
} {
  const marker = buildBookingMarker(input.chatId);
  const requestedTime = normaliseDropOffTime(input.dropOffTime, input.comments);
  const noteLines = [
    cleanLine(input.defaultNote || 'Booked in over Nest', 200),
    input.bike ? `Bike: ${cleanLine(input.bike, 120)}` : '',
    `Requested drop-off: ${formatRequestedDropOff(input.dropOffDate, requestedTime)}`,
    `Customer request: ${cleanLine(input.comments, 400)}`,
    marker,
  ].filter(Boolean);

  return {
    marker,
    requestedTime,
    payload: {
      timeIn: melbourneDropOffIso(input.dropOffDate, requestedTime),
      etaOut: melbourneEtaOutIso(input.dropOffDate, requestedTime),
      note: noteLines.join('\n').slice(0, 1200),
      internalNote: `Created from a confirmed Nest customer booking.\n${marker}`,
      warranty: false,
      saveParts: false,
      assignEmployeeToAll: false,
      customerID: resolved.customerId,
      serializedID: 0,
      shopID: resolved.shopId,
      workorderStatusID: 1,
    },
  };
}

export function extractWorkorderId(data: Record<string, unknown>): number | null {
  const node = data.Workorder;
  const row = (Array.isArray(node) ? node[0] : node) as Record<string, unknown> | undefined;
  const raw = row?.workorderID ?? data.workorder_id;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}
