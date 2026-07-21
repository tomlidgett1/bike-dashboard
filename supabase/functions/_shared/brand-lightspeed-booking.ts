// ═══════════════════════════════════════════════════════════════
// Customer-facing Lightspeed booking flow.
//
// Goal: when a customer texts the brand bot saying they want to book
// their bike in for service, we collect everything we need over chat
// (name, drop-off date, comments) and then push a real workorder into
// Lightspeed Retail. Always tagged with the business-defined note
// (default "Booked in over Nest") and always with a drop-off date.
//
// State lives in `nest_brand_lightspeed_booking_state` (one row per
// brand+chat). We update it turn-by-turn until everything is gathered,
// then call the `lightspeed-create-workorder` Edge Function.
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { BrandApiDebugCollector } from './brand-api-debug.ts';
import { truncateForLog } from './brand-api-debug.ts';
import type { LightspeedToolSettings } from './brand-chat-config.ts';
import type { BrandBookingState } from './brand-chat-types.ts';
import { normaliseToE164 } from './phone-normalise.ts';
import { geminiSimpleText } from './ai/gemini.ts';
import { MODEL_MAP } from './ai/models.ts';
import { getOptionalEnv } from './env.ts';
import { shouldDeferBookingToMainLlm } from './brand-lightspeed-booking-deferral.ts';
import { lookupLightspeedCustomerByPhone } from './brand-lightspeed-workorders.ts';
import { UNCOMMITTED_VISIT_TIME_CLAIM_RE } from './lightspeed-booking-create.ts';

const STATE_TABLE = 'nest_brand_lightspeed_booking_state';
/** Keep draft bookings usable across a long same-day thread (was 6h — too easy to lose before "Yes"). */
const STATE_TTL_HOURS = 72;
const EXTRACT_MODEL = MODEL_MAP.fast;

// ── Types ──────────────────────────────────────────────────────

export type BookingState = BrandBookingState;

export type BookingExtraction = {
  /** True iff this turn explicitly conveys a booking intent (book in / drop off / service etc.) */
  intent: boolean;
  customer_name: string | null;
  bike: string | null;         // make/model/year of the bike being booked in
  comments: string | null;
  drop_off_date: string | null; // YYYY-MM-DD
  cancel: boolean;
  confirm: boolean;
};

export type BookingTurnInput = {
  supabase: SupabaseClient;
  brandKey: string;
  chatId: string;
  senderHandle: string;
  message: string;
  settings: LightspeedToolSettings;
  brandApiDebug?: BrandApiDebugCollector;
};

export type BookingTurnOutcome = {
  text: string;
  inputTokens: number;
  outputTokens: number;
};

// ── Quick intent regex (cheap pre-filter to avoid LLM cost) ───
//
// We only run the LLM extractor when this regex hits OR when an
// in-progress booking row already exists for this chat. That keeps
// the booking flow free for unrelated messages.
const BOOKING_HINT_RE =
  /\b(book(?:\s+(?:my|the|a))?\s+(?:bike|in)|book\s+another\b|\banother\s+(?:bike|booking|one)\b|book\s+in|book\s+a\s+(?:service|repair)|drop(?:[ -]?off)?\s+(?:my|the|a)?\s*(?:bike)?|service\s+(?:my|the|a)\s+bike|need\s+(?:my|the|a)\s+bike\s+(?:serviced|fixed|repaired|looked\s+at)|get\s+(?:my|the|a)\s+bike\s+(?:serviced|fixed|repaired)|repair\s+(?:my|the|a)\s+bike|tune[- ]?up|when\s+can\s+i\s+drop|can\s+i\s+book|like\s+to\s+book|want\s+to\s+book)\b/i;

const CANCEL_RE = /\b(cancel|never\s*mind|forget\s+it|stop|nope|not\s+now)\b/i;

const CONFIRM_RE = /\b(yes|yep|yeah|yup|sure|ok(?:ay)?|confirm|please\s+do|book\s+it|go\s+ahead|do\s+it|sounds\s+good|that'?s\s+(?:right|good|perfect|fine)|locked\s*in|confirmed)\b/i;

/** Short replies that only confirm — must still enter the pipeline if state exists; gate uses this for bare "Yes". */
function isBareConfirmationMessage(message: string): boolean {
  const t = message.trim();
  if (t.length > 64) return false;
  return CONFIRM_RE.test(t);
}

/**
 * Should we run the LLM extractor for this message at all?
 *
 * Cold start (no existing booking row): only when the cheap regex actually
 * matches an explicit booking phrase. Mentioning the word "bike" or naming a
 * weekday is NOT sufficient — those false-positive into the field-collection
 * checklist on questions like "i want to find out about bike servicing" or
 * "what time are you open Friday?" and make the bot feel robotic.
 *
 * Mid-flow (existing row): always extract so partial details like "Trek
 * Domane", "tomorrow afternoon", or a bare "yes" still register.
 */
function shouldExtract(state: BookingState | null, message: string): boolean {
  if (state) return true;
  return BOOKING_HINT_RE.test(message);
}

// ── State persistence ─────────────────────────────────────────

export async function loadBookingState(
  supabase: SupabaseClient,
  brandKey: string,
  chatId: string,
): Promise<BookingState | null> {
  const { data, error } = await supabase
    .from(STATE_TABLE)
    .select('*')
    .eq('brand_key', brandKey)
    .eq('chat_id', chatId)
    .maybeSingle();
  if (error) {
    console.error('[brand-booking] loadState error:', error.message);
    return null;
  }
  if (!data) return null;

  const ageMs = Date.now() - new Date(data.last_message_at as string).getTime();
  if (Number.isFinite(ageMs) && ageMs > STATE_TTL_HOURS * 3_600_000) {
    await supabase.from(STATE_TABLE).delete().eq('brand_key', brandKey).eq('chat_id', chatId);
    return null;
  }
  // Keep created/confirmed rows so Nest can answer follow-ups (due date, bike,
  // workorder) after a website or chat booking. Draft flow uses collecting /
  // awaiting_confirm; created/confirmed are completed bookings.
  return data as BookingState;
}

export async function upsertBookingState(supabase: SupabaseClient, state: BookingState): Promise<void> {
  const row = {
    brand_key: state.brand_key,
    chat_id: state.chat_id,
    status: state.status,
    sender_handle: state.sender_handle,
    sender_phone_e164: state.sender_phone_e164,
    customer_name: state.customer_name,
    bike: state.bike,
    comments: state.comments,
    drop_off_date: state.drop_off_date,
    workorder_id: state.workorder_id,
    last_message_at: new Date().toISOString(),
  };
  const { error } = await supabase.from(STATE_TABLE).upsert(row, { onConflict: 'brand_key,chat_id' });
  if (error) console.error('[brand-booking] upsertState error:', error.message);
}

export async function deleteBookingState(supabase: SupabaseClient, brandKey: string, chatId: string): Promise<void> {
  const { error } = await supabase
    .from(STATE_TABLE)
    .delete()
    .eq('brand_key', brandKey)
    .eq('chat_id', chatId);
  if (error) console.error('[brand-booking] deleteState error:', error.message);
}

// ── LLM extractor ─────────────────────────────────────────────

function todayMelbourneYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function buildExtractorPrompt(state: BookingState | null): string {
  const todayYmd = todayMelbourneYmd();
  const knownLines: string[] = [];
  if (state?.customer_name) knownLines.push(`- name: ${state.customer_name}`);
  if (state?.bike) knownLines.push(`- bike: ${state.bike}`);
  if (state?.drop_off_date) knownLines.push(`- drop_off_date: ${state.drop_off_date}`);
  if (state?.comments) knownLines.push(`- comments: ${state.comments}`);
  const knownBlock = knownLines.length > 0
    ? `Already collected for this booking:\n${knownLines.join('\n')}\n`
    : 'Nothing collected yet for this booking.\n';

  return [
    `You are an intent + entity extractor for a bike shop bot. Today (Melbourne) is ${todayYmd}.`,
    'The customer is texting the shop. Determine whether this turn is them ACTIVELY trying to book a service / drop off a bike, and extract any fields present in the message.',
    '',
    '- intent (boolean): true ONLY when the customer is explicitly trying to BOOK / SCHEDULE / DROP OFF a bike for service or repair RIGHT NOW. The bar is high — when in doubt, return false.',
    '  intent=TRUE examples:',
    '    "I want to book my bike in for a service"',
    '    "Can I drop my bike off tomorrow?"',
    '    "Need to get my road bike fixed, when can you fit me in?"',
    '    "Booking a tune up please"',
    '    "I would like to schedule a service for next Friday"',
    '  intent=FALSE examples (informational, pricing, capability, hours, stock — let the main bot handle these):',
    '    "I want to find out about bike servicing"',
    '    "Tell me about your services"',
    '    "How much for a tune up?"',
    '    "What does a basic service cost?"',
    '    "Do you do bike servicing?"',
    '    "Do you service e-bikes?"',
    '    "What time are you open Friday?"',
    '    "Are you open today?"',
    '    "Do you have a Giant Talon in stock?"',
    '    "What bike brands do you stock?"',
    '    "Hello"',
    '  Only return intent=true when there is a clear ACTION verb directed at booking / dropping off / scheduling. Asking ABOUT a service is not intent — only DOING the booking is.',
    '- customer_name: the customers name if they introduced themselves ("its Sam", "this is Alex"). null if not stated.',
    '- bike: the make/model/year of the bike being brought in (e.g. "Trek Domane SL 5", "Giant Anthem 2021", "my road bike"). null if not mentioned. Do NOT populate this from a stock-availability question like "do you have a Giant Talon in stock".',
    '- comments: a brief description of what is wrong or what they want done ("brakes are squeaky", "full service", "flat rear tyre"). null if absent. Never use this field for price or "how much" questions.',
    '- drop_off_date: an ISO yyyy-mm-dd date if the customer named a date or weekday FOR a booking. Resolve relative dates ("tomorrow", "this Friday", "next Tuesday") against the Melbourne today value above. null if not stated, or if the date is for an unrelated question like "are you open Friday?".',
    '- cancel: true if the customer said they want to cancel/abandon the booking ("never mind", "forget it", "cancel that").',
    '- confirm: true if the customer is explicitly confirming a booking summary ("yes book it", "looks good go ahead", "confirm", "yes please").',
    '',
    knownBlock,
    'Output JSON only, with this exact shape — no commentary, no markdown:',
    '{"intent": false, "customer_name": null, "bike": null, "comments": null, "drop_off_date": null, "cancel": false, "confirm": false}',
  ].join('\n');
}

function safeParseExtraction(raw: string): BookingExtraction {
  const fallback: BookingExtraction = {
    intent: false,
    customer_name: null,
    bike: null,
    comments: null,
    drop_off_date: null,
    cancel: false,
    confirm: false,
  };
  if (!raw) return fallback;
  const cleaned = raw
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  // Some models wrap output even after we ask. Try to grab the first {...} block.
  const match = cleaned.match(/\{[\s\S]*\}/);
  const text = match ? match[0] : cleaned;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const bool = (v: unknown) => v === true;
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const dateStr = (v: unknown) => {
      const s = str(v);
      if (!s) return null;
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
    };
    return {
      intent: bool(parsed.intent),
      customer_name: str(parsed.customer_name)?.slice(0, 80) ?? null,
      bike: str(parsed.bike)?.slice(0, 120) ?? null,
      comments: str(parsed.comments)?.slice(0, 400) ?? null,
      drop_off_date: dateStr(parsed.drop_off_date),
      cancel: bool(parsed.cancel),
      confirm: bool(parsed.confirm),
    };
  } catch {
    return fallback;
  }
}

async function extractBookingFields(
  message: string,
  state: BookingState | null,
  brandApiDebug?: BrandApiDebugCollector,
): Promise<{ extraction: BookingExtraction; inputTokens: number; outputTokens: number }> {
  const cancelHint = CANCEL_RE.test(message);
  const confirmHint = CONFIRM_RE.test(message);

  try {
    const systemPrompt = buildExtractorPrompt(state);
    const result = await geminiSimpleText({
      model: EXTRACT_MODEL,
      systemPrompt,
      userMessage: message,
      maxOutputTokens: 256,
      brandApiDebug,
    });
    const extraction = safeParseExtraction(result.text);
    if (cancelHint) extraction.cancel = true;
    if (confirmHint) extraction.confirm = true;
    return { extraction, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
  } catch (err) {
    console.warn('[brand-booking] extractor error, falling back to regex:', (err as Error).message);
    return {
      extraction: {
        intent: BOOKING_HINT_RE.test(message),
        customer_name: null,
        bike: null,
        comments: null,
        drop_off_date: null,
        cancel: cancelHint,
        confirm: confirmHint,
      },
      inputTokens: 0,
      outputTokens: 0,
    };
  }
}

// ── Reply formatting ──────────────────────────────────────────

/** Pick a phrase variation so copy is not identical every time (deterministic per seed). */
function stablePick(seed: string, options: readonly string[]): string {
  if (options.length === 0) return '';
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return options[Math.abs(h) % options.length] ?? options[0];
}

function formatHumanDate(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const parts = ymd.split('-').map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(d);
}

export function buildBookingSummary(state: BookingState, settings: LightspeedToolSettings): string {
  const head = stablePick(`${state.chat_id}:summary`, [
    'Quick recap — does this look right?',
    'Here is what I have — shout if anything is off.',
    'Locking this in — tell me what to tweak if needed.',
  ]);
  const lines = [
    '**Booking**',
    head,
    `**Name:** ${state.customer_name ?? '—'}`,
    `**Bike:** ${state.bike ?? '—'}`,
    `**What needs doing:** ${state.comments ?? '—'}`,
    `**Drop-off day:** ${state.drop_off_date ? formatHumanDate(state.drop_off_date) : '—'}`,
    state.sender_phone_e164 ? `**Number on file:** ${state.sender_phone_e164}` : '',
    '',
    stablePick(`${state.chat_id}:yes`, [
      'Reply **yes** to book it in, or say what to change.',
      '**Yes=** all good to book. Otherwise tell me what is different.',
      'If that is spot on, reply **yes** — or correct anything you like.',
    ]),
  ].filter(Boolean);
  // settings.booking.default_note is silently appended on the workorder; we
  // dont need to show it to the customer.
  void settings;
  return lines.join('\n');
}

export function buildBookingMissingFieldPrompt(state: BookingState, settings: LightspeedToolSettings): string {
  const missing: string[] = [];
  if (!state.customer_name) missing.push('your name');
  if (!state.bike) missing.push('what bike you are bringing in (make and model)');
  if (!state.comments) missing.push('a quick line on what you would like done');
  if (settings.booking.require_drop_off_date && !state.drop_off_date) {
    missing.push('the day you would like to drop it off');
  }

  if (missing.length === 0) return buildBookingSummary({ ...state, status: 'awaiting_confirm' }, settings);

  const seed = `${state.chat_id}:${missing.join('\x00')}`;

  if (missing.length === 1) {
    const [m] = missing;
    return stablePick(seed + ':1', [
      `Could you let me know ${m}?`,
      `Still need ${m} — whenever suits.`,
      `Thanks — ${m}?`,
    ]);
  }
  if (missing.length === 2) {
    const [a, b] = missing;
    return stablePick(seed + ':2', [
      `**Still need:** ${a} and ${b}.`,
      `**Just need:** ${a} and ${b}.`,
      `**Still after:** ${a}, plus ${b}.`,
    ]);
  }
  const intro = stablePick(seed + ':n', [
    '**Still need:**',
    '**Can you share:**',
    '**A few details still:**',
  ]);
  return [intro, ...missing.map((m) => `- ${m}`)].join('\n');
}

export function bookingDraftIsComplete(
  state: BookingState,
  settings: LightspeedToolSettings,
): boolean {
  return !!state.customer_name &&
    !!state.bike &&
    !!state.comments &&
    (!settings.booking.require_drop_off_date || !!state.drop_off_date);
}

export async function populateBookingCustomerName(
  supabase: SupabaseClient,
  state: BookingState,
  brandApiDebug?: BrandApiDebugCollector,
): Promise<BookingState> {
  if (state.customer_name || !state.sender_phone_e164) return state;

  try {
    const lsCustomer = await lookupLightspeedCustomerByPhone(
      supabase,
      state.brand_key,
      state.sender_phone_e164,
      brandApiDebug,
    );
    const resolved = lsCustomer?.fullName ?? lsCustomer?.firstName ?? null;
    if (resolved) {
      return { ...state, customer_name: resolved };
    }
  } catch (err) {
    console.warn('[brand-booking] Lightspeed customer lookup failed:', (err as Error).message);
  }

  return state;
}

// ── Lightspeed write (calls the dedicated edge function) ─────

export async function createBookingWorkorder(
  payload: {
    brand_key: string;
    chat_id: string;
    customer_name: string;
    customer_phone_e164: string | null;
    bike: string | null;
    comments: string;
    drop_off_date: string;
    default_note: string;
  },
  brandApiDebug?: BrandApiDebugCollector,
): Promise<{ ok: true; workorder_id: number } | { ok: false; error: string }> {
  const supabaseUrl = getOptionalEnv('SUPABASE_URL') ?? getOptionalEnv('PROJECT_URL');
  const sharedSecret = getOptionalEnv('INTERNAL_EDGE_SHARED_SECRET') ?? getOptionalEnv('NEST_INTERNAL_EDGE_SHARED_SECRET');
  if (!supabaseUrl || !sharedSecret) {
    return { ok: false, error: 'edge function URL or shared secret not configured' };
  }
  try {
    const url = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/lightspeed-create-workorder`;
    const t0 = Date.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': sharedSecret },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(text); } catch { /* fall through */ }
    if (!res.ok || data.ok === false) {
      const err = typeof data.error === 'string' ? data.error : `http ${res.status}`;
      brandApiDebug?.record({
        service: 'edge_function',
        operation: 'POST functions/v1/lightspeed-create-workorder',
        duration_ms: Date.now() - t0,
        http_status: res.status,
        request: {
          brand_key: payload.brand_key,
          chat_id: payload.chat_id,
          drop_off_date: payload.drop_off_date,
          customer_name: payload.customer_name,
        },
        response: truncateForLog(text, 8000),
        error: err,
      });
      return { ok: false, error: err };
    }
    const wid = Number(data.workorder_id);
    if (!Number.isFinite(wid) || wid <= 0) {
      brandApiDebug?.record({
        service: 'edge_function',
        operation: 'POST functions/v1/lightspeed-create-workorder',
        duration_ms: Date.now() - t0,
        http_status: res.status,
        request: { brand_key: payload.brand_key },
        response: truncateForLog(text, 8000),
        error: 'missing workorder_id',
      });
      return { ok: false, error: 'create-workorder did not return a workorder_id' };
    }
    brandApiDebug?.record({
      service: 'edge_function',
      operation: 'POST functions/v1/lightspeed-create-workorder',
      duration_ms: Date.now() - t0,
      http_status: res.status,
      request: { brand_key: payload.brand_key, drop_off_date: payload.drop_off_date },
      response: { workorder_id: Math.trunc(wid) },
    });
    return { ok: true, workorder_id: Math.trunc(wid) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ── Deterministic pre-LLM commit (root-cause fix) ────────────
//
// Problem we are fixing: the LLM had sole authority over whether
// `brand_booking_create` was called. When a customer sent a clear "yes" on a
// complete draft, we still depended on the model to call the tool — and
// sometimes it didn't, then produced a fake "booked in" reply with no
// workorder behind it. The post-turn hallucination guard catches this after
// the fact, but the real fix is to remove the LLM's authority for the
// unambiguous case. When the draft is complete, phone is on file, and the
// customer's message is a clean confirmation, we commit the workorder
// deterministically before the LLM runs and return a canned success reply.
// The model never gets a chance to silently skip the commit.

/**
 * Strict confirmation regex. Intentionally narrow — a false positive here
 * would commit a workorder the customer did not intend to commit.
 * `isUnambiguousBookingConfirmation` layers additional filters on top.
 *
 * Exported for unit testing.
 */
export const UNAMBIGUOUS_BOOKING_CONFIRM_RE =
  /^(yes|yep|yeah|yup|yess+|sure|ok(?:ay)?|confirm(?:ed)?|please\s+do|book\s+it(?:\s+in)?|go\s+ahead|do\s+it|sounds\s+good|that'?s\s+(?:right|good|perfect|fine)|perfect|great|cheers|lock\s+it\s+in|let'?s\s+do\s+it|all\s+good|that\s+works)(?:[,;]?\s+(?:please|thanks|thank\s+you|mate|then|cheers))?[.!\s]*$/i;

/**
 * True iff the customer message is an unambiguous confirmation of the current
 * draft — short, direct, no modifiers or edits. Anything fuzzier falls through
 * to the LLM path, which handles nuance like "yes but change the day".
 */
export function isUnambiguousBookingConfirmation(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length === 0 || trimmed.length > 50) return false;
  if (trimmed.includes('?')) return false;
  if (
    /\b(but|however|wait|actually|hold\s+on|change|instead|add|also|except|cancel|nope|not)\b/i
      .test(trimmed)
  ) {
    return false;
  }
  return UNAMBIGUOUS_BOOKING_CONFIRM_RE.test(trimmed);
}

export type DeterministicCommitDeps = {
  supabase: SupabaseClient;
  brandKey: string;
  chatId: string;
  settings: LightspeedToolSettings;
  brandApiDebug?: BrandApiDebugCollector;
};

export type DeterministicCommitResult =
  | { committed: true; text: string; workorderId: number }
  | { committed: false; reason: 'preconditions_not_met' | 'create_failed' };

/**
 * Commit the booking deterministically before the LLM runs, when conditions
 * are unambiguous. Caller should use the returned `text` directly as the
 * turn's reply and skip the LLM entirely for that turn.
 *
 * Returns `committed: false` if any precondition fails — caller then continues
 * with the normal LLM path. If the Lightspeed call itself fails, we also
 * return `committed: false` (reason `create_failed`) so the LLM can handle the
 * retry naturally; we do NOT override the reply here.
 */
export async function tryDeterministicBookingCommit(
  deps: DeterministicCommitDeps,
  opts: { bookingState: BookingState | null; userMessage: string },
): Promise<DeterministicCommitResult> {
  const { bookingState, userMessage } = opts;

  if (!deps.settings.booking.enabled) return { committed: false, reason: 'preconditions_not_met' };
  if (!bookingState) return { committed: false, reason: 'preconditions_not_met' };
  if (bookingState.status !== 'awaiting_confirm') {
    return { committed: false, reason: 'preconditions_not_met' };
  }
  if (!bookingDraftIsComplete(bookingState, deps.settings)) {
    return { committed: false, reason: 'preconditions_not_met' };
  }
  if (!bookingState.sender_phone_e164) {
    return { committed: false, reason: 'preconditions_not_met' };
  }
  if (!isUnambiguousBookingConfirmation(userMessage)) {
    return { committed: false, reason: 'preconditions_not_met' };
  }

  console.warn(
    '[brand-booking] deterministic commit: creating workorder pre-LLM',
    JSON.stringify({
      brand_key: deps.brandKey,
      chat_id: deps.chatId,
      drop_off_date: bookingState.drop_off_date,
    }),
  );

  const create = await createBookingWorkorder(
    {
      brand_key: deps.brandKey,
      chat_id: deps.chatId,
      customer_name: bookingState.customer_name!,
      customer_phone_e164: bookingState.sender_phone_e164,
      bike: bookingState.bike,
      comments: bookingState.comments!,
      drop_off_date: bookingState.drop_off_date!,
      default_note: deps.settings.booking.default_note,
    },
    deps.brandApiDebug,
  );

  if (!create.ok) {
    console.error('[brand-booking] deterministic commit: create failed:', create.error);
    // Leave the draft at awaiting_confirm so the LLM turn can try again with
    // full context (or the hallucination guard can pick it up after).
    return { committed: false, reason: 'create_failed' };
  }

  await upsertBookingState(deps.supabase, {
    ...bookingState,
    status: 'confirmed',
    workorder_id: create.workorder_id,
  });

  const firstName = bookingState.customer_name?.split(' ')[0] ?? 'cheers';
  const dayLabel = formatHumanDate(bookingState.drop_off_date!);
  const bikeLabel = bookingState.bike ?? 'your bike';

  const text = [
    stablePick(`${deps.chatId}:booked`, [
      `All set, ${firstName}. Your ${bikeLabel} is booked in for ${dayLabel}.`,
      `You are on the sheet, ${firstName} — ${bikeLabel} for ${dayLabel}.`,
      `Done — ${firstName}, we have ${bikeLabel} down for ${dayLabel}.`,
    ]),
    '',
    `We have logged: ${bookingState.comments}`,
    `Once you drop it off, the team will do a check over the bike and let you know when the service will be completed. We will give you a yell once it is ready. See you then!`,
  ].join('\n');

  return { committed: true, text, workorderId: create.workorder_id };
}

// ── Booking hallucination guard (post-turn safety net) ───────
//
// Problem we are guarding against: the LLM produces a response that sounds
// like the booking is locked in ("we've got it set", "booked in", "pencilled
// you in", "you're on the sheet"), but it never actually called the
// `brand_booking_create` tool. The guard must correct the claim, never turn a
// model mistake into an unconfirmed side effect. Confirmed bookings are
// committed deterministically before the LLM runs or through the create tool.

/**
 * Phrases that mean "this booking IS done" — past tense or present perfect.
 * Careful: must NOT fire on future-tense prompts like "reply yes to book it
 * in" or "want me to lock it in?" — those live in buildBookingSummary and in
 * normal LLM turns during collection.
 *
 * Exported for unit testing.
 */
export const BOOKING_DONE_CLAIM_RE = new RegExp(
  [
    // "booked (you|it|your bike) in", "booked in for"
    String.raw`\bbooked\s+(?:you|it|your\s+bike|your\s+\S+)?\s*in\b`,
    // "pencilled (you|it) in"
    String.raw`\bpencill?ed\s+(?:you|it|\S+)?\s*in\b`,
    // "locked (it|you|this|the booking) in"
    String.raw`\blocked\s+(?:it|you|this|that|the\s+booking)?\s*in\b`,
    // "got (it|you|your bike) (set|down|in|locked|booked)" — catches "we've got it set"
    String.raw`\b(?:got|have|set)\s+(?:you|it|that|your\s+bike|your\s+\S+)\s+(?:set|down|in|locked|booked|reserved)\b`,
    // "on the (sheet|books|calendar)"
    String.raw`\bon\s+the\s+(?:sheet|books|calendar|schedule)\b`,
    // "you're (all set|booked|set|in|down)"
    String.raw`\byou(?:'re|\s+are)\s+(?:all\s+set|booked|set|in|down|sorted|good\s+to\s+go)\b`,
    // "all set, …" / "all booked"
    String.raw`\ball\s+(?:set|booked|locked|sorted)\b`,
    // "see you (on|then|next|this) <day>" — implies confirmed appointment
    String.raw`\bsee\s+you\s+(?:on|then|next|this|tomorrow|friday|monday|tuesday|wednesday|thursday|saturday|sunday)\b`,
    // "reserved (that|it|you) for"
    String.raw`\breserved\s+(?:it|that|you|your\s+\S+)\s+for\b`,
  ].join('|'),
  'i',
);

export type BookingGuardDeps = {
  supabase: SupabaseClient;
  brandKey: string;
  chatId: string;
  senderHandle: string;
  settings: LightspeedToolSettings;
  brandApiDebug?: BrandApiDebugCollector;
};

export type BookingGuardInput = {
  text: string;
  bookingState: BookingState | null;
  executedTools: ReadonlyArray<{ name: string; outcome: 'success' | 'error' | 'timeout' }>;
};

export type BookingGuardResult = {
  text: string;
  overrideReason?:
    | 'missing_fields'
    | 'create_failed'
    | 'no_phone'
    | 'uncommitted_time'
    | 'unconfirmed_claim';
};

/**
 * Apply the booking hallucination guard.
 *
 * Returns `{ text }` unchanged when the guard doesn't fire (no claim, or the
 * LLM correctly called brand_booking_create). Otherwise returns remediated
 * text and an `overrideReason`.
 */
export async function applyBookingClaimGuard(
  deps: BookingGuardDeps,
  input: BookingGuardInput,
): Promise<BookingGuardResult> {
  const { text, bookingState, executedTools } = input;
  const madeDoneClaim = BOOKING_DONE_CLAIM_RE.test(text);
  const madeVisitTimeClaim = UNCOMMITTED_VISIT_TIME_CLAIM_RE.test(text);

  if (!text || (!madeDoneClaim && !madeVisitTimeClaim)) {
    return { text };
  }

  const bookingCreatedOk = executedTools.some(
    (t) => t.name === 'brand_booking_create' && t.outcome === 'success',
  );
  if (bookingCreatedOk) {
    return { text };
  }

  // Already-confirmed bookings (website or prior Nest create): allow restating
  // due dates / confirmation language without remediating.
  if (
    bookingState &&
    (bookingState.status === 'created' || bookingState.status === 'confirmed')
  ) {
    return { text };
  }

  const touchedBookingTools = executedTools.some((t) => t.name.startsWith('brand_booking_'));

  if (madeVisitTimeClaim && touchedBookingTools) {
    if (!bookingState) {
      return {
        text:
          'I can note that as your requested drop-off time, but it is not booked yet. Is that for today, and what bike are you bringing in?',
        overrideReason: 'uncommitted_time',
      };
    }
    if (!bookingDraftIsComplete(bookingState, deps.settings)) {
      const missing = buildBookingMissingFieldPrompt(
        { ...bookingState, status: 'collecting' },
        deps.settings,
      );
      await upsertBookingState(deps.supabase, { ...bookingState, status: 'collecting' });
      return {
        text:
          `I have noted that as your requested drop-off time, but it is not booked yet. ${missing}`,
        overrideReason: 'uncommitted_time',
      };
    }
  }

  // No active booking draft and the LLM did not touch the booking tools this
  // turn: the confirmatory phrase is almost certainly referring to a
  // previously created workorder (state row gets wiped on success). Do not
  // interfere — rewriting "see you tomorrow" into "I do not have a booking"
  // would be a regression on legitimate follow-up turns.
  if (!bookingState && !touchedBookingTools) {
    return { text };
  }

  // LLM claimed a booking is locked in, but brand_booking_create wasn't
  // successfully executed this turn. Try to reconcile.

  if (!deps.settings.booking.enabled) {
    // Booking flow is turned off for this brand — the LLM should not be
    // claiming bookings at all. Override to a neutral handoff.
    return {
      text: 'I cannot lock that booking in from here. Could you give the shop a call so the team can confirm it for you?',
      overrideReason: 'create_failed',
    };
  }

  // Tools were touched but no draft survived. Probably a cancel/clear mid-
  // turn — override so we don't imply a booking exists.
  if (!bookingState) {
    return {
      text: 'Sorry — I do not actually have an open booking to lock in. If you would like to book your bike in, send over your name, the bike, what you need done, and the day that suits, and I will get it sorted.',
      overrideReason: 'missing_fields',
    };
  }

  // Phone is required for Lightspeed workorder creation.
  if (!bookingState.sender_phone_e164) {
    await upsertBookingState(deps.supabase, { ...bookingState, status: 'collecting' });
    return {
      text: 'Quick one — I cannot see a mobile on file to attach the booking to. Could you send the best number to reach you on and I will lock it in?',
      overrideReason: 'no_phone',
    };
  }

  // Draft must be complete before we commit.
  if (!bookingDraftIsComplete(bookingState, deps.settings)) {
    const prompt = buildBookingMissingFieldPrompt(
      { ...bookingState, status: 'collecting' },
      deps.settings,
    );
    await upsertBookingState(deps.supabase, { ...bookingState, status: 'collecting' });
    return { text: prompt, overrideReason: 'missing_fields' };
  }

  // A complete draft is still only a draft. Do not turn the model's premature
  // wording into an unconfirmed real-world side effect. Re-state the details
  // and require a fresh confirmation; the next clear "yes" is committed by the
  // deterministic pre-LLM path.
  console.warn(
    '[brand-booking] hallucination guard: blocking unconfirmed booking claim',
    JSON.stringify({
      brand_key: deps.brandKey,
      chat_id: deps.chatId,
      drop_off_date: bookingState.drop_off_date,
    }),
  );
  const awaitingConfirmation = { ...bookingState, status: 'awaiting_confirm' as const };
  await upsertBookingState(deps.supabase, awaitingConfirmation);
  return {
    text: buildBookingSummary(awaitingConfirmation, deps.settings),
    overrideReason: 'unconfirmed_claim',
  };
}

// ── Public entry point ────────────────────────────────────────

/**
 * Try to drive the booking flow for this turn.
 *
 * Returns `null` if this turn is unrelated (so the chat handler should fall
 * through to its normal LLM reply). Returns `BookingTurnOutcome` if the
 * booking flow handled this turn end-to-end and the chat handler should
 * use that text directly.
 */
export async function tryHandleLightspeedBookingTurn(
  input: BookingTurnInput,
): Promise<BookingTurnOutcome | null> {
  const { supabase, brandKey, chatId, senderHandle, message, settings, brandApiDebug } = input;
  if (!settings.booking.enabled) return null;

  const existing = await loadBookingState(supabase, brandKey, chatId);
  if (!existing && !shouldExtract(null, message) && !isBareConfirmationMessage(message)) return null;

  const { extraction, inputTokens, outputTokens } = await extractBookingFields(message, existing, brandApiDebug);
  // Cold start: trust the LLM extractor. Only enter the booking flow when the
  // model says the customer is explicitly trying to book / drop off / schedule
  // (or sent a bare confirmation we still want to handle gracefully). Anything
  // else — informational questions, pricing, capability queries, hours, stock
  // — falls through to the main brand LLM so the conversation stays natural.
  if (!existing && !extraction.intent && !extraction.confirm) {
    return null;
  }

  // Cancel — wipe state, confirm to user, return.
  if (extraction.cancel) {
    if (existing) await deleteBookingState(supabase, brandKey, chatId);
    return {
      text: 'No worries, I have not booked anything in. Let me know if you change your mind.',
      inputTokens,
      outputTokens,
    };
  }

  const senderE164 = normaliseToE164(senderHandle);

  // Merge new fields into the running state (or seed a fresh one).
  const merged: BookingState = existing ?? {
    brand_key: brandKey,
    chat_id: chatId,
    status: 'collecting',
    sender_handle: senderHandle,
    sender_phone_e164: senderE164,
    customer_name: null,
    bike: null,
    comments: null,
    drop_off_date: null,
    workorder_id: null,
    last_message_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  if (extraction.customer_name) merged.customer_name = extraction.customer_name;
  if (extraction.bike) merged.bike = extraction.bike;
  if (extraction.comments) {
    merged.comments = merged.comments
      ? `${merged.comments}; ${extraction.comments}`.slice(0, 400)
      : extraction.comments;
  }
  if (extraction.drop_off_date) merged.drop_off_date = extraction.drop_off_date;
  if (!merged.sender_phone_e164 && senderE164) merged.sender_phone_e164 = senderE164;

  // If we still don't have a customer name, try a live Lightspeed Customer
  // lookup by phone — when the caller is already on file we can skip asking
  // for their name entirely and address them directly.
  if (!merged.customer_name && merged.sender_phone_e164) {
    const populated = await populateBookingCustomerName(
      supabase,
      merged,
      brandApiDebug,
    );
    merged.customer_name = populated.customer_name;
  } else if (!merged.customer_name) {
    console.log(
      '[brand-booking] skipping customer lookup — no sender_phone_e164',
      JSON.stringify({ brandKey, senderHandle }),
    );
  }

  const fieldSnap = (s: BookingState) => ({
    customer_name: s.customer_name,
    bike: s.bike,
    comments: s.comments,
    drop_off_date: s.drop_off_date,
  });

  if (
    existing &&
    shouldDeferBookingToMainLlm(fieldSnap(existing), fieldSnap(merged), extraction)
  ) {
    return null;
  }

  const haveAll = bookingDraftIsComplete(merged, settings);

  // Confirmed with no persisted draft (expired TTL, or model never saved state) — do not fall through to main LLM.
  if (extraction.confirm && !haveAll && !existing) {
    return {
      text:
        'I do not have an active booking on file to confirm. Send your name, bike, what you need done, and drop-off day — or call the shop and the team can lock it in.',
      inputTokens,
      outputTokens,
    };
  }

  // ── Confirmation path: customer just said yes and we have everything ──
  if (extraction.confirm && haveAll) {
    if (!merged.sender_phone_e164) {
      // Refuse to create a workorder we cannot match back to a customer phone.
      await upsertBookingState(supabase, { ...merged, status: 'collecting' });
      return {
        text: 'I cannot quite place a number on file for you. Could you send the best mobile to reach you on, and I will lock the booking in?',
        inputTokens,
        outputTokens,
      };
    }
    const create = await createBookingWorkorder(
      {
        brand_key: brandKey,
        chat_id: chatId,
        customer_name: merged.customer_name!,
        customer_phone_e164: merged.sender_phone_e164,
        bike: merged.bike,
        comments: merged.comments!,
        drop_off_date: merged.drop_off_date!,
        default_note: settings.booking.default_note,
      },
      brandApiDebug,
    );
    if (!create.ok) {
      console.error('[brand-booking] create workorder failed:', create.error);
      // Stay in awaiting_confirm so the customer can retry without losing fields.
      await upsertBookingState(supabase, { ...merged, status: 'awaiting_confirm' });
      return {
        text: 'I had trouble creating that booking just now. Could you try again in a minute, or I can pass you to the team to lock it in?',
        inputTokens,
        outputTokens,
      };
    }
    await upsertBookingState(supabase, {
      ...merged,
      status: 'confirmed',
      workorder_id: create.workorder_id,
    });
    return {
      text: [
        stablePick(`${chatId}:booked`, [
          `All set, ${merged.customer_name?.split(' ')[0] ?? 'cheers'}. Your ${merged.bike ?? 'bike'} is booked in for ${formatHumanDate(merged.drop_off_date!)}.`,
          `You are on the sheet, ${merged.customer_name?.split(' ')[0] ?? 'cheers'} — ${merged.bike ?? 'bike'} for ${formatHumanDate(merged.drop_off_date!)}.`,
          `Done — ${merged.customer_name?.split(' ')[0] ?? 'cheers'}, we have ${merged.bike ?? 'your bike'} down for ${formatHumanDate(merged.drop_off_date!)}.`,
        ]),
        '',
        `We have logged: ${merged.comments}`,
        `Once you drop it off, the team will do a check over the bike and let you know when the service will be completed. We will give you a yell once it is ready. See you then!`,
      ].join('\n'),
      inputTokens,
      outputTokens,
    };
  }

  // ── Still gathering / re-summarising ──
  if (haveAll) {
    merged.status = 'awaiting_confirm';
    await upsertBookingState(supabase, merged);
    return {
      text: buildBookingSummary(merged, settings),
      inputTokens,
      outputTokens,
    };
  }

  merged.status = 'collecting';
  await upsertBookingState(supabase, merged);
  return {
    text: buildBookingMissingFieldPrompt(merged, settings),
    inputTokens,
    outputTokens,
  };
}
