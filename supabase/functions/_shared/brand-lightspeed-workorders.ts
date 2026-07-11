import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { LightspeedToolSettings } from './brand-chat-config.ts';
import { normaliseToE164 } from './phone-normalise.ts';
import type { BrandApiDebugCollector } from './brand-api-debug.ts';
import {
  buildAccountResourceUrl,
  ensureValidLightspeedAccessToken,
  lookupYellowJerseyLightspeedToken,
  lightspeedJsonRequest,
  parseBigIntLoose,
  parseNumberLoose,
  type LightspeedPortalConnection,
} from './lightspeed-client.ts';
import { lookupLightspeedWorkordersSql } from './lightspeed-sql.ts';

const LIGHTSPEED_PROVIDER = 'lightspeed';

const WORKORDER_STATUS_LABELS: Record<number, string> = {
  1: 'Open',
  4: 'Finished (awaiting collection/payment)',
  5: 'Collected (done & paid)',
  8: 'Due Today',
};

function statusLabel(id: number | null | undefined): string {
  if (id == null) return 'Unknown';
  // Stores define custom workorder statuses in Lightspeed (waiting on parts,
  // on hold, …) whose IDs we can't name. Anything not finished/collected is,
  // from the customer's point of view, still in the workshop.
  return WORKORDER_STATUS_LABELS[id] ?? `In the workshop — not finished yet (internal status ${id})`;
}

/** Statuses that mean the job is live right now: open, finished awaiting collection, due today. */
const ACTIVE_WORKORDER_STATUSES = new Set([1, 4, 8]);

/** Done & Paid — the job is finished, collected and settled. Never customer-relevant. */
const DONE_AND_PAID_STATUS = 5;

/**
 * Trim a phone-matched workorder history down to what a customer asking
 * "is my bike ready?" actually needs: every active job plus any other job
 * touched in the last 60 days, newest first. Done & Paid (status 5) jobs are
 * excluded outright — a collected-and-settled job must never be presented as
 * a live one (archived jobs are already excluded by the SQL lookup).
 */
export function selectCustomerFacingWorkorders(rows: WorkorderRow[], maxRows = 10): WorkorderRow[] {
  const ts = (r: WorkorderRow) =>
    r.eta_out_melbourne ?? r.time_in_melbourne ?? r.time_stamp_melbourne ?? '';
  const eligible = rows.filter(
    (r) => r.workorder_status_id !== DONE_AND_PAID_STATUS && r.archived !== true,
  );
  const sorted = eligible.sort((a, b) => ts(b).localeCompare(ts(a)));

  const cutoff = new Date(Date.now() - 60 * 86_400_000);
  const cutoffYmd = melbourneYmd(cutoff);

  const active = sorted.filter((r) =>
    r.workorder_status_id != null && ACTIVE_WORKORDER_STATUSES.has(r.workorder_status_id),
  );
  const recentOther = sorted.filter(
    (r) =>
      !(r.workorder_status_id != null && ACTIVE_WORKORDER_STATUSES.has(r.workorder_status_id)) &&
      ts(r).slice(0, 10) >= cutoffYmd,
  );

  const picked = [...active, ...recentOther].sort((a, b) => ts(b).localeCompare(ts(a)));
  return picked.slice(0, maxRows);
}

/**
 * Verify phone-matched candidate jobs against the LIVE Lightspeed API before
 * showing them to a customer. The mirror can go stale in two ways the
 * incremental sync cannot see: a workorder archived in Lightspeed (the sync
 * historically only fetched archived=false) and a workorder deleted outright
 * (404 — it simply vanishes from the feed). Both must never be presented as a
 * live job, and a stale status must never make us tell a customer their bike
 * is ready when it has since been collected.
 *
 * Uses the stored access token ONLY while it is still valid — this helper must
 * NEVER trigger a token refresh (Lightspeed refresh tokens are single-use and
 * rotating; only the serialized refresher may rotate them). If no usable token
 * is available the mirror rows are returned unchanged (best effort).
 */
async function liveVerifyCustomerWorkorders(
  supabase: SupabaseClient,
  brandKey: string,
  rows: WorkorderRow[],
  brandApiDebug?: BrandApiDebugCollector,
): Promise<{ rows: WorkorderRow[]; verified: boolean }> {
  if (rows.length === 0) return { rows, verified: false };
  try {
    const { data: connRow } = await supabase
      .from('nest_brand_portal_connections')
      .select('access_token, api_endpoint, access_expires_at')
      .eq('provider', LIGHTSPEED_PROVIDER)
      .eq('brand_key', brandKey)
      .maybeSingle();
    let accessToken = typeof connRow?.access_token === 'string' ? connRow.access_token : null;
    let accountId = typeof connRow?.api_endpoint === 'string' ? connRow.api_endpoint : null;
    const expiresAt = connRow?.access_expires_at ? new Date(connRow.access_expires_at as string).getTime() : 0;
    if (!accessToken || !accountId || !Number.isFinite(expiresAt) || expiresAt < Date.now() + 30_000) {
      // Legacy Nest token unusable — try the Yellow Jersey dashboard token
      // (read-only, never refreshed from here).
      const yj = await lookupYellowJerseyLightspeedToken(supabase, brandKey);
      if (!yj) return { rows, verified: false };
      accessToken = yj.accessToken;
      accountId = yj.accountId;
    }

    const kept: (WorkorderRow | null)[] = await Promise.all(
      rows.map(async (r) => {
        try {
          const url = buildAccountResourceUrl(accountId, `Workorder/${r.workorder_id}.json`, {});
          const data = await lightspeedJsonRequest(accessToken, url, {
            method: 'GET',
            max429Retries: 1,
            brandApiDebug,
          });
          const node = data.Workorder;
          const wo = (Array.isArray(node) ? node[0] : node) as Record<string, unknown> | undefined;
          if (!wo || typeof wo !== 'object') return null; // gone from Lightspeed
          const archived = pickLightspeedBool(wo, 'archived', 'Archived');
          if (archived === true) return null;
          const liveStatus = pickLightspeedNumber(wo, 'workorderStatusID', 'WorkorderStatusID');
          if (liveStatus != null) {
            if (Math.trunc(liveStatus) === DONE_AND_PAID_STATUS) return null;
            r.workorder_status_id = Math.trunc(liveStatus);
          }
          return r;
        } catch (err) {
          const msg = (err as Error).message ?? '';
          // Deleted workorders 404 — drop them; anything else keep best-effort.
          if (/^Lightspeed API 404\b/.test(msg)) return null;
          console.warn('[live-verify] workorder', r.workorder_id, 'check failed:', msg);
          return r;
        }
      }),
    );

    const verifiedRows = kept.filter((r): r is WorkorderRow => r != null);
    console.log(
      '[live-verify] phone-matched jobs verified against Lightspeed:',
      JSON.stringify({ brandKey, before: rows.length, after: verifiedRows.length }),
    );
    return { rows: verifiedRows, verified: true };
  } catch (err) {
    console.warn('[live-verify] skipped:', (err as Error).message);
    return { rows, verified: false };
  }
}

/** Triggers a read from mirrored `nest_brand_lightspeed_workorder` rows. */
export const WORKORDER_QUERY_RE =
  /(\bwork\s*orders?\b|\bworkorders?\b|\bservice\b|\bservicing\b|\bservices\b|\bserviced\b|\brepairs?\b|\brepaired\b|\bbike\s+service\b|\bbikes?\s+being\s+serviced\b|\bworkshop\b|\bjobs?\b|\bdrop.?off\b|\bdropped\s+off\b|\bcollect(?:ion|ed)?\b|\bdue\s+today\b|\bdue\s+tomorrow\b|\beta\b|\bfinished\b|\bawaiting\b|\bpick\s*up\b|\bpicked\s+up\b|\bready\b|\bbike\s+done\b|\bdone\s+yet\b|\bstatus\s+of\b|how\s+many\s+bikes|any\s+(?:services?|repairs?|jobs?|work)\s+(?:in|on|due|for|tomorrow|today|this\s+week)|(?:is|are)\s+[A-Za-z][a-z]+(?:['’]s)?\s+bike|[A-Za-z][a-z]+(?:\s+[A-Za-z][a-z]+)+(?:['’]s)?\s+(?:bike|service|workorder|job|repair)|\bhave\s+we\s+(?:ever\s+)?(?:worked|serviced|seen|done)|\bbeen\s+(?:in|here)(?:\s+(?:before|recently|lately))?\b|\bcome\s+(?:in|by)(?:\s+(?:recently|lately))?\b|\bvisited\b|\bin\s+recently\b|\bhistory\s+(?:for|on|of)|\b(?:any|previous|past)\s+(?:jobs?|services?|work|history)|\bcustomer\s+(?:history|record))/i;

/**
 * Looser fallback gate. If the message clearly contains a proper-noun person
 * name in a context the LLM can answer, we still want to run the workorder
 * lookup even if the question doesn't use a workshop keyword. This catches
 * "anything for jackson trotman?" / "what's up with Jane Doe" / "check
 * Jackson Trotman" / "find Jane" style turns.
 *
 * Intentionally broad — false positives here just run a quick mirror lookup
 * that returns nothing; false negatives mean the bot misses a real query.
 */
const NAME_ONLY_HINT_RE =
  /\b(?:any(?:thing)?|update|news|latest|status|whats?|how(?:'s|s)?|recently|lately|ever|before|been|visited|come|check|find|look|pull|show|search|get|see|tell|for|about|info|details|up)\b/i;

export function messageSuggestsWorkorderQuery(message: string): boolean {
  const trimmed = message.trim();
  if (/\b(weather|forecast|opening hours?|open today|what time are you open|hours today)\b/i.test(trimmed)) {
    return false;
  }
  if (WORKORDER_QUERY_RE.test(trimmed)) return true;

  // Extract a name first — if nothing plausible is found, no point continuing.
  const extractedName = extractCustomerNameFromQuery(trimmed);
  if (!extractedName) return false;

  // Name + inquisitive/action keyword nearby → strong signal.
  if (NAME_ONLY_HINT_RE.test(trimmed)) return true;

  // Bare-name shortcut: the entire message is essentially just a customer name
  // (possibly with trivial filler like "hi", punctuation, "please").
  // Covers "Jackson Trotman", "Jackson Trotman?", "Hi Jackson Trotman" etc.
  if (extractedName.split(/\s+/).length >= 2) {
    const nameTokens = new Set(extractedName.toLowerCase().split(/\s+/));
    const msgTokens = trimmed
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 1);
    const leftover = msgTokens.filter((w) => !nameTokens.has(w) && !STOP_NAME_WORDS.has(w));
    if (leftover.length === 0) return true;
  }

  return false;
}

/**
 * Try to pull a customer name out of natural questions like:
 *   "is Jack Lloyd's bike ready?"
 *   "what's happening with Jack Lloyd's service?"
 *   "any update on Jack Lloyd"
 *   "Jack Lloyd workorder"
 *   "anything for jackson trotman?"     ← lowercase OK
 *   "have we serviced trotman before?"  ← last-name-only OK
 *
 * Returns the best-effort name. Two-word names beat single names so we
 * don't grab pronouns / stop words. Case-insensitive on the input but the
 * returned string is title-cased so the SQL ILIKE %name% reads cleanly in logs.
 */
const STOP_NAME_WORDS = new Set([
  'is', 'are', 'was', 'were', 'his', 'her', 'their', 'my', 'your', 'our',
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'any', 'all', 'some',
  'bike', 'job', 'jobs', 'service', 'services', 'workorder', 'workorders', 'work', 'order',
  'repair', 'repairs', 'ready', 'done', 'finished', 'open', 'today', 'tomorrow',
  'yesterday', 'we', 'us', 'they', 'them', 'has', 'have', 'had', 'who', 'when',
  'where', 'what', 'why', 'how', 'about', 'with', 'and', 'or', 'but', 'so',
  'i', 'me', 'mine', 'you', 'yours', 'check', 'find', 'look', 'show', 'get',
  'see', 'pull', 'search', 'tell', 'bring', 'grab', 'update', 'status', 'news',
  'latest', 'still', 'just', 'now', 'morning', 'afternoon', 'evening',
  // common verbs that can wear a Capital because they begin a sentence
  'did', 'do', 'does', 'should', 'could', 'would', 'will', 'can',
  // small words that are not names
  'mr', 'mrs', 'ms', 'mister',
  // pronouns / place words that are not names
  'there', 'here', 'anyone', 'someone', 'everyone', 'nobody', 'somebody',
  // shop / business-context words
  'shop', 'store', 'workshop', 'stock', 'inventory', 'team', 'customer',
  // time / manner adverbs
  'recently', 'lately', 'ever', 'before', 'been', 'visited',
  'last', 'next', 'year', 'week', 'month', 'day', 'time', 'ago',
  'currently', 'presently', 'soon', 'later', 'never', 'always',
  // verb forms staff commonly use describing workshop actions
  'come', 'came', 'coming', 'gone', 'going', 'went', 'seen', 'saw',
  'serviced', 'fixed', 'repaired', 'worked', 'looked', 'met', 'helped',
  'dealt', 'sold', 'bought', 'brought', 'took', 'taken', 'gave', 'given',
  'put', 'made', 'called', 'picked', 'dropped', 'charged', 'priced',
  'quoted', 'booked', 'scheduled', 'confirmed', 'rejected', 'refunded',
  'returned', 'tested', 'checked', 'changed', 'replaced', 'installed',
  'removed', 'mounted', 'adjusted', 'tuned', 'cleaned',
  // common greetings / polite openers
  'hi', 'hello', 'hey', 'thanks', 'thank', 'please', 'cheers',
  // filler / confirmation words
  'right', 'yes', 'no', 'yeah', 'nah', 'okay', 'ok', 'sure', 'correct',
  // plurals / contractions / extra fillers
  'updates', 'update', 'news', 'whats', 'hows', 'whens', 'wheres', 'whys',
  'new', 'old', 'for', 'from', 'to', 'at', 'in', 'on', 'off', 'out', 'up',
  'down', 'over', 'under', 'into', 'onto', 'than', 'then', 'also', 'too',
  'quite', 'very', 'really', 'actually', 'probably', 'maybe', 'perhaps',
  // adjectives that commonly appear near name-like bigrams but aren't names
  'good', 'great', 'nice', 'cool', 'fine', 'fast', 'slow', 'big', 'small',
  'cheap', 'expensive', 'tight', 'loose', 'quick', 'easy', 'hard',
  // action / request words that begin staff queries — never customer names
  'give', 'get', 'run', 'pull', 'grab', 'fetch', 'show', 'list',
  // summary / aggregation words staff use in quick-rundown requests
  'rundown', 'breakdown', 'summary', 'overview', 'brief', 'update',
  'report', 'recap', 'digest', 'snapshot', 'total', 'count', 'number',
  // question / inquiry words
  'any', 'anything', 'everything', 'something', 'nothing', 'anyone',
  // time-relative words that aren't names
  'current', 'currently', 'today', 'tonight', 'tomorrow', 'yesterday',
  'weekly', 'daily', 'monthly', 'annual', 'recent', 'upcoming', 'pending',
  // common stop words missed from the original list
  'me', 'us', 'we', 'our', 'its', 'he', 'she', 'they', 'it',
  'who', 'what', 'which', 'where', 'when', 'why', 'how',
  'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
  'both', 'either', 'neither', 'own', 'same', 'so', 'yet',
]);

const COMMON_LAST_NAME_HINT_RE =
  /\b(?:for|about|on|of|under|by|customer|name(?:d)?|called|named)\s+([A-Za-z][a-z'\-]{2,}(?:\s+[A-Za-z][a-z'\-]{2,}){0,2})\b/i;

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}

function isPlausibleNameToken(token: string): boolean {
  const t = token.toLowerCase();
  if (t.length < 2) return false;
  if (STOP_NAME_WORDS.has(t)) return false;
  return /^[a-z][a-z'\-]*$/i.test(token);
}

function isPlausibleNamePhrase(phrase: string): boolean {
  const tokens = phrase.trim().split(/\s+/);
  if (tokens.length === 0) return false;
  for (const tok of tokens) if (!isPlausibleNameToken(tok)) return false;
  return true;
}

export function extractCustomerNameFromQuery(message: string): string | null {
  const text = message.trim();
  if (!text) return null;

  // Pattern 1 (case-insensitive): "<word(s)>'s bike/job/service" — keep
  // possessive as the strongest signal regardless of case.
  const possessive = text.match(/\b([A-Za-z][a-z'\-]+(?:\s+[A-Za-z][a-z'\-]+){0,2})['’]s\s+(?:bike|service|job|repair|workorder|work\s*order)\b/i);
  if (possessive && isPlausibleNamePhrase(possessive[1])) {
    return titleCase(possessive[1]);
  }

  // Pattern 1b: missing-apostrophe possessive — "Jackson Trotmans bike".
  // We only accept this when there's a clear First-Last preceding the trailing
  // `s bike/service/job`, so a bare "bikes" doesn't get grabbed. Example:
  // "Has Jackson Trotmans bike been worked on?" → "Jackson Trotman".
  const possessiveNoApos = text.match(
    /\b([A-Za-z][a-z'\-]+(?:\s+[A-Za-z][a-z'\-]+){0,1})s\s+(?:bike|service|job|repair|workorder|work\s*order)\b/i,
  );
  if (possessiveNoApos && isPlausibleNamePhrase(possessiveNoApos[1])) {
    // Require the capture to be at least a First Last pair (two tokens) so we
    // don't treat "bikes" or "services" as a name.
    const tokens = possessiveNoApos[1].trim().split(/\s+/);
    if (tokens.length >= 2) {
      return titleCase(possessiveNoApos[1]);
    }
  }

  // Pattern 2: "<First Last>'s ..." (more permissive — possessive without an
  // explicit object word). Avoid single-word so we don't grab "John's car".
  const possessiveLoose = text.match(/\b([A-Za-z][a-z'\-]+\s+[A-Za-z][a-z'\-]+(?:\s+[A-Za-z][a-z'\-]+)?)['’]s\b/);
  if (possessiveLoose && isPlausibleNamePhrase(possessiveLoose[1])) {
    return titleCase(possessiveLoose[1]);
  }

  // Pattern 3: "for/about/on <name>" — covers "any update on Jane Doe",
  // "anything for trotman", "customer named jane".
  const forName = text.match(COMMON_LAST_NAME_HINT_RE);
  if (forName && isPlausibleNamePhrase(forName[1])) {
    return titleCase(forName[1]);
  }

  // Pattern 4: bare First-Last only when both words are Title-Cased. Use
  // matchAll so a leading Title-Case stop word ("Has Jackson Trotman…")
  // doesn't poison the whole scan — we just try each candidate phrase in
  // document order until one passes isPlausibleNamePhrase, then optionally
  // trim any leading stop-word tokens that slipped in.
  const bareRe = /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,2})\b/g;
  for (const m of text.matchAll(bareRe)) {
    const phrase = m[1].trim();
    if (isPlausibleNamePhrase(phrase)) {
      return phrase;
    }
    // Strip any leading stop-word tokens and re-check — this recovers the
    // common "Has Jackson Trotman" / "Does Jane Doe" case where the sentence
    // opener is itself Title-Cased.
    const tokens = phrase.split(/\s+/);
    while (tokens.length > 0 && STOP_NAME_WORDS.has(tokens[0].toLowerCase())) {
      tokens.shift();
    }
    if (tokens.length >= 2 && isPlausibleNamePhrase(tokens.join(' '))) {
      return titleCase(tokens.join(' '));
    }
  }

  // Pattern 5: lowercase sentence-opener name. Covers the common
  // "has jackson trotman been in recently?" / "did jane doe drop off today?"
  // style where the user doesn't bother with Title Case. We require a clear
  // question-opener trigger word so we don't grab random two-word phrases.
  //
  // We use a greedy {1,2} capture that may grab extra trailing tokens (e.g.
  // "jackson trotman been" for the sentence "has jackson trotman been in…"),
  // then progressively shorten by dropping trailing tokens until a valid
  // First-Last pair survives isPlausibleNamePhrase.
  const questionOpenerRe =
    /\b(?:has|have|had|did|does|do|is|are|was|were|will|when|how|any|about|check|find|look|show|get|see|pull|search|tell|bring|grab|for)\s+([a-z][a-z'\-]{2,}(?:\s+[a-z][a-z'\-]{2,}){1,2})\b/gi;
  for (const m of text.matchAll(questionOpenerRe)) {
    const phrase = m[1].trim();
    if (isPlausibleNamePhrase(phrase)) {
      return titleCase(phrase);
    }
    const tokens = phrase.split(/\s+/);
    while (tokens.length > 2) {
      tokens.pop();
      if (isPlausibleNamePhrase(tokens.join(' '))) {
        return titleCase(tokens.join(' '));
      }
    }
    while (tokens.length > 2 && STOP_NAME_WORDS.has(tokens[0].toLowerCase())) {
      tokens.shift();
    }
    if (tokens.length >= 2 && isPlausibleNamePhrase(tokens.join(' '))) {
      return titleCase(tokens.join(' '));
    }
  }

  // Pattern 6: verb-style trigger — "we serviced Jackson Trotman",
  // "worked on Jane Doe", "saw Steve Rogers" etc. Staff-style statements
  // where the verb precedes the name. Same progressive-shortening logic as
  // Pattern 5.
  const verbTriggerRe =
    /\b(?:serviced|worked\s+on|looked\s+at|saw|seen|met|helped|fixed|repaired|booked|scheduled|quoted|charged|called|dealt\s+with|had|took|sold|for)\s+([a-z][a-z'\-]{2,}(?:\s+[a-z][a-z'\-]{2,}){1,2})\b/gi;
  for (const m of text.matchAll(verbTriggerRe)) {
    const phrase = m[1].trim();
    if (isPlausibleNamePhrase(phrase)) {
      return titleCase(phrase);
    }
    const tokens = phrase.split(/\s+/);
    while (tokens.length > 2) {
      tokens.pop();
      if (isPlausibleNamePhrase(tokens.join(' '))) {
        return titleCase(tokens.join(' '));
      }
    }
    if (tokens.length >= 2 && isPlausibleNamePhrase(tokens.join(' '))) {
      return titleCase(tokens.join(' '));
    }
  }

  // Last resort: scan the whole message for any consecutive pair of
  // plausible name tokens (length ≥ 3, alpha-only, not in STOP_NAME_WORDS).
  // Only used if every earlier pattern failed. The expanded STOP_NAME_WORDS
  // list catches most of the obvious false-positive bigrams (verbs, time
  // words, pronouns, filler). If two consecutive tokens survive that filter,
  // they're very likely a First-Last name.
  const rawWords = text.split(/\s+/).map((w) => w.replace(/[^\w'\-]/g, ''));
  for (let i = 0; i < rawWords.length - 1; i++) {
    const a = rawWords[i];
    const b = rawWords[i + 1];
    if (a.length < 3 || b.length < 3) continue;
    if (!isPlausibleNameToken(a) || !isPlausibleNameToken(b)) continue;
    // Also reject if either token looks like a number or contains digits.
    if (/\d/.test(a) || /\d/.test(b)) continue;
    return titleCase(`${a} ${b}`);
  }

  return null;
}

function melbourneYmd(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function melbourneWeekday(d: Date): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    weekday: 'long',
  }).format(d);
}

function melbourneLongDate(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

type DateWindow = { label: string; fromYmd: string; toYmd: string };

function resolveDateWindow(message: string): DateWindow | null {
  const now = new Date();
  const todayYmd = melbourneYmd(now);
  const lower = message.toLowerCase();

  const yesterdayDate = new Date(now.getTime() - 86_400_000);
  const yesterdayYmd = melbourneYmd(yesterdayDate);
  const tomorrowDate = new Date(now.getTime() + 86_400_000);
  const tomorrowYmd = melbourneYmd(tomorrowDate);

  if (/\byesterday\b/.test(lower)) {
    return { label: `Yesterday (${melbourneLongDate(yesterdayYmd)})`, fromYmd: yesterdayYmd, toYmd: yesterdayYmd };
  }
  // Only treat "tomorrow" as a workorder date window when it's near a workorder/
  // ETA keyword. If "tomorrow" appears only in a roster context ("who's on/working
  // tomorrow"), it should NOT filter the workorder ETA — use active filter instead.
  if (/\btomorrow\b/.test(lower)) {
    // "tomorrow" near a workorder-specific date keyword → use as ETA date filter.
    const tomorrowNearWorkorderKeyword = /\b(?:due|eta|ready|pickup|pick.?up|collect|service|repair|job|workorder|work.?order)\b.*\btomorrow\b|\btomorrow\b.*\b(?:due|eta|ready|pickup|pick.?up|collect|service|repair|job|workorder|work.?order)\b/i.test(lower);
    // "tomorrow" in a "who is/who's on/working/rostered tomorrow" context → roster.
    const tomorrowIsRoster = /who(?:'s|\s+is|\s+are)?\s+(?:on|working|rostered|in|scheduled)?\s*tomorrow|tomorrow\s+(?:on|working|rostered|in|scheduled)/i.test(lower);
    if (tomorrowNearWorkorderKeyword || !tomorrowIsRoster) {
      return { label: `Tomorrow (${melbourneLongDate(tomorrowYmd)})`, fromYmd: tomorrowYmd, toYmd: tomorrowYmd };
    }
  }
  if (/\btoday\b|\bdue today\b/.test(lower)) {
    return { label: `Today (${melbourneLongDate(todayYmd)})`, fromYmd: todayYmd, toYmd: todayYmd };
  }

  const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  for (const dayName of dayNames) {
    if (new RegExp(`\\b${dayName}\\b`, 'i').test(lower)) {
      for (let offset = -7; offset <= 7; offset++) {
        const candidate = new Date(now.getTime() + offset * 86_400_000);
        const candidateDay = new Intl.DateTimeFormat('en-AU', {
          timeZone: 'Australia/Melbourne',
          weekday: 'long',
        }).format(candidate).toLowerCase();
        if (candidateDay === dayName) {
          const ymd = melbourneYmd(candidate);
          if (/\blast\b/.test(lower) && offset < 0) {
            return { label: `Last ${dayName.charAt(0).toUpperCase() + dayName.slice(1)} (${melbourneLongDate(ymd)})`, fromYmd: ymd, toYmd: ymd };
          }
          if (offset > 0 && !/\blast\b/.test(lower)) {
            return { label: `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} (${melbourneLongDate(ymd)})`, fromYmd: ymd, toYmd: ymd };
          }
          if (offset <= 0) {
            return { label: `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} (${melbourneLongDate(ymd)})`, fromYmd: ymd, toYmd: ymd };
          }
        }
      }
    }
  }

  if (/\bthis\s+week\b/.test(lower)) {
    const dayOfWeek = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'long' }).format(now).toLowerCase();
    const dayIdx = dayNames.indexOf(dayOfWeek);
    const mondayOffset = dayIdx >= 0 ? -dayIdx : 0;
    const mondayDate = new Date(now.getTime() + mondayOffset * 86_400_000);
    const sundayDate = new Date(mondayDate.getTime() + 6 * 86_400_000);
    return { label: 'This week', fromYmd: melbourneYmd(mondayDate), toYmd: melbourneYmd(sundayDate) };
  }

  if (/\blast\s+week\b/.test(lower)) {
    const dayOfWeek = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'long' }).format(now).toLowerCase();
    const dayIdx = dayNames.indexOf(dayOfWeek);
    const thisMonOffset = dayIdx >= 0 ? -dayIdx : 0;
    const lastMonDate = new Date(now.getTime() + (thisMonOffset - 7) * 86_400_000);
    const lastSunDate = new Date(lastMonDate.getTime() + 6 * 86_400_000);
    return { label: 'Last week', fromYmd: melbourneYmd(lastMonDate), toYmd: melbourneYmd(lastSunDate) };
  }

  if (/\bnext\s+week\b/.test(lower)) {
    const dayOfWeek = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'long' }).format(now).toLowerCase();
    const dayIdx = dayNames.indexOf(dayOfWeek);
    const thisMonOffset = dayIdx >= 0 ? -dayIdx : 0;
    const nextMonDate = new Date(now.getTime() + (thisMonOffset + 7) * 86_400_000);
    const nextSunDate = new Date(nextMonDate.getTime() + 6 * 86_400_000);
    return { label: 'Next week', fromYmd: melbourneYmd(nextMonDate), toYmd: melbourneYmd(nextSunDate) };
  }

  if (/\bthis\s+month\b/.test(lower)) {
    const parts = todayYmd.split('-');
    return { label: 'This month', fromYmd: `${parts[0]}-${parts[1]}-01`, toYmd: todayYmd };
  }

  if (/\blast\s+month\b/.test(lower)) {
    const melbMonth = Number(todayYmd.split('-')[1]);
    const melbYear = Number(todayYmd.split('-')[0]);
    const prevMonth = melbMonth === 1 ? 12 : melbMonth - 1;
    const prevYear = melbMonth === 1 ? melbYear - 1 : melbYear;
    const firstDay = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
    const lastDay = `${melbYear}-${String(melbMonth).padStart(2, '0')}-01`;
    const lastOfPrev = new Date(new Date(lastDay + 'T12:00:00Z').getTime() - 86_400_000);
    return { label: 'Last month', fromYmd: firstDay, toYmd: melbourneYmd(lastOfPrev) };
  }

  const nDaysMatch = lower.match(/\b(?:last|past)\s+(\d+)\s+days?\b/);
  if (nDaysMatch) {
    const n = Math.min(Number(nDaysMatch[1]), 365);
    const from = new Date(now.getTime() - n * 86_400_000);
    return { label: `Last ${n} days`, fromYmd: melbourneYmd(from), toYmd: todayYmd };
  }

  const nWeeksMatch = lower.match(/\b(?:last|past)\s+(\d+)\s+weeks?\b/);
  if (nWeeksMatch) {
    const n = Math.min(Number(nWeeksMatch[1]) * 7, 365);
    return { label: `Last ${nWeeksMatch[1]} weeks`, fromYmd: melbourneYmd(new Date(now.getTime() - n * 86_400_000)), toYmd: todayYmd };
  }

  const nMonthsMatch = lower.match(/\b(?:last|past|previous)\s+(\d+)\s+months?\b/);
  if (nMonthsMatch) {
    const n = Math.min(Number(nMonthsMatch[1]) * 30, 365);
    return { label: `Last ${nMonthsMatch[1]} months`, fromYmd: melbourneYmd(new Date(now.getTime() - n * 86_400_000)), toYmd: todayYmd };
  }

  return null;
}

type RawLineItem = {
  source?: string;
  item_id?: number | null;
  description?: string | null;
  custom_sku?: string | null;
  display_label?: string | null;
  unit_quantity?: number | null;
  unit_price?: number | null;
  unit_price_override?: number | null;
  note?: string | null;
  workorder_line_id?: number | null;
  workorder_item_id?: number | null;
  /** discountID from Lightspeed — resolved to a percent via liveLightspeedFetchDiscounts */
  discount_id?: number | null;
  /** 0–100 percent discount; applied by lineItemUnitPrice when present */
  discount_percent?: number | null;
};

type WorkorderRow = {
  workorder_id: number;
  workorder_status_id: number | null;
  customer_name: string | null;
  notes: string | null;
  time_in_melbourne: string | null;
  eta_out_melbourne: string | null;
  time_stamp_melbourne: string | null;
  updated_at_melbourne: string | null;
  archived: boolean | null;
  warranty: boolean | null;
  workorder_line_items: unknown;
  sale_id?: number | null;
  customer_phone?: string | null;
  customer_phone_e164?: string | null;
  sale_total?: number | null;
  sale_balance?: number | null;
};

function formatAudPrice(n: number): string {
  try {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function cleanNotes(notes: string | null, maxLen = 240): string | null {
  if (!notes) return null;
  const oneLine = notes.replace(/\s+/g, ' ').trim();
  if (!oneLine) return null;
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen - 1)}…`;
}

/** Pull a sensible "what was done" label out of a raw line item, falling back through every field. */
function lineItemLabel(item: RawLineItem): string | null {
  const label =
    (typeof item.description === 'string' && item.description.trim()) ||
    (typeof item.note === 'string' && item.note.trim()) ||
    (typeof item.display_label === 'string' && !/^Item\s*#\d+$/i.test(item.display_label) && item.display_label.trim()) ||
    null;
  return label || null;
}

function lineItemUnitPrice(item: RawLineItem): number | null {
  const override = typeof item.unit_price_override === 'number' && Number.isFinite(item.unit_price_override)
    ? item.unit_price_override
    : null;
  const base = override != null
    ? override
    : (typeof item.unit_price === 'number' && Number.isFinite(item.unit_price) ? item.unit_price : null);
  if (base == null) return null;
  // Apply discount percentage fetched from Lightspeed Discount.json (live path).
  const pct = typeof item.discount_percent === 'number' && Number.isFinite(item.discount_percent)
    ? item.discount_percent
    : null;
  if (pct != null && pct > 0 && pct <= 100) {
    return base * (1 - pct / 100);
  }
  return base;
}

function lineItemQty(item: RawLineItem): number {
  const q = typeof item.unit_quantity === 'number' && Number.isFinite(item.unit_quantity) ? item.unit_quantity : 1;
  return q > 0 ? q : 1;
}

function calculateLineItemsTotal(items: RawLineItem[]): number | null {
  let any = false;
  let sum = 0;
  for (const it of items) {
    const price = lineItemUnitPrice(it);
    if (price == null) continue;
    any = true;
    sum += price * lineItemQty(it);
  }
  return any ? sum : null;
}

/**
 * Format the items + labour list as natural prose lines for the model.
 * Hides raw `Item #NNN` ids so the model never echoes them to a customer.
 */
function formatLineItemsNatural(items: RawLineItem[]): string[] {
  const out: string[] = [];
  for (const it of items.slice(0, 20)) {
    const label = lineItemLabel(it);
    if (!label) continue;
    const qty = lineItemQty(it);
    const price = lineItemUnitPrice(it);
    const qtyStr = qty > 1 ? ` x${qty}` : '';
    if (price != null) {
      out.push(`  - ${label}${qtyStr} (${formatAudPrice(price * qty)})`);
    } else {
      out.push(`  - ${label}${qtyStr}`);
    }
  }
  return out;
}

type WorkorderFormatOptions = {
  /** When true, include the linked sale total iff the workorder is finished AND the sale is paid. */
  shareCompletedPrice: boolean;
  /** When true, include WO #IDs (internal mode). Customer-facing should hide. */
  includeWorkorderId: boolean;
};

function formatWorkorderBlock(r: WorkorderRow, opts: WorkorderFormatOptions): string {
  const status = statusLabel(r.workorder_status_id);
  const customer = r.customer_name?.trim() || 'Unknown customer';
  const idTag = opts.includeWorkorderId ? ` (Job #${r.workorder_id})` : '';
  const warranty = r.warranty ? ' [warranty]' : '';
  const cleanedNotes = cleanNotes(r.notes);
  const items: RawLineItem[] = Array.isArray(r.workorder_line_items)
    ? (r.workorder_line_items as RawLineItem[])
    : [];

  const lines: string[] = [];
  lines.push(`Customer: ${customer}${idTag}${warranty}`);
  lines.push(`Status: ${status}`);
  if (r.time_in_melbourne) lines.push(`Dropped off: ${r.time_in_melbourne}`);
  if (r.eta_out_melbourne) lines.push(`ETA out: ${r.eta_out_melbourne}`);
  if (cleanedNotes) lines.push(`What the customer asked us to look at: ${cleanedNotes}`);
  else lines.push(`What the customer asked us to look at: (no note recorded)`);

  // ── Pricing ──
  // Prefer real sale total when paid in full. If the sale is unpaid or unlinked,
  // fall back to the sum of line item unit prices so the model has SOMETHING
  // factual to use (still gated by share_completed_price for finished jobs).
  if (opts.shareCompletedPrice) {
    const finished = r.workorder_status_id === 4 || r.workorder_status_id === 5;
    const saleTotal = typeof r.sale_total === 'number' && Number.isFinite(r.sale_total) ? r.sale_total : null;
    const saleBalance = typeof r.sale_balance === 'number' && Number.isFinite(r.sale_balance) ? r.sale_balance : null;
    const paid = saleBalance == null || saleBalance <= 0.0001;
    const calcTotal = calculateLineItemsTotal(items);

    if (finished && saleTotal != null && saleTotal > 0 && paid) {
      lines.push(`Total invoiced: ${formatAudPrice(saleTotal)} (paid in full — OK to quote)`);
    } else if (finished && saleTotal != null && saleTotal > 0 && !paid) {
      lines.push(`Total invoiced: ${formatAudPrice(saleTotal)} (balance ${formatAudPrice(saleBalance ?? 0)} owing — say "outstanding balance to settle on collection")`);
    } else if (calcTotal != null && calcTotal > 0) {
      lines.push(`Estimated total from items on the job: ${formatAudPrice(calcTotal)} (not yet finalised; tell the customer the team will confirm the final price on collection)`);
    } else {
      lines.push(`Total: not yet finalised (no charge has been added). Do NOT invent a price; tell the customer the team will confirm when collected.`);
    }
  }

  const naturalItems = formatLineItemsNatural(items);
  if (naturalItems.length > 0) {
    lines.push(`Items / labour on the job:`);
    lines.push(...naturalItems);
  }

  return lines.join('\n');
}

/**
 * Runtime enrichment: any line items missing real `description` get backfilled
 * from the `nest_brand_lightspeed_item` mirror so the formatter never has to
 * fall back to "Item #16755" labels (which the model would echo to customers).
 */
async function enrichLineItemDescriptions(
  supabase: SupabaseClient,
  brandKey: string,
  rows: WorkorderRow[],
): Promise<void> {
  const missingIds = new Set<number>();
  for (const r of rows) {
    if (!Array.isArray(r.workorder_line_items)) continue;
    for (const raw of r.workorder_line_items as RawLineItem[]) {
      if (!raw || typeof raw !== 'object') continue;
      const hasReal =
        (typeof raw.description === 'string' && raw.description.trim()) ||
        (typeof raw.note === 'string' && raw.note.trim());
      if (hasReal) continue;
      const id = typeof raw.item_id === 'number' && Number.isFinite(raw.item_id) ? raw.item_id : null;
      if (id != null && id > 0) missingIds.add(id);
    }
  }
  if (missingIds.size === 0) return;

  const idList = [...missingIds];
  const lookup = new Map<number, { description: string | null; default_price: number | null; custom_sku: string | null }>();
  const chunkSize = 100;
  for (let i = 0; i < idList.length; i += chunkSize) {
    const chunk = idList.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('nest_brand_lightspeed_item')
      .select('item_id, description, default_price, custom_sku')
      .eq('brand_key', brandKey)
      .in('item_id', chunk);
    if (error) {
      console.warn('[brand-lightspeed-workorders] item lookup error:', error.message);
      continue;
    }
    for (const row of data ?? []) {
      const r = row as Record<string, unknown>;
      const id = typeof r.item_id === 'number' ? r.item_id : Number(r.item_id);
      if (!Number.isFinite(id)) continue;
      lookup.set(id, {
        description: typeof r.description === 'string' && r.description.trim() ? r.description.trim() : null,
        default_price: typeof r.default_price === 'number' && Number.isFinite(r.default_price) ? r.default_price : null,
        custom_sku: typeof r.custom_sku === 'string' && r.custom_sku.trim() ? r.custom_sku.trim() : null,
      });
    }
  }
  if (lookup.size === 0) return;

  for (const r of rows) {
    if (!Array.isArray(r.workorder_line_items)) continue;
    const items = r.workorder_line_items as RawLineItem[];
    for (const raw of items) {
      if (!raw || typeof raw !== 'object') continue;
      const id = typeof raw.item_id === 'number' && Number.isFinite(raw.item_id) ? raw.item_id : null;
      if (id == null) continue;
      const meta = lookup.get(id);
      if (!meta) continue;
      if (!raw.description && meta.description) raw.description = meta.description;
      if (raw.unit_price == null && meta.default_price != null) raw.unit_price = meta.default_price;
      if (!raw.custom_sku && meta.custom_sku) raw.custom_sku = meta.custom_sku;
      if (!raw.display_label || /^Item\s*#\d+$/i.test(String(raw.display_label))) {
        raw.display_label = raw.description ?? raw.note ?? null;
      }
    }
  }
}

/**
 * Runtime enrichment: pull `total` / `balance` from the mirrored sale table for
 * any workorder rows whose own `sale_total` is null. Some sync runs leave these
 * blank, but the linked sale row usually has the canonical figure.
 */
async function enrichSaleTotals(
  supabase: SupabaseClient,
  brandKey: string,
  rows: WorkorderRow[],
): Promise<void> {
  const missingSaleIds = new Set<number>();
  for (const r of rows) {
    const needs = r.sale_total == null;
    const sid = typeof r.sale_id === 'number' && Number.isFinite(r.sale_id) ? r.sale_id : null;
    if (needs && sid != null && sid > 0) missingSaleIds.add(sid);
  }
  if (missingSaleIds.size === 0) return;

  const idList = [...missingSaleIds];
  const lookup = new Map<number, { total: number | null; balance: number | null }>();
  const chunkSize = 100;
  for (let i = 0; i < idList.length; i += chunkSize) {
    const chunk = idList.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('nest_brand_lightspeed_sale')
      .select('sale_id, total, balance')
      .eq('brand_key', brandKey)
      .in('sale_id', chunk);
    if (error) {
      console.warn('[brand-lightspeed-workorders] sale lookup error:', error.message);
      continue;
    }
    for (const row of data ?? []) {
      const r = row as Record<string, unknown>;
      const id = typeof r.sale_id === 'number' ? r.sale_id : Number(r.sale_id);
      if (!Number.isFinite(id)) continue;
      lookup.set(id, {
        total: typeof r.total === 'number' && Number.isFinite(r.total) ? r.total : null,
        balance: typeof r.balance === 'number' && Number.isFinite(r.balance) ? r.balance : null,
      });
    }
  }

  for (const r of rows) {
    const sid = typeof r.sale_id === 'number' && Number.isFinite(r.sale_id) ? r.sale_id : null;
    if (sid == null) continue;
    const sale = lookup.get(sid);
    if (!sale) continue;
    if (r.sale_total == null) r.sale_total = sale.total;
    if (r.sale_balance == null) r.sale_balance = sale.balance;
  }
}

// ── Live Lightspeed name fallback ──────────────────────────────
//
// When the mirror returns nothing for a customer-name query (most often
// because the customer hasn't been in within the 90-day retention window),
// we hit Lightspeed Customer.json + Workorder.json directly so we can still
// answer "have we worked on Jane Doe's bike before?" questions for any
// long-time customer. Adds ~300–600ms but only when the mirror missed.
//
// Returns at most 25 most recent workorders across all matching customers,
// shaped to the same WorkorderRow used by the mirror path so the formatter
// doesn't care where the rows came from.

function pickLightspeedString(o: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function pickLightspeedNumber(o: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = o[k];
    if (v == null) continue;
    const n = parseNumberLoose(v);
    if (n != null && Number.isFinite(n)) return n;
  }
  return null;
}

function pickLightspeedBool(o: Record<string, unknown>, ...keys: string[]): boolean | null {
  for (const k of keys) {
    const v = o[k];
    if (v == null) continue;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') {
      const t = v.trim().toLowerCase();
      if (t === 'true' || t === '1' || t === 'yes') return true;
      if (t === 'false' || t === '0' || t === 'no') return false;
    }
    if (typeof v === 'number') return v !== 0;
  }
  return null;
}

function lightspeedIsoToMelbourneDisplay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  try {
    const formatter = new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Melbourne',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(t);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:00`;
  } catch {
    return iso.slice(0, 19).replace('T', ' ');
  }
}

function buildLineItemsFromLightspeedWorkorder(wo: Record<string, unknown>): RawLineItem[] {
  const items: RawLineItem[] = [];

  // Catalog items first (WorkorderItems.WorkorderItem)
  const woItemsNode = (wo.WorkorderItems ?? wo.workorderItems) as unknown;
  if (woItemsNode && typeof woItemsNode === 'object') {
    const inner = (woItemsNode as Record<string, unknown>).WorkorderItem ??
      (woItemsNode as Record<string, unknown>).workorderItem;
    const list: unknown[] = Array.isArray(inner) ? inner : inner ? [inner] : [];
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const r = raw as Record<string, unknown>;
      const itemId = pickLightspeedNumber(r, 'itemID', 'ItemID');
      const qty = pickLightspeedNumber(r, 'unitQuantity', 'qty', 'quantity') ?? 1;
      const price = pickLightspeedNumber(r, 'unitPrice', 'price');
      const overridePrice = pickLightspeedNumber(r, 'unitPriceOverride', 'UnitPriceOverride');
      const discountId = pickLightspeedNumber(r, 'discountID', 'DiscountID');
      // Lightspeed embeds an `Item` relation when load_relations includes Item.
      const item = (r.Item ?? r.item) as Record<string, unknown> | undefined;
      const description = item ? pickLightspeedString(item, 'description', 'Description') : null;
      const customSku = item ? pickLightspeedString(item, 'customSku', 'CustomSku') : null;
      items.push({
        source: 'workorderItem',
        item_id: itemId != null ? Math.trunc(itemId) : null,
        description,
        custom_sku: customSku,
        display_label: description,
        unit_quantity: qty,
        unit_price: price,
        unit_price_override: overridePrice,
        note: null,
        discount_id: discountId != null && discountId > 0 ? Math.trunc(discountId) : null,
        discount_percent: null,
      });
    }
  }

  // Labour / line notes (WorkorderLines.WorkorderLine)
  // In Lightspeed R-Series, WorkorderLine stores its price in `unitPriceOverride`
  // (not `unitPrice`). It also carries an `itemID` linking to a service-item
  // record (e.g. "Hub Service", "Labour - General") and a `discountID`.
  const woLinesNode = (wo.WorkorderLines ?? wo.workorderLines) as unknown;
  if (woLinesNode && typeof woLinesNode === 'object') {
    const inner = (woLinesNode as Record<string, unknown>).WorkorderLine ??
      (woLinesNode as Record<string, unknown>).workorderLine;
    const list: unknown[] = Array.isArray(inner) ? inner : inner ? [inner] : [];
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const r = raw as Record<string, unknown>;
      const note = pickLightspeedString(r, 'note', 'Note');
      const qty = pickLightspeedNumber(r, 'unitQuantity', 'qty', 'quantity') ?? 1;
      // WorkorderLine prices are stored in unitPriceOverride, not unitPrice.
      const price = pickLightspeedNumber(r, 'unitPriceOverride', 'UnitPriceOverride', 'unitPrice', 'price');
      const lineItemId = pickLightspeedNumber(r, 'itemID', 'ItemID');
      const discountId = pickLightspeedNumber(r, 'discountID', 'DiscountID');
      items.push({
        source: 'workorderLine',
        item_id: lineItemId != null ? Math.trunc(lineItemId) : null,
        description: note,
        display_label: note,
        unit_quantity: qty,
        unit_price: price,
        note,
        discount_id: discountId != null && discountId > 0 ? Math.trunc(discountId) : null,
        discount_percent: null,
      });
    }
  }

  return items;
}

function lightspeedWorkorderToRow(
  wo: Record<string, unknown>,
  customer: { id: number; name: string; phoneE164: string | null },
): WorkorderRow | null {
  const idBig = parseBigIntLoose(wo.workorderID);
  if (idBig == null) return null;
  const id = Number(idBig);
  const status = pickLightspeedNumber(wo, 'workorderStatusID', 'WorkorderStatusID');
  const archived = pickLightspeedBool(wo, 'archived', 'Archived');
  const warranty = pickLightspeedBool(wo, 'warranty', 'Warranty');
  const note = pickLightspeedString(wo, 'note', 'Note');
  const internalNote = pickLightspeedString(wo, 'internalNote', 'InternalNote');
  const combinedNote = [note, internalNote].filter(Boolean).join('\n');
  const items = buildLineItemsFromLightspeedWorkorder(wo);
  const saleId = pickLightspeedNumber(wo, 'saleID', 'SaleID');

  return {
    workorder_id: id,
    workorder_status_id: status != null ? Math.trunc(status) : null,
    customer_name: customer.name || null,
    notes: combinedNote || null,
    time_in_melbourne: lightspeedIsoToMelbourneDisplay(pickLightspeedString(wo, 'timeIn', 'TimeIn')),
    eta_out_melbourne: lightspeedIsoToMelbourneDisplay(pickLightspeedString(wo, 'etaOut', 'EtaOut')),
    time_stamp_melbourne: lightspeedIsoToMelbourneDisplay(pickLightspeedString(wo, 'timeStamp', 'TimeStamp')),
    updated_at_melbourne: null,
    archived: archived ?? false,
    warranty: warranty ?? false,
    workorder_line_items: items as unknown,
    sale_id: saleId != null ? Math.trunc(saleId) : null,
    customer_phone: null,
    customer_phone_e164: customer.phoneE164,
    sale_total: null,
    sale_balance: null,
  };
}

type LightspeedCustomerHit = { id: number; firstName: string; lastName: string; phoneE164: string | null };

function extractCustomerPhoneE164(c: Record<string, unknown>): string | null {
  const contact = (c.Contact ?? c.contact) as Record<string, unknown> | undefined;
  if (!contact) return null;
  const phones = (contact.Phones ?? contact.phones) as Record<string, unknown> | undefined;
  if (!phones) return null;
  const inner = (phones.ContactPhone ?? phones.contactPhone) as unknown;
  const list: unknown[] = Array.isArray(inner) ? inner : inner ? [inner] : [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const number = pickLightspeedString(r, 'number', 'Number');
    if (number) return normaliseToE164(number) ?? null;
  }
  return null;
}

async function liveLightspeedCustomerSearch(
  accessToken: string,
  accountId: string,
  rawQuery: string,
  brandApiDebug?: BrandApiDebugCollector,
): Promise<LightspeedCustomerHit[]> {
  const tokens = rawQuery.split(/\s+/).filter((t) => t.length >= 2).slice(0, 3);
  if (tokens.length === 0) return [];
  const seen = new Map<number, LightspeedCustomerHit>();

  // For each token try firstName and lastName "contains" filters in parallel.
  const urls: string[] = [];
  for (const tok of tokens) {
    urls.push(
      buildAccountResourceUrl(accountId, 'Customer.json', {
        limit: '15',
        firstName: `~,${tok}`,
        load_relations: '["Contact"]',
      }),
      buildAccountResourceUrl(accountId, 'Customer.json', {
        limit: '15',
        lastName: `~,${tok}`,
        load_relations: '["Contact"]',
      }),
    );
  }

  await Promise.all(
    urls.map(async (url) => {
      try {
        const data = await lightspeedJsonRequest(accessToken, url, { method: 'GET', brandApiDebug });
        const node = data.Customer;
        const list = Array.isArray(node) ? node : node ? [node] : [];
        for (const entry of list) {
          if (!entry || typeof entry !== 'object') continue;
          const o = entry as Record<string, unknown>;
          const idBig = parseBigIntLoose(o.customerID);
          if (idBig == null) continue;
          const id = Number(idBig);
          if (seen.has(id)) continue;
          const firstName = pickLightspeedString(o, 'firstName', 'FirstName') ?? '';
          const lastName = pickLightspeedString(o, 'lastName', 'LastName') ?? '';
          const phoneE164 = extractCustomerPhoneE164(o);
          seen.set(id, { id, firstName, lastName, phoneE164 });
        }
      } catch (err) {
        console.warn(
          '[live-lookup] customer search failed',
          url.slice(url.indexOf('?')),
          '→',
          (err as Error).message,
        );
      }
    }),
  );

  // Rank: prefer matches whose full name actually contains EVERY query token.
  // Otherwise keep the order Lightspeed returned (rough relevance).
  const lowerTokens = tokens.map((t) => t.toLowerCase());
  const candidates = [...seen.values()];
  candidates.sort((a, b) => {
    const aFull = `${a.firstName} ${a.lastName}`.toLowerCase();
    const bFull = `${b.firstName} ${b.lastName}`.toLowerCase();
    const aMatch = lowerTokens.every((t) => aFull.includes(t)) ? 1 : 0;
    const bMatch = lowerTokens.every((t) => bFull.includes(t)) ? 1 : 0;
    return bMatch - aMatch;
  });
  return candidates.slice(0, 6);
}

async function liveLightspeedWorkordersForCustomer(
  accessToken: string,
  accountId: string,
  customerId: number,
  brandApiDebug?: BrandApiDebugCollector,
  keepRow?: (statusId: number | null, archived: boolean) => boolean,
): Promise<Record<string, unknown>[]> {
  // NOTE: Lightspeed's Workorder endpoint does NOT accept `Item` as a
  // top-level load_relation (Item is nested under WorkorderItems). Including
  // it in the list makes the whole request fail with a 400, which is why we
  // previously returned 0 rows even when the customer clearly had jobs.
  // Keep the relations list aligned with what the sync job uses so we know
  // it's valid. Line-item descriptions come back via `enrichLineItemDescriptions`
  // against the mirrored item catalog.
  // The Lightspeed R-Series API does not reliably honour an IN filter on
  // workorderStatusID, so we fetch the 25 most-recent and filter client-side.
  // Default filter: not archived and Open (1) / Finished (4) / Due Today (8).
  const url = buildAccountResourceUrl(accountId, 'Workorder.json', {
    limit: '25',
    customerID: String(customerId),
    sort: '-timeStamp',
    load_relations: '["WorkorderLines","WorkorderItems"]',
  });
  const keep =
    keepRow ??
    ((sid: number | null, archived: boolean) =>
      !archived && sid != null && ACTIVE_WORKORDER_STATUSES.has(sid));
  try {
    const data = await lightspeedJsonRequest(accessToken, url, { method: 'GET', brandApiDebug });
    const node = data.Workorder;
    const list = Array.isArray(node) ? node : node ? [node] : [];
    return (list.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]).filter(
      (wo) => {
        const sid = pickLightspeedNumber(wo, 'workorderStatusID', 'WorkorderStatusID');
        const archived = pickLightspeedBool(wo, 'archived', 'Archived') === true;
        return keep(sid != null ? Math.trunc(sid) : null, archived);
      },
    );
  } catch (err) {
    console.warn(
      '[live-lookup] workorder fetch failed customerID=',
      customerId,
      '→',
      (err as Error).message,
    );
    return [];
  }
}

/**
 * Fetch `total` and `balance` from Sale.json for a set of sale IDs, in
 * parallel. Used by the live-fallback path so workorder totals are accurate
 * even when the linked sale hasn't been synced to the mirror yet.
 * Caps at 20 concurrent requests to keep latency manageable.
 */
async function liveLightspeedFetchSaleTotals(
  accessToken: string,
  accountId: string,
  saleIds: number[],
  brandApiDebug?: BrandApiDebugCollector,
): Promise<Map<number, { total: number | null; balance: number | null }>> {
  const result = new Map<number, { total: number | null; balance: number | null }>();
  if (saleIds.length === 0) return result;
  const ids = saleIds.slice(0, 20); // cap concurrent requests
  await Promise.all(
    ids.map(async (saleId) => {
      try {
        const url = buildAccountResourceUrl(accountId, 'Sale.json', {
          saleID: String(saleId),
        });
        const data = await lightspeedJsonRequest(accessToken, url, { method: 'GET', brandApiDebug });
        const node = data.Sale;
        const sale = Array.isArray(node) ? node[0] : node;
        if (!sale || typeof sale !== 'object') return;
        const s = sale as Record<string, unknown>;
        const total = pickLightspeedNumber(s, 'total', 'Total');
        const balance = pickLightspeedNumber(s, 'balance', 'Balance');
        result.set(saleId, { total, balance });
      } catch (err) {
        console.warn('[live-lookup] sale fetch saleID=', saleId, '→', (err as Error).message);
      }
    }),
  );
  return result;
}

/**
 * Fetch discount details (type + percent) from Discount.json for a set of
 * discountIDs. Used by the live-fallback path to resolve the actual charged
 * price when Lightspeed applies a percentage discount to workorder line items.
 */
async function liveLightspeedFetchDiscounts(
  accessToken: string,
  accountId: string,
  discountIds: number[],
  brandApiDebug?: BrandApiDebugCollector,
): Promise<Map<number, { percentOf100: number | null; flatAmount: number | null }>> {
  const result = new Map<number, { percentOf100: number | null; flatAmount: number | null }>();
  if (discountIds.length === 0) return result;
  const ids = discountIds.slice(0, 15);
  await Promise.all(
    ids.map(async (discountId) => {
      try {
        // Lightspeed R-Series: individual discount at Discount/{id}.json.
        // Response shape: { discountPercent: "0.5", discountAmount: "0" }
        // discountPercent is a decimal (0.5 = 50% off), not 0–100.
        const url = buildAccountResourceUrl(accountId, `Discount/${discountId}.json`, {});
        const data = await lightspeedJsonRequest(accessToken, url, { method: 'GET', brandApiDebug });
        const node = data.Discount;
        const discount = Array.isArray(node) ? node[0] : node;
        if (!discount || typeof discount !== 'object') return;
        const d = discount as Record<string, unknown>;
        // Convert decimal fraction to 0-100 percent so lineItemUnitPrice can use it directly.
        const rawPct = pickLightspeedNumber(d, 'discountPercent', 'DiscountPercent');
        const percentOf100 = rawPct != null && rawPct > 0 ? rawPct * 100 : null;
        const flatAmount = pickLightspeedNumber(d, 'discountAmount', 'DiscountAmount');
        result.set(discountId, {
          percentOf100,
          flatAmount: flatAmount != null && flatAmount > 0 ? flatAmount : null,
        });
      } catch (err) {
        console.warn('[live-lookup] discount fetch discountID=', discountId, '→', (err as Error).message);
      }
    }),
  );
  return result;
}

/**
 * Look up a customer's first name from Lightspeed via a LIVE API call using
 * their phone number (E164). Tries mobile, home, and work phone fields in
 * parallel. Also retries with local AU format (0xxx) in case Lightspeed stores
 * numbers without country code.
 *
 * Returns the first name title-cased, or null if not found / no credentials.
 */
export async function lookupLightspeedFirstNameByPhone(
  supabase: SupabaseClient,
  brandKey: string,
  callerE164: string,
  brandApiDebug?: BrandApiDebugCollector,
): Promise<string | null> {
  const customer = await lookupLightspeedCustomerByPhone(supabase, brandKey, callerE164, brandApiDebug);
  return customer?.firstName ?? null;
}

/**
 * Look up a Lightspeed customer by phone number and return their first + full name
 * (and customer ID) if a match is found. Used by the over-text booking flow so
 * we can skip asking for the customer's name when they're already on file.
 *
 * Returns null if Lightspeed isn't connected, no customer matches, or any error occurs.
 */
/**
 * Fast mirror-table lookup for the customer's name keyed by phone. The
 * `nest_brand_lightspeed_workorder` mirror is populated by the sync from each
 * workorder's nested Customer node, so any customer with at least one synced
 * workorder against this brand will have their `customer_name` already on
 * file — and this avoids every Lightspeed API formatting / field-name pitfall.
 */
async function lookupCustomerNameFromWorkorderMirror(
  supabase: SupabaseClient,
  brandKey: string,
  phoneE164: string,
): Promise<{ firstName: string | null; fullName: string | null } | null> {
  try {
    const { data, error } = await supabase
      .from('nest_brand_lightspeed_workorder')
      .select('customer_name, customer_id, updated_at')
      .eq('brand_key', brandKey)
      .eq('customer_phone_e164', phoneE164)
      .not('customer_name', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(10);
    if (error) {
      console.warn('[customer-lookup] mirror lookup error:', error.message);
      return null;
    }
    const rows = (data ?? []) as Array<{ customer_name: string | null }>;
    // Pick the first non-empty, non-stub name. "Customer" is the fallback
    // createLightspeedCustomer uses when Nest never collected a real name —
    // skip those so we don't address the user as "Customer".
    const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    for (const row of rows) {
      const raw = (row.customer_name ?? '').trim();
      if (!raw) continue;
      if (raw.toLowerCase() === 'customer') continue;
      const parts = raw.split(/\s+/).filter(Boolean);
      const firstRaw = parts[0] ?? null;
      const firstName = firstRaw ? titleCase(firstRaw) : null;
      const fullName = parts.map(titleCase).join(' ').trim() || null;
      return { firstName, fullName };
    }
    return null;
  } catch (err) {
    console.warn('[customer-lookup] mirror lookup threw:', (err as Error).message);
    return null;
  }
}

export async function lookupLightspeedCustomerByPhone(
  supabase: SupabaseClient,
  brandKey: string,
  callerE164: string,
  brandApiDebug?: BrandApiDebugCollector,
): Promise<{ customerId: number | null; firstName: string | null; fullName: string | null } | null> {
  try {
    const target = normaliseToE164(callerE164);
    if (!target) {
      console.log('[customer-lookup] phone normalisation failed:', JSON.stringify({ brandKey, callerE164 }));
      return null;
    }

    // FAST PATH — mirror table. Populated from synced workorders, so any
    // customer with prior service jobs is here without needing the live API.
    const mirror = await lookupCustomerNameFromWorkorderMirror(supabase, brandKey, target);
    if (mirror?.fullName || mirror?.firstName) {
      console.log(
        '[customer-lookup] mirror hit',
        JSON.stringify({ brandKey, phone: target, fullName: mirror.fullName, firstName: mirror.firstName }),
      );
      return { customerId: null, firstName: mirror.firstName, fullName: mirror.fullName };
    }

    // Get Lightspeed connection credentials
    const { data: connRow, error: connErr } = await supabase
      .from('nest_brand_portal_connections')
      .select('brand_key, access_token, refresh_token, api_endpoint, access_expires_at')
      .eq('provider', LIGHTSPEED_PROVIDER)
      .eq('brand_key', brandKey)
      .maybeSingle();
    if (connErr || !connRow) return null;

    let accessToken: string;
    let accountId: string;
    try {
      const t = await ensureValidLightspeedAccessToken(
        supabase,
        connRow as LightspeedPortalConnection,
        brandApiDebug,
      );
      accessToken = t.accessToken;
      accountId = t.accountId;
    } catch {
      return null;
    }

    const settled = await Promise.allSettled(
      buildSupportedCustomerPhoneLookupUrls(accountId, target, '20').map((url) =>
        lightspeedJsonRequest(accessToken, url, { method: 'GET', brandApiDebug }),
      ),
    );

    // Merge all returned customers, then verify each candidate's E.164 against target.
    const candidates = new Map<number, Record<string, unknown>>();
    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      mergeCustomersFromResponse(result.value, candidates);
    }

    console.log(
      '[customer-lookup] live API candidate count',
      JSON.stringify({ brandKey, phone: target, candidates: candidates.size }),
    );

    const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

    // Build a list of candidates whose E.164 contact phones match the target.
    // Iterate ALL of them — not just the first — and prefer the one with a
    // usable firstName/lastName. Stub records without a real name (e.g. created
    // by Nest's booking flow before we collected the customer's name) are
    // common, so don't bail on the first un-named match.
    const verifiedRows: Array<Record<string, unknown>> = [];
    for (const [, row] of candidates) {
      const e164s = collectContactPhoneE164sFromLightspeedCustomer(row);
      if (e164s.includes(target)) verifiedRows.push(row);
    }
    // If nothing E.164-verified, fall back to any candidate the API returned —
    // they were already returned by a phone-targeted query, so the match is
    // implicitly trustworthy even if structured phone data is missing.
    const candidateRows = verifiedRows.length > 0 ? verifiedRows : [...candidates.values()];

    const namedRow = candidateRows.find((row) => {
      const f = pickLightspeedString(row, 'firstName', 'FirstName');
      const l = pickLightspeedString(row, 'lastName', 'LastName');
      const firstClean = (f ?? '').trim().toLowerCase();
      // Skip the "Customer" stub fallback that createLightspeedCustomer writes
      // when no real name was collected.
      if (!f && !l) return false;
      if (firstClean === 'customer' && !l) return false;
      return true;
    });
    const verified = namedRow ?? candidateRows[0] ?? null;
    if (!verified) {
      console.log('[customer-lookup] no live API match', JSON.stringify({ brandKey, phone: target }));
      return null;
    }

    const firstRaw = pickLightspeedString(verified, 'firstName', 'FirstName');
    const lastRaw = pickLightspeedString(verified, 'lastName', 'LastName');
    if (!firstRaw && !lastRaw) {
      console.log(
        '[customer-lookup] live API match has no name',
        JSON.stringify({ brandKey, phone: target, customerID: verified.customerID }),
      );
      return null;
    }

    const firstName = firstRaw ? titleCase(firstRaw) : null;
    const lastName = lastRaw ? titleCase(lastRaw) : null;
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || null;
    const idBig = parseBigIntLoose((verified as Record<string, unknown>).customerID);
    const customerId = idBig !== null ? Number(idBig) : null;

    console.log(
      '[customer-lookup] live API hit',
      JSON.stringify({ brandKey, phone: target, customerId, fullName }),
    );

    return { customerId, firstName, fullName };
  } catch (err) {
    console.warn('[customer-lookup] phone lookup failed:', (err as Error).message);
    return null;
  }
}

/**
 * Build a small "customer context" prefix for customer-facing chat turns. Looks
 * up the caller in Lightspeed by their mobile (E164) and, if a match is found,
 * returns a one-block hint the model can use to address the customer by name
 * without forcing the bot to call the workorder lookup tool first.
 *
 * Returns an empty string when:
 *   - the sender handle isn't a usable phone number,
 *   - Lightspeed isn't connected for this brand,
 *   - no customer matches the phone, or
 *   - any error occurs (lookup is best-effort and must never break a turn).
 */
export async function buildLightspeedCustomerContextPrefix(args: {
  supabase: SupabaseClient;
  brandKey: string;
  senderHandle: string;
  brandApiDebug?: BrandApiDebugCollector;
}): Promise<string> {
  const { supabase, brandKey, senderHandle, brandApiDebug } = args;
  const senderE164 = normaliseToE164(senderHandle);
  if (!senderE164) return '';
  try {
    const customer = await lookupLightspeedCustomerByPhone(supabase, brandKey, senderE164, brandApiDebug);
    if (!customer || (!customer.fullName && !customer.firstName)) return '';
    const fullName = customer.fullName ?? customer.firstName ?? 'this customer';
    const firstName = customer.firstName ?? customer.fullName?.split(' ')[0] ?? null;
    const lines = [
      `[Lightspeed customer context — pulled live by mobile ${senderE164}.`,
      `This caller is on file as ${fullName}${customer.customerId ? ` (Lightspeed customerID ${customer.customerId})` : ''}.`,
      firstName
        ? `Address them as ${firstName} when it feels natural — don't be over-familiar or open every reply with their name.`
        : `Use their name when it feels natural — don't be over-familiar.`,
      `If they ask about their account, history, or workorders, lean on the workorder lookup tool for full details.]`,
      '',
    ];
    return lines.join('\n');
  } catch (err) {
    console.warn('[customer-context] Lightspeed lookup failed:', (err as Error).message);
    return '';
  }
}

/** Collect every phone we can read from a Customer payload (Contact.Phones + top-level Contact mobile fields). */
function collectContactPhoneE164sFromLightspeedCustomer(c: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const contact = (c.Contact ?? c.contact) as Record<string, unknown> | undefined;
  if (contact) {
    for (const key of ['mobile', 'Mobile', 'phoneHome', 'PhoneHome', 'phoneWork', 'PhoneWork']) {
      const v = contact[key];
      if (typeof v === 'string' && v.trim()) {
        const e = normaliseToE164(v);
        if (e) out.add(e);
      }
    }
    const phones = (contact.Phones ?? contact.phones) as Record<string, unknown> | undefined;
    if (phones) {
      const inner = (phones.ContactPhone ?? phones.contactPhone) as unknown;
      const list: unknown[] = Array.isArray(inner) ? inner : inner ? [inner] : [];
      for (const raw of list) {
        if (!raw || typeof raw !== 'object') continue;
        const r = raw as Record<string, unknown>;
        const num = r.number ?? r.Number;
        if (typeof num === 'string' && num.trim()) {
          const e = normaliseToE164(num);
          if (e) out.add(e);
        }
      }
    }
  }
  return [...out];
}

function mergeCustomersFromResponse(
  data: Record<string, unknown>,
  into: Map<number, Record<string, unknown>>,
): void {
  const node = data?.Customer;
  const list = Array.isArray(node) ? node : node ? [node] : [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const o = entry as Record<string, unknown>;
    const idBig = parseBigIntLoose(o.customerID);
    if (idBig === null) continue;
    into.set(Number(idBig), o);
  }
}

export function buildSupportedCustomerPhoneLookupUrls(
  accountId: string,
  targetE164: string,
  limit: string,
): string[] {
  const variants = new Set<string>([targetE164]);
  if (targetE164.startsWith('+61') && targetE164.length >= 11) {
    variants.add('0' + targetE164.slice(3));
    variants.add(targetE164.slice(1));
  }

  const phoneFields = ['Contact.mobile', 'Contact.phoneHome', 'Contact.phoneWork'];
  const urls: string[] = [];
  for (const phone of variants) {
    for (const field of phoneFields) {
      urls.push(
        buildAccountResourceUrl(accountId, 'Customer.json', {
          [field]: phone,
          load_relations: '["Contact"]',
          limit,
        }),
      );
    }
  }

  return urls;
}

/**
 * Resolve an existing Lightspeed customer for Nest chat bookings — **phone only**.
 *
 * Uses the supported `Contact.mobile` / `phoneHome` / `phoneWork` queries and
 * then verifies E.164 on the returned Contact. Name is never used for matching.
 */
export async function resolveLightspeedCustomerIdForBooking(
  supabase: SupabaseClient,
  brandKey: string,
  phoneE164: string,
  cachedAuth?: { accessToken: string; accountId: string },
  brandApiDebug?: BrandApiDebugCollector,
): Promise<number | null> {
  const target = normaliseToE164(phoneE164);
  if (!target) return null;

  let accessToken: string;
  let accountId: string;
  if (cachedAuth) {
    accessToken = cachedAuth.accessToken;
    accountId = cachedAuth.accountId;
  } else {
    const { data: connRow, error: connErr } = await supabase
      .from('nest_brand_portal_connections')
      .select('brand_key, access_token, refresh_token, api_endpoint, access_expires_at')
      .eq('provider', LIGHTSPEED_PROVIDER)
      .eq('brand_key', brandKey)
      .maybeSingle();
    if (connErr || !connRow) return null;
    try {
      const t = await ensureValidLightspeedAccessToken(supabase, connRow as LightspeedPortalConnection, brandApiDebug);
      accessToken = t.accessToken;
      accountId = t.accountId;
    } catch {
      return null;
    }
  }

  const pickMatching = (candidates: Map<number, Record<string, unknown>>): number | null => {
    for (const [id, row] of candidates) {
      for (const e164 of collectContactPhoneE164sFromLightspeedCustomer(row)) {
        if (e164 === target) return id;
      }
    }
    return null;
  };

  const candidates = new Map<number, Record<string, unknown>>();

  const settled = await Promise.allSettled(
    buildSupportedCustomerPhoneLookupUrls(accountId, target, '80').map((url) =>
      lightspeedJsonRequest(accessToken, url, { method: 'GET', brandApiDebug }),
    ),
  );
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    mergeCustomersFromResponse(result.value, candidates);
  }

  return pickMatching(candidates);
}

/**
 * Enrich live-fetched workorder rows with real invoice figures while the
 * access token is still in scope: `total`/`balance` from Sale.json for each
 * linked sale, and percentage discounts from Discount.json for line items that
 * carry a discountID. Without this we'd sum pre-discount unit prices and
 * report totals that diverge from the real invoice (tax, discounts, etc.).
 */
async function enrichRowsWithLiveSaleData(
  accessToken: string,
  accountId: string,
  allRows: WorkorderRow[],
  brandApiDebug?: BrandApiDebugCollector,
): Promise<{ salesFetched: number; discountsFetched: number }> {
  const liveSaleIds = [
    ...new Set(
      allRows
        .filter((r) => r.sale_id != null && (r.sale_id as number) > 0)
        .map((r) => r.sale_id as number),
    ),
  ];
  if (liveSaleIds.length > 0) {
    const saleLookup = await liveLightspeedFetchSaleTotals(accessToken, accountId, liveSaleIds, brandApiDebug);
    for (const r of allRows) {
      if (r.sale_id == null) continue;
      const sale = saleLookup.get(r.sale_id as number);
      if (!sale) continue;
      if (r.sale_total == null) r.sale_total = sale.total;
      if (r.sale_balance == null) r.sale_balance = sale.balance;
    }
  }

  const liveDiscountIds = [
    ...new Set(
      allRows.flatMap((r) => {
        const items = Array.isArray(r.workorder_line_items) ? (r.workorder_line_items as RawLineItem[]) : [];
        return items
          .filter((it) => it.discount_id != null && (it.discount_id as number) > 0)
          .map((it) => it.discount_id as number);
      }),
    ),
  ];
  if (liveDiscountIds.length > 0) {
    const discountLookup = await liveLightspeedFetchDiscounts(accessToken, accountId, liveDiscountIds, brandApiDebug);
    for (const r of allRows) {
      if (!Array.isArray(r.workorder_line_items)) continue;
      for (const item of r.workorder_line_items as RawLineItem[]) {
        if (item.discount_id == null || (item.discount_id as number) === 0) continue;
        const disc = discountLookup.get(item.discount_id as number);
        if (!disc) continue;
        // Prefer percentage discount; fall back to flat amount treated as % of unit price.
        if (disc.percentOf100 != null && disc.percentOf100 > 0) {
          item.discount_percent = disc.percentOf100;
        }
      }
    }
  }

  return { salesFetched: liveSaleIds.length, discountsFetched: liveDiscountIds.length };
}

/**
 * LIVE customer-facing workorder lookup keyed by the sender's phone number.
 * This is the PRIMARY path for "is my bike ready?" questions — it asks the
 * Lightspeed API directly instead of trusting the mirror, so archived,
 * deleted, and Done & Paid jobs can never resurface from a stale snapshot.
 *
 * Steps: find every customer record whose contact phone matches the caller's
 * E.164 (Lightspeed often holds duplicates for one person), pull each one's
 * most recent workorders, and keep only jobs that are not archived and not
 * Done & Paid. Newest first, capped at 10.
 *
 * Returns null when Lightspeed is not connected or the token/API fails —
 * callers should then fall back to the mirror as a best effort.
 */
async function liveLightspeedPhoneLookup(
  supabase: SupabaseClient,
  brandKey: string,
  phoneE164: string,
  brandApiDebug?: BrandApiDebugCollector,
): Promise<{ rows: WorkorderRow[]; matchedCustomers: number } | null> {
  const target = normaliseToE164(phoneE164);
  if (!target) return null;

  const { data: connRow, error: connErr } = await supabase
    .from('nest_brand_portal_connections')
    .select('brand_key, access_token, refresh_token, api_endpoint, access_expires_at')
    .eq('provider', LIGHTSPEED_PROVIDER)
    .eq('brand_key', brandKey)
    .maybeSingle();
  if (connErr || !connRow) {
    if (connErr) console.warn('[live-phone-lookup] connection load error:', connErr.message);
    return null;
  }

  let accessToken: string;
  let accountId: string;
  try {
    const t = await ensureValidLightspeedAccessToken(supabase, connRow as LightspeedPortalConnection, brandApiDebug);
    accessToken = t.accessToken;
    accountId = t.accountId;
  } catch (err) {
    console.warn('[live-phone-lookup] token unavailable:', (err as Error).message);
    return null;
  }

  try {
    // Find ALL customer records matching this phone (duplicates are common).
    const settled = await Promise.allSettled(
      buildSupportedCustomerPhoneLookupUrls(accountId, target, '80').map((url) =>
        lightspeedJsonRequest(accessToken, url, { method: 'GET', brandApiDebug }),
      ),
    );
    const candidates = new Map<number, Record<string, unknown>>();
    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      mergeCustomersFromResponse(result.value, candidates);
    }

    // Prefer candidates whose structured contact phones verify against the
    // target; if none verify, trust the phone-targeted query results as-is.
    const verifiedRows: Array<[number, Record<string, unknown>]> = [];
    for (const [id, row] of candidates) {
      const e164s = collectContactPhoneE164sFromLightspeedCustomer(row);
      if (e164s.includes(target)) verifiedRows.push([id, row]);
    }
    const customerEntries = (verifiedRows.length > 0 ? verifiedRows : [...candidates.entries()]).slice(0, 5);
    if (customerEntries.length === 0) {
      console.log('[live-phone-lookup] no customer match', JSON.stringify({ brandKey, phone: target }));
      return { rows: [], matchedCustomers: 0 };
    }

    const fetched = await Promise.all(
      customerEntries.map(async ([customerId, customerRow]) => {
        const firstName = pickLightspeedString(customerRow, 'firstName', 'FirstName') ?? '';
        const lastName = pickLightspeedString(customerRow, 'lastName', 'LastName') ?? '';
        const wos = await liveLightspeedWorkordersForCustomer(
          accessToken,
          accountId,
          customerId,
          brandApiDebug,
          // Customer rule: everything except archived and Done & Paid.
          (sid, archived) => !archived && sid !== DONE_AND_PAID_STATUS,
        );
        return wos
          .map((wo) =>
            lightspeedWorkorderToRow(wo, {
              id: customerId,
              name: `${firstName} ${lastName}`.trim(),
              phoneE164: target,
            }),
          )
          .filter((r): r is WorkorderRow => r != null);
      }),
    );

    const allRows = fetched.flat();
    allRows.sort((a, b) => {
      const at = a.time_in_melbourne ?? '';
      const bt = b.time_in_melbourne ?? '';
      return bt.localeCompare(at);
    });
    const rows = allRows.slice(0, 10);

    const enriched = await enrichRowsWithLiveSaleData(accessToken, accountId, rows, brandApiDebug);

    console.log(
      '[live-phone-lookup]',
      JSON.stringify({
        brandKey,
        phone: target,
        customers: customerEntries.length,
        rows: rows.length,
        salesFetched: enriched.salesFetched,
        discountsFetched: enriched.discountsFetched,
      }),
    );

    return { rows, matchedCustomers: customerEntries.length };
  } catch (err) {
    console.warn('[live-phone-lookup] failed:', (err as Error).message);
    return null;
  }
}

export async function liveLightspeedNameLookup(
  supabase: SupabaseClient,
  brandKey: string,
  rawQueryName: string,
  brandApiDebug?: BrandApiDebugCollector,
): Promise<{ rows: WorkorderRow[]; matchedCustomers: number; sourceLabel: string } | null> {
  // Pull connection (with token) — separate from the upstream `conn` query
  // because we need access_token / refresh_token columns.
  const { data: connRow, error: connErr } = await supabase
    .from('nest_brand_portal_connections')
    .select('brand_key, access_token, refresh_token, api_endpoint, access_expires_at')
    .eq('provider', LIGHTSPEED_PROVIDER)
    .eq('brand_key', brandKey)
    .maybeSingle();
  if (connErr || !connRow) {
    if (connErr) console.warn('[live-lookup] connection load error:', connErr.message);
    return null;
  }

  let accessToken: string;
  let accountId: string;
  try {
    const t = await ensureValidLightspeedAccessToken(supabase, connRow as LightspeedPortalConnection, brandApiDebug);
    accessToken = t.accessToken;
    accountId = t.accountId;
  } catch (err) {
    console.warn('[live-lookup] token refresh failed:', (err as Error).message);
    return null;
  }

  const customers = await liveLightspeedCustomerSearch(accessToken, accountId, rawQueryName, brandApiDebug);
  if (customers.length === 0) {
    return { rows: [], matchedCustomers: 0, sourceLabel: 'live Lightspeed search (no matching customer)' };
  }

  // Fetch workorders for the top 3 customer matches concurrently.
  const top = customers.slice(0, 3);
  const fetched = await Promise.all(
    top.map(async (c) => {
      const wos = await liveLightspeedWorkordersForCustomer(accessToken, accountId, c.id, brandApiDebug);
      return wos
        .map((wo) =>
          lightspeedWorkorderToRow(wo, {
            id: c.id,
            name: `${c.firstName} ${c.lastName}`.trim(),
            phoneE164: c.phoneE164,
          }),
        )
        .filter((r): r is WorkorderRow => r != null);
    }),
  );

  const allRows = fetched.flat();
  // Most recent first across all matches.
  allRows.sort((a, b) => {
    const at = a.time_in_melbourne ?? '';
    const bt = b.time_in_melbourne ?? '';
    return bt.localeCompare(at);
  });

  const enriched = await enrichRowsWithLiveSaleData(accessToken, accountId, allRows, brandApiDebug);

  console.log(
    '[live-lookup] name=',
    JSON.stringify(rawQueryName),
    'customers=',
    customers.length,
    'rows=',
    allRows.length,
    'salesFetched=',
    enriched.salesFetched,
    'discountsFetched=',
    enriched.discountsFetched,
  );

  return {
    rows: allRows.slice(0, 25),
    matchedCustomers: customers.length,
    sourceLabel: `live Lightspeed search for "${rawQueryName}" (${customers.length} customer match${customers.length === 1 ? '' : 'es'})`,
  };
}

/**
 * When a message relates to workshop / workorders / servicing, inject a factual block
 * from the mirrored Lightspeed workorder data in Supabase.
 *
 * Customer-facing mode (no `force`):
 *   - If `settings.workorder_lookup.enabled === false`, the prefix is empty.
 *   - If `require_phone_match` is true and no E.164 sender, refuse with a "I cannot
 *     find your job from this number" instruction.
 *   - If a customer name is detected in the message, prefer name-match results.
 *
 * Internal mode (force=true):
 *   - Always runs. If a customer name is detected, prefers name-match. Otherwise
 *     falls back to status / date filters.
 */
export async function buildLightspeedWorkorderPrefix(opts: {
  supabase: SupabaseClient;
  brandKey: string;
  message: string;
  force?: boolean;
  settings?: LightspeedToolSettings | null;
  /** Sender handle (phone or iMessage email) for customer-facing phone-match lookups. */
  senderHandle?: string;
  /** Brand-only: logs Lightspeed HTTP + OAuth into turn_traces for /debug. */
  brandApiDebug?: BrandApiDebugCollector;
}): Promise<string> {
  if (opts.settings && !opts.force && opts.settings.workorder_lookup.enabled === false) return '';
  if (!opts.force && !messageSuggestsWorkorderQuery(opts.message)) return '';

  const settings = opts.settings ?? null;
  const requirePhoneMatch = !opts.force && settings?.workorder_lookup.require_phone_match === true;
  let senderE164: string | null = null;
  if (requirePhoneMatch && opts.senderHandle) {
    senderE164 = normaliseToE164(opts.senderHandle);
  }
  if (requirePhoneMatch && !senderE164) {
    // Cannot identify the customer — refuse to leak any workorders.
    return [
      '[LIVE SERVICE JOB LOOKUP]',
      'We could not match this conversation to a number on file, so we cannot pull up any service job for them.',
      'If they ask whether their bike is ready, reply naturally that we cannot find a job under their number and offer to have the team double-check (mention they can call the shop or share the number used at drop-off). Do NOT name any other customers or jobs.',
      '---',
      '',
    ].join('\n');
  }

  const { data: conn } = await opts.supabase
    .from('nest_brand_portal_connections')
    .select('api_endpoint')
    .eq('brand_key', opts.brandKey)
    .eq('provider', LIGHTSPEED_PROVIDER)
    .maybeSingle();

  const { count: totalRows, error: countErr } = await opts.supabase
    .from('nest_brand_lightspeed_workorder')
    .select('*', { count: 'exact', head: true })
    .eq('brand_key', opts.brandKey);

  if (countErr) {
    console.error('[brand-lightspeed-workorders] count error:', countErr.message);
    return [
      '[LIVE SERVICE JOB LOOKUP]',
      'We could not read the mirrored service job table just now. Tell the customer the team will need to check this for them — do not invent any details.',
      '---',
      '',
    ].join('\n');
  }

  const n = totalRows ?? 0;
  if (n === 0 && !conn) {
    return [
      '[LIVE SERVICE JOB LOOKUP]',
      'No service jobs are mirrored into Nest for this business yet (POS not connected). If the customer asks about a job, say we cannot check from chat right now and offer to put them through to the team.',
      '---',
      '',
    ].join('\n');
  }

  // An empty mirror only blocks paths that READ the mirror. Customer-facing
  // phone lookups ask the Lightspeed API directly, so let them through.
  if (n === 0 && !senderE164) {
    return [
      '[LIVE SERVICE JOB LOOKUP]',
      'POS is connected but no service jobs are stored yet (sync may still be running). Tell the customer the team will need to confirm the status; do not invent any.',
      '---',
      '',
    ].join('\n');
  }

  const dateWindow = resolveDateWindow(opts.message);
  const explicitName = extractCustomerNameFromQuery(opts.message);

  // Internal mode (force) and customer-facing mode share the same select shape.
  const baseSelect =
    'workorder_id, workorder_status_id, customer_name, notes, time_in_melbourne, eta_out_melbourne, time_stamp_melbourne, updated_at_melbourne, archived, warranty, workorder_line_items, sale_id, customer_phone, customer_phone_e164, sale_total, sale_balance';

  // ── Name-aware path: if the message contains a customer name, prefer name match ──
  // Only allowed for internal mode OR for customer-facing mode where the explicit
  // name matches the sender's own name on file. We don't let a random customer
  // probe other customers' jobs by typing names.
  let rows: WorkorderRow[] = [];
  let resolvedFilter: 'name' | 'phone' | 'date' | 'active' | 'name_live' = 'active';
  let filterLabel = 'active service jobs (open, finished awaiting collection, or due today)';
  let liveFallbackUsed = false;

  if (explicitName && (opts.force || !requirePhoneMatch)) {
    try {
      rows = (await lookupLightspeedWorkordersSql(opts.supabase, {
        brandKey: opts.brandKey,
        customerName: explicitName,
        statusIds: [1, 4, 8],
        limit: 25,
      })) as unknown as WorkorderRow[];
      if (rows.length > 0) {
        resolvedFilter = 'name';
        filterLabel = `service jobs whose customer name matches "${explicitName}"`;
      }
    } catch (e) {
      console.warn('[brand-lightspeed-workorders] SQL name lookup error:', e instanceof Error ? e.message : String(e));
    }
  }

  // If a customer name was extracted and mirror SQL found nothing, stop there.
  // Do not fall through to general active/date filters or unrelated jobs leak in.
  const nameSearchExhausted = !!explicitName && (opts.force || !requirePhoneMatch) && rows.length === 0;

  if (rows.length === 0 && !nameSearchExhausted) {
    try {
      if (senderE164) {
        // PRIMARY: ask the Lightspeed API directly (customer by phone → their
        // jobs, excluding archived and Done & Paid). The mirror is only a
        // fallback — it can hold jobs that were archived, deleted, or
        // collected after the last sync, and must never drive a "your bike is
        // ready" answer on its own.
        const live = await liveLightspeedPhoneLookup(
          opts.supabase,
          opts.brandKey,
          senderE164,
          opts.brandApiDebug,
        );
        if (live) {
          rows = live.rows;
          liveFallbackUsed = true;
        } else {
          // Lightspeed unreachable — best-effort stale-mirror answer. Fetch the
          // full history (the SQL orders oldest-first with a LIMIT, so a small
          // limit would drop the newest job), trim to plausible jobs, and
          // re-check live where a still-valid token allows.
          const history = (await lookupLightspeedWorkordersSql(opts.supabase, {
            brandKey: opts.brandKey,
            customerPhoneE164: senderE164,
            limit: 200,
          })) as unknown as WorkorderRow[];
          const candidates = selectCustomerFacingWorkorders(history);
          const verification = await liveVerifyCustomerWorkorders(
            opts.supabase,
            opts.brandKey,
            candidates,
            opts.brandApiDebug,
          );
          rows = verification.verified
            ? selectCustomerFacingWorkorders(verification.rows)
            : verification.rows;
        }
        resolvedFilter = 'phone';
        filterLabel = `service jobs linked to this customer's number on file`;
      } else if (dateWindow) {
        rows = (await lookupLightspeedWorkordersSql(opts.supabase, {
          brandKey: opts.brandKey,
          fromDate: dateWindow.fromYmd,
          toDate: dateWindow.toYmd,
          limit: 300,
        })) as unknown as WorkorderRow[];
        resolvedFilter = 'date';
        filterLabel = `service jobs with ETA out on ${dateWindow.label}`;
      } else {
        rows = (await lookupLightspeedWorkordersSql(opts.supabase, {
          brandKey: opts.brandKey,
          statusIds: [1, 4, 8],
          limit: 100,
        })) as unknown as WorkorderRow[];
        resolvedFilter = 'active';
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[brand-lightspeed-workorders] SQL lookup error:', msg);
      return [
        '[LIVE SERVICE JOB LOOKUP]',
        `We could not read the service job table just now. ${msg}`,
        '---',
        '',
      ].join('\n');
    }
  }

  // ── Runtime enrichment: descriptions + sale totals ──
  await Promise.all([
    enrichLineItemDescriptions(opts.supabase, opts.brandKey, rows),
    enrichSaleTotals(opts.supabase, opts.brandKey, rows),
  ]);

  const now = new Date();
  const todayYmd = melbourneYmd(now);
  const todayLabel = melbourneLongDate(todayYmd);

  const formatOpts: WorkorderFormatOptions = {
    shareCompletedPrice: opts.force
      ? true
      : settings?.workorder_lookup.share_completed_price !== false,
    includeWorkorderId: !!opts.force, // internal staff can see WO numbers; customers cannot
  };

  const headerLines: string[] = [
    liveFallbackUsed
      ? '[LIVE SERVICE JOB LOOKUP — checked directly against Lightspeed just now (current jobs only: nothing archived or already collected & paid)]'
      : '[LIVE SERVICE JOB LOOKUP — pulled from the mirrored Lightspeed snapshot in Nest]',
    `Today (Melbourne): ${todayLabel} (${melbourneWeekday(now)}).`,
    `Filter applied: ${filterLabel}.`,
    liveFallbackUsed
      ? `Returned in this lookup: ${rows.length}.`
      : `Total service jobs in snapshot: ${n}. Returned in this lookup: ${rows.length}.`,
  ];
  if (!opts.force) {
    headerLines.push(
      'Customer-facing reply rules:',
      '- Speak naturally as the shop ("we", "us"). Do NOT say "workorder", "WO", or quote any internal job numbers.',
      '- Use the words "service", "job", or "your bike" in plain English.',
      '- Use what is on the job to answer accurately. Never invent line items, prices, dates or work that is not in the data below.',
      '- If a customer has more than one job listed, mention each clearly (e.g. "we have two jobs for you on file…") and use the drop-off date / what was on the job to distinguish them.',
      '- Status meaning for your reply: status 1 = still in the workshop, 4 = finished and ready to collect, 5 = already picked up and paid, 8 = due back today. Any other status = still with us in the workshop, not finished yet.',
      '- If they ask whether their bike is ready: the jobs below are newest first — answer from the most recent job\'s status. Finished (status 4) → yes, it\'s ready to collect. Due today (status 8) → it\'s due to be finished today. Anything else still open → not ready yet; it\'s still being worked on. Already collected (status 5) → remind them it was picked up.',
    );
    if (requirePhoneMatch) {
      headerLines.push(
        '- PRIVACY RULE (phone-match mode is ON): You can ONLY see the service job(s) below, which are matched to this customer\'s phone number. If the customer asks about a job under a different name or mentions someone else\'s bike, push back clearly — tell them you can only look up jobs linked to the phone number they\'re messaging from, and invite them to call the shop if they need help with something else.',
      );
    }
  } else {
    headerLines.push(
      'Internal staff reply rules:',
      '- You can use Job #IDs and full detail. Be brief and accurate. Status key: 1 = Open, 4 = Finished, 5 = Done & Paid (collected), 8 = Due Today.',
    );
  }
  if (!formatOpts.shareCompletedPrice) {
    headerLines.push('Business rule: do NOT quote any final price even when a job is finished — confirm collection only.');
  }

  if (rows.length === 0) {
    const noneText = (() => {
      if (resolvedFilter === 'name') {
        return `No service jobs found whose customer name matches "${explicitName}" in the Nest mirror. Reply naturally that we do not have anything on file under that name and offer to take more details (a phone number used at drop-off, or a different spelling).`;
      }
      if (resolvedFilter === 'phone') {
        return `No service jobs are linked to this customer's phone number. Tell them clearly that you can only see jobs linked to the number they're messaging from, and there's nothing on file for that number right now. Offer to have the team double-check if they drop in or call — do NOT look up or mention any other customer's jobs.`;
      }
      if (resolvedFilter === 'date') {
        return `No service jobs match that date window. Reply naturally and offer to check a different date.`;
      }
      return 'No active service jobs found right now (everything may be archived or already collected).';
    })();
    return [
      ...headerLines,
      '',
      'Matching service jobs: NONE.',
      noneText,
      '---',
      '',
    ].join('\n');
  }

  const blocks = rows.slice(0, 60).map((r) => formatWorkorderBlock(r, formatOpts));
  const blockSep = '\n\n';

  const summaryParts: string[] = [];
  const openCount = rows.filter((r) => r.workorder_status_id === 1).length;
  const finishedCount = rows.filter((r) => r.workorder_status_id === 4).length;
  const paidCount = rows.filter((r) => r.workorder_status_id === 5).length;
  const todayCount = rows.filter((r) => r.workorder_status_id === 8).length;
  const otherCount = rows.length - openCount - finishedCount - paidCount - todayCount;
  if (openCount > 0) summaryParts.push(`${openCount} still in the workshop`);
  if (finishedCount > 0) summaryParts.push(`${finishedCount} finished and ready to collect`);
  if (paidCount > 0) summaryParts.push(`${paidCount} already collected`);
  if (todayCount > 0) summaryParts.push(`${todayCount} due today`);
  if (otherCount > 0) summaryParts.push(`${otherCount} on another workshop status (treat as still in progress)`);

  const summary = summaryParts.length > 0
    ? `Summary: ${rows.length} service job${rows.length === 1 ? '' : 's'} returned — ${summaryParts.join(', ')}.`
    : `Summary: ${rows.length} service job${rows.length === 1 ? '' : 's'} returned.`;

  return [
    ...headerLines,
    '',
    summary,
    '',
    'Service jobs:',
    blocks.join(blockSep),
    rows.length > 60 ? `\n(${rows.length} total; showing first 60.)` : '',
    '---',
    '',
  ].join('\n');
}
