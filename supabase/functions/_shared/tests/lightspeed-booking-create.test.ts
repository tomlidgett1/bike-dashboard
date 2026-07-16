import {
  buildLightspeedWorkorderPayload,
  extractWorkorderId,
  isFreshBookingConfirmation,
  melbourneDropOffIso,
  melbourneEtaOutIso,
  normaliseDropOffTime,
  UNCOMMITTED_VISIT_TIME_CLAIM_RE,
} from '../lightspeed-booking-create.ts';
import { toolOutputIndicatesFailure } from '../tools/tool-output-status.ts';

function assertEquals(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

function assertStringIncludes(actual: string, expected: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`Expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}

Deno.test('preserves the requested 10am drop-off from booking comments', () => {
  assertEquals(
    normaliseDropOffTime(null, 'Customer wants to come in at 10am today for Garmin fitting'),
    '10:00',
  );

  const built = buildLightspeedWorkorderPayload(
    {
      brandKey: 'ash',
      chatId: '633f287c-e424-4ebd-a2b7-ba3be640c800',
      customerName: 'Ganesh Naidoo',
      customerPhoneE164: '+61400000000',
      bike: 'SL7 Tarmac',
      comments: 'Customer wants to come in at 10am today for Garmin fitting',
      dropOffDate: '2026-07-14',
      defaultNote: 'Booked in over Nest',
    },
    { customerId: 9500, shopId: 1 },
  );

  assertEquals(built.requestedTime, '10:00');
  assertEquals(built.payload.timeIn, '2026-07-14T10:00:00+10:00');
  assertEquals(built.payload.etaOut, '2026-07-14T17:00:00+10:00');
  assertEquals(built.payload.customerID, 9500);
  assertEquals(built.payload.shopID, 1);
  assertStringIncludes(String(built.payload.note), 'SL7 Tarmac');
  assertStringIncludes(
    String(built.payload.note),
    '[Nest booking 633f287c-e424-4ebd-a2b7-ba3be640c800]',
  );
});

Deno.test('uses the correct Melbourne daylight-saving offset', () => {
  assertEquals(melbourneDropOffIso('2026-01-14', '10:00'), '2026-01-14T10:00:00+11:00');
  assertEquals(melbourneDropOffIso('2026-07-14', '10:00'), '2026-07-14T10:00:00+10:00');
});

Deno.test('etaOut always lands after the drop-off timeIn', () => {
  assertEquals(melbourneEtaOutIso('2026-07-14', '10:00'), '2026-07-14T17:00:00+10:00');
  assertEquals(melbourneEtaOutIso('2026-07-14', null), '2026-07-14T17:00:00+10:00');
  assertEquals(melbourneEtaOutIso('2026-07-14', '17:30'), '2026-07-14T19:00:00+10:00');
  assertEquals(melbourneEtaOutIso('2026-07-14', '22:30'), '2026-07-14T23:00:00+10:00');
});

Deno.test('extracts workorder IDs from Lightspeed responses', () => {
  assertEquals(
    extractWorkorderId({ Workorder: { workorderID: '19476' } }),
    19476,
  );
  assertEquals(extractWorkorderId({ Workorder: {} }), null);
});

Deno.test('flags a resolved commit with ok false as an execution error', () => {
  assertEquals(toolOutputIndicatesFailure('commit', { ok: false, error: 'http 404' }), true);
  assertEquals(toolOutputIndicatesFailure('draft', { ok: false }), false);
  assertEquals(toolOutputIndicatesFailure('commit', { ok: true }), false);
});

Deno.test('detects a premature time-specific booking promise', () => {
  assertEquals(
    UNCOMMITTED_VISIT_TIME_CLAIM_RE.test(
      'Yep, you can come by at 10am during opening hours. Is that for today?',
    ),
    true,
  );
  assertEquals(
    UNCOMMITTED_VISIT_TIME_CLAIM_RE.test(
      'I can note 10am as your requested time, but it is not booked yet.',
    ),
    false,
  );
});

Deno.test('requires a fresh unambiguous confirmation before committing', () => {
  assertEquals(isFreshBookingConfirmation('yes'), true);
  assertEquals(isFreshBookingConfirmation('book it please'), true);
  assertEquals(isFreshBookingConfirmation('SL7 Tarmac'), false);
  assertEquals(isFreshBookingConfirmation('yes but change it to Friday'), false);
});
