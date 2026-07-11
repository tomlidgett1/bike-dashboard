/**
 * Unified "current situation" context — a single source of truth for where
 * the user IS RIGHT NOW (location, timezone, local time, travel state).
 *
 * Synthesises five signals, in priority order:
 *   1. Live primary calendar timezone (Google/Outlook) — the strongest
 *      forward-looking signal; updates the moment the user changes their
 *      calendar tz on travel.
 *   2. Flight/travel events today or yesterday — a strong signal that the
 *      user may now be in the destination city, even without an explicit
 *      "current location" memory.
 *   3. Most recent calendar event location in the last ~24h — concrete
 *      ground-truth that the user was physically present somewhere recently.
 *   4. user_profiles.context_profile.currentLocation — what the user has
 *      told Nest in conversation.
 *   5. user_profiles.context_profile.homeLocation — fallback baseline.
 *
 * Every prompt that reasons about the user (briefs, heads-ups, agent
 * replies, proactive nudges) should use the formatted block returned by
 * buildUserSituationContext so they all share the same understanding.
 */

import { getAdminClient } from './supabase.ts';
import { USER_PROFILES_TABLE } from './env.ts';
import {
  liveCalendarLookup,
  resolveCalendarPrimaryTimezone,
  type FormattedCalendarEvent,
} from './calendar-helpers.ts';
import {
  sanitiseUserContextProfile,
  type UserContextProfile,
} from './state.ts';

export interface UserSituation {
  /** Calendar's primary timezone right now. May differ from stored profile. */
  liveTimezone: string;
  /** Stored timezone from user_profiles. Set on signup, often stale on travel. */
  storedTimezone: string;
  /** True iff liveTimezone differs from storedTimezone — a strong travel hint. */
  timezoneChanged: boolean;
  /** Best-effort short label for where the user currently is, e.g. "Tokyo, Japan". */
  currentLocationLabel: string | null;
  /** Source of the location label, for diagnostics in logs. */
  currentLocationSource:
    | 'recent_calendar_event'
    | 'calendar_travel_event'
    | 'context_profile_current'
    | 'context_profile_home'
    | 'calendar_timezone_city'
    | 'none';
  /** True iff we believe the user is away from their home location right now. */
  isLikelyTravelling: boolean;
  /** Home location label, if known. */
  homeLocationLabel: string | null;
  /** Local datetime string in liveTimezone, for natural language use. */
  localDateTime: string;
  /** Local day part: 'morning' | 'afternoon' | 'evening' | 'night'. */
  localDayPart: 'morning' | 'afternoon' | 'evening' | 'night';
  /** Local weekday name (en-AU). */
  localWeekday: string;
  /** Flight/travel event signal from calendar, if one was found. */
  travelInference: CalendarTravelInference | null;
  /** A short prose block ready to drop into any LLM system prompt. */
  promptBlock: string;
  /** Diagnostic metadata to include in execution rows. */
  metadata: Record<string, unknown>;
}

interface SituationInputProfile {
  handle?: string | null;
  storedTimezone?: string | null;
  contextProfile?: unknown;
}

export interface CalendarTravelInference {
  destinationLabel: string;
  eventTitle: string;
  eventStartIso: string;
  eventEndIso: string | null;
  relation: 'recent_or_in_progress' | 'upcoming_today';
  confidence: 'medium' | 'high';
  evidence: string;
}

const TIMEZONE_COUNTRY_MAP: Record<string, string> = {
  'Australia': 'Australia',
  'America': 'USA',
  'Europe': 'Europe',
  'Asia': 'Asia',
  'Pacific': 'Pacific',
  'Africa': 'Africa',
};

function timezoneToCityCountry(tz: string | null): string | null {
  if (!tz || !tz.includes('/')) return null;
  const parts = tz.split('/');
  const city = parts[parts.length - 1]?.replace(/_/g, ' ').trim();
  if (!city) return null;
  const country = TIMEZONE_COUNTRY_MAP[parts[0]];
  return country && country !== city ? `${city}, ${country}` : city;
}

function formatLocalDateTime(tz: string): string {
  try {
    return new Date().toLocaleString('en-AU', {
      timeZone: tz,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return new Date().toISOString();
  }
}

function getLocalHour(tz: string): number {
  try {
    return Number.parseInt(
      new Intl.DateTimeFormat('en-AU', { timeZone: tz, hour: 'numeric', hour12: false }).format(new Date()),
      10,
    );
  } catch {
    return new Date().getUTCHours();
  }
}

function localDayPart(hour: number): UserSituation['localDayPart'] {
  if (hour < 5) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 22) return 'evening';
  return 'night';
}

function getLocalWeekday(tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-AU', { timeZone: tz, weekday: 'long' }).format(new Date());
  } catch {
    return '';
  }
}

const AIRPORT_CODE_TO_CITY: Record<string, string> = {
  AKL: 'Auckland, New Zealand',
  BKK: 'Bangkok, Thailand',
  BNE: 'Brisbane, Australia',
  CDG: 'Paris, France',
  CHC: 'Christchurch, New Zealand',
  DPS: 'Bali, Indonesia',
  DOH: 'Doha, Qatar',
  DXB: 'Dubai, UAE',
  HKG: 'Hong Kong',
  HND: 'Tokyo, Japan',
  ITM: 'Osaka, Japan',
  JFK: 'New York, USA',
  KIX: 'Osaka, Japan',
  LAX: 'Los Angeles, USA',
  LHR: 'London, United Kingdom',
  MEL: 'Melbourne, Australia',
  NRT: 'Tokyo, Japan',
  SFO: 'San Francisco, USA',
  SIN: 'Singapore',
  SYD: 'Sydney, Australia',
  TYO: 'Tokyo, Japan',
};

const AIRPORT_NAME_TO_CITY: Array<[RegExp, string]> = [
  [/\bhaneda\b|\bnarita\b/i, 'Tokyo, Japan'],
  [/\bkansai\b|\bitami\b/i, 'Osaka, Japan'],
  [/\bchangi\b/i, 'Singapore'],
  [/\btullamarine\b|\bmelbourne airport\b/i, 'Melbourne, Australia'],
  [/\bkingsford smith\b|\bsydney airport\b/i, 'Sydney, Australia'],
  [/\bheathrow\b|\bgatwick\b/i, 'London, United Kingdom'],
  [/\bcharles de gaulle\b|\borly\b/i, 'Paris, France'],
  [/\blos angeles international\b|\blax\b/i, 'Los Angeles, USA'],
];

function cleanTravelDestination(raw: string): string | null {
  let value = raw
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(?:airport|international|domestic|terminal|gate|boarding|flight|arrive|arrival|depart|departure)\b.*$/i, ' ')
    .replace(/\b(?:today|tomorrow|yesterday|tonight)\b.*$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  value = value.replace(/^[,.\-\s]+|[,.\-\s]+$/g, '');
  if (value.length < 2) return null;
  const code = value.toUpperCase();
  if (AIRPORT_CODE_TO_CITY[code]) return AIRPORT_CODE_TO_CITY[code];
  return value.slice(0, 80);
}

function inferDestinationLabelFromTravelText(text: string): string | null {
  const normalised = text.replace(/[→➡]/g, ' to ').replace(/\s+/g, ' ').trim();
  if (!normalised) return null;

  const routeByCode = normalised.match(/\b([A-Z]{3})\s*(?:-|to|->)\s*([A-Z]{3})\b/);
  if (routeByCode) {
    const destination = AIRPORT_CODE_TO_CITY[routeByCode[2]];
    if (destination) return destination;
  }

  const codeAfterTo = normalised.match(/\b(?:to|arriving in|arrive in|arrival in|landing in|lands in|destination)\s+([A-Z]{3})\b/);
  if (codeAfterTo) {
    const destination = AIRPORT_CODE_TO_CITY[codeAfterTo[1]];
    if (destination) return destination;
  }

  for (const [pattern, city] of AIRPORT_NAME_TO_CITY) {
    if (pattern.test(normalised)) return city;
  }

  const placeMatches = [...normalised.matchAll(
    /\b(?:to|arriving in|arrive in|arrival in|landing in|lands in|destination:?|bound for)\s+([A-Z][A-Za-z.' -]+(?:,\s*[A-Z][A-Za-z.' -]+)?)/g,
  )];
  for (let i = placeMatches.length - 1; i >= 0; i--) {
    const cleaned = cleanTravelDestination(placeMatches[i][1]);
    if (cleaned) return cleaned;
  }

  return null;
}

export function inferCalendarTravelDestinationFromEvent(
  event: Pick<FormattedCalendarEvent, 'title' | 'start_iso' | 'end_iso' | 'location' | 'description' | 'all_day'>,
  now = new Date(),
): CalendarTravelInference | null {
  if (event.all_day) return null;
  const textParts = [event.title, event.location ?? '', event.description ?? '']
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  const haystack = textParts.join(' | ');
  if (!/\b(flight|fly|flying|airport|depart(?:ure)?|arriv(?:e|al|ing)|landing|lands|boarding|bound for|qantas|jetstar|virgin|ana|jal|emirates|cathay|singapore airlines|air new zealand|united|delta|british airways)\b/i.test(haystack)) {
    return null;
  }

  const destinationLabel = inferDestinationLabelFromTravelText(haystack);
  if (!destinationLabel) return null;

  const startMs = new Date(event.start_iso).getTime();
  if (!Number.isFinite(startMs)) return null;
  const endMs = event.end_iso ? new Date(event.end_iso).getTime() : NaN;
  const nowMs = now.getTime();
  const relation = startMs <= nowMs + 90 * 60_000 ? 'recent_or_in_progress' : 'upcoming_today';
  const confidence = AIRPORT_NAME_TO_CITY.some(([pattern]) => pattern.test(haystack)) || /\b[A-Z]{3}\b/.test(haystack)
    ? 'high'
    : 'medium';

  return {
    destinationLabel,
    eventTitle: event.title,
    eventStartIso: event.start_iso,
    eventEndIso: Number.isFinite(endMs) ? event.end_iso : null,
    relation,
    confidence,
    evidence: haystack.slice(0, 240),
  };
}

async function findCalendarTravelInference(
  authUserId: string,
  tz: string,
): Promise<CalendarTravelInference | null> {
  try {
    const result = await liveCalendarLookup(
      authUserId,
      'last 2 days',
      tz,
      undefined,
      undefined,
      30,
    );
    const now = new Date();
    const nowMs = now.getTime();
    const candidates = ((result.events ?? []) as FormattedCalendarEvent[])
      .map((event) => inferCalendarTravelDestinationFromEvent(event, now))
      .filter((event): event is CalendarTravelInference => event !== null)
      .sort((a, b) => {
        const aStart = new Date(a.eventStartIso).getTime();
        const bStart = new Date(b.eventStartIso).getTime();
        const aCurrent = a.relation === 'recent_or_in_progress';
        const bCurrent = b.relation === 'recent_or_in_progress';
        if (aCurrent !== bCurrent) return aCurrent ? -1 : 1;
        if (aCurrent) return bStart - aStart;
        return Math.abs(aStart - nowMs) - Math.abs(bStart - nowMs);
      });
    return candidates[0] ?? null;
  } catch {
    return null;
  }
}

/** Pull the most recent calendar event with a usable location in the last 24h. */
async function findMostRecentEventWithLocation(
  authUserId: string,
  tz: string,
): Promise<{ label: string; eventTitle: string; hoursAgo: number } | null> {
  try {
    const result = await liveCalendarLookup(
      authUserId,
      'last 24 hours',
      tz,
      undefined,
      undefined,
      15,
    );
    const events = (result.events ?? []) as FormattedCalendarEvent[];
    const nowMs = Date.now();
    const candidates = events
      .filter((e) => !e.all_day && e.location && String(e.location).trim().length > 0)
      .filter((e) => {
        const startMs = new Date(e.start_iso).getTime();
        return Number.isFinite(startMs) && Math.abs(nowMs - startMs) <= 24 * 3600 * 1000;
      })
      .sort((a, b) => {
        const da = Math.abs(nowMs - new Date(a.start_iso).getTime());
        const db = Math.abs(nowMs - new Date(b.start_iso).getTime());
        return da - db;
      });
    const top = candidates[0];
    if (!top || !top.location) return null;
    const startMs = new Date(top.start_iso).getTime();
    return {
      label: String(top.location).split(',').slice(0, 2).map((s) => s.trim()).join(', ').slice(0, 80),
      eventTitle: top.title,
      hoursAgo: Math.round(((nowMs - startMs) / 3600000) * 10) / 10,
    };
  } catch {
    return null;
  }
}

/**
 * Build a complete situation snapshot. Safe to call from anywhere with an
 * authUserId; gracefully degrades if any provider call fails.
 */
export async function buildUserSituationContext(args: {
  authUserId?: string | null;
  profile?: SituationInputProfile;
  /** Pre-resolved live calendar timezone — pass when caller has already
   *  fetched it to avoid a duplicate provider call. */
  liveTimezone?: string;
}): Promise<UserSituation> {
  let authUserId: string | null | undefined = args.authUserId;

  // Resolve stored profile (auth_user_id + timezone + context_profile) if not supplied.
  let storedTimezone = args.profile?.storedTimezone ?? '';
  let contextProfile: UserContextProfile | null = args.profile?.contextProfile
    ? sanitiseUserContextProfile(args.profile.contextProfile)
    : null;
  if ((!storedTimezone || !contextProfile || !authUserId) && args.profile?.handle) {
    try {
      const supabase = getAdminClient();
      const { data } = await supabase
        .from(USER_PROFILES_TABLE)
        .select('auth_user_id, timezone, context_profile')
        .eq('handle', args.profile.handle)
        .maybeSingle();
      if (data) {
        storedTimezone = storedTimezone || (data.timezone as string ?? '');
        if (!contextProfile) {
          contextProfile = sanitiseUserContextProfile(data.context_profile);
        }
        if (!authUserId && typeof data.auth_user_id === 'string') {
          authUserId = data.auth_user_id;
        }
      }
    } catch { /* best-effort */ }
  }
  if (!storedTimezone) storedTimezone = 'Australia/Sydney';

  // Resolve live calendar timezone (cheap if no provider connected).
  let liveTimezone = args.liveTimezone ?? '';
  if (!liveTimezone) {
    if (authUserId) {
      try {
        liveTimezone = await resolveCalendarPrimaryTimezone(authUserId, storedTimezone);
      } catch {
        liveTimezone = storedTimezone;
      }
    } else {
      liveTimezone = storedTimezone;
    }
  }

  const timezoneChanged = !!liveTimezone && !!storedTimezone && liveTimezone !== storedTimezone;

  // Resolve current location from strongest signal down.
  const homeLocationLabel = contextProfile?.homeLocation?.value?.trim() || null;
  const profileCurrentLabel = contextProfile?.currentLocation?.value?.trim() || null;
  let currentLocationLabel: string | null = null;
  let currentLocationSource: UserSituation['currentLocationSource'] = 'none';
  let travelInference: CalendarTravelInference | null = null;

  // 1) A recent flight/travel event points at where the user may be now.
  if (authUserId) {
    travelInference = await findCalendarTravelInference(authUserId, liveTimezone);
    if (travelInference?.relation === 'recent_or_in_progress') {
      currentLocationLabel = travelInference.destinationLabel;
      currentLocationSource = 'calendar_travel_event';
    }
  }
  // 2) Recent calendar event with a location is the strongest concrete "I am here" signal.
  if (!currentLocationLabel && authUserId) {
    const recent = await findMostRecentEventWithLocation(authUserId, liveTimezone);
    if (recent?.label) {
      currentLocationLabel = recent.label;
      currentLocationSource = 'recent_calendar_event';
    }
  }
  // 3) Profile's currentLocation (set via memory or context patches).
  if (!currentLocationLabel && profileCurrentLabel) {
    currentLocationLabel = profileCurrentLabel;
    currentLocationSource = 'context_profile_current';
  }
  // 4) Calendar timezone city (works when travelling and the user has set
  //    their calendar tz to the trip city).
  if (!currentLocationLabel && timezoneChanged) {
    const tzCity = timezoneToCityCountry(liveTimezone);
    if (tzCity) {
      currentLocationLabel = tzCity;
      currentLocationSource = 'calendar_timezone_city';
    }
  }
  // 5) Home as fallback.
  if (!currentLocationLabel && homeLocationLabel) {
    currentLocationLabel = homeLocationLabel;
    currentLocationSource = 'context_profile_home';
  }

  const isLikelyTravelling = (() => {
    if (!homeLocationLabel || !currentLocationLabel) return timezoneChanged;
    const norm = (s: string) => s.toLowerCase().trim();
    if (norm(homeLocationLabel) === norm(currentLocationLabel)) return false;
    // Different city/country labels OR live tz != stored tz → travelling.
    return true;
  })();

  const localDateTime = formatLocalDateTime(liveTimezone);
  const localHour = getLocalHour(liveTimezone);
  const dayPart = localDayPart(localHour);
  const weekday = getLocalWeekday(liveTimezone);

  // Build the prompt block — short, dense, prose-ready.
  const lines: string[] = [];
  lines.push(`USER'S CURRENT SITUATION (real-time, refreshed each prompt)`);
  lines.push(`- Local date/time: ${localDateTime} (${liveTimezone})`);
  if (currentLocationLabel) {
    const sourceNote = currentLocationSource === 'recent_calendar_event'
      ? 'from a calendar event in the last 24h'
      : currentLocationSource === 'calendar_travel_event'
      ? 'inferred from a flight/travel calendar event today or yesterday'
      : currentLocationSource === 'context_profile_current'
      ? 'from prior conversation'
      : currentLocationSource === 'calendar_timezone_city'
      ? 'inferred from current calendar timezone'
      : 'from home location on file';
    lines.push(`- Currently in/near: ${currentLocationLabel} (${sourceNote})`);
  } else {
    lines.push(`- Current location: unknown — do not assume a city`);
  }
  if (travelInference) {
    const travelTiming = travelInference.relation === 'upcoming_today'
      ? `upcoming today`
      : `recent or in progress`;
    lines.push(`- Calendar travel signal: "${travelInference.eventTitle}" points to ${travelInference.destinationLabel} (${travelTiming}, ${travelInference.confidence} confidence). Phrase travel-derived location as "looks like you may be in/near..." unless confirmed by another source.`);
  }
  if (isLikelyTravelling && homeLocationLabel) {
    lines.push(`- Travel state: AWAY FROM HOME (home is ${homeLocationLabel}; do not place them at home, do not assume home-city services, weather, transit, or events)`);
  } else if (homeLocationLabel) {
    lines.push(`- Home base: ${homeLocationLabel}`);
  }
  if (timezoneChanged) {
    lines.push(`- Timezone note: live calendar tz is ${liveTimezone}, stored profile says ${storedTimezone}. Trust the LIVE timezone for all times.`);
  }
  lines.push(`- ALWAYS use the local date/time and current location above when the answer depends on where the user is or what time it is for them. Never assume they're at home or in their stored timezone.`);

  const promptBlock = lines.join('\n');

  return {
    liveTimezone,
    storedTimezone,
    timezoneChanged,
    currentLocationLabel,
    currentLocationSource,
    isLikelyTravelling,
    homeLocationLabel,
    localDateTime,
    localDayPart: dayPart,
    localWeekday: weekday,
    travelInference,
    promptBlock,
    metadata: {
      situationLiveTimezone: liveTimezone,
      situationStoredTimezone: storedTimezone,
      situationTimezoneChanged: timezoneChanged,
      situationCurrentLocation: currentLocationLabel,
      situationCurrentLocationSource: currentLocationSource,
      situationIsLikelyTravelling: isLikelyTravelling,
      situationHomeLocation: homeLocationLabel,
      situationTravelInference: travelInference,
    },
  };
}
