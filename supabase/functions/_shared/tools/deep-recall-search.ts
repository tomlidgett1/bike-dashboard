import type { ToolContract, ToolContext } from './types.ts';
import { calendarReadTool } from './calendar-read.ts';
import { emailReadTool } from './email-read.ts';
import { semanticSearchTool } from './semantic-search.ts';
import { granolaReadTool } from './granola-read.ts';

type Evidence = {
  source: 'semantic' | 'email' | 'calendar' | 'granola';
  query: string;
  content: string;
};

type TravelFact = {
  sourceQuery: string;
  date?: string;
  location?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: string;
  from?: string;
  snippet: string;
};

const STOPWORDS = new Set([
  'when', 'where', 'what', 'who', 'with', 'did', 'was', 'were', 'the', 'and',
  'that', 'this', 'have', 'about', 'into', 'from', 'there', 'then',
]);

function unique(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

function extractYears(query: string): number[] {
  return unique(query.match(/\b(?:19|20)\d{2}\b/g) ?? []).map((y) => Number(y));
}

function extractTerms(query: string): string[] {
  const words = query
    .replace(/[^\p{L}\p{N}\s@._-]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w.toLowerCase()));

  const terms = words.filter((w) =>
    /@/.test(w) ||
    /^[A-Z][\p{L}'-]+/u.test(w) ||
    /\b(?:airbnb|booking|flight|hotel|trip|internship|zoom|berlin|barcelona|linq|morgan|stanley)\b/i.test(w)
  );

  return unique(terms).slice(0, 8);
}

function extractPhrases(query: string): string[] {
  const cleaned = query.replace(/[^\p{L}\p{N}\s@._-]/gu, ' ');
  const phrases: string[] = [];
  const properPhrases = cleaned.match(/\b[A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){1,4}\b/gu) ?? [];
  phrases.push(...properPhrases);

  const afterPreposition = cleaned.match(/\b(?:to|in|at|from|about|with)\s+([A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){0,4})\b/gu) ?? [];
  for (const match of afterPreposition) {
    const phrase = match.replace(/^(?:to|in|at|from|about|with)\s+/i, '');
    phrases.push(phrase);
  }

  return unique(phrases)
    .filter((phrase) => {
      const lower = phrase.toLowerCase();
      return !/^(have i|did i|when did|who is|what is|tom lidgett)$/i.test(phrase) &&
        !lower.split(/\s+/).every((word) => STOPWORDS.has(word));
    })
    .slice(0, 8);
}

function extractPeopleFromEmailJson(raw: string): string[] {
  const names: string[] = [];
  try {
    const parsed = JSON.parse(raw);
    const results = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.results) ? parsed.results : [];
    for (const row of results) {
      for (const field of ['from', 'to']) {
        const value = String(row?.[field] ?? '');
        const match = value.match(/^"?([^"<@]+?)"?\s*</);
        if (match?.[1]) names.push(match[1].trim());
      }
    }
  } catch {
    // Ignore non-JSON tool output.
  }
  return unique(names)
    .filter((name) => !/^(tom lidgett|tom|airbnb|booking|travelperk)$/i.test(name))
    .slice(0, 6);
}

function extractInterestingTokens(raw: string): string[] {
  const tokens = [
    ...(raw.match(/\b(?:Airbnb|Splitwise|Booking\.com|TravelPerk|Lollapalooza|Festicket)\b/gi) ?? []),
    ...(raw.match(/\b(?:19|20)\d{2}-\d{2}-\d{2}\b/g) ?? []),
    ...(raw.match(/\brooms\/\d+\b/g) ?? []).map((s) => s.replace('rooms/', '')),
  ];
  return unique(tokens).slice(0, 10);
}

async function runEvidenceQuery(
  source: Evidence['source'],
  query: string,
  ctx: ToolContext,
): Promise<Evidence> {
  try {
    if (source === 'semantic') {
      const out = await semanticSearchTool.handler({ query }, ctx);
      return { source, query, content: out.content };
    }
    if (source === 'email') {
      const detailed = /\b(airbnb|booking\.com|booking|hotel|flight|itinerary|reservation|splitwise|guests?|adults?)\b/i.test(query);
      const out = await emailReadTool.handler({
        action: 'search',
        query,
        max_results: detailed ? 5 : 10,
        response_format: detailed ? 'detailed' : 'concise',
      }, ctx);
      return { source, query, content: out.content };
    }
    if (source === 'calendar') {
      const year = query.match(/\b(?:19|20)\d{2}\b/)?.[0];
      const out = await calendarReadTool.handler({
        action: 'search',
        query: query.replace(/\b(?:19|20)\d{2}\b/g, '').trim() || query,
        range: year ?? 'past 10 years',
        max_results: 50,
      }, ctx);
      return { source, query, content: out.content };
    }
    const out = await granolaReadTool.handler({ action: 'query', query }, ctx);
    return { source, query, content: out.content };
  } catch (err) {
    return { source, query, content: `ERROR: ${(err as Error).message}` };
  }
}

function parseTravelFacts(evidence: Evidence[]): TravelFact[] {
  const facts: TravelFact[] = [];
  for (const item of evidence) {
    if (item.source !== 'email') continue;
    try {
      const parsed = JSON.parse(item.content);
      const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.results) ? parsed.results : [];
      for (const row of rows) {
        const combined = `${row.snippet ?? ''}\n${row.body_preview ?? ''}\n${row.body ?? ''}`;
        const airbnbUrl = combined.match(/airbnb\.com\.au\/rooms\/\d+\?[^"\s\\]+/i)?.[0];
        const checkIn = combined.match(/check_in=([0-9-]+)/i)?.[1];
        const checkOut = combined.match(/check_out=([0-9-]+)/i)?.[1];
        const location = combined.match(/location=([^&\s]+)/i)?.[1];
        const guests = combined.match(/(?:guests|adults)=([0-9]+)/i)?.[1];
        const hasTravelSignal = airbnbUrl || /\b(booking confirmed|trip confirmed|reservation|itinerary|splitwise|airbnb|hotel|flight|transfer|shuttle|transport|drop you off|pick up)\b/i.test(combined);
        if (!hasTravelSignal) continue;
        facts.push({
          sourceQuery: item.query,
          date: row.date,
          location: location ? decodeURIComponent(location.replace(/\+/g, ' ')) : undefined,
          checkIn,
          checkOut,
          guests,
          from: row.from,
          snippet: String(row.snippet ?? row.body_preview ?? '').slice(0, 500),
        });
      }
    } catch {
      // Ignore non-JSON evidence.
    }
  }
  return facts
    .sort((a, b) => {
      const score = (fact: TravelFact) =>
        (fact.location ? 8 : 0) +
        (fact.checkIn ? 5 : 0) +
        (fact.checkOut ? 5 : 0) +
        (fact.guests ? 2 : 0) -
        (/newsletter|updates@travelperk/i.test(`${fact.from} ${fact.snippet}`) ? 4 : 0);
      return score(b) - score(a);
    })
    .slice(0, 12);
}

function buildInitialQueries(userQuery: string): Array<{ source: Evidence['source']; query: string }> {
  const years = extractYears(userQuery);
  const terms = extractTerms(userQuery);
  const phrases = extractPhrases(userQuery);
  const core = unique([userQuery, ...phrases, terms.join(' '), terms.slice(0, 4).join(' ')].filter(Boolean));
  const queries: Array<{ source: Evidence['source']; query: string }> = [];

  const recallLooksTravelRelated =
    /\b(go|went|been|visit|visited|travel|trip|holiday|flight|hotel|airbnb|booking|stay|with who|who with)\b/i.test(userQuery);
  if (recallLooksTravelRelated) {
    const phraseTravelSources = ['hotel', 'flight', 'booking', 'reservation', 'transfer', 'shuttle', 'transport', 'Airbnb', 'Booking.com', 'Splitwise'];
    for (const phrase of phrases) {
      queries.push({ source: 'email', query: `"${phrase}"` });
      queries.push({ source: 'email', query: `Cairns "${phrase}"` });
      for (const source of phraseTravelSources) {
        queries.push({ source: 'email', query: `"${phrase}" ${source}` });
      }
    }
  }

  for (const q of core) queries.push({ source: 'semantic', query: q });
  for (const q of core) queries.push({ source: 'email', query: q });
  for (const q of core.slice(0, 2)) queries.push({ source: 'calendar', query: years[0] ? `${q} ${years[0]}` : q });
  for (const q of core.slice(0, 1)) queries.push({ source: 'granola', query: q });

  if (recallLooksTravelRelated) {
    const travelSources = ['Airbnb', 'Booking.com', 'booking', 'hotel', 'flight', 'itinerary', 'reservation', 'Splitwise'];
    for (const phrase of phrases) {
      queries.push({ source: 'email', query: `"${phrase}"` });
      queries.push({ source: 'email', query: `Cairns "${phrase}"` });
      for (const source of travelSources) {
        queries.push({ source: 'email', query: `"${phrase}" ${source}` });
        queries.push({ source: 'email', query: `${source} "${phrase}"` });
      }
    }
    for (const term of terms.slice(0, 5)) {
      for (const source of travelSources) {
        queries.push({ source: 'email', query: `${source} ${term}` });
      }
    }
  }

  for (const year of years) {
    const start = `${year}/01/01`;
    const end = `${year + 1}/01/01`;
    for (const term of terms.slice(0, 5)) {
      queries.push({ source: 'email', query: `${term} after:${start} before:${end}` });
    }
    const travelTerms = unique(['Airbnb', 'Booking.com', 'flight', 'hotel', 'Splitwise', ...terms]);
    for (const term of travelTerms.slice(0, 8)) {
      queries.push({ source: 'email', query: `${term} after:${start} before:${end}` });
    }
  }

  return unique(queries.map((q) => `${q.source}\t${q.query}`))
    .map((encoded) => {
      const [source, query] = encoded.split('\t') as [Evidence['source'], string];
      return { source, query };
    })
    .slice(0, 36);
}

function buildExpansionQueries(
  userQuery: string,
  evidence: Evidence[],
): Array<{ source: Evidence['source']; query: string }> {
  const years = extractYears(userQuery);
  const terms = extractTerms(userQuery);
  const people = unique(evidence.flatMap((e) => extractPeopleFromEmailJson(e.content)));
  const interesting = unique(evidence.flatMap((e) => extractInterestingTokens(e.content)));
  const queries: Array<{ source: Evidence['source']; query: string }> = [];

  for (const year of years.length ? years : [undefined]) {
    const dateSuffix = year ? ` after:${year}/01/01 before:${year + 1}/01/01` : '';
    for (const person of people.slice(0, 5)) {
      for (const term of terms.slice(0, 4)) {
        queries.push({ source: 'email', query: `${person} ${term}${dateSuffix}` });
      }
      queries.push({ source: 'email', query: `Splitwise ${person}${dateSuffix}` });
      queries.push({ source: 'semantic', query: `${userQuery} ${person}` });
    }
    for (const token of interesting.slice(0, 8)) {
      queries.push({ source: 'email', query: `${token}${dateSuffix}` });
      queries.push({ source: 'semantic', query: `${userQuery} ${token}` });
    }
  }

  return queries.slice(0, 16);
}

function summariseEvidence(evidence: Evidence[]): string {
  return evidence
    .map((e, index) => {
      const preview = e.content.length > 3200 ? `${e.content.slice(0, 3200)}\n...[truncated]` : e.content;
      return `[${index + 1}] ${e.source.toUpperCase()} query="${e.query}"\n${preview}`;
    })
    .join('\n\n');
}

function scoreEvidence(userQuery: string, evidence: Evidence): number {
  const qTerms = extractTerms(userQuery).map((term) => term.toLowerCase());
  const text = evidence.content.toLowerCase();
  let score = 0;

  for (const term of qTerms) {
    if (text.includes(term.toLowerCase())) score += 2;
  }
  if (/\b(airbnb|check_in|check-out|check_out|guests|adults|reservation|booking confirmed|itinerary|flight|hotel|splitwise|transfer|shuttle|transport|drop you off|pick up)\b/i.test(evidence.content)) {
    score += 8;
  }
  if (/\b(20\d{2}|19\d{2})[-/]\d{1,2}[-/]\d{1,2}\b/.test(evidence.content)) {
    score += 3;
  }
  if (/"from":"[^"]+<(?![^>]*blacklane\.com)[^>]+>"/i.test(evidence.content)) {
    score += 2;
  }
  if (/\b(newsletter|weekly|leadership team|team\.newsletter|mm apac|blacklane newsletter)\b/i.test(evidence.content)) {
    score -= 5;
  }
  if (/blacklane\.com/i.test(evidence.content) && !/travelperk|booking|itinerary|flight/i.test(evidence.content)) {
    score -= 2;
  }

  return score;
}

async function runEvidenceQueries(
  queries: Array<{ source: Evidence['source']; query: string }>,
  ctx: ToolContext,
  concurrency = 4,
): Promise<Evidence[]> {
  const results: Evidence[] = [];
  for (let i = 0; i < queries.length; i += concurrency) {
    const batch = queries.slice(i, i + concurrency);
    results.push(...await Promise.all(
      batch.map((q) => runEvidenceQuery(q.source, q.query, ctx)),
    ));
  }
  return results;
}

export const deepRecallSearchTool: ToolContract = {
  name: 'deep_recall_search',
  description:
    'Deterministically search all connected personal-history sources for recall questions. Use this as the first tool for personal recall, old trips, people, dates, conversations, and "with who" questions. It expands across semantic memory, email, calendar, and meeting notes, then returns an evidence ledger.',
  namespace: 'knowledge.search',
  sideEffect: 'read',
  idempotent: true,
  timeoutMs: 45000,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The exact personal recall question from the user.',
      },
    },
    required: ['query'],
  },
  handler: async (input, ctx) => {
    const query = String(input.query ?? '').trim();
    if (!query) return { content: 'Missing recall query.' };

    const initialQueries = buildInitialQueries(query);
    const initialEvidence = await runEvidenceQueries(initialQueries, ctx);

    const expansionQueries = buildExpansionQueries(query, initialEvidence);
    const expansionEvidence = await runEvidenceQueries(expansionQueries, ctx);

    const evidence = [...initialEvidence, ...expansionEvidence]
      .filter((e) => !/"results":\[\]/.test(e.content) && !/No events matching|No emails found|No results found/i.test(e.content))
      .sort((a, b) => scoreEvidence(query, b) - scoreEvidence(query, a))
      .slice(0, 24);

    const people = unique(evidence.flatMap((e) => extractPeopleFromEmailJson(e.content)));
    const interesting = unique(evidence.flatMap((e) => extractInterestingTokens(e.content)));
    const travelFacts = parseTravelFacts(evidence);
    const birthdayInference = /\b(birthday|birthdate|date of birth|dob)\b/i.test(query);

    return {
      content: [
        `DEEP_RECALL_SEARCH evidence_count=${evidence.length}`,
        birthdayInference
          ? "PERSONAL_ATTRIBUTE_CAUTION: For birthday/date-of-birth questions, generic calendar entries like \"Happy birthday!\" are weak clues only unless the event/email explicitly identifies the birthday as the user's. Do not assert a date as fact from generic birthday events alone."
          : "",
        people.length ? `Possible people surfaced: ${people.join(', ')}` : 'Possible people surfaced: none',
        interesting.length ? `Useful tokens surfaced: ${interesting.join(', ')}` : 'Useful tokens surfaced: none',
        travelFacts.length
          ? `Candidate travel facts:\n${travelFacts.map((fact, index) =>
            `${index + 1}. query="${fact.sourceQuery}" date=${fact.date ?? '?'} from=${fact.from ?? '?'} location=${fact.location ?? '?'} check_in=${fact.checkIn ?? '?'} check_out=${fact.checkOut ?? '?'} guests=${fact.guests ?? '?'} snippet=${fact.snippet}`
          ).join('\n')}`
          : 'Candidate travel facts: none',
        '',
        summariseEvidence(evidence),
      ].join('\n'),
      structuredData: {
        evidence_count: evidence.length,
        people,
        interesting_tokens: interesting,
        travel_facts: travelFacts,
        initial_query_count: initialQueries.length,
        expansion_query_count: expansionQueries.length,
      },
    };
  },
};
