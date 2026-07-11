// ═══════════════════════════════════════════════════════════════
// Pure helpers: when an in-progress booking exists but the customer
// asks something unrelated (price, hours, etc.), fall through to the
// main brand LLM instead of repeating the field checklist.
// ═══════════════════════════════════════════════════════════════

export type BookingFieldSnapshot = {
  customer_name: string | null;
  bike: string | null;
  comments: string | null;
  drop_off_date: string | null;
};

export type BookingDeferralSignals = {
  cancel: boolean;
  confirm: boolean;
  intent: boolean;
};

function bookingFieldsEqual(a: BookingFieldSnapshot, b: BookingFieldSnapshot): boolean {
  return (
    a.customer_name === b.customer_name &&
    a.bike === b.bike &&
    a.comments === b.comments &&
    a.drop_off_date === b.drop_off_date
  );
}

/**
 * `true` → `tryHandleLightspeedBookingTurn` should return `null` so brand chat
 * runs the normal reply path. Booking row stays in the DB untouched.
 */
export function shouldDeferBookingToMainLlm(
  before: BookingFieldSnapshot,
  after: BookingFieldSnapshot,
  extraction: BookingDeferralSignals,
): boolean {
  if (extraction.cancel || extraction.confirm) return false;
  if (extraction.intent) return false;
  return bookingFieldsEqual(before, after);
}
