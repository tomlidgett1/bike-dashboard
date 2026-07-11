/**
 * Morning brief audio pipeline: gather mail/calendar/RAG/profile/weather/news,
 * synthesise a spoken script + companion text, Gemini TTS + Linq send.
 */

import { getAdminClient } from './supabase.ts';
import { USER_PROFILES_TABLE, getOptionalEnv } from './env.ts';
import { decryptSearchResults } from './encryption.ts';
import { gmailSearchTool } from './gmail-helpers.ts';
import { liveCalendarLookup } from './calendar-helpers.ts';
import { getEmbedding, vectorString } from './rag-tools.ts';
import { GoogleGenAI } from 'npm:@google/genai';
import { displayNameForAlerts, resolveNameForAlerts } from './email-webhook-helpers.ts';
import {
  addMessage,
  getActiveMemoryItems,
  getConversationSummaries,
  getConnectedAccounts,
  sanitiseUserContextProfile,
} from './state.ts';
import { NEST_CONVERSATION_FILTER } from './conversation-engagement.ts';
import type { UserContextProfile } from './state.ts';
import { weatherTool } from './tools/weather.ts';
import { geminiGroundedSearch, isGeminiModel } from './ai/gemini.ts';
import { MODEL_MAP, getOpenAIClient, getResponseText } from './ai/models.ts';
import { resolveChatId } from './email-webhook-helpers.ts';
import { createChat, sendVoiceMemo, CREATE_CHAT_INVISIBLE_PLACEHOLDER } from './linq.ts';
import { buildUserSituationContext, type UserSituation } from './user-situation.ts';

// ── Types ───────────────────────────────────────────────────────────────────

export interface MorningBriefUserRow {
  handle: string;
  name: string | null;
  bot_number: string | null;
  timezone: string | null;
  auth_user_id: string | null;
  deep_profile_snapshot: Record<string, unknown> | null;
  context_profile: unknown;
  facts: unknown;
}

export interface MorningBriefScript {
  script_plain: string;
  companion_text: string;
  word_count: number;
}

export interface MorningBriefGathered {
  day_shape: 'dense_day' | 'normal_day' | 'quiet_day';
  calendar_event_count: number;
  important_inbox_count: number;
  local_context_snippet: string;
  is_weekend: boolean;
  weather_location_label: string | null;
  email_snippet: string;
  priority_inbox_snippet: string;
  calendar_snippet: string;
  rag_snippet: string;
  memories_snippet: string;
  summaries_snippet: string;
  work_open_loops_snippet: string;
  personal_open_loops_snippet: string;
  weekend_local_suggestions_snippet: string;
  safe_to_ignore_snippet: string;
  weather_snippet: string;
  news_snippet: string;
  deep_profile_snippet: string;
}

export interface MorningBriefResult {
  ok: boolean;
  error?: string;
  dry_run?: boolean;
  script?: MorningBriefScript;
  signed_audio_url?: string;
  storage_path?: string;
  linq_message_id?: string;
  chat_id?: string;
  gathered?: MorningBriefGathered;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const TIMEZONE_COUNTRY_MAP: Record<string, string> = {
  'Australia': 'Australia', 'America': 'USA', 'Europe': 'Europe', 'Asia': 'Asia', 'Pacific': 'Pacific',
};

export interface MorningBriefLocalContext {
  timezone: string;
  localDateTime: string;
  weekday: string;
  isWeekend: boolean;
}

export function buildMorningBriefLocalContext(
  timezone: string | null,
  now = new Date(),
): MorningBriefLocalContext {
  const tz = timezone || 'Australia/Sydney';
  const localDateTime = now.toLocaleString('en-AU', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const weekday = new Intl.DateTimeFormat('en-AU', { timeZone: tz, weekday: 'long' }).format(now);
  return {
    timezone: tz,
    localDateTime,
    weekday,
    isWeekend: weekday === 'Saturday' || weekday === 'Sunday',
  };
}

function timezoneToWeatherLabel(timezone: string | null): string | null {
  if (!timezone || !timezone.includes('/')) return null;
  const parts = timezone.split('/');
  const city = parts[parts.length - 1]?.replace(/_/g, ' ').trim();
  if (!city) return null;
  const region = parts[0];
  const country = TIMEZONE_COUNTRY_MAP[region];
  return country ? `${city}, ${country}` : city;
}

export function pickMorningBriefWeatherLocation(
  ctx: UserContextProfile | null,
  timezone: string | null,
  situation?: Pick<UserSituation, 'currentLocationLabel' | 'liveTimezone'> | null,
): string | null {
  if (situation?.currentLocationLabel?.trim()) return situation.currentLocationLabel.trim();
  const cur = ctx?.currentLocation;
  const home = ctx?.homeLocation;
  if (cur?.value?.trim()) return cur.value.trim();
  if (home?.value?.trim()) return home.value.trim();
  const work = ctx?.workLocation;
  if (work?.value?.trim()) return work.value.trim();
  return timezoneToWeatherLabel(situation?.liveTimezone ?? timezone);
}

/** Infer country label for news context from IANA timezone (user automations, briefings). */
export function inferCountryFromTimezone(timezone: string | null): string {
  const tz = timezone ?? 'Australia/Sydney';
  if (tz.startsWith('Australia/')) return 'Australia';
  if (tz.startsWith('Pacific/Auckland')) return 'New Zealand';
  if (tz.startsWith('America/')) return 'United States';
  if (tz.startsWith('Europe/London') || tz.startsWith('Europe/Belfast')) return 'United Kingdom';
  if (tz.startsWith('Europe/Dublin')) return 'Ireland';
  if (tz.startsWith('Asia/Singapore')) return 'Singapore';
  if (tz.startsWith('Asia/Hong_Kong')) return 'Hong Kong';
  if (tz.startsWith('Asia/Tokyo')) return 'Japan';
  return 'Australia';
}

/** Home/current/work location + country for personalised news digests (website News Briefing automation). */
export function resolveBriefingLocationForNews(
  user: MorningBriefUserRow,
  situation?: Pick<UserSituation, 'currentLocationLabel' | 'liveTimezone'> | null,
): { location: string | null; country: string } {
  const ctx = sanitiseUserContextProfile(user.context_profile);
  const tz = situation?.liveTimezone ?? user.timezone ?? 'Australia/Sydney';
  const location = pickMorningBriefWeatherLocation(ctx, tz, situation);
  const country = inferCountryFromTimezone(tz);
  return { location, country };
}

export function filterWeekendWorkOpenLoops(
  workOpenLoops: string[],
  localContext: Pick<MorningBriefLocalContext, 'isWeekend'>,
): string[] {
  return localContext.isWeekend ? [] : workOpenLoops;
}

export function extractInterests(snapshot: Record<string, unknown> | null): string[] {
  if (!snapshot) return [];
  const pl = snapshot.personal_life as Record<string, unknown> | undefined;
  const arr = pl?.interests;
  if (!Array.isArray(arr)) return [];
  return arr.filter((x): x is string => typeof x === 'string').map((s) => s.slice(0, 120)).slice(0, 6);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function classifyLoopText(
  text: string,
  category = '',
  memoryType = '',
): 'work' | 'personal' {
  const haystack = `${text} ${category} ${memoryType}`.toLowerCase();

  const workHints = [
    'meeting', 'stakeholder', 'invoice', 'contract', 'launch', 'partner', 'client',
    'salesforce', 'case', 'wbr', 'apac', 'emirates', 'work', 'employment', 'project',
    'team', 'bd', 'iag', 'approval', 'market', 'ops', 'business district',
  ];
  if (workHints.some((hint) => haystack.includes(hint))) return 'work';

  const personalHints = [
    'pay ', ' bill', 'ato', 'doctor', 'dentist', 'gp', 'appointment', 'birthday',
    'family', 'friend', 'mum', 'dad', 'partner', 'rent', 'insurance', 'school',
    'pickup', 'travel', 'flight', 'weekend', 'groceries', 'home', 'gym', 'personal',
    'call mum', 'call dad', 'medicare',
  ];
  if (personalHints.some((hint) => haystack.includes(hint))) return 'personal';

  return category === 'employment' || memoryType === 'employment' ? 'work' : 'personal';
}

function scoreInboxRow(row: EmailRow): number {
  const from = String(row.from ?? row.account ?? '').toLowerCase();
  const subject = String(row.subject ?? '').toLowerCase();
  const preview = String(row.body_preview ?? row.snippet ?? '').toLowerCase();
  let score = 0;

  const routineSenderHints = [
    'datawarehouse@',
    'noreply@',
    'jira@',
    'notifications@',
    'gemini-notes@',
  ];
  if (routineSenderHints.some((hint) => from.includes(hint))) score -= 1;

  const routineSubjectHints = [
    'updated invitation',
    'chauffeur driven services',
    'feedback request',
    'thank you',
    'automatic reply',
  ];
  if (routineSubjectHints.some((hint) => subject.includes(hint))) score -= 1;

  const importantHints = [
    'approved',
    'can’t launch',
    "can't launch",
    'due',
    'overdue',
    'payment',
    'transferred to you',
    'case transferred',
    'urgent',
    'important',
    'contract extension',
    'needs reply',
    'chasing',
    'stopped',
    'issue',
    'blocked',
  ];
  if (importantHints.some((hint) => subject.includes(hint) || preview.includes(hint))) score += 2;

  if (from.includes('@blacklane.com')) score += 1;

  return score;
}

function classifyDayShape(args: {
  calendarEventCount: number;
  importantInboxCount: number;
  workOpenLoopCount: number;
  personalOpenLoopCount: number;
}): 'dense_day' | 'normal_day' | 'quiet_day' {
  const { calendarEventCount, importantInboxCount, workOpenLoopCount, personalOpenLoopCount } = args;

  if (
    calendarEventCount >= 4 ||
    importantInboxCount >= 4 ||
    (calendarEventCount >= 2 && importantInboxCount >= 2) ||
    workOpenLoopCount >= 4
  ) {
    return 'dense_day';
  }

  if (
    calendarEventCount <= 1 &&
    importantInboxCount <= 1 &&
    workOpenLoopCount <= 1 &&
    personalOpenLoopCount <= 2
  ) {
    return 'quiet_day';
  }

  return 'normal_day';
}

function buildDateTimeContext(timezone: string | null): string {
  const now = new Date();
  const tz = timezone ?? 'UTC';
  const formatted = now.toLocaleString('en-AU', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const shortTz = now.toLocaleString('en-AU', { timeZone: tz, timeZoneName: 'short' }).split(' ').pop() ?? tz;
  return `${formatted} ${shortTz}`;
}

async function hybridSearch(handle: string, query: string, matchCount: number): Promise<string> {
  const supabase = getAdminClient();
  const embedding = await getEmbedding(query);
  const embStr = vectorString(embedding);
  const { data, error } = await supabase.rpc('hybrid_search_documents', {
    p_handle: handle,
    query_text: query,
    query_embedding: embStr,
    match_count: matchCount,
    source_filters: null,
    min_semantic_score: 0.26,
  });
  if (error) {
    console.warn('[morning-brief] hybrid_search error:', error.message);
    return '';
  }
  type Row = {
    title: string;
    source_type: string;
    chunk_text: string | null;
    summary_text: string | null;
    fused_score?: number;
    semantic_score: number;
  };
  const rawRows = (data as Row[] | null) ?? [];
  if (rawRows.length === 0) return '';
  const rows = await decryptSearchResults(rawRows);
  const blocks = rows.slice(0, 8).map((r, i) => {
    const text = (r.chunk_text ?? r.summary_text ?? '').slice(0, 500);
    const score = Math.round((r.fused_score ?? r.semantic_score) * 100);
    return `[${i + 1}] ${r.title} (${r.source_type}, ${score}%)\n${text}`;
  });
  return blocks.join('\n\n');
}

async function fetchWeatherBlock(locationLabel: string | null): Promise<string> {
  if (!locationLabel) return '(No location on file — skip weather in script or mention generically.)';
  try {
    const out = await weatherTool.handler({
      location: locationLabel,
      type: 'daily_forecast',
      days: 2,
    }, { chatId: '', senderHandle: '', authUserId: null, timezone: null, pendingEmailSend: null, pendingEmailSends: [] });
    const raw = out.structuredData ?? JSON.parse(typeof out.content === 'string' ? out.content : '{}');
    if (raw && typeof raw === 'object' && 'error' in raw) {
      return `Weather lookup failed: ${(raw as { error?: string }).error ?? 'unknown'}`;
    }
    return JSON.stringify(raw, null, 0).slice(0, 2500);
  } catch (e) {
    return `Weather error: ${(e as Error).message}`;
  }
}

async function fetchInterestNews(
  interests: string[],
  timezone: string | null,
  userName: string | null,
  locationLabel?: string | null,
  country?: string | null,
): Promise<string> {
  if (!isGeminiModel(MODEL_MAP.fast)) {
    return '(Web search not available - local news unavailable.)';
  }

  const now = new Date();
  const tz = timezone ?? 'Australia/Sydney';
  const newsCountry = country || inferCountryFromTimezone(tz);
  const isoDateTime = now.toLocaleString('en-AU', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const topicHint = interests
    .map((interest) => interest.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');

  try {
    const localFrame = locationLabel
      ? `${locationLabel}, ${newsCountry}`
      : newsCountry;
    const q =
      `Current local time in ${localFrame}: ${isoDateTime}. ` +
      `Search the web and identify the single biggest ${newsCountry} news story from the last 12 hours that would very likely lead mainstream local news bulletins right now. ` +
      `Prioritise major, reliable outlets that cover ${newsCountry}${locationLabel ? ` and ${locationLabel}` : ''}. ` +
      'Ignore niche stories and ignore sport unless it is unquestionably the dominant local headline. ' +
      (topicHint ? `The user is generally interested in ${topicHint}, but this is secondary to picking the biggest local story. ` : '') +
      'Return exactly 3 short lines in plain text: ' +
      'Line 1 = the headline. ' +
      'Line 2 = source and timestamp window, for example "ABC News, within the last 12 hours". ' +
      `Line 3 = one concise sentence explaining why it matters in ${newsCountry} today. ` +
      'Australian English only. No bullet points.';
    const result = await geminiGroundedSearch({ model: MODEL_MAP.fast, query: q });
    return result.text.slice(0, 900);
  } catch (e) {
    return `News lookup failed: ${(e as Error).message}`;
  }
}

async function fetchWeekendLocalSuggestions(args: {
  interests: string[];
  timezone: string;
  locationLabel: string | null;
  userName: string | null;
  isWeekend: boolean;
  isLikelyTravelling?: boolean;
}): Promise<string> {
  const { interests, timezone, locationLabel, userName, isWeekend, isLikelyTravelling } = args;
  if (!isWeekend || !locationLabel || !isLikelyTravelling || !isGeminiModel(MODEL_MAP.fast)) {
    return '';
  }

  const now = new Date();
  const localDateTime = now.toLocaleString('en-AU', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const topicHint = interests
    .map((interest) => interest.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(', ');

  try {
    const query =
      `Current local date/time: ${localDateTime}. The user ${userName ? `(${userName}) ` : ''}is travelling or away from home and appears to be in/near ${locationLabel}. ` +
      `Search for genuinely good things to do in or near ${locationLabel} today or this weekend. ` +
      'Prioritise specific, currently relevant options: exhibitions, neighbourhoods, food areas, events, gardens, markets, walks, cafes, or low-friction half-day ideas. ' +
      'Avoid generic tourist-brochure filler and avoid work/productivity suggestions. ' +
      (topicHint ? `Use these interests as light preference hints where useful: ${topicHint}. ` : '') +
      'Return exactly 3 short lines in plain text, no bullets. Each line should be one concrete idea with a short reason. Australian English.';
    const result = await geminiGroundedSearch({ model: MODEL_MAP.fast, query });
    return result.text.slice(0, 1000);
  } catch (e) {
    return `Local suggestions lookup failed: ${(e as Error).message}`;
  }
}

const PACKAGER_SYSTEM = `You are Nest's morning brief writer.

Your job is to create a private daily voice memo and a short companion text that feel like they came from an exceptional human executive assistant who knows the user's world well.

You are not a summariser.
You are not a calendar reader.
You are not a newsreader.

You are a sharp, warm, emotionally intelligent EA whose job is to help the user feel clear, calm, and accurately informed about the day ahead.

WHAT GOOD LOOKS LIKE

A great brief does five things:
1. It tells the user what actually matters today.
2. It interprets the shape of the day, not just the logistics.
3. It spots likely pressure points, awkward handoffs, open loops, and background developments.
4. It connects relevant inbox, calendar, memory, and background context into one coherent read.
5. It leaves the user feeling steadier and better informed.

IDENTITY AND ATTRIBUTION RULES

The USER IDENTITY section tells you who you are speaking to.

You are speaking directly to that person.

This means:
- Never refer to the user in third person.
- Never describe the user as though they are an external participant in their own meeting.
- If the user is Tom and there is a meeting called "Tom / Alex", say "you've got that chat with Alex", not "you have a meeting with Tom and Alex".
- Emails sent from the user's own connected addresses are actions the user has already taken. Refer to them as "you sent", "you followed up", "you asked", "you replied".
- Emails received from others are incoming context. Refer to them as "Alex got back to you", "Mario is chasing", "there's a note from Sarah about...".

DECISION RULES

Prioritise signal over volume.

Calendar Today is the only authoritative source for meetings happening today.
Memory items are background context only.
Even if a memory contains the word "today" or a specific time, never treat it as a live calendar event.
If something is not in Calendar Today, it is not happening today.

Use the following weighting:
- First: today's calendar and anything time-bound
- Second: important inbox threads from the last 24 hours
- Third: open loops from the last 2 to 3 days
- Fourth: older background context only if it clearly helps explain something happening today
- Fifth: weather or one news item only if genuinely relevant and worth saying aloud

WEEKEND AWARENESS

You will be given LOCAL DAY CONTEXT.

If today is Saturday or Sunday:
- Do not treat the day as a normal workday.
- Do not lead with work unless Calendar Today contains a work event, or IMPORTANT INBOX contains something clearly urgent and time-bound for today.
- Treat work open loops as weekday background, not weekend obligations.
- Prefer a lighter framing: calendar shape, travel/current-location details, weather, personal/admin loops, and genuinely useful local context.
- If the user appears to be travelling or away from home and WEEKEND / LOCAL SUGGESTIONS has useful content, include one or two specific things they could enjoy nearby.
- If there is no urgent email signal, do not mention email at all. Weekend briefs are not inbox digests.
- If work context exists but is not tied to today, compress it or say it can sit in the background.

MODE AWARENESS

You will be given a DAY SHAPE value.

If DAY SHAPE is dense_day:
- prioritise the live dependencies and what changed around them
- keep weather and news brief

If DAY SHAPE is normal_day:
- balance obligations, background context, weather, and one major news item

If DAY SHAPE is quiet_day:
- do not manufacture urgency
- explicitly say the day is clear or lightly loaded if that is true
- give more weight to weather, one personal/admin open loop, and the biggest local story
- if work signal is weak, do not pad with routine inbox trivia

Do not mention:
- routine marketing noise
- low-signal admin clutter
- stale background that has no bearing on today
- every single meeting or email just because it exists

If the day is light, say so plainly.
If the day is fragmented, say that.
If there is a difficult or politically sensitive conversation, acknowledge it with tact.
Be more informative than instructive.
Interpret the day, but do not manage the user's behaviour.
Avoid coaching language like:
- "I'd go into that with..."
- "Worth having a quick scan..."
- "I'd treat today as..."
- "You should..."
- "Try to..."
Only give guidance if there is a concrete timing or risk issue that really needs flagging.
If there is a lot of low-signal noise, say what can safely be ignored.

STYLE

Sound like:
- an outstanding human EA
- warm, composed, perceptive, and highly competent
- lightly conversational, but never try-hard
- supportive without being gushy
- calm and confident without sounding corporate

Do not sound like:
- a productivity app
- a radio host
- a therapist
- a comedian
- a robot reading a digest

WRITING RULES

- Use Australian English.
- Use contractions naturally.
- Use clean spoken prose.
- Vary sentence length.
- Keep the language natural and understated.
- Use natural pauses. Include natural spoken disfluencies to make it sound human. A real EA talking would say things like:
  "So... the main thing today is, ummm, that five o'clock with Alex."
  "The inbox is, hmm, mostly operational stuff."
  "And then, ahh, let me think... right, the other thing is the pricing thread."
  Use "um", "ummm", "hmm", "hmmm", "ahh", "so", "right", "anyway", "let me think", "the other thing is", and ellipses ("...") consistently — roughly once every three to five sentences, mixing the fillers (don't repeat the same one). They should feel incidental, not performed.
- Use ellipses ("...") for natural thinking pauses mid-sentence. These translate directly to pauses in TTS.
- Spell the hesitations the way they sound: "um", "ummm", "hmm", "hmmm", "ahh" — never wrap them in brackets, quotes, or stage directions.
- No markdown.
- No emojis.
- No em dashes. Use commas or hyphens instead.
- No bullet points in script_plain.
- No SSML or stage directions.
- No bracketed delivery cues.
- Do not say "I pulled this together from your inbox and calendar" or mention the source material.

STRUCTURE FOR script_plain

script_plain should be around 170 to 250 words and should flow like a polished voice memo.
250 words is a hard ceiling.

Use this shape:

1. Opening
A natural greeting that fits the actual time of day provided.
If a usable first name is available, the first sentence must be exactly: "Good morning <name>, hope you slept well."
If no usable first name is available, the first sentence must be exactly: "Good morning, hope you slept well."
Then a quick read on the overall shape of the day.
Always mention today's weather in the user's location in this opening paragraph if weather data is available.
Examples of the function, not exact wording:
- feels meeting-heavy
- pretty manageable
- a bit chopped up
- one or two things worth getting in front of
- mostly reactive unless you protect a block

2. Core brief
This is the value.
Synthesize the day into a coherent narrative.
Connect meetings, email threads, open loops, and relevant background.
Explain what matters and why.
Surface likely friction, interpersonal nuance, deadlines, and dependencies.
Interpret, do not list, and do not over-coach.
If useful, include one short line on what is safe to ignore.
If you mention a meeting, conversation, or calendar event, include its start time in natural prose.

3. Close
End naturally.
Leave the user with a clear sense of what is sitting in the background of the day.
The final note should feel calm, sharp, and human.
No cheesy motivation.
No "you've got this".
Always end with a warm personal sign-off in this spirit: "Have a nice day, I'm here if you need anything."
Keep the sign-off natural, not corporate, and not over-written.

4. News
Always include one short sentence on the single biggest local news story from the last 12 hours, using the NEWS block if available.
Keep it factual and concise.
Frame it as one wider thing worth knowing today, not a separate news bulletin.

COMPANION TEXT RULES

companion_text is a short iMessage sent alongside the audio.
It should be lock-screen cautious, plain text only, and one to three short lines.
It should give the user the gist without exposing sensitive detail.
It can lightly frame the day, for example:
- "Bit of a chopped-up one today. A couple of things worth getting ahead of."
- "You're reasonably clear this morning, but there's one thread that probably needs attention."

OUTPUT FORMAT

Return ONLY valid JSON with exactly these keys:
{"script_plain":"...","companion_text":"..."}

QUALITY BAR

The user should feel:
- understood
- oriented
- less overwhelmed
- better prepared
- quietly supported

If there is little real signal, keep it brief and honest.
If there is a lot going on, impose structure and judgment.
Always optimise for clarity, relevance, and emotional steadiness.`;

const MORNING_BRIEF_MAX_WORDS = 250;

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

async function packageBriefWithLlm(
  userName: string | null,
  pack: MorningBriefGathered,
  tz?: string | null,
  situation?: UserSituation | null,
): Promise<MorningBriefScript> {
  const first = userName?.trim().split(/\s+/)[0] ?? '';
  const dtContext = buildDateTimeContext(tz ?? 'Australia/Sydney');
  const situationBlock = situation?.promptBlock ? `\n${situation.promptBlock}\n\n` : '';
  const userMessage = `Current date/time: ${dtContext}
${situationBlock}=== USER IDENTITY ===
${pack.deep_profile_snippet || `Name: ${first || 'unknown'}`}

=== DAY SHAPE ===
${pack.day_shape}

=== DAY SHAPE SIGNALS ===
Calendar events today: ${pack.calendar_event_count}
Important inbox threads: ${pack.important_inbox_count}

=== LOCAL DAY CONTEXT ===
${pack.local_context_snippet}

=== REQUIRED GREETING NAME ===
${first || '(none available)'}

=== TODAY'S CALENDAR ===
${pack.calendar_snippet || '(No events today)'}

=== IMPORTANT INBOX ===
${pack.priority_inbox_snippet || '(No important inbox signal)'}

=== EMAIL (last 24 hours) ===
${pack.email_snippet || '(No recent emails)'}

=== OPEN LOOPS & RECENT CONVERSATIONS ===
${pack.summaries_snippet || '(No recent conversation context)'}

=== WORK OPEN LOOPS ===
${pack.work_open_loops_snippet || '(No meaningful work open loops)'}

=== PERSONAL / ADMIN OPEN LOOPS ===
${pack.personal_open_loops_snippet || '(No meaningful personal or admin open loops)'}

=== WEEKEND / LOCAL SUGGESTIONS ===
${pack.weekend_local_suggestions_snippet || '(No weekend local suggestions)'}

=== SAFE TO IGNORE ===
${pack.safe_to_ignore_snippet || '(Nothing explicit to compress)'}

=== BACKGROUND CONTEXT ===
${pack.rag_snippet || '(No relevant background)'}

=== ACTIVE MEMORIES ===
${pack.memories_snippet || '(No active memories)'}

=== WEATHER ===
${pack.weather_snippet}

=== NEWS ===
${pack.news_snippet}
`;

  const client = getOpenAIClient();
  const resp = await client.responses.create({
    model: MODEL_MAP.agent,
    instructions: PACKAGER_SYSTEM,
    input: userMessage,
    max_output_tokens: 2000,
    store: false,
    prompt_cache_key: 'nest-morning-brief',
  } as Parameters<typeof client.responses.create>[0]);

  const raw = getResponseText(resp).trim();
  let parsed: { script_plain?: string; companion_text?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    parsed = JSON.parse(cleaned);
  }
  const script_plain = (parsed.script_plain ?? '').replace(/\u2014/g, '-').trim();
  const companion_text = (parsed.companion_text ?? '').replace(/\u2014/g, '-').trim();
  if (!script_plain || script_plain.length < 40) {
    throw new Error('Packager returned empty or too short script');
  }
  let packaged: MorningBriefScript = {
    script_plain,
    companion_text,
    word_count: countWords(script_plain),
  };

  if (packaged.word_count > MORNING_BRIEF_MAX_WORDS) {
    packaged = await tightenBriefWithLlm(packaged, first);
  }

  if (packaged.word_count > MORNING_BRIEF_MAX_WORDS) {
    packaged = clampBriefToWordLimit(packaged);
  }

  return packaged;
}

async function tightenBriefWithLlm(
  script: MorningBriefScript,
  firstName: string,
): Promise<MorningBriefScript> {
  const client = getOpenAIClient();
  let current = script;

  for (let attempt = 0; attempt < 2; attempt++) {
    if (current.word_count <= MORNING_BRIEF_MAX_WORDS) break;

    const requiredOpener = firstName
      ? `Good morning ${firstName}, hope you slept well.`
      : 'Good morning, hope you slept well.';

    const response = await client.responses.create({
      model: MODEL_MAP.agent,
      instructions: `You are editing a morning brief.

Your job is to keep the same core facts, but make it shorter, more informative, and less instructive.

Hard rules:
- The first sentence must stay exactly: "${requiredOpener}"
- Keep the weather mention for today.
- Keep one sentence on the biggest local news story.
- Keep any mentioned meeting or calendar item tied to its start time.
- End with a warm sign-off in the spirit of "Have a nice day, I'm here if you need anything."
- Remove coaching and advice. Favour observation over instruction.
- Maximum ${MORNING_BRIEF_MAX_WORDS} words total. This is a hard limit.
- Australian English.
- Return ONLY valid JSON with exactly these keys: {"script_plain":"...","companion_text":"..."}`,
      input: JSON.stringify(current),
      max_output_tokens: 1200,
      store: false,
      prompt_cache_key: 'nest-morning-brief-tighten',
    } as Parameters<typeof client.responses.create>[0]);

    const raw = getResponseText(response).trim();
    let parsed: { script_plain?: string; companion_text?: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      parsed = JSON.parse(cleaned);
    }

    const script_plain = (parsed.script_plain ?? '').replace(/\u2014/g, '-').trim();
    const companion_text = (parsed.companion_text ?? current.companion_text).replace(/\u2014/g, '-').trim();
    current = {
      script_plain,
      companion_text,
      word_count: countWords(script_plain),
    };
  }

  return current;
}

function clampBriefToWordLimit(script: MorningBriefScript): MorningBriefScript {
  const advisoryPatterns = [
    /^If\b/i,
    /\bworth\b/i,
    /\bshould\b/i,
    /\btry to\b/i,
    /\bI'?d\b/i,
    /\bprobably\b/i,
  ];
  const newsPattern = /\b(news|headline|australia|australian)\b/i;

  let paragraphs = script.script_plain
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const sentenceSplit = (paragraph: string) =>
    paragraph.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);

  const rebuild = () => paragraphs.join('\n\n').trim();

  while (countWords(rebuild()) > MORNING_BRIEF_MAX_WORDS) {
    let removed = false;

    for (let p = 1; p < paragraphs.length; p++) {
      const sentences = sentenceSplit(paragraphs[p]);
      for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i];
        if (newsPattern.test(sentence)) continue;
        if (advisoryPatterns.some((pattern) => pattern.test(sentence))) {
          sentences.splice(i, 1);
          paragraphs[p] = sentences.join(' ').trim();
          paragraphs = paragraphs.filter(Boolean);
          removed = true;
          break;
        }
      }
      if (removed) break;
    }

    if (removed) continue;

    let fallbackParagraph = -1;
    let fallbackIndex = -1;
    let fallbackLength = Number.POSITIVE_INFINITY;

    for (let p = 1; p < paragraphs.length; p++) {
      const sentences = sentenceSplit(paragraphs[p]);
      for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i];
        if (newsPattern.test(sentence)) continue;
        const len = countWords(sentence);
        if (len < fallbackLength) {
          fallbackLength = len;
          fallbackParagraph = p;
          fallbackIndex = i;
        }
      }
    }

    if (fallbackParagraph >= 0 && fallbackIndex >= 0) {
      const sentences = sentenceSplit(paragraphs[fallbackParagraph]);
      sentences.splice(fallbackIndex, 1);
      paragraphs[fallbackParagraph] = sentences.join(' ').trim();
      paragraphs = paragraphs.filter(Boolean);
      continue;
    }

    const words = rebuild().split(/\s+/).filter(Boolean).slice(0, MORNING_BRIEF_MAX_WORDS);
    const truncated = words.join(' ').trim().replace(/[,\s]+$/, '');
    paragraphs = [truncated.endsWith('.') ? truncated : `${truncated}.`];
    break;
  }

  const script_plain = rebuild();
  return {
    ...script,
    script_plain,
    word_count: countWords(script_plain),
  };
}

// ── Gemini TTS ──────────────────────────────────────────────────

const GEMINI_TTS_MODEL = 'gemini-3.1-flash-tts-preview';
/** Prebuilt voice name for `gemini-3.1-flash-tts-preview`. */
const GEMINI_TTS_VOICE = 'Aoede';
const GEMINI_TTS_TRANSCRIPT_CHAR_LIMIT = 3000;

const GEMINI_TTS_AUDIO_PROFILE = 'A helpful and professional personal assistant.';
const GEMINI_TTS_DIRECTORS_NOTE = 'Style: Empathetic. Pace: Natural. Accent: American (Gen).';
const GEMINI_TTS_SCENE = 'A quiet, professional remote workspace.';
/** Default ## Sample Context — drives prosody/pacing of the prebuilt voice. */
const GEMINI_TTS_DEFAULT_CONTEXT =
  'Deep voice. Steady, efficient, and unhurried. Medium to fast speaking speed. Tone is empathetic, crisp, and reassuring. Australian accent. Use natural pauses — when the transcript contains "um", "umm", "hmm", "hmmm", "ahh", or ellipses ("...", "…"), perform them as real spoken hesitations and short breaths, not as letters or punctuation read aloud.';

const MORNING_BRIEF_TTS_INSTRUCTIONS = GEMINI_TTS_DEFAULT_CONTEXT;
export const VOICE_MODE_TTS_INSTRUCTIONS = GEMINI_TTS_DEFAULT_CONTEXT;

/**
 * Exact generation config for gemini-3.1-flash-tts-preview (per Google sample).
 * https://ai.google.dev/ — `generateContentStream` with `responseModalities: ['audio']`.
 */
const GEMINI_TTS_STREAM_CONFIG = {
  temperature: 1,
  responseModalities: ['audio'],
  speechConfig: {
    voiceConfig: {
      prebuiltVoiceConfig: {
        voiceName: GEMINI_TTS_VOICE,
      },
    },
  },
};

interface SynthesisedAudio {
  bytes: Uint8Array;
  contentType: string;
  extension: string;
}

interface WavConversionOptions {
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function splitTextForTTS(text: string): string[] {
  if (text.length <= GEMINI_TTS_TRANSCRIPT_CHAR_LIMIT) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= GEMINI_TTS_TRANSCRIPT_CHAR_LIMIT) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf('. ', GEMINI_TTS_TRANSCRIPT_CHAR_LIMIT);
    if (splitAt < GEMINI_TTS_TRANSCRIPT_CHAR_LIMIT * 0.4) {
      splitAt = remaining.lastIndexOf('? ', GEMINI_TTS_TRANSCRIPT_CHAR_LIMIT);
    }
    if (splitAt < GEMINI_TTS_TRANSCRIPT_CHAR_LIMIT * 0.4) {
      splitAt = remaining.lastIndexOf(', ', GEMINI_TTS_TRANSCRIPT_CHAR_LIMIT);
    }
    if (splitAt < GEMINI_TTS_TRANSCRIPT_CHAR_LIMIT * 0.4) {
      splitAt = remaining.lastIndexOf(' ', GEMINI_TTS_TRANSCRIPT_CHAR_LIMIT);
    }
    if (splitAt <= 0) splitAt = GEMINI_TTS_TRANSCRIPT_CHAR_LIMIT;
    else splitAt += 1;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  return chunks.filter(Boolean);
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function parseGeminiAudioMimeType(mimeType: string): WavConversionOptions {
  const [fileType, ...params] = mimeType.split(';').map((s) => s.trim());
  const [, format = 'L16'] = fileType.split('/');
  const options: Partial<WavConversionOptions> = {
    numChannels: 1,
    sampleRate: 24_000,
    bitsPerSample: 16,
  };

  if (format.toUpperCase().startsWith('L')) {
    const bits = Number.parseInt(format.slice(1), 10);
    if (Number.isFinite(bits) && bits > 0) {
      options.bitsPerSample = bits;
    }
  }

  for (const param of params) {
    const [key, value] = param.split('=').map((s) => s.trim());
    if (key === 'rate') {
      const rate = Number.parseInt(value, 10);
      if (Number.isFinite(rate) && rate > 0) {
        options.sampleRate = rate;
      }
    }
  }

  return options as WavConversionOptions;
}

function createWavHeader(dataLength: number, options: WavConversionOptions): Uint8Array {
  const { numChannels, sampleRate, bitsPerSample } = options;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const buffer = new Uint8Array(44);
  const view = new DataView(buffer.buffer);

  buffer.set(new TextEncoder().encode('RIFF'), 0);
  view.setUint32(4, 36 + dataLength, true);
  buffer.set(new TextEncoder().encode('WAVE'), 8);
  buffer.set(new TextEncoder().encode('fmt '), 12);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  buffer.set(new TextEncoder().encode('data'), 36);
  view.setUint32(40, dataLength, true);
  return buffer;
}

function normaliseGeminiAudio(
  rawBytes: Uint8Array,
  mimeType: string,
): SynthesisedAudio {
  const [baseMime] = mimeType.split(';').map((s) => s.trim().toLowerCase());

  if (baseMime === 'audio/mpeg' || baseMime === 'audio/mp3') {
    return { bytes: rawBytes, contentType: 'audio/mpeg', extension: 'mp3' };
  }
  if (baseMime === 'audio/ogg') {
    return { bytes: rawBytes, contentType: 'audio/ogg', extension: 'ogg' };
  }
  if (baseMime === 'audio/wav' || baseMime === 'audio/x-wav') {
    return { bytes: rawBytes, contentType: 'audio/wav', extension: 'wav' };
  }

  const wavOptions = parseGeminiAudioMimeType(mimeType);
  const wavBytes = concatUint8Arrays([createWavHeader(rawBytes.length, wavOptions), rawBytes]);
  return { bytes: wavBytes, contentType: 'audio/wav', extension: 'wav' };
}

function buildGeminiTtsPrompt(text: string, styleContext: string): string {
  return `Read the following transcript based on the audio profile and director's note.

# Audio Profile
${GEMINI_TTS_AUDIO_PROFILE}

# Director's note
${GEMINI_TTS_DIRECTORS_NOTE}

## Scene:
${GEMINI_TTS_SCENE}

## Sample Context:
${styleContext}

## Transcript:
${text}`;
}

async function collectGeminiTtsRawSegment(
  ai: GoogleGenAI,
  text: string,
  styleContext: string,
): Promise<{ rawBytes: Uint8Array; mimeType: string }> {
  const response = await ai.models.generateContentStream({
    model: GEMINI_TTS_MODEL,
    config: GEMINI_TTS_STREAM_CONFIG,
    contents: [{
      role: 'user',
      parts: [{ text: buildGeminiTtsPrompt(text, styleContext) }],
    }],
  });

  const rawParts: Uint8Array[] = [];
  let mimeType = 'audio/L16;rate=24000';

  for await (const streamChunk of response) {
    const parts = streamChunk.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (!part.inlineData?.data) continue;
      mimeType = part.inlineData.mimeType || mimeType;
      rawParts.push(decodeBase64ToBytes(part.inlineData.data));
    }
  }

  if (rawParts.length === 0) {
    throw new Error('Gemini TTS returned no audio data');
  }

  return {
    rawBytes: concatUint8Arrays(rawParts),
    mimeType,
  };
}

export async function synthesizeSpeechAudio(
  text: string,
  instructions?: string,
): Promise<SynthesisedAudio> {
  const apiKey = getOptionalEnv('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const ai = new GoogleGenAI({ apiKey });
  const styleContext = (instructions || VOICE_MODE_TTS_INSTRUCTIONS).trim() || GEMINI_TTS_DEFAULT_CONTEXT;
  const chunks = splitTextForTTS(text);
  console.log(
    `[tts] Gemini TTS: ${text.length} chars in ${chunks.length} chunk(s), voice=${GEMINI_TTS_VOICE}`,
  );

  const rawSegments: Array<{ rawBytes: Uint8Array; mimeType: string }> = [];

  for (const chunk of chunks) {
    rawSegments.push(await collectGeminiTtsRawSegment(ai, chunk, styleContext));
  }

  if (rawSegments.length === 0) {
    throw new Error('Gemini TTS returned no audio segments');
  }

  const mimeTypes = [...new Set(rawSegments.map((segment) => segment.mimeType))];
  if (mimeTypes.length === 1) {
    const mergedRawBytes = concatUint8Arrays(rawSegments.map((segment) => segment.rawBytes));
    const normalised = normaliseGeminiAudio(mergedRawBytes, mimeTypes[0]);
    console.log(
      `[tts] Gemini TTS OK: ${rawSegments.length} segment(s), ${normalised.bytes.length} bytes ${normalised.contentType}`,
    );
    return normalised;
  }

  const outputParts = rawSegments.map((segment) =>
    normaliseGeminiAudio(segment.rawBytes, segment.mimeType)
  );
  const primary = outputParts[0];
  const mergedBytes = concatUint8Arrays(outputParts.map((part) => part.bytes));

  console.log(
    `[tts] Gemini TTS OK: ${outputParts.length} mixed segment(s), ${mergedBytes.length} bytes ${primary.contentType}`,
  );

  return {
    bytes: mergedBytes,
    contentType: primary.contentType,
    extension: primary.extension,
  };
}

/** @deprecated Kept for backward compatibility. */
export async function synthesizeSpeechMp3(
  text: string,
  instructions?: string,
): Promise<Uint8Array> {
  return (await synthesizeSpeechAudio(text, instructions)).bytes;
}

/** @deprecated Kept for backward compatibility. */
export const synthesizeElevenLabsMp3 = synthesizeSpeechMp3;

/**
 * Synthesise text → Gemini TTS → upload to storage → return signed URL.
 * Used by voice mode via the morning-brief-audio edge function to get the full 400s budget.
 */
export async function synthesizeAndUpload(
  text: string,
  chatId: string,
  instructions?: string,
): Promise<{ signedUrl: string; storagePath: string }> {
  const audio = await synthesizeSpeechAudio(text, instructions);
  console.log(`[tts] synthesizeAndUpload: ${audio.bytes.length} bytes, uploading...`);

  const supabase = getAdminClient();
  const path = `voice-mode/${chatId}/${Date.now()}.${audio.extension}`;
  const { error: upErr } = await supabase.storage
    .from('morning-brief-audio')
    .upload(path, audio.bytes, { contentType: audio.contentType, upsert: true });
  if (upErr) throw new Error(`storage upload failed: ${upErr.message}`);

  const { data: signed, error: signErr } = await supabase.storage
    .from('morning-brief-audio')
    .createSignedUrl(path, 72 * 3600);
  if (signErr || !signed?.signedUrl) throw new Error(`signed URL failed: ${signErr?.message ?? 'no URL'}`);

  return { signedUrl: signed.signedUrl, storagePath: path };
}

export async function loadMorningBriefUser(handle: string): Promise<MorningBriefUserRow | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from(USER_PROFILES_TABLE)
    .select(
      'handle, name, bot_number, timezone, auth_user_id, deep_profile_snapshot, context_profile, facts',
    )
    .eq('handle', handle)
    .maybeSingle();
  if (error || !data) return null;
  return data as MorningBriefUserRow;
}

// ── Rich context builders ───────────────────────────────────────

interface EmailRow {
  from?: unknown; account?: unknown; subject?: unknown;
  body_preview?: unknown; snippet?: unknown; date?: unknown;
  thread_id?: unknown;
}

function buildRichEmailSnippet(results: EmailRow[]): string {
  if (!results.length) return '';

  // Group by thread/subject to surface threads rather than individual messages
  const threads = new Map<string, EmailRow[]>();
  for (const r of results) {
    const key = String(r.thread_id ?? r.subject ?? '').toLowerCase().trim();
    if (!threads.has(key)) threads.set(key, []);
    threads.get(key)!.push(r);
  }

  const lines: string[] = [];
  for (const [, msgs] of threads) {
    const latest = msgs[0];
    const from = String(latest.from ?? latest.account ?? '');
    const sub = String(latest.subject ?? '');
    const prev = String(latest.body_preview ?? latest.snippet ?? '').slice(0, 280);
    const date = String(latest.date ?? '');
    const threadCount = msgs.length;
    const threadTag = threadCount > 1 ? ` [${threadCount} messages in thread]` : '';
    const participants = threadCount > 1
      ? [...new Set(msgs.map(m => String(m.from ?? '').split('<')[0].trim()).filter(Boolean))].join(', ')
      : '';
    const partLine = participants && threadCount > 1 ? `\n  Participants: ${participants}` : '';
    lines.push(`- ${date} | ${from} | ${sub}${threadTag}\n  ${prev}${partLine}`);
  }
  return lines.slice(0, 12).join('\n');
}

interface CalEvent {
  title?: unknown; start?: unknown; start_iso?: unknown; end?: unknown;
  location?: unknown; attendees?: unknown; organiser?: unknown;
  description?: unknown; status?: unknown; meet_link?: unknown;
}

function buildRichCalendarSnippet(events: CalEvent[]): string {
  if (!events.length) return '';
  return events.slice(0, 12).map((e) => {
    const title = String(e.title ?? '(no title)');
    const start = String(e.start ?? e.start_iso ?? '');
    const end = e.end ? ` - ${e.end}` : '';
    const loc = e.location ? `\n  Location: ${e.location}` : '';
    const attendees = Array.isArray(e.attendees) && e.attendees.length > 0
      ? `\n  Attendees: ${(e.attendees as string[]).slice(0, 8).join(', ')}` : '';
    const organiser = e.organiser ? `\n  Organiser: ${e.organiser}` : '';
    const desc = e.description ? `\n  Description: ${String(e.description).slice(0, 200)}` : '';
    const status = e.status ? ` [${e.status}]` : '';
    const meet = e.meet_link ? `\n  Meet: ${e.meet_link}` : '';
    return `- ${title} (${start}${end})${status}${loc}${attendees}${organiser}${desc}${meet}`;
  }).join('\n');
}

function buildTargetedRagQueries(calEvents: CalEvent[], emailSubjects: string[]): string[] {
  const queries: string[] = [];

  // Query 1: always — recent email threads, follow-ups, deadlines
  queries.push('Important email threads, deadlines, and follow-ups from the last two days');

  // Query 2: targeted to today's meetings if any
  const meetingNames = calEvents
    .slice(0, 5)
    .map(e => String(e.title ?? '').replace(/\(no title\)/i, '').trim())
    .filter(Boolean);
  if (meetingNames.length) {
    queries.push(
      `Background and past context for today's meetings: ${meetingNames.join(', ')}`,
    );
  }

  // Query 3: targeted to active email threads if interesting ones exist
  const interestingSubjects = emailSubjects
    .filter(s => s.length > 4 && !s.match(/^(re:|fwd:|test|hello|hi)\s*$/i))
    .slice(0, 4);
  if (interestingSubjects.length) {
    queries.push(
      `Past context and history for these email topics: ${interestingSubjects.join('; ')}`,
    );
  }

  // Query 4: personal plans, open tasks, things the user mentioned wanting to do
  queries.push('Open tasks, personal plans, and things the user wants to get done soon');

  return queries;
}

function buildUserIdentityBlock(user: MorningBriefUserRow, connectedEmails: string[]): string {
  const lines: string[] = [];
  lines.push(`Name: ${user.name ?? 'unknown'}`);
  lines.push(`Phone: ${user.handle}`);
  if (connectedEmails.length) {
    lines.push(`Email accounts (these are the user's own addresses): ${connectedEmails.join(', ')}`);
  }
  if (user.timezone) lines.push(`Timezone: ${user.timezone}`);

  const ctx = sanitiseUserContextProfile(user.context_profile);
  if (ctx?.homeLocation?.value) lines.push(`Home: ${ctx.homeLocation.value}`);
  if (ctx?.workLocation?.value) lines.push(`Work: ${ctx.workLocation.value}`);
  if (ctx?.currentLocation?.value) lines.push(`Current location: ${ctx.currentLocation.value}`);

  // Facts from user_profiles (bio facts like job, interests, etc.)
  const facts = Array.isArray(user.facts) ? user.facts.filter((f): f is string => typeof f === 'string') : [];
  if (facts.length) lines.push(`Known facts: ${facts.slice(0, 15).join('; ')}`);

  // Deep profile — professional and personal life context
  const dp = user.deep_profile_snapshot;
  if (dp) {
    const prof = dp.professional_life as Record<string, unknown> | undefined;
    const pers = dp.personal_life as Record<string, unknown> | undefined;
    if (prof) {
      const role = prof.role ?? prof.job_title ?? prof.occupation;
      const company = prof.company ?? prof.employer;
      if (role) lines.push(`Role: ${role}`);
      if (company) lines.push(`Company: ${company}`);
      const summary = prof.summary ?? prof.work_summary;
      if (summary) lines.push(`Work context: ${String(summary).slice(0, 300)}`);
    }
    if (pers) {
      const interests = pers.interests;
      if (Array.isArray(interests) && interests.length) {
        lines.push(`Interests: ${interests.slice(0, 6).join(', ')}`);
      }
    }
    const hooks = dp.conversation_hooks as string[] | undefined;
    if (hooks?.length) lines.push(`Recent conversation hooks: ${hooks.slice(0, 3).join('; ')}`);
    const patterns = dp.notable_patterns as string[] | undefined;
    if (patterns?.length) lines.push(`Behavioural patterns: ${patterns.slice(0, 3).join('; ')}`);
  }

  return lines.join('\n');
}

export async function gatherMorningBriefContext(
  user: MorningBriefUserRow,
  situation?: UserSituation | null,
): Promise<MorningBriefGathered> {
  const tz = situation?.liveTimezone ?? user.timezone ?? 'Australia/Sydney';
  const authId = user.auth_user_id;
  const ctx = sanitiseUserContextProfile(user.context_profile);
  const localContext = buildMorningBriefLocalContext(tz);
  const weatherLabel = pickMorningBriefWeatherLocation(ctx, tz, situation);
  const newsCountry = inferCountryFromTimezone(tz);

  // ── Phase 1: fetch inbox + sent + calendar + memories + summaries + connected accounts ──

  const [inboxResult, sentResult, calResult, memories, summaries, connectedAccounts] = await Promise.all([
    authId
      ? gmailSearchTool(authId, { query: 'in:anywhere newer_than:1d', max_results: 20, time_zone: tz })
      : Promise.resolve({ results: [] as unknown[], count: 0 }),
    authId
      ? gmailSearchTool(authId, { query: 'in:sent newer_than:1d', max_results: 10, time_zone: tz })
      : Promise.resolve({ results: [] as unknown[], count: 0 }),
    authId
      ? liveCalendarLookup(authId, 'today', tz, undefined, undefined, 18)
      : Promise.resolve({ events: [] as CalEvent[] }),
    getActiveMemoryItems(user.handle, 30),
    user.bot_number
      ? getConversationSummaries(`DM#${user.bot_number}#${user.handle}`, 8, NEST_CONVERSATION_FILTER)
      : Promise.resolve([]),
    authId
      ? getConnectedAccounts(authId).catch(() => [])
      : Promise.resolve([]),
  ]);

  const connectedEmails = connectedAccounts.map(a => a.email).filter(Boolean);

  // ── Phase 2: build targeted RAG queries using actual calendar + email subjects ──

  const inboxRows = ((inboxResult as { results?: EmailRow[] }).results ?? []);
  const sentRows = ((sentResult as { results?: EmailRow[] }).results ?? []);
  const calEvents = (calResult.events ?? []) as CalEvent[];
  const importantInboxRows = inboxRows.filter((row) => scoreInboxRow(row) > 0);
  const inboxRowsForBrief = localContext.isWeekend
    ? importantInboxRows.filter((row) => scoreInboxRow(row) >= 2)
    : inboxRows;
  const importantInboxRowsForBrief = localContext.isWeekend
    ? inboxRowsForBrief
    : importantInboxRows;
  const routineInboxRows = inboxRows.filter((row) => scoreInboxRow(row) <= 0);

  const emailSubjects = [...inboxRows, ...sentRows].map(r => String(r.subject ?? '')).filter(Boolean);
  const ragQueries = buildTargetedRagQueries(calEvents, emailSubjects);

  // Run all RAG queries + weather + news in parallel
  const [ragResults, weather_snippet, news_snippet, weekend_local_suggestions_snippet] = await Promise.all([
    Promise.all(ragQueries.map(q => hybridSearch(user.handle, q, 6))),
    fetchWeatherBlock(weatherLabel),
    fetchInterestNews(extractInterests(user.deep_profile_snapshot), tz, user.name, weatherLabel, newsCountry),
    fetchWeekendLocalSuggestions({
      interests: extractInterests(user.deep_profile_snapshot),
      timezone: tz,
      locationLabel: weatherLabel,
      userName: user.name,
      isWeekend: localContext.isWeekend,
      isLikelyTravelling: situation?.isLikelyTravelling,
    }),
  ]);

  // ── Phase 3: format everything into rich snippets ──

  const inboxSnippet = inboxRowsForBrief.length ? buildRichEmailSnippet(inboxRowsForBrief) : '';
  const priorityInboxSnippet = importantInboxRowsForBrief.length ? buildRichEmailSnippet(importantInboxRowsForBrief) : '';
  const sentSnippet = sentRows.length ? buildRichEmailSnippet(sentRows) : '';
  const email_snippet = [
    inboxSnippet && `INBOX:\n${inboxSnippet}`,
    !localContext.isWeekend && sentSnippet && `SENT BY YOU (the user's own outgoing emails):\n${sentSnippet}`,
  ].filter(Boolean).join('\n\n') ||
    (localContext.isWeekend ? '' : ((inboxResult as { message?: string }).message ?? ''));

  const calendar_snippet = buildRichCalendarSnippet(calEvents);

  const memories_snippet = memories.length
    ? memories.map((m) => `- [${m.memoryType}/${m.category}] ${m.valueText}`).join('\n')
    : '';

  const now = new Date();
  function formatAge(isoDate: string): string {
    const d = new Date(isoDate);
    const diffMs = now.getTime() - d.getTime();
    const diffH = Math.floor(diffMs / 3600000);
    if (diffH < 1) return 'just now';
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD === 1) return 'yesterday';
    if (diffD < 7) return `${diffD} days ago`;
    return `${Math.floor(diffD / 7)} weeks ago`;
  }

  // Only surface open loops from conversations in the last 3 days
  const recentCutoff = new Date(now.getTime() - 3 * 24 * 3600000).toISOString();
  const recentSummaries = summaries.filter(s => s.lastMessageAt >= recentCutoff);
  const olderSummaries = summaries.filter(s => s.lastMessageAt < recentCutoff);

  const rawRecentOpenLoops = recentSummaries
    .flatMap(s => (s.openLoops ?? []))
    .filter(Boolean);
  const recentOpenLoops = localContext.isWeekend
    ? rawRecentOpenLoops.filter((loop) => classifyLoopText(loop) !== 'work')
    : rawRecentOpenLoops;

  const rawWorkOpenLoops = uniqueStrings([
    ...rawRecentOpenLoops.filter((loop) => classifyLoopText(loop) === 'work'),
    ...memories
      .filter((memory) => classifyLoopText(memory.valueText, memory.category, memory.memoryType) === 'work')
      .map((memory) => memory.valueText),
  ]).slice(0, 8);
  const workOpenLoops = filterWeekendWorkOpenLoops(rawWorkOpenLoops, localContext);

  const personalOpenLoops = uniqueStrings([
    ...recentOpenLoops.filter((loop) => classifyLoopText(loop) === 'personal'),
    ...memories
      .filter((memory) => classifyLoopText(memory.valueText, memory.category, memory.memoryType) === 'personal')
      .map((memory) => memory.valueText),
  ]).slice(0, 8);

  const safeToIgnoreParts: string[] = [];
  if (routineInboxRows.length >= 3) {
    safeToIgnoreParts.push(
      `The inbox is mostly routine operational traffic, around ${routineInboxRows.length} low-signal threads.`,
    );
  }
  if (calEvents.length === 0) {
    safeToIgnoreParts.push('Nothing time-bound is pressing on the calendar.');
  } else if (calEvents.length === 1 && importantInboxRows.length <= 1) {
    safeToIgnoreParts.push('The day is fairly light beyond the main scheduled item.');
  }
  if (routineInboxRows.length > importantInboxRows.length && importantInboxRows.length <= 1) {
    safeToIgnoreParts.push('Most of the new inbox movement can be treated as background rather than urgency.');
  }
  if (localContext.isWeekend && inboxRows.length > 0 && importantInboxRowsForBrief.length === 0) {
    safeToIgnoreParts.push('There is no urgent inbox signal for the weekend brief; do not turn this into an email digest.');
  }
  if (localContext.isWeekend && rawWorkOpenLoops.length > 0 && calEvents.length === 0 && importantInboxRows.length <= 1) {
    safeToIgnoreParts.push(
      `It is ${localContext.weekday}, so work background should not be treated as a weekend obligation unless something explicitly says it is due today.`,
    );
  }
  const safe_to_ignore_snippet = safeToIgnoreParts.join(' ');

  const day_shape = classifyDayShape({
    calendarEventCount: calEvents.length,
    importantInboxCount: importantInboxRowsForBrief.length,
    workOpenLoopCount: workOpenLoops.length,
    personalOpenLoopCount: personalOpenLoops.length,
  });

  const summaries_snippet = [
    ...(recentOpenLoops.length
      ? [`OPEN LOOPS (from last 3 days - these are timely and relevant):\n${recentOpenLoops.map(l => `- ${l}`).join('\n')}`]
      : []),
    ...(recentSummaries.length
      ? [`\nRECENT CONVERSATIONS (last 3 days - prioritise these):\n${recentSummaries.map(
          (s) => `- [${formatAge(s.lastMessageAt)}] ${s.summary.slice(0, 500)}`,
        ).join('\n')}`]
      : []),
    ...(olderSummaries.length
      ? [`\nOLDER CONVERSATIONS (for background only - do NOT lead with these):\n${olderSummaries.map(
          (s) => `- [${formatAge(s.lastMessageAt)}] ${s.summary.slice(0, 300)}`,
        ).join('\n')}`]
      : []),
  ].join('\n');

  const deep_profile_snippet = buildUserIdentityBlock(user, connectedEmails);

  const rag_snippet = ragResults
    .map((r, i) => r ? `[RAG query ${i + 1}: ${ragQueries[i]}]\n${r}` : '')
    .filter(Boolean)
    .join('\n\n');

  return {
    day_shape,
    calendar_event_count: calEvents.length,
    important_inbox_count: importantInboxRowsForBrief.length,
    local_context_snippet: [
      `Local date/time: ${localContext.localDateTime} (${localContext.timezone})`,
      `Day type: ${localContext.isWeekend ? 'weekend' : 'weekday'} (${localContext.weekday})`,
      weatherLabel ? `Weather location: ${weatherLabel}` : 'Weather location: unknown',
      situation?.travelInference
        ? `Calendar travel signal: ${situation.travelInference.eventTitle} -> ${situation.travelInference.destinationLabel} (${situation.travelInference.relation}, ${situation.travelInference.confidence} confidence)`
        : '',
      `News country: ${newsCountry}`,
    ].filter(Boolean).join('\n'),
    is_weekend: localContext.isWeekend,
    weather_location_label: weatherLabel,
    email_snippet,
    priority_inbox_snippet: priorityInboxSnippet,
    calendar_snippet,
    rag_snippet,
    memories_snippet,
    summaries_snippet,
    work_open_loops_snippet: workOpenLoops.length
      ? workOpenLoops.map((loop) => `- ${loop}`).join('\n')
      : '',
    personal_open_loops_snippet: personalOpenLoops.length
      ? personalOpenLoops.map((loop) => `- ${loop}`).join('\n')
      : '',
    weekend_local_suggestions_snippet,
    safe_to_ignore_snippet,
    weather_snippet,
    news_snippet,
    deep_profile_snippet,
  };
}

export async function runMorningBriefAudio(params: {
  handle: string;
  dryRun: boolean;
}): Promise<MorningBriefResult> {
  const { handle, dryRun } = params;

  const user = await loadMorningBriefUser(handle);
  if (!user) {
    return { ok: false, error: 'User not found' };
  }
  if (!user.auth_user_id) {
    return { ok: false, error: 'No auth_user_id — connect email/calendar first' };
  }

  const resolvedDisplayName = await resolveNameForAlerts(
    getAdminClient(),
    user.auth_user_id,
    user.name,
  );
  const spokenName = displayNameForAlerts(resolvedDisplayName || user.name);

  // Real-time situation snapshot — drives WHERE/WHEN framing across the brief.
  let situation: UserSituation | null = null;
  try {
    situation = await buildUserSituationContext({
      authUserId: user.auth_user_id,
      profile: {
        handle: user.handle,
        storedTimezone: user.timezone,
        contextProfile: user.context_profile,
      },
    });
  } catch (e) {
    console.warn('[morning-brief] buildUserSituationContext failed:', (e as Error).message);
  }

  const gathered = await gatherMorningBriefContext(user, situation);
  const briefTz = situation?.liveTimezone ?? user.timezone ?? 'Australia/Sydney';
  const script = await packageBriefWithLlm(spokenName || user.name, gathered, briefTz, situation);

  if (dryRun) {
    return { ok: true, dry_run: true, script, gathered };
  }

  if (!user.bot_number) {
    return { ok: false, error: 'User has no bot_number', script, gathered };
  }

  const audio = await synthesizeSpeechAudio(script.script_plain, MORNING_BRIEF_TTS_INSTRUCTIONS);
  const supabase = getAdminClient();
  const path = `${handle}/${Date.now()}.${audio.extension}`;
  const { error: upErr } = await supabase.storage.from('morning-brief-audio').upload(path, audio.bytes, {
    contentType: audio.contentType,
    upsert: true,
  });
  if (upErr) {
    return { ok: false, error: `Storage upload failed: ${upErr.message}`, script, gathered };
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from('morning-brief-audio')
    .createSignedUrl(path, 72 * 3600);
  if (signErr || !signed?.signedUrl) {
    return { ok: false, error: `Signed URL failed: ${signErr?.message ?? 'unknown'}`, script, gathered };
  }

  let chatId = await resolveChatId(handle);
  if (!chatId) {
    const created = await createChat(user.bot_number, [handle], CREATE_CHAT_INVISIBLE_PLACEHOLDER);
    chatId = created.chat.id;
    const vmRes = await sendVoiceMemo(chatId, signed.signedUrl);
    const briefContext = `[Nest sent a voice memo — daily brief. The user heard this spoken aloud and may reply to it. Here is what Nest said in the voice memo:]\n\n${script.script_plain}\n\n[End of voice memo. If the user responds, they are replying to this brief. Use it as context — reference specific things mentioned, answer follow-up questions, and offer to dig deeper on any topic covered.]`;
    try {
      await addMessage(chatId, 'assistant', briefContext);
    } catch {
      /* non-fatal */
    }
    return {
      ok: true,
      script,
      signed_audio_url: signed.signedUrl,
      storage_path: path,
      linq_message_id: vmRes.voice_memo?.id,
      chat_id: chatId,
      gathered,
    };
  }

  const vmRes = await sendVoiceMemo(chatId, signed.signedUrl);

  const briefContext = `[Nest sent a voice memo — daily brief. The user heard this spoken aloud and may reply to it. Here is what Nest said in the voice memo:]\n\n${script.script_plain}\n\n[End of voice memo. If the user responds, they are replying to this brief. Use it as context — reference specific things mentioned, answer follow-up questions, and offer to dig deeper on any topic covered.]`;
  try {
    await addMessage(chatId, 'assistant', briefContext);
  } catch {
    /* non-fatal */
  }

  return {
    ok: true,
    script,
    signed_audio_url: signed.signedUrl,
    storage_path: path,
    linq_message_id: vmRes.voice_memo?.id,
    chat_id: chatId,
    gathered,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Advanced Midday + Evening briefs — gpt-5.4 reasoning, prior-brief continuity,
// deep semantic search, voice memo via shared Gemini TTS pipeline.
// ════════════════════════════════════════════════════════════════════════════

export type AdvancedBriefKind = 'midday' | 'evening';

const ADVANCED_BRIEF_TARGET_WORDS = 320;
const ADVANCED_BRIEF_MAX_WORDS = 380;

const BRIEF_TYPE_KEYS: Record<AdvancedBriefKind, string> = {
  midday: 'midday_briefing',
  evening: 'evening_briefing',
};

interface PriorBriefRecord {
  type: 'morning' | 'midday' | 'evening';
  sentAt: string;
  hoursAgo: number;
  scriptPlain: string;
}

/**
 * Pull prior briefs (morning/midday/evening) for the same handle in the last 24h.
 * Used so each new brief explicitly references what was said earlier in the day,
 * builds on it, and surfaces what's actually changed since.
 */
async function getRecentBriefScripts(handle: string, hoursBack = 24): Promise<PriorBriefRecord[]> {
  const supabase = getAdminClient();
  const cutoff = new Date(Date.now() - hoursBack * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('automation_runs')
    .select('automation_type, content, sent_at, metadata')
    .eq('handle', handle)
    .in('automation_type', ['morning_briefing', 'midday_briefing', 'evening_briefing'])
    .gt('sent_at', cutoff)
    .order('sent_at', { ascending: true });
  if (error) {
    console.warn('[advanced-brief] getRecentBriefScripts failed:', error.message);
    return [];
  }
  const now = Date.now();
  return ((data ?? []) as Array<{ automation_type: string; content: string; sent_at: string; metadata?: Record<string, unknown> }>)
    .map((row) => {
      const t = row.automation_type === 'morning_briefing'
        ? 'morning'
        : row.automation_type === 'midday_briefing'
          ? 'midday'
          : 'evening';
      const sentAt = row.sent_at;
      const hoursAgo = Math.max(0, Math.round((now - new Date(sentAt).getTime()) / 3600000 * 10) / 10);
      // Prefer companion_text if content was a placeholder; default to content.
      const meta = row.metadata ?? {};
      const fromMeta = typeof meta.script_plain === 'string' ? meta.script_plain : '';
      const scriptPlain = (row.content?.startsWith('[voice memo')
        ? fromMeta
        : (row.content || fromMeta)).trim();
      return scriptPlain ? { type: t as PriorBriefRecord['type'], sentAt, hoursAgo, scriptPlain } : null;
    })
    .filter((r): r is PriorBriefRecord => r !== null);
}

function formatPriorBriefs(prior: PriorBriefRecord[]): string {
  if (prior.length === 0) return '(No prior briefs in the last 24 hours.)';
  return prior
    .map((p) => `[${p.type.toUpperCase()} brief, ${p.hoursAgo}h ago at ${p.sentAt}]\n${p.scriptPlain}`)
    .join('\n\n');
}

/**
 * Pull the user's most recent inbox + sent emails over a configurable window.
 * Used by midday/evening briefs to detect "what arrived since the morning brief"
 * and "what's still unanswered after a full day".
 */
interface AdvancedEmailContext {
  inboxRows: EmailRow[];
  sentRows: EmailRow[];
  sinceMorningRows: EmailRow[];
  untouchedThreads: EmailRow[];
}

async function gatherAdvancedEmailContext(
  authUserId: string,
  tz: string,
  morningBriefSentAt: string | null,
): Promise<AdvancedEmailContext> {
  const [inboxRes, sentRes] = await Promise.all([
    gmailSearchTool(authUserId, {
      query: 'in:inbox newer_than:2d -in:spam -in:trash',
      max_results: 25,
      time_zone: tz,
    }),
    gmailSearchTool(authUserId, {
      query: 'in:sent newer_than:2d',
      max_results: 20,
      time_zone: tz,
    }),
  ]);

  const inboxRows = ((inboxRes as { results?: EmailRow[] }).results ?? []);
  const sentRows = ((sentRes as { results?: EmailRow[] }).results ?? []);

  const morningCutoffMs = morningBriefSentAt ? new Date(morningBriefSentAt).getTime() : 0;
  const sinceMorningRows = morningCutoffMs > 0
    ? inboxRows.filter((r) => {
      const d = r.date ? new Date(String(r.date)).getTime() : 0;
      return d >= morningCutoffMs;
    })
    : inboxRows.slice(0, 12);

  // Untouched: inbox threads where the user has NOT sent a reply in the same thread today.
  const sentThreadKeys = new Set(
    sentRows.map((r) => String(r.thread_id ?? r.subject ?? '').toLowerCase().trim()).filter(Boolean),
  );
  const untouchedThreads = inboxRows.filter((r) => {
    const key = String(r.thread_id ?? r.subject ?? '').toLowerCase().trim();
    if (!key) return false;
    return !sentThreadKeys.has(key);
  });

  return { inboxRows, sentRows, sinceMorningRows, untouchedThreads };
}

interface AdvancedBriefGathered extends MorningBriefGathered {
  // Adds:
  prior_briefs_snippet: string;
  prior_brief_count: number;
  since_morning_email_snippet: string;
  untouched_threads_snippet: string;
  tomorrow_calendar_snippet: string;  // evening only
  this_afternoon_calendar_snippet: string; // midday only
  semantic_thread_context: string;
  brief_kind: AdvancedBriefKind;
  user_local_time: string;
}

async function gatherAdvancedBriefContext(
  user: MorningBriefUserRow,
  kind: AdvancedBriefKind,
  situation?: UserSituation | null,
): Promise<AdvancedBriefGathered> {
  const tz = situation?.liveTimezone ?? user.timezone ?? 'Australia/Sydney';
  const authId = user.auth_user_id;

  // Run morning brief gathering first (gives us calendar, weather, news, RAG, etc.)
  // and prior briefs in parallel.
  const [base, priorBriefs] = await Promise.all([
    gatherMorningBriefContext(user, situation),
    getRecentBriefScripts(user.handle, 24),
  ]);

  const morningBrief = priorBriefs.find((p) => p.type === 'morning');
  const morningSentAt = morningBrief?.sentAt ?? null;

  // Advanced email context — only meaningful with a connected account.
  const advancedEmail = authId
    ? await gatherAdvancedEmailContext(authId, tz, morningSentAt)
    : { inboxRows: [], sentRows: [], sinceMorningRows: [], untouchedThreads: [] };

  // Tomorrow + this-afternoon calendar — one extra calendar lookup per brief kind.
  let tomorrowCalSnippet = '';
  let thisAfternoonCalSnippet = '';
  if (authId && kind === 'evening') {
    try {
      const result = await liveCalendarLookup(authId, 'tomorrow', tz, undefined, undefined, 18);
      tomorrowCalSnippet = buildRichCalendarSnippet((result.events ?? []) as CalEvent[]);
    } catch (e) {
      tomorrowCalSnippet = `(Tomorrow calendar lookup failed: ${(e as Error).message})`;
    }
  }
  if (authId && kind === 'midday') {
    try {
      // "rest of today" — calendar already has today; we'll let the LLM reason over base.calendar_snippet.
      // This block is reserved for future hourly windowing.
      thisAfternoonCalSnippet = '';
    } catch {
      thisAfternoonCalSnippet = '';
    }
  }

  // Semantic thread context — pull deep history for top open / untouched email subjects.
  let semanticThreadContext = '';
  try {
    const subjectsForSearch = (kind === 'midday'
      ? advancedEmail.sinceMorningRows
      : advancedEmail.untouchedThreads
    )
      .map((r) => String(r.subject ?? '').replace(/^(re:|fwd:)\s*/i, '').trim())
      .filter((s) => s.length > 4)
      .slice(0, 4);

    if (subjectsForSearch.length > 0) {
      const semanticQuery =
        kind === 'midday'
          ? `Background and prior history for these email threads that arrived this morning: ${subjectsForSearch.join('; ')}`
          : `Background and prior history for these inbox threads still unanswered: ${subjectsForSearch.join('; ')}`;
      semanticThreadContext = await hybridSearch(user.handle, semanticQuery, 6);
    }
  } catch (e) {
    semanticThreadContext = `(Semantic thread context failed: ${(e as Error).message})`;
  }

  const sinceMorningSnippet = advancedEmail.sinceMorningRows.length
    ? buildRichEmailSnippet(advancedEmail.sinceMorningRows)
    : '';
  const untouchedSnippet = advancedEmail.untouchedThreads.length
    ? buildRichEmailSnippet(advancedEmail.untouchedThreads)
    : '';

  const userLocalTime = buildDateTimeContext(tz);

  return {
    ...base,
    prior_briefs_snippet: formatPriorBriefs(priorBriefs),
    prior_brief_count: priorBriefs.length,
    since_morning_email_snippet: sinceMorningSnippet,
    untouched_threads_snippet: untouchedSnippet,
    tomorrow_calendar_snippet: tomorrowCalSnippet,
    this_afternoon_calendar_snippet: thisAfternoonCalSnippet,
    semantic_thread_context: semanticThreadContext,
    brief_kind: kind,
    user_local_time: userLocalTime,
  };
}

// ── Per-kind packager system prompts ──────────────────────────────

const ADVANCED_BRIEF_BASE_VOICE = `You are Nest, the user's exceptional human executive assistant, sending a private spoken voice memo.

You are not a summariser, not a calendar reader, not a newsreader. You are a sharp, warm, emotionally intelligent EA whose job is to make the user feel clear, calm, and accurately informed.

Identity & attribution:
- You are speaking DIRECTLY to the user. Never refer to them in third person.
- Always address them by their first name in the opening line. If no first name is available, use a warm greeting without a placeholder.
- Emails sent from the user's own connected addresses are actions the user has already taken — say "you sent", "you replied".
- Emails received from others are incoming — say "Alex got back to you", "there's a note from Sarah".

Continuity (CRITICAL for this brief):
- The PRIOR BRIEFS block contains what you (Nest) already told the user earlier today. Build on it explicitly. Reference what was said this morning ("this morning I flagged X — it's still sitting there", "the Sarah thread you mentioned at midday has now landed").
- Do NOT repeat morning content verbatim. The user already heard it. Your job is to advance the picture, not restart it.
- If something you flagged earlier has been resolved, acknowledge it. If something you predicted didn't happen, note it briefly.

Decision rules:
- Prioritise signal over volume. Use the inbox, calendar, semantic context, prior briefs, and memories — not all of them in every brief.
- Only mention news if it's genuinely relevant to the user's interests AND the day. If nothing fits, don't mention news at all. Never pad.
- If the day is light, say so plainly. If chopped up or pressured, say that. If a thread is genuinely awkward or politically sensitive, acknowledge it with tact.
- Be more informative than instructive. Avoid coaching language ("you should", "I'd treat this as", "try to") unless there's a concrete timing or risk issue.
- If LOCAL DAY CONTEXT says Saturday or Sunday, do not treat it as a standard workday. Work only belongs if today's calendar, new email, or prior brief makes it explicitly active today.

Style:
- Sound like an outstanding human EA: warm, composed, perceptive, calm, confident, never corporate, never gushy.
- Australian English. Contractions. Vary sentence length. Clean spoken prose.
- Use natural pauses. Sprinkle real spoken hesitations — "um", "ummm", "hmm", "hmmm", "ahh" — and ellipses ("...") roughly once every three to five sentences. Mix them. They should feel incidental, not performed.
- No markdown. No emojis. No em dashes. No bullet points. No SSML. No bracketed delivery cues.
- Do not say "I pulled this together from your inbox" or mention source material. Do not narrate your reasoning.

Output format — return ONLY valid JSON with exactly these keys:
{"script_plain":"...","companion_text":"..."}

companion_text is a short iMessage sent alongside the audio: lock-screen cautious, plain text, one to three short lines, gives the gist without exposing sensitive detail.`;

const MIDDAY_BRIEF_SYSTEM = `${ADVANCED_BRIEF_BASE_VOICE}

You are writing the MIDDAY BRIEF.

Objective: bridge the morning's setup to the rest of the day. The user has lived through the morning. Tell them what's actually shifted, what arrived, what's still untouched, and what genuinely needs attention before end of day. This is not a status report — it's a sharp midday read.

What to use (in priority order):
1. PRIOR BRIEFS — explicitly reference what was said this morning. Build on it.
2. SINCE-MORNING EMAILS — emails that landed after the morning brief was sent. These are the freshest signal.
3. UNTOUCHED THREADS — inbox threads where the user has NOT yet replied. These are obligations or items you flagged earlier that are still open.
4. TODAY'S REMAINING CALENDAR — afternoon and evening events from the calendar snippet.
5. SEMANTIC THREAD CONTEXT — deep prior context on the most important active threads.
6. Background memories, deep profile, weather change if dramatic.

Structure (around 250 to 320 words, hard ceiling 380):
- Opening: warm midday greeting using first name. Short read on how the day is shaping up vs the morning prediction. ("Hey Tom, hope the morning's gone alright. The day's tracking pretty close to plan, but, ahh, a couple of new things have landed.")
- Core: 2-4 paragraphs, interpretive — what arrived, what's still hanging, what's worth getting in front of this afternoon. Connect threads. Surface friction or interpersonal nuance. Reference the morning brief specifically when something has changed.
- Close: a calm forward-looking line for the rest of the day. Warm sign-off in the spirit of "I'll catch you again this evening" or "Holler if you need anything before then".

Things to AVOID:
- Restating the morning brief.
- Manufacturing news. Skip news if nothing is genuinely relevant.
- Listing every email. Interpret, don't enumerate.
- Coaching language unless there's a hard deadline or risk.`;

const EVENING_BRIEF_SYSTEM = `${ADVANCED_BRIEF_BASE_VOICE}

You are writing the EVENING BRIEF.

Objective: a thoughtful end-of-day wrap that helps the user switch off cleanly and walk into tomorrow oriented. Reference the morning AND midday briefs explicitly. What landed, what slipped, what's still hot, and what's queued for tomorrow.

What to use (in priority order):
1. PRIOR BRIEFS — explicit references to morning and midday. ("This morning I mentioned X — looks like it landed", "At midday we flagged Y — still no reply".)
2. UNTOUCHED THREADS — what's still unanswered after a full day. The honest list of obligations rolling into tomorrow.
3. TOMORROW'S CALENDAR — surface what's coming up, especially anything that needs prep tonight.
4. SEMANTIC THREAD CONTEXT — deep history for any thread that needs attention before tomorrow.
5. SENT-TODAY EMAILS — what the user actioned today (acknowledge their work).
6. Background memories, deep profile, news only if genuinely relevant to tomorrow.

Structure (around 260 to 340 words, hard ceiling 380):
- Opening: warm evening greeting using first name. Honest read on how the day went vs the morning shape. ("Evening Tom. Mostly a steady one today, ahh, except for that pricing thread which dragged on a bit longer than expected.")
- Body — what closed, what's still open, what tomorrow needs from them tonight. 2-4 paragraphs. Be specific. Reference earlier briefs when something has progressed or stalled.
- Tomorrow look-ahead: brief, oriented to actual events. If there's something that needs prep tonight (a deck, a reply, a doc), call it out clearly but without coaching.
- Close: calm sign-off in the spirit of "Have a good evening, I'm here if you need anything" or "Catch you in the morning". Genuine, brief.

Things to AVOID:
- Generic "you had a great day" warmth. Be specific.
- Cheesy motivation, "you've got this", "tomorrow is a fresh start".
- Restating earlier briefs. Build forward.
- News unless it's genuinely relevant to the user or tomorrow.`;

function buildAdvancedBriefUserMessage(
  user: MorningBriefUserRow,
  gathered: AdvancedBriefGathered,
  spokenName: string | null,
  situation?: UserSituation | null,
): string {
  const first = (spokenName ?? user.name ?? '').trim().split(/\s+/)[0] ?? '';
  const tz = situation?.liveTimezone ?? user.timezone ?? 'Australia/Sydney';
  const dt = buildDateTimeContext(tz);
  const kindLabel = gathered.brief_kind === 'midday' ? 'MIDDAY BRIEF' : 'EVENING BRIEF';

  const tomorrowBlock = gathered.brief_kind === 'evening'
    ? `\n=== TOMORROW'S CALENDAR ===\n${gathered.tomorrow_calendar_snippet || '(no events on tomorrow yet)'}\n`
    : '';

  const situationBlock = situation?.promptBlock ? `\n${situation.promptBlock}\n\n` : '';

  return `${kindLabel}

Current date/time: ${dt}
User local time: ${gathered.user_local_time}
${situationBlock}=== USER IDENTITY ===
${gathered.deep_profile_snippet || `Name: ${first || 'unknown'}`}

=== REQUIRED GREETING NAME ===
${first || '(none available)'}

=== DAY SHAPE (from morning) ===
${gathered.day_shape}

=== LOCAL DAY CONTEXT ===
${gathered.local_context_snippet}

=== PRIOR BRIEFS (what you already said earlier today — build on these) ===
${gathered.prior_briefs_snippet}

=== TODAY'S CALENDAR (full day) ===
${gathered.calendar_snippet || '(no events today)'}
${tomorrowBlock}
=== EMAILS THAT LANDED SINCE THE MORNING BRIEF ===
${gathered.since_morning_email_snippet || '(no new emails since morning)'}

=== UNTOUCHED INBOX THREADS (no reply from the user yet) ===
${gathered.untouched_threads_snippet || '(nothing untouched of note)'}

=== IMPORTANT INBOX (last 24h, scored) ===
${gathered.priority_inbox_snippet || '(no important inbox signal)'}

=== SENT BY THE USER (last 24h) — these are actions the user has taken ===
${gathered.email_snippet || '(no sent context)'}

=== SEMANTIC THREAD CONTEXT (deeper prior history on active threads) ===
${gathered.semantic_thread_context || '(no deep history surfaced)'}

=== OPEN LOOPS & RECENT CONVERSATIONS ===
${gathered.summaries_snippet || '(no recent conversation context)'}

=== WORK OPEN LOOPS ===
${gathered.work_open_loops_snippet || '(no meaningful work open loops)'}

=== PERSONAL / ADMIN OPEN LOOPS ===
${gathered.personal_open_loops_snippet || '(no meaningful personal or admin open loops)'}

=== BACKGROUND CONTEXT ===
${gathered.rag_snippet || '(no relevant background)'}

=== ACTIVE MEMORIES ===
${gathered.memories_snippet || '(no active memories)'}

=== WEATHER ===
${gathered.weather_snippet}

=== NEWS (only mention if genuinely relevant; skip otherwise) ===
${gathered.news_snippet}
`;
}

async function packageAdvancedBriefWithLlm(
  user: MorningBriefUserRow,
  gathered: AdvancedBriefGathered,
  spokenName: string | null,
  situation?: UserSituation | null,
): Promise<MorningBriefScript> {
  const systemPrompt = gathered.brief_kind === 'midday'
    ? MIDDAY_BRIEF_SYSTEM
    : EVENING_BRIEF_SYSTEM;

  const userMessage = buildAdvancedBriefUserMessage(user, gathered, spokenName, situation);

  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: MODEL_MAP.agent,
    instructions: systemPrompt,
    input: userMessage,
    max_output_tokens: 3500,
    store: false,
    prompt_cache_key: `nest-advanced-brief-${gathered.brief_kind}`,
    reasoning: { effort: 'medium' },
  } as Parameters<typeof client.responses.create>[0]);

  const raw = getResponseText(response).trim();
  let parsed: { script_plain?: string; companion_text?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    parsed = JSON.parse(cleaned);
  }
  const script_plain = (parsed.script_plain ?? '').replace(/\u2014/g, '-').trim();
  const companion_text = (parsed.companion_text ?? '').replace(/\u2014/g, '-').trim();
  if (!script_plain || script_plain.length < 60) {
    throw new Error(`Advanced brief packager (${gathered.brief_kind}) returned empty/too short script`);
  }
  let packaged: MorningBriefScript = {
    script_plain,
    companion_text,
    word_count: countWords(script_plain),
  };

  // Soft enforcement of the word ceiling — if over, ask the same model to tighten.
  if (packaged.word_count > ADVANCED_BRIEF_MAX_WORDS) {
    try {
      const tightenResp = await client.responses.create({
        model: MODEL_MAP.agent,
        instructions:
          `You are tightening a Nest ${gathered.brief_kind} brief. Keep the same voice, references, and continuity to prior briefs. ` +
          `Maximum ${ADVANCED_BRIEF_MAX_WORDS} words. Australian English. Return ONLY valid JSON: {"script_plain":"...","companion_text":"..."}`,
        input: JSON.stringify(packaged),
        max_output_tokens: 2000,
        store: false,
        prompt_cache_key: `nest-advanced-brief-tighten-${gathered.brief_kind}`,
        reasoning: { effort: 'low' },
      } as Parameters<typeof client.responses.create>[0]);
      const rawT = getResponseText(tightenResp).trim();
      const cleanedT = rawT.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsedT = JSON.parse(cleanedT) as { script_plain?: string; companion_text?: string };
      const sp = (parsedT.script_plain ?? packaged.script_plain).replace(/\u2014/g, '-').trim();
      const ct = (parsedT.companion_text ?? packaged.companion_text).replace(/\u2014/g, '-').trim();
      packaged = { script_plain: sp, companion_text: ct, word_count: countWords(sp) };
    } catch (e) {
      console.warn(`[advanced-brief] tighten failed:`, (e as Error).message);
    }
  }

  return packaged;
}

// ════════════════════════════════════════════════════════════════════════════
// Welcome Brief — first-touch personalised voice memo immediately after a
// user connects Gmail/Outlook for the first time.
// gpt-5.4 reasoning HIGH; reads last ~100 emails (50 inbox + 50 sent) to
// model the user fast, then renders a short, warm, contextual voice intro.
// ════════════════════════════════════════════════════════════════════════════

const WELCOME_BRIEF_TARGET_WORDS = 140;
const WELCOME_BRIEF_MAX_WORDS = 170;

interface WelcomeEmailContext {
  inboxRows: EmailRow[];
  sentRows: EmailRow[];
}

async function gatherWelcomeEmailContext(
  authUserId: string,
  tz: string,
): Promise<WelcomeEmailContext> {
  // Pull a generous window so we get ~50 inbox + ~50 sent. Caps at 50/query.
  // We accept fewer if the user is new — the model is fine reasoning over less.
  const [inboxRes, sentRes] = await Promise.all([
    gmailSearchTool(authUserId, {
      query: 'in:inbox newer_than:60d -in:spam -in:trash',
      max_results: 50,
      time_zone: tz,
    }),
    gmailSearchTool(authUserId, {
      query: 'in:sent newer_than:60d',
      max_results: 50,
      time_zone: tz,
    }),
  ]);

  return {
    inboxRows: ((inboxRes as { results?: EmailRow[] }).results ?? []),
    sentRows: ((sentRes as { results?: EmailRow[] }).results ?? []),
  };
}

function formatWelcomeEmailRows(rows: EmailRow[], label: string): string {
  if (!rows.length) return `${label}: (none in last 60 days)`;
  const lines = rows.slice(0, 50).map((row) => {
    const partyRaw = label === 'Sent' ? row.to : row.from;
    const party = String(partyRaw ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const subject = String(row.subject ?? '').replace(/\s+/g, ' ').trim().slice(0, 110);
    const snippet = String(row.body_preview ?? row.snippet ?? '').replace(/\s+/g, ' ').trim().slice(0, 220);
    const time = String(row.date ?? '').slice(0, 32);
    return `- [${time}] ${party} | ${subject}${snippet ? `\n  ${snippet}` : ''}`;
  });
  return `${label} (${rows.length}):\n${lines.join('\n')}`;
}

const WELCOME_BRIEF_SYSTEM = `You are Nest, a warm, sharp, emotionally intelligent personal assistant. The user has JUST connected their email for the first time. They have NEVER messaged Nest before. They have ZERO context on what Nest is, what it does, or why they should care.

You are writing the very first voice memo Nest will ever send them. The single most important job: in under two minutes, leave them thinking "oh — I want this in my life."

Required structure (in order, no exceptions):

1. GREETING (one short sentence)
   - "Hey <FirstName>, welcome to Nest." Use the first name from the REQUIRED GREETING NAME section. If none available, "Hey, welcome to Nest." Never use a placeholder.

2. WHAT NEST IS (2-3 short sentences, in plain spoken English — this is the user's first ever explanation)
   - Frame Nest as their personal assistant they text on iMessage — like having a sharp human EA in their pocket, available 24/7.
   - Tell them they can just text or send voice notes like this one. Then weave in a NATURAL spread of what Nest can do — never as a bulleted feature list, always as conversational verbs. Pick 5-7 capabilities to mention, varied across categories so it feels like a real EA describing themselves, not a brochure:
     • Productivity: read your email and calendar, draft replies, manage events, set reminders and nudges
     • Sense-making: summarise your day, surface what actually needs your attention, remember the things that matter
     • In-the-moment help: search the web, check the news, weather, directions and travel time, look up places nearby
     • Conversational: chat about life, talk things through, sound something out, brainstorm
   - The mix should feel useful and human-broad, not technical. Vary the wording every single time — never sound like marketing copy. NEVER read it back as a list.

3. WHY IT'LL MATTER FOR THEM SPECIFICALLY (the wow moment — 2-4 sentences)
   - Show you've already read their world. Reference ONE specific, true, non-trivial observation grounded in the inbox + sent mail below. Not a generic "looks busy".
   - Then frame what Nest will be most useful for given THAT picture — e.g. someone whose sent mail is mostly partner logistics → "keeping the moving pieces straight across all those threads"; someone with hot deal threads → "tracking the ones genuinely moving"; etc.
   - Make this beat feel like a teaser of what daily life with Nest will be like, not a status update.

4. CALM CLOSING INVITATION (one short sentence)
   - In the spirit of "just text me anytime, I'll learn your rhythm as we go". Vary the wording.

Hard rules:
- Length: roughly 130 to 160 words. Hard ceiling 170. This is a first impression, not an essay.
- Australian English. Spoken prose. Contractions. Vary sentence length.
- Use natural pauses. Sprinkle "um", "ahh", "hmm" or ellipses ("...") roughly twice across the memo, as a real person would. Don't repeat the same one. They should feel incidental, not performed.
- Do NOT dump a feature list. Mention capabilities only as natural verbs woven into a sentence ("read your email, draft replies"), never as a bulleted-feeling rattle-off.
- Do NOT mention emails one by one. Synthesise.
- Do NOT invent. If the inbox is mostly noise or no clear pattern emerges, soften: "still getting a feel for things, but already I can see you spend a lot of time on…"
- NEVER say "I pulled this from your inbox", "based on what I see", or mention source material.
- No markdown, no emojis, no em dashes, no bullets, no SSML, no bracketed cues.

Reasoning approach (do this thoroughly before writing — you have reasoning=high):
- Identify the user's likely role / line of work from sender domains, signatures, recurring company names, and the things they're sending OUT (sent mail is the strongest signal — that's their voice and their priorities).
- Identify the 1-2 most active relationships, projects, or recurring themes.
- Identify what kind of help would actually move the needle for THIS person.
- Pick ONE specific, true thing to mention. Make sure it could ONLY be true for them.

Output format — return ONLY valid JSON with exactly these keys:
{"script_plain":"...","companion_text":"..."}

companion_text is a short iMessage sent right before the audio. Lock-screen cautious, plain text, one short line that primes them to listen — e.g. "Welcome to Nest — quick voice intro for you." Vary the wording.`;

function buildWelcomeBriefUserMessage(
  user: MorningBriefUserRow,
  spokenName: string | null,
  ctx: WelcomeEmailContext,
  primaryEmail: string | null,
  situation?: UserSituation | null,
): string {
  const first = (spokenName ?? user.name ?? '').trim().split(/\s+/)[0] ?? '';
  const tz = situation?.liveTimezone ?? user.timezone ?? 'Australia/Sydney';
  const dt = buildDateTimeContext(tz);
  const totalEmails = ctx.inboxRows.length + ctx.sentRows.length;
  const situationBlock = situation?.promptBlock ? `\n${situation.promptBlock}\n\n` : '';

  return `WELCOME BRIEF — first voice memo immediately after Gmail/Outlook connect. The user has NEVER messaged Nest before. They have ZERO prior context.

Current date/time: ${dt}
${situationBlock}=== REQUIRED GREETING NAME ===
${first || '(none available — open without a name)'}

=== USER ===
Phone: ${user.handle}
Connected email: ${primaryEmail || '(unknown)'}
Timezone: ${tz}
Total emails seen for this brief: ${totalEmails}

=== USER'S 50 MOST RECENT INBOX EMAILS (last 60 days) ===
${formatWelcomeEmailRows(ctx.inboxRows, 'Inbox')}

=== USER'S 50 MOST RECENT SENT EMAILS (last 60 days — strongest signal of voice + priorities) ===
${formatWelcomeEmailRows(ctx.sentRows, 'Sent')}

Required structure: greeting → what Nest is (two sentences, this is their first explanation ever) → ONE specific personalised observation + how Nest will be useful for them → calm warm invitation. ~130-160 words. Hard ceiling 170.`;
}

async function packageWelcomeBriefWithLlm(
  user: MorningBriefUserRow,
  spokenName: string | null,
  ctx: WelcomeEmailContext,
  primaryEmail: string | null,
  situation?: UserSituation | null,
): Promise<MorningBriefScript> {
  const userMessage = buildWelcomeBriefUserMessage(user, spokenName, ctx, primaryEmail, situation);

  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: MODEL_MAP.agent,
    instructions: WELCOME_BRIEF_SYSTEM,
    input: userMessage,
    max_output_tokens: 4500,
    store: false,
    prompt_cache_key: 'nest-welcome-brief',
    reasoning: { effort: 'high' },
  } as Parameters<typeof client.responses.create>[0]);

  const raw = getResponseText(response).trim();
  let parsed: { script_plain?: string; companion_text?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    parsed = JSON.parse(cleaned);
  }
  const script_plain = (parsed.script_plain ?? '').replace(/\u2014/g, '-').trim();
  const companion_text = (parsed.companion_text ?? 'Welcome — quick voice note for you.').replace(/\u2014/g, '-').trim();
  if (!script_plain || script_plain.length < 60) {
    throw new Error('Welcome brief packager returned empty/too short script');
  }
  let packaged: MorningBriefScript = {
    script_plain,
    companion_text,
    word_count: countWords(script_plain),
  };

  if (packaged.word_count > WELCOME_BRIEF_MAX_WORDS) {
    try {
      const tightenResp = await client.responses.create({
        model: MODEL_MAP.agent,
        instructions:
          `You are tightening Nest's first voice memo to a new user. Keep the warmth, the specific personalised observation, and the calm one-line invitation. ` +
          `Keep the opener "Hey <name>, welcome to Nest." intact. ` +
          `Maximum ${WELCOME_BRIEF_MAX_WORDS} words. Australian English. Return ONLY valid JSON: {"script_plain":"...","companion_text":"..."}`,
        input: JSON.stringify(packaged),
        max_output_tokens: 1500,
        store: false,
        prompt_cache_key: 'nest-welcome-brief-tighten',
        reasoning: { effort: 'low' },
      } as Parameters<typeof client.responses.create>[0]);
      const rawT = getResponseText(tightenResp).trim();
      const cleanedT = rawT.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsedT = JSON.parse(cleanedT) as { script_plain?: string; companion_text?: string };
      const sp = (parsedT.script_plain ?? packaged.script_plain).replace(/\u2014/g, '-').trim();
      const ct = (parsedT.companion_text ?? packaged.companion_text).replace(/\u2014/g, '-').trim();
      packaged = { script_plain: sp, companion_text: ct, word_count: countWords(sp) };
    } catch (e) {
      console.warn(`[welcome-brief] tighten failed:`, (e as Error).message);
    }
  }

  return packaged;
}

/**
 * Build and send the first-touch welcome voice memo.
 * - Loads user, pulls 50 inbox + 50 sent emails (last 60 days).
 * - GPT-5.4 reasoning high → contextual welcome script (~80-120 words).
 * - Synthesises via Gemini Aoede TTS, uploads, sends voice memo via Linq.
 * - Stores the script under `automation_runs.metadata.script_plain` so future
 *   briefs can reference it as continuity.
 */
export async function runWelcomeBriefAudio(params: {
  handle: string;
  primaryEmail?: string | null;
  dryRun?: boolean;
}): Promise<MorningBriefResult> {
  const { handle } = params;
  const dryRun = params.dryRun === true;

  const user = await loadMorningBriefUser(handle);
  if (!user) return { ok: false, error: 'User not found' };
  if (!user.auth_user_id) {
    return { ok: false, error: 'No auth_user_id — connect email first' };
  }

  const tz = user.timezone || 'Australia/Sydney';
  const resolvedDisplayName = await resolveNameForAlerts(
    getAdminClient(),
    user.auth_user_id,
    user.name,
  );
  const spokenName = displayNameForAlerts(resolvedDisplayName || user.name);

  let primaryEmail = params.primaryEmail ?? null;
  if (!primaryEmail) {
    try {
      const accounts = await getConnectedAccounts(user.auth_user_id);
      const primary = accounts.find((a) => a.isPrimary) ?? accounts[0];
      primaryEmail = primary?.email ?? null;
    } catch {
      // best-effort
    }
  }

  const emailCtx = await gatherWelcomeEmailContext(user.auth_user_id, tz);
  let situation: UserSituation | null = null;
  try {
    situation = await buildUserSituationContext({
      authUserId: user.auth_user_id,
      profile: { handle: user.handle, storedTimezone: user.timezone, contextProfile: user.context_profile },
    });
  } catch (e) {
    console.warn('[welcome-brief] buildUserSituationContext failed:', (e as Error).message);
  }

  const script = await packageWelcomeBriefWithLlm(user, spokenName || user.name, emailCtx, primaryEmail, situation);

  if (dryRun) {
    return { ok: true, dry_run: true, script };
  }
  if (!user.bot_number) {
    return { ok: false, error: 'User has no bot_number', script };
  }

  const audio = await synthesizeSpeechAudio(script.script_plain, MORNING_BRIEF_TTS_INSTRUCTIONS);
  const supabase = getAdminClient();
  const path = `${handle}/welcome/${Date.now()}.${audio.extension}`;
  const { error: upErr } = await supabase.storage
    .from('morning-brief-audio')
    .upload(path, audio.bytes, { contentType: audio.contentType, upsert: true });
  if (upErr) {
    return { ok: false, error: `Storage upload failed: ${upErr.message}`, script };
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from('morning-brief-audio')
    .createSignedUrl(path, 72 * 3600);
  if (signErr || !signed?.signedUrl) {
    return { ok: false, error: `Signed URL failed: ${signErr?.message ?? 'unknown'}`, script };
  }

  let chatId = await resolveChatId(handle);
  if (!chatId) {
    const created = await createChat(user.bot_number, [handle], CREATE_CHAT_INVISIBLE_PLACEHOLDER);
    chatId = created.chat.id;
  }

  // Send a brief lock-screen-friendly text first, then the voice memo.
  try {
    const { sendMessage } = await import('./linq.ts');
    if (script.companion_text?.trim()) {
      await sendMessage(chatId, script.companion_text.trim());
      await new Promise((r) => setTimeout(r, 800));
    }
  } catch (e) {
    console.warn('[welcome-brief] companion_text send failed:', (e as Error).message);
  }

  const vmRes = await sendVoiceMemo(chatId, signed.signedUrl);

  const briefContext = `[Nest sent a voice memo — first welcome after the user connected Gmail/Outlook. Here is what Nest said:]\n\n${script.script_plain}\n\n[End of voice memo. If the user replies, they're responding to this welcome. Use it as context — reference what Nest said, answer follow-up questions naturally.]`;
  try {
    await addMessage(chatId, 'assistant', briefContext);
  } catch {
    /* non-fatal */
  }

  return {
    ok: true,
    script,
    signed_audio_url: signed.signedUrl,
    storage_path: path,
    linq_message_id: vmRes.voice_memo?.id,
    chat_id: chatId,
  };
}

/**
 * Run an advanced brief (midday or evening): gather rich context, generate
 * spoken script with reasoning model, synthesise via Gemini TTS, send as voice
 * memo, and persist to automation_runs (so the next brief can reference it).
 */
export async function runAdvancedBriefAudio(params: {
  handle: string;
  kind: AdvancedBriefKind;
  dryRun?: boolean;
}): Promise<MorningBriefResult> {
  const { handle, kind } = params;
  const dryRun = params.dryRun === true;

  const user = await loadMorningBriefUser(handle);
  if (!user) return { ok: false, error: 'User not found' };
  if (!user.auth_user_id) {
    return { ok: false, error: 'No auth_user_id — connect email/calendar first' };
  }

  const resolvedDisplayName = await resolveNameForAlerts(
    getAdminClient(),
    user.auth_user_id,
    user.name,
  );
  const spokenName = displayNameForAlerts(resolvedDisplayName || user.name);

  let situation: UserSituation | null = null;
  try {
    situation = await buildUserSituationContext({
      authUserId: user.auth_user_id,
      profile: { handle: user.handle, storedTimezone: user.timezone, contextProfile: user.context_profile },
    });
  } catch (e) {
    console.warn(`[advanced-brief:${kind}] buildUserSituationContext failed:`, (e as Error).message);
  }

  const gathered = await gatherAdvancedBriefContext(user, kind, situation);
  const script = await packageAdvancedBriefWithLlm(user, gathered, spokenName || user.name, situation);

  if (dryRun) {
    return { ok: true, dry_run: true, script, gathered: gathered as MorningBriefGathered };
  }
  if (!user.bot_number) {
    return { ok: false, error: 'User has no bot_number', script, gathered: gathered as MorningBriefGathered };
  }

  const audio = await synthesizeSpeechAudio(script.script_plain, MORNING_BRIEF_TTS_INSTRUCTIONS);
  const supabase = getAdminClient();
  const path = `${handle}/${kind}/${Date.now()}.${audio.extension}`;
  const { error: upErr } = await supabase.storage
    .from('morning-brief-audio')
    .upload(path, audio.bytes, { contentType: audio.contentType, upsert: true });
  if (upErr) {
    return { ok: false, error: `Storage upload failed: ${upErr.message}`, script, gathered: gathered as MorningBriefGathered };
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from('morning-brief-audio')
    .createSignedUrl(path, 72 * 3600);
  if (signErr || !signed?.signedUrl) {
    return { ok: false, error: `Signed URL failed: ${signErr?.message ?? 'unknown'}`, script, gathered: gathered as MorningBriefGathered };
  }

  let chatId = await resolveChatId(handle);
  if (!chatId) {
    const created = await createChat(user.bot_number, [handle], CREATE_CHAT_INVISIBLE_PLACEHOLDER);
    chatId = created.chat.id;
  }

  const vmRes = await sendVoiceMemo(chatId, signed.signedUrl);

  const briefLabel = kind === 'midday' ? 'midday' : 'evening';
  const briefContext = `[Nest sent a voice memo — ${briefLabel} brief. The user heard this spoken aloud and may reply to it. Here is what Nest said in the voice memo:]\n\n${script.script_plain}\n\n[End of voice memo. If the user responds, they are replying to this ${briefLabel} brief. Use it as context — reference specific things mentioned, answer follow-up questions, and offer to dig deeper on any topic covered.]`;
  try {
    await addMessage(chatId, 'assistant', briefContext);
  } catch {
    /* non-fatal */
  }

  return {
    ok: true,
    script,
    signed_audio_url: signed.signedUrl,
    storage_path: path,
    linq_message_id: vmRes.voice_memo?.id,
    chat_id: chatId,
    gathered: gathered as MorningBriefGathered,
  };
}
