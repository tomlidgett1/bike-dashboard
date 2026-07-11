import { getOptionalEnv } from './env.ts';
import { getAdminClient } from './supabase.ts';
import { getInternalEdgeSharedSecret } from './internal-auth.ts';
import * as linqApi from './linq.ts';
import type { LinqTextDecoration, NormalisedIncomingMessage, WebhookEvent } from './linq.ts';
import { cleanResponse, extractTextDecorations } from './imessage-text-format.ts';
import { getUserProfile, getConversation } from './state.ts';
import { NEST_CONVERSATION_ENGAGEMENT } from './conversation-engagement.ts';
import { enrichOutboundGoalWithKnowledge } from './brand-knowledge.ts';
import {
  buildConversationRecordingProxyUrl,
  fetchElevenLabsConversation,
  fetchTwilioCallStatus,
  resolvePhoneNumberId,
  startElevenLabsOutboundCall,
} from './elevenlabs-outbound.ts';
import { handleNestOutboundPostCall, pollNestOutboundCalls } from './nest-outbound.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const encoder = new TextEncoder();

type BuzzSessionStatus = 'active' | 'ended' | 'expired';
type BuzzJobStatus =
  | 'drafted'
  | 'awaiting_like'
  | 'approved'
  | 'calling'
  | 'connected'
  | 'no_answer'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired';

interface BuzzSessionRow {
  id: string;
  chat_id: string;
  user_handle: string;
  bot_number: string;
  status: BuzzSessionStatus;
  metadata?: Record<string, unknown>;
}

interface BuzzCallJobRow {
  id: string;
  session_id: string | null;
  chat_id: string;
  user_handle: string;
  bot_number: string;
  request_text: string;
  merchant_query: string | null;
  merchant_name: string | null;
  merchant_phone: string | null;
  merchant_address: string | null;
  google_place_id: string | null;
  google_maps_uri: string | null;
  goal_prompt: string | null;
  approval_message_id: string | null;
  status: BuzzJobStatus;
  elevenlabs_conversation_id: string | null;
  twilio_call_sid: string | null;
  metadata: Record<string, unknown>;
}

interface BuzzCallPlan {
  merchantQuery: string;
  locationHint: string;
  taskSummary: string;
  objective: string;
  approach: string[];
  constraints: string[];
  preferredTime: string;
}

interface PlaceCandidate {
  name: string;
  phone: string;
  address: string;
  placeId: string;
  mapsUri: string;
}

type BuzzRouteAction = 'casual' | 'search_places' | 'prepare_call';

interface BuzzRouteDecision {
  action: BuzzRouteAction;
  reply?: string;
  searchQuery?: string;
  callTarget?: string;
  callObjective?: string;
  selectedPlaceIndex?: number | null;
}

interface BuzzUserContext {
  location: string;
  timezone: string;
  nowText: string;
  historyContext: string;
}

const SESSION_TTL_HOURS = 6;
const BUZZ_AGENT_ID = getOptionalEnv('ELEVENLABS_AGENT_ID') || 'agent_5301krncw5w8ez99baz9eqrtg0nh';
const FALLBACK_LOCATION = 'Melbourne, Australia';

function buzzEnabled(): boolean {
  return (getOptionalEnv('BUZZ_CALLS_ENABLED') || 'false') === 'true';
}

function looksLikeBuzzWake(text: string): boolean {
  return /^(hey\s+)?buzz[!. ]*$/i.test(text.trim()) || /\bhey\s+buzz\b/i.test(text);
}

function looksLikeBuzzExit(text: string): boolean {
  return /^(stop|exit|cancel|done|leave)\s+buzz\b|^buzz\s+(stop|exit|cancel|done)$/i.test(text.trim());
}

function sessionExpiry(): string {
  return new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();
}

function getSessionMetadata(session: BuzzSessionRow): Record<string, unknown> {
  const maybe = (session as unknown as { metadata?: unknown }).metadata;
  return maybe && typeof maybe === 'object' && !Array.isArray(maybe) ? maybe as Record<string, unknown> : {};
}

function formatNow(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-AU', {
      timeZone: timezone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date());
  } catch {
    return new Date().toISOString();
  }
}

async function loadBuzzUserContext(message: NormalisedIncomingMessage): Promise<BuzzUserContext> {
  const profile = await getUserProfile(message.from).catch(() => null);
  const context = profile?.contextProfile ?? null;
  const storedLocation =
    context?.currentLocation?.value ||
    context?.homeLocation?.value ||
    context?.workLocation?.value ||
    null;
  // Always default to Melbourne when no stored location
  const location = storedLocation || 'Melbourne, Australia';
  const timezone = context?.timezone || 'Australia/Melbourne';

  // Load last 10 Buzz messages for conversation history
  let historyContext = '';
  try {
    const messages = await getConversation(message.chatId, 10, NEST_CONVERSATION_ENGAGEMENT);
    if (messages.length > 0) {
      historyContext = messages
        .map((m) => `${m.role === 'assistant' ? 'Buzz' : 'User'}: ${m.content}`)
        .join('\n');
    }
  } catch {
    // non-fatal
  }

  return {
    location,
    timezone,
    nowText: formatNow(timezone),
    historyContext,
  };
}

async function sendBuzzMessage(chatId: string, markdown: string, replyToMessageId?: string | null): Promise<string | null> {
  const cleaned = cleanResponse(markdown);
  const parsed = extractTextDecorations(cleaned);
  const response = await linqApi.sendMessage(
    chatId,
    parsed.value,
    undefined,
    undefined,
    replyToMessageId ? { message_id: replyToMessageId } : undefined,
    parsed.text_decorations as LinqTextDecoration[],
  );
  return response.message?.id ?? null;
}

async function logBuzzEvent(params: {
  sessionId?: string | null;
  jobId?: string | null;
  chatId: string;
  eventType: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await getAdminClient().from('buzz_events').insert({
    session_id: params.sessionId ?? null,
    call_job_id: params.jobId ?? null,
    chat_id: params.chatId,
    event_type: params.eventType,
    payload: params.payload ?? {},
  });
  if (error) console.warn('[buzz] event insert failed:', error.message);
}

async function findActiveSession(message: NormalisedIncomingMessage): Promise<BuzzSessionRow | null> {
  const { data, error } = await getAdminClient()
    .from('buzz_sessions')
    .select('id, chat_id, user_handle, bot_number, status, metadata')
    .eq('chat_id', message.chatId)
    .eq('user_handle', message.from)
    .eq('bot_number', message.conversation.fromNumber)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle<BuzzSessionRow>();
  if (error) {
    console.warn('[buzz] session lookup failed:', error.message);
    return null;
  }
  return data ?? null;
}

async function activateSession(message: NormalisedIncomingMessage): Promise<BuzzSessionRow | null> {
  const { data, error } = await getAdminClient()
    .from('buzz_sessions')
    .upsert({
      chat_id: message.chatId,
      user_handle: message.from,
      bot_number: message.conversation.fromNumber,
      status: 'active',
      last_active_at: new Date().toISOString(),
      expires_at: sessionExpiry(),
      metadata: {
        service: message.service ?? null,
        is_group_chat: message.isGroupChat,
      },
    }, { onConflict: 'chat_id,user_handle,bot_number' })
    .select('id, chat_id, user_handle, bot_number, status, metadata')
    .single<BuzzSessionRow>();
  if (error) {
    console.error('[buzz] activate session failed:', error.message);
    return null;
  }
  await logBuzzEvent({ sessionId: data.id, chatId: message.chatId, eventType: 'session_started' });
  return data;
}

async function touchSession(sessionId: string): Promise<void> {
  await getAdminClient()
    .from('buzz_sessions')
    .update({ last_active_at: new Date().toISOString(), expires_at: sessionExpiry() })
    .eq('id', sessionId);
}

async function endSession(session: BuzzSessionRow): Promise<void> {
  await getAdminClient()
    .from('buzz_sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', session.id);
  await logBuzzEvent({ sessionId: session.id, chatId: session.chat_id, eventType: 'session_ended' });
}

async function routeBuzzTurn(params: {
  text: string;
  context: BuzzUserContext;
  session: BuzzSessionRow;
}): Promise<BuzzRouteDecision> {
  const { text, context, session } = params;
  const metadata = getSessionMetadata(session);
  const recentPlaces = Array.isArray(metadata.last_places)
    ? (metadata.last_places as Array<Record<string, unknown>>).slice(0, 6)
    : [];

  const fallback = (): BuzzRouteDecision => {
    if (/\b(call|phone|ring)\b/i.test(text)) {
      return { action: 'prepare_call', callObjective: text, callTarget: extractDirectPhoneNumber(text) ?? text };
    }
    if (/\b(open|near me|restaurant|cafe|bar|place|places|nearby|around me|where)\b/i.test(text)) {
      return { action: 'search_places', searchQuery: text };
    }
    return { action: 'casual', reply: "I can help find places and make calls. Tell me what you're trying to do." };
  };

  const apiKey = getOptionalEnv('OPENAI_API_KEY') || getOptionalEnv('NEST_OPENAI_API_KEY');
  if (!apiKey) return fallback();

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: getOptionalEnv('BUZZ_ROUTER_MODEL') || 'gpt-5.4-nano',
        temperature: 0,
        max_completion_tokens: 500,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are Buzz's router. Buzz is a location and phone-calling assistant, not a command parser.

Classify the user's message into exactly one action:
- casual: conversational reply, no maps or call yet.
- search_places: user asks for places, venues, what's open, where to go, nearby options, current availability context, etc.
- prepare_call: user wants Buzz to call someone, call a selected previous place, call a phone number, or arrange/ask/discuss something by phone.

Return JSON:
{
  "action": "casual" | "search_places" | "prepare_call",
  "reply": "short reply for casual only",
  "searchQuery": "Google Maps query for search_places",
  "callTarget": "phone number, merchant name, or selected previous place label",
  "callObjective": "open-ended objective for the call",
  "selectedPlaceIndex": number|null
}

Current time: ${context.nowText}
User location: ${context.location}
Recent places from last Buzz search: ${JSON.stringify(recentPlaces)}
${context.historyContext ? `\nRecent conversation:\n${context.historyContext}` : ''}

Do not require words like call/ask/book. Infer intent semantically.`,
          },
          { role: 'user', content: text },
        ],
      }),
    });
    if (!response.ok) return fallback();
    const data = await response.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}') as Record<string, unknown>;
    const action = parsed.action === 'search_places' || parsed.action === 'prepare_call' || parsed.action === 'casual'
      ? parsed.action
      : fallback().action;
    return {
      action,
      reply: typeof parsed.reply === 'string' ? parsed.reply : undefined,
      searchQuery: typeof parsed.searchQuery === 'string' ? parsed.searchQuery : undefined,
      callTarget: typeof parsed.callTarget === 'string' ? parsed.callTarget : undefined,
      callObjective: typeof parsed.callObjective === 'string' ? parsed.callObjective : text,
      selectedPlaceIndex: typeof parsed.selectedPlaceIndex === 'number' ? parsed.selectedPlaceIndex : null,
    };
  } catch (err) {
    console.warn('[buzz] route failed:', (err as Error).message);
    return fallback();
  }
}

async function parseCallPlan(text: string): Promise<BuzzCallPlan> {
  const fallback: BuzzCallPlan = {
    merchantQuery: text.replace(/\b(please|can you|call|phone|ring)\b/gi, '').trim().slice(0, 160) || text.trim(),
    locationHint: FALLBACK_LOCATION,
    taskSummary: text.trim(),
    objective: text.trim(),
    approach: ['Use the user request as the call objective. Ask natural follow-up questions as needed.'],
    constraints: [],
    preferredTime: '',
  };
  const apiKey = getOptionalEnv('OPENAI_API_KEY') || getOptionalEnv('NEST_OPENAI_API_KEY');
  if (!apiKey) return fallback;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: getOptionalEnv('BUZZ_PLANNER_MODEL') || 'gpt-5.4-nano',
        temperature: 0,
        max_completion_tokens: 700,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Extract an open-ended phone-call plan. Do not force the request into fixed questions. Return JSON with merchantQuery, locationHint, taskSummary, objective, approach array, constraints array, preferredTime. merchantQuery is the business/person/search target if not a direct phone number. objective should preserve the user intent in natural language. approach should be flexible call strategy steps, not a rigid script. Default locationHint to Melbourne, Australia when absent. User location context: ${FALLBACK_LOCATION}.`,
          },
          { role: 'user', content: text },
        ],
      }),
    });
    if (!response.ok) return fallback;
    const data = await response.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    return {
      merchantQuery: String(parsed.merchantQuery || fallback.merchantQuery).trim(),
      locationHint: String(parsed.locationHint || fallback.locationHint).trim(),
      taskSummary: String(parsed.taskSummary || fallback.taskSummary).trim(),
      objective: String(parsed.objective || parsed.taskSummary || fallback.objective).trim(),
      approach: Array.isArray(parsed.approach) && parsed.approach.length > 0
        ? parsed.approach.map((q: unknown) => String(q)).filter(Boolean).slice(0, 8)
        : fallback.approach,
      constraints: Array.isArray(parsed.constraints)
        ? parsed.constraints.map((q: unknown) => String(q)).filter(Boolean).slice(0, 8)
        : [],
      preferredTime: String(parsed.preferredTime || '').trim(),
    };
  } catch (err) {
    console.warn('[buzz] plan parse failed:', (err as Error).message);
    return fallback;
  }
}

function normalisePhoneNumber(raw: string): string | null {
  const compact = raw.replace(/[^\d+]/g, '');
  if (/^\+61[2-478]\d{8}$/.test(compact)) return compact;
  if (/^0[2-478]\d{8}$/.test(compact)) return `+61${compact.slice(1)}`;
  if (/^61[2-478]\d{8}$/.test(compact)) return `+${compact}`;
  return null;
}

function extractDirectPhoneNumber(text: string): string | null {
  const candidates = text.match(/(?:\+?61|0)?[\s().-]*(?:[2-478])(?:[\s().-]*\d){8}/g) ?? [];
  for (const candidate of candidates) {
    const normalised = normalisePhoneNumber(candidate);
    if (normalised) return normalised;
  }
  return null;
}

function directPhonePlace(phone: string): PlaceCandidate {
  return {
    name: 'Provided phone number',
    phone,
    address: '',
    placeId: '',
    mapsUri: '',
  };
}

async function lookupPlace(plan: BuzzCallPlan): Promise<PlaceCandidate | null> {
  const key = getOptionalEnv('GOOGLE_MAPS_API_KEY');
  if (!key) throw new Error('GOOGLE_MAPS_API_KEY is not configured');

  const query = `${plan.merchantQuery} ${plan.locationHint}`.trim();
  const searchUrl = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
  searchUrl.searchParams.set('query', query);
  searchUrl.searchParams.set('key', key);
  // Bias toward Melbourne CBD when using default location
  searchUrl.searchParams.set('location', '-37.8136,144.9631');
  searchUrl.searchParams.set('radius', '40000');
  searchUrl.searchParams.set('region', 'au');
  const search = await fetch(searchUrl);
  const searchData = await search.json();
  const first = searchData.results?.[0];
  if (!first?.place_id) return null;

  const detailsUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  detailsUrl.searchParams.set('place_id', first.place_id);
  detailsUrl.searchParams.set('fields', 'name,formatted_address,international_phone_number,formatted_phone_number,url');
  detailsUrl.searchParams.set('key', key);
  const details = await fetch(detailsUrl);
  const detailsData = await details.json();
  const result = detailsData.result || {};
  const phone = result.international_phone_number || result.formatted_phone_number || '';
  if (!phone) return null;

  return {
    name: result.name || first.name || plan.merchantQuery,
    phone,
    address: result.formatted_address || first.formatted_address || '',
    placeId: first.place_id,
    mapsUri: result.url || '',
  };
}

async function searchPlaces(query: string, context: BuzzUserContext): Promise<PlaceCandidate[]> {
  const key = getOptionalEnv('GOOGLE_MAPS_API_KEY');
  if (!key) throw new Error('GOOGLE_MAPS_API_KEY is not configured');

  const searchQuery = context.location ? `${query} near ${context.location}` : query;
  const searchUrl = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
  searchUrl.searchParams.set('query', searchQuery);
  searchUrl.searchParams.set('key', key);
  // Always bias toward Melbourne; override with stored location coords if available
  searchUrl.searchParams.set('location', '-37.8136,144.9631');
  searchUrl.searchParams.set('radius', '40000');
  searchUrl.searchParams.set('region', 'au');
  if (/\bopen|open now|at the moment|right now|currently\b/i.test(query)) {
    searchUrl.searchParams.set('opennow', 'true');
  }
  const response = await fetch(searchUrl);
  const payload = await response.json();
  const results = Array.isArray(payload.results) ? payload.results.slice(0, 5) : [];
  const places: PlaceCandidate[] = [];
  for (const result of results) {
    if (!result.place_id) continue;
    const detailsUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    detailsUrl.searchParams.set('place_id', result.place_id);
    detailsUrl.searchParams.set('fields', 'name,formatted_address,international_phone_number,formatted_phone_number,url,opening_hours');
    detailsUrl.searchParams.set('key', key);
    const details = await fetch(detailsUrl);
    const detailsData = await details.json();
    const detail = detailsData.result || {};
    places.push({
      name: detail.name || result.name || query,
      phone: detail.international_phone_number || detail.formatted_phone_number || '',
      address: detail.formatted_address || result.formatted_address || '',
      placeId: result.place_id,
      mapsUri: detail.url || '',
    });
  }
  return places;
}

function formatPlaceSearchResponse(places: PlaceCandidate[], context: BuzzUserContext): string {
  if (places.length === 0) {
    return `**Buzz search**\n\nI couldn't find a good open-place match${context.location ? ` near ${context.location}` : ''}. Send a suburb or a more specific venue type and I'll try again.`;
  }
  const rows = places.map((place, index) => {
    const phone = place.phone ? `\n${place.phone}` : '\nNo phone listed';
    return `**${index + 1}. ${place.name}**\n${place.address}${phone}`;
  }).join('\n\n');
  return `**Buzz found these**\n\n${rows}\n\nReply with something like "call 1" or "call the second one and ask about a table."`;
}

function placeFromPreviousSelection(session: BuzzSessionRow, selectedPlaceIndex: number | null | undefined): PlaceCandidate | null {
  if (!selectedPlaceIndex || selectedPlaceIndex < 1) return null;
  const places = getSessionMetadata(session).last_places;
  if (!Array.isArray(places)) return null;
  const raw = places[selectedPlaceIndex - 1] as Record<string, unknown> | undefined;
  if (!raw) return null;
  const phone = typeof raw.phone === 'string' ? raw.phone : '';
  if (!phone) return null;
  return {
    name: typeof raw.name === 'string' ? raw.name : `Option ${selectedPlaceIndex}`,
    phone,
    address: typeof raw.address === 'string' ? raw.address : '',
    placeId: typeof raw.placeId === 'string' ? raw.placeId : '',
    mapsUri: typeof raw.mapsUri === 'string' ? raw.mapsUri : '',
  };
}

function buildGoalPrompt(plan: BuzzCallPlan, place: PlaceCandidate): string {
  const approach = plan.approach.map((q) => `- ${q}`).join('\n');
  const constraints = plan.constraints.length > 0
    ? `\nConstraints:\n${plan.constraints.map((c) => `- ${c}`).join('\n')}`
    : '';
  const preferredTime = plan.preferredTime ? `\nTime context: ${plan.preferredTime}` : '';
  const addressLine = place.address ? `\nAddress: ${place.address}` : '';
  return `Call ${place.name} at ${place.phone}.${addressLine}

Task: ${plan.objective || plan.taskSummary}
${preferredTime}

Approach:
${approach}
${constraints}`;
}

function approvalText(plan: BuzzCallPlan, place: PlaceCandidate): string {
  const approach = plan.approach.map((q) => `• ${q}`).join('\n');
  return `**Buzz call ready**

**Calling:** ${place.name}
${place.phone}${place.address ? `\n${place.address}` : ''}

**For:** ${plan.taskSummary}

**Plan:**
${approach}

**Approve:** Like this message and I'll make the call.`;
}

export async function handleBuzzMessage(message: NormalisedIncomingMessage): Promise<boolean> {
  if (!buzzEnabled()) return false;
  const text = message.text.trim();
  if (!text) return false;

  if (looksLikeBuzzWake(text)) {
    const session = await activateSession(message);
    await sendBuzzMessage(
      message.chatId,
      `**Buzz mode on**\n\nTell me who to call and what to ask. Example: "Call Tipo 00 and ask if they have a table for four tomorrow night."`,
      message.messageId,
    );
    return Boolean(session);
  }

  const session = await findActiveSession(message);
  if (!session) return false;
  await touchSession(session.id);

  if (looksLikeBuzzExit(text)) {
    await endSession(session);
    await sendBuzzMessage(message.chatId, `**Buzz mode off**\n\nBack to normal Nest.`, message.messageId);
    return true;
  }

  const context = await loadBuzzUserContext(message);

  // If there's a pending job awaiting approval, let the user refine it conversationally
  const supabaseForPending = getAdminClient();
  const { data: pendingJob } = await supabaseForPending
    .from('buzz_call_jobs')
    .select('id, session_id, chat_id, user_handle, bot_number, request_text, merchant_query, merchant_name, merchant_phone, merchant_address, google_place_id, google_maps_uri, goal_prompt, approval_message_id, status, elevenlabs_conversation_id, twilio_call_sid, metadata')
    .eq('session_id', session.id)
    .eq('status', 'awaiting_like')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<BuzzCallJobRow>();

  if (pendingJob) {
    // Let an LLM decide what to do with the refinement
    const apiKey = getOptionalEnv('OPENAI_API_KEY') || getOptionalEnv('NEST_OPENAI_API_KEY');
    if (apiKey) {
      const refinementRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: getOptionalEnv('BUZZ_ROUTER_MODEL') || 'gpt-5.4-nano',
          temperature: 0,
          max_completion_tokens: 600,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `There is a pending Buzz call plan waiting for approval. The user may be:
- refining the plan (e.g. "don't say that", "ask this instead", "change the approach")
- cancelling (e.g. "cancel", "forget it", "don't call")
- approving (e.g. "yes", "looks good", "do it") — though normally done via like reaction

Return JSON: { "action": "refine"|"cancel"|"approve"|"ignore", "refinement_note": "what they want changed" }
Default: "ignore" if it's unrelated to editing the pending plan.`,
            },
            {
              role: 'user',
              content: `Pending plan:\nCalling: ${pendingJob.merchant_name} (${pendingJob.merchant_phone})\nObjective: ${pendingJob.request_text}\n\nUser message: "${text}"`,
            },
          ],
        }),
      });
      if (refinementRes.ok) {
        const refinementData = await refinementRes.json();
        const parsed = JSON.parse(refinementData.choices?.[0]?.message?.content || '{}') as { action?: string; refinement_note?: string };

        if (parsed.action === 'cancel') {
          await supabaseForPending.from('buzz_call_jobs').update({ status: 'cancelled' }).eq('id', pendingJob.id);
          await sendBuzzMessage(message.chatId, `Cancelled. What else can I help with?`, message.messageId);
          return true;
        }

        if (parsed.action === 'approve') {
          await supabaseForPending.from('buzz_call_jobs').update({ status: 'approved' }).eq('id', pendingJob.id);
          await logBuzzEvent({ sessionId: pendingJob.session_id, jobId: pendingJob.id, chatId: pendingJob.chat_id, eventType: 'approved_by_message' });
          EdgeRuntime.waitUntil(executeBuzzCall(pendingJob.id).catch((err) => console.error('[buzz] execute failed:', err)));
          return true;
        }

        if (parsed.action === 'refine' && parsed.refinement_note) {
          // Rebuild the plan incorporating the feedback
          const revisedPlan = await parseCallPlan(`${pendingJob.request_text}\n\nRevision: ${parsed.refinement_note}`);
          const revisedPlace: PlaceCandidate = {
            name: pendingJob.merchant_name || '',
            phone: pendingJob.merchant_phone || '',
            address: pendingJob.merchant_address || '',
            placeId: pendingJob.google_place_id || '',
            mapsUri: pendingJob.google_maps_uri || '',
          };
          const newGoalPrompt = buildGoalPrompt(revisedPlan, revisedPlace);
          const newApprovalMessageId = await sendBuzzMessage(message.chatId, approvalText(revisedPlan, revisedPlace), message.messageId);
          await supabaseForPending.from('buzz_call_jobs').update({
            request_text: `${pendingJob.request_text}\n\nRevision: ${parsed.refinement_note}`,
            goal_prompt: newGoalPrompt,
            approval_message_id: newApprovalMessageId,
            metadata: { ...(pendingJob.metadata ?? {}), plan: revisedPlan },
          }).eq('id', pendingJob.id);
          return true;
        }

        if (parsed.action === 'ignore') {
          // Fall through to normal routing below
        }
      }
    }
  }

  const route = await routeBuzzTurn({ text, context, session });

  if (route.action === 'casual') {
    await sendBuzzMessage(message.chatId, route.reply || `I can help find places and make calls. Tell me what you're trying to work out.`, message.messageId);
    return true;
  }

  if (route.action === 'search_places') {
    const places = await searchPlaces(route.searchQuery || text, context);
    await getAdminClient()
      .from('buzz_sessions')
      .update({
        metadata: {
          ...getSessionMetadata(session),
          last_places: places,
          last_search_query: route.searchQuery || text,
          last_search_at: new Date().toISOString(),
        },
      })
      .eq('id', session.id);
    await sendBuzzMessage(message.chatId, formatPlaceSearchResponse(places, context), message.messageId);
    return true;
  }

  const selectedPlace = placeFromPreviousSelection(session, route.selectedPlaceIndex);
  const directPhone = extractDirectPhoneNumber(text) || (route.callTarget ? extractDirectPhoneNumber(route.callTarget) : null);
  const plan = await parseCallPlan(route.callObjective || text);
  const place = selectedPlace || (directPhone ? directPhonePlace(directPhone) : await lookupPlace({
    ...plan,
    merchantQuery: route.callTarget || plan.merchantQuery,
  }));
  if (!place) {
    await sendBuzzMessage(message.chatId, `**Buzz needs a phone number**\n\nI couldn't find a callable number for "${plan.merchantQuery}". Send the business name with suburb, or paste the number.`, message.messageId);
    return true;
  }

  const supabase = getAdminClient();
  const sessionMeta = getSessionMetadata(session) as Record<string, unknown>;
  const brandKey = typeof sessionMeta.brand_key === 'string' ? sessionMeta.brand_key.trim() : '';
  let goalPrompt = buildGoalPrompt(plan, place);
  if (brandKey) {
    goalPrompt = await enrichOutboundGoalWithKnowledge(supabase, brandKey, goalPrompt);
  }
  const { data: job, error } = await supabase
    .from('buzz_call_jobs')
    .insert({
      session_id: session.id,
      chat_id: message.chatId,
      user_handle: message.from,
      bot_number: message.conversation.fromNumber,
      request_text: text,
      merchant_query: plan.merchantQuery,
      merchant_name: place.name,
      merchant_phone: place.phone,
      merchant_address: place.address,
      google_place_id: place.placeId,
      google_maps_uri: place.mapsUri,
      goal_prompt: goalPrompt,
      status: 'drafted',
      metadata: { plan, direct_phone: Boolean(directPhone) },
    })
    .select('id, session_id, chat_id, user_handle, bot_number, request_text, merchant_query, merchant_name, merchant_phone, merchant_address, google_place_id, google_maps_uri, goal_prompt, approval_message_id, status, elevenlabs_conversation_id, twilio_call_sid, metadata')
    .single<BuzzCallJobRow>();
  if (error || !job) {
    console.error('[buzz] job insert failed:', error?.message);
    await sendBuzzMessage(message.chatId, `**Buzz hit an issue**\n\nI couldn't create the call plan. Try again in a moment.`, message.messageId);
    return true;
  }

  const approvalMessageId = await sendBuzzMessage(message.chatId, approvalText(plan, place), message.messageId);
  await supabase
    .from('buzz_call_jobs')
    .update({ status: 'awaiting_like', approval_message_id: approvalMessageId })
    .eq('id', job.id);
  await logBuzzEvent({ sessionId: session.id, jobId: job.id, chatId: message.chatId, eventType: 'approval_requested', payload: { approvalMessageId } });
  return true;
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function extractLinqReaction(event: WebhookEvent): {
  messageId: string;
  reactionType: string;
  operation: string;
  chatId: string;
  senderHandle: string;
} | null {
  const data = event.data as Record<string, unknown> | null;
  if (!data || !/reaction/i.test(event.event_type)) return null;
  const reaction = (data.reaction || data.message_reaction || data.tapback || {}) as Record<string, unknown>;
  const message = (data.message || data.target_message || {}) as Record<string, unknown>;
  const chat = (data.chat || {}) as Record<string, unknown>;
  const sender = (data.sender_handle || data.actor_handle || data.handle || {}) as Record<string, unknown>;
  return {
    messageId: pickString(data.message_id, data.target_message_id, data.messageId, message.id),
    reactionType: pickString(data.type, reaction.type, data.reaction_type, reaction.reaction_type).toLowerCase(),
    operation: pickString(data.operation, data.action, reaction.operation) || 'add',
    chatId: pickString(data.chat_id, chat.id),
    senderHandle: pickString(data.sender, sender.handle, data.sender_handle),
  };
}

export async function handleBuzzReaction(event: WebhookEvent): Promise<boolean> {
  if (!buzzEnabled()) return false;
  const parsed = extractLinqReaction(event);
  if (!parsed?.messageId || parsed.operation === 'remove') return false;
  if (parsed.reactionType !== 'like') return false;

  const supabase = getAdminClient();
  const { data: job, error } = await supabase
    .from('buzz_call_jobs')
    .select('id, session_id, chat_id, user_handle, bot_number, request_text, merchant_query, merchant_name, merchant_phone, merchant_address, google_place_id, google_maps_uri, goal_prompt, approval_message_id, status, elevenlabs_conversation_id, twilio_call_sid, metadata')
    .eq('approval_message_id', parsed.messageId)
    .eq('status', 'awaiting_like')
    .maybeSingle<BuzzCallJobRow>();
  if (error) {
    console.warn('[buzz] approval lookup failed:', error.message);
    return false;
  }
  if (!job) return false;

  await supabase.from('buzz_call_jobs').update({ status: 'approved' }).eq('id', job.id);
  await logBuzzEvent({ sessionId: job.session_id, jobId: job.id, chatId: job.chat_id, eventType: 'approved_by_like', payload: parsed });
  EdgeRuntime.waitUntil(executeBuzzCall(job.id).catch((err) => console.error('[buzz] execute failed:', err)));
  return true;
}

async function getElevenLabsPhoneNumberId(): Promise<string> {
  const agentId = getOptionalEnv('ELEVENLABS_AGENT_ID') || BUZZ_AGENT_ID;
  return resolvePhoneNumberId(agentId);
}

export async function executeBuzzCall(jobId: string): Promise<void> {
  const supabase = getAdminClient();
  const { data: job, error } = await supabase
    .from('buzz_call_jobs')
    .select('id, session_id, chat_id, user_handle, bot_number, request_text, merchant_query, merchant_name, merchant_phone, merchant_address, google_place_id, google_maps_uri, goal_prompt, approval_message_id, status, elevenlabs_conversation_id, twilio_call_sid, metadata')
    .eq('id', jobId)
    .single<BuzzCallJobRow>();
  if (error || !job) throw new Error(error?.message || 'Buzz job not found');
  if (!job.merchant_phone || !job.goal_prompt) throw new Error('Buzz job missing phone or goal prompt');

  await supabase.from('buzz_call_jobs').update({ status: 'calling' }).eq('id', job.id);
  const apiKey = getOptionalEnv('ELEVENLABS_API_KEY');
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not configured');
  const agentId = getOptionalEnv('ELEVENLABS_AGENT_ID') || BUZZ_AGENT_ID;
  const sipPhoneNumberId = getOptionalEnv('ELEVENLABS_SIP_AGENT_PHONE_NUMBER_ID');
  const phoneNumberId = sipPhoneNumberId || await getElevenLabsPhoneNumberId();
  const toNumber = normalisePhoneNumber(job.merchant_phone) ?? job.merchant_phone;
  let outbound: Awaited<ReturnType<typeof startElevenLabsOutboundCall>>;
  try {
    outbound = await startElevenLabsOutboundCall({
      agentId,
      phoneNumberId,
      toNumber,
      firstMessage: '',
      dynamicVariables: {
        buzz_job_id: job.id,
        merchant_name: job.merchant_name,
        merchant_phone: job.merchant_phone,
        user_request: job.request_text,
        goal: job.goal_prompt,
      },
      sipPhoneNumberId,
    });
  } catch (err) {
    const reason = (err as Error).message;
    await supabase.from('buzz_call_jobs').update({ status: 'failed', failure_reason: reason }).eq('id', job.id);
    await sendBuzzMessage(job.chat_id, `**Buzz couldn't start the call**\n\n${reason}`);
    return;
  }
  await supabase.from('buzz_call_jobs').update({
    status: 'calling',
    elevenlabs_conversation_id: outbound.conversationId,
    twilio_call_sid: outbound.callSid,
    metadata: {
      ...(job.metadata ?? {}),
      elevenlabs_response: outbound.raw,
      telephony_provider: outbound.telephonyProvider,
      sip_call_id: outbound.sipCallId,
    },
  }).eq('id', job.id);
  await logBuzzEvent({
    sessionId: job.session_id,
    jobId: job.id,
    chatId: job.chat_id,
    eventType: 'call_created',
    payload: outbound.raw,
  });
  await sendBuzzMessage(job.chat_id, `Calling now ✓`);
}

function conversationSummary(data: Record<string, unknown>): {
  status: BuzzJobStatus;
  summary: Record<string, unknown>;
  recordingUrl: string | null;
} {
  const analysis = (data.analysis || {}) as Record<string, unknown>;
  const metadata = (data.metadata || {}) as Record<string, unknown>;
  const transcript = Array.isArray(data.transcript) ? data.transcript as Array<Record<string, unknown>> : [];
  const hasAudio = Boolean(data.has_audio);
  return {
    status: data.status === 'done' ? 'completed' : data.status === 'failed' ? 'failed' : 'calling',
    summary: {
      outcome_summary: String(analysis.transcript_summary || 'Call finished, but ElevenLabs did not return a transcript summary.'),
      call_successful: analysis.call_successful ?? null,
      transcript: transcript.map((t) => ({ role: t.role, message: t.message, time_in_call_secs: t.time_in_call_secs })),
      metadata,
    },
    recordingUrl: hasAudio && typeof data.conversation_id === 'string'
      ? `https://api.elevenlabs.io/v1/convai/conversations/${data.conversation_id}/audio`
      : null,
  };
}

async function fetchTwilioRecordingMp3Url(callSid: string): Promise<string | null> {
  const sid = getOptionalEnv('TWILIO_ACCOUNT_SID');
  const token = getOptionalEnv('TWILIO_AUTH_TOKEN');
  if (!sid || !token || !callSid) return null;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      // List at account level filtered by CallSid (child resource path can miss ElevenLabs-created recordings)
      const listRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Recordings.json?CallSid=${encodeURIComponent(callSid)}&PageSize=1`,
        { headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}` } },
      );
      if (listRes.ok) {
        const listData = await listRes.json() as { recordings?: Array<{ sid: string; status?: string }> };
        const rec = listData.recordings?.find((r) => r.status === 'completed') || listData.recordings?.[0];
        if (rec?.sid) {
          return `https://${encodeURIComponent(sid)}:${encodeURIComponent(token)}@api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Recordings/${encodeURIComponent(rec.sid)}.mp3`;
        }
      }
    } catch {
      // retry below
    }
    if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  return null;
}

function extractTwilioCallSidFromSummary(summary: Record<string, unknown>): string | null {
  const metadata = summary.metadata as Record<string, unknown> | undefined;
  const phoneCall = metadata?.phone_call as Record<string, unknown> | undefined;
  return typeof phoneCall?.call_sid === 'string' && phoneCall.call_sid.trim()
    ? phoneCall.call_sid.trim()
    : null;
}

async function completeJobFromConversation(job: BuzzCallJobRow, data: Record<string, unknown>): Promise<void> {
  const supabase = getAdminClient();
  const result = conversationSummary(data);
  const conversationId = typeof data.conversation_id === 'string' ? data.conversation_id : job.elevenlabs_conversation_id;
  const callSid = job.twilio_call_sid || extractTwilioCallSidFromSummary(result.summary);
  const proxyRecordingUrl = result.recordingUrl && conversationId
    ? await buildConversationRecordingProxyUrl(conversationId, 'buzz-recording-audio')
    : null;
  await supabase.from('buzz_call_jobs').update({
    status: result.status,
    completed_at: result.status === 'completed' || result.status === 'failed' ? new Date().toISOString() : null,
    summary: result.summary,
    recording_url: proxyRecordingUrl || result.recordingUrl,
    twilio_call_sid: callSid,
    failure_reason: result.status === 'failed' ? 'ElevenLabs conversation failed' : null,
  }).eq('id', job.id);
  await logBuzzEvent({ sessionId: job.session_id, jobId: job.id, chatId: job.chat_id, eventType: 'call_completed', payload: { status: result.status } });

  const outcome = String(result.summary.outcome_summary || 'Call complete.');
  await sendBuzzMessage(job.chat_id, `**Buzz call complete**\n\n**Called:** ${job.merchant_name || job.merchant_phone}\n\n**Outcome:** ${outcome}`);

  // Send Twilio call recording as an iMessage voice memo
  const mp3Url = callSid ? await fetchTwilioRecordingMp3Url(callSid) : null;
  const voiceMemoUrl = mp3Url || proxyRecordingUrl;
  if (voiceMemoUrl) {
    try {
      await linqApi.sendVoiceMemo(job.chat_id, voiceMemoUrl);
    } catch (err) {
      console.warn('[buzz] voice memo send failed:', (err as Error).message);
    }
  } else {
    console.warn('[buzz] no recording URL available for voice memo', { jobId: job.id, callSid, conversationId });
  }
}

export async function handleElevenLabsPostCall(payload: Record<string, unknown>): Promise<boolean> {
  const data = (payload.data || payload) as Record<string, unknown>;
  const conversationId = typeof data.conversation_id === 'string' ? data.conversation_id : '';
  if (!conversationId) return false;
  const supabase = getAdminClient();
  const { data: job, error } = await supabase
    .from('buzz_call_jobs')
    .select('id, session_id, chat_id, user_handle, bot_number, request_text, merchant_query, merchant_name, merchant_phone, merchant_address, google_place_id, google_maps_uri, goal_prompt, approval_message_id, status, elevenlabs_conversation_id, twilio_call_sid, metadata')
    .eq('elevenlabs_conversation_id', conversationId)
    .maybeSingle<BuzzCallJobRow>();
  if (!error && job) {
    await completeJobFromConversation(job, data);
    return true;
  }
  return await handleNestOutboundPostCall(payload);
}

export async function pollBuzzCalls(limit = 25): Promise<{ processed: number }> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('buzz_call_jobs')
    .select('id, session_id, chat_id, user_handle, bot_number, request_text, merchant_query, merchant_name, merchant_phone, merchant_address, google_place_id, google_maps_uri, goal_prompt, approval_message_id, status, elevenlabs_conversation_id, twilio_call_sid, metadata')
    .in('status', ['approved', 'calling', 'connected'])
    .order('updated_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  let processed = 0;
  for (const job of (data ?? []) as BuzzCallJobRow[]) {
    processed++;
    if (job.status === 'approved') {
      await executeBuzzCall(job.id);
      continue;
    }
    if (job.twilio_call_sid && job.status === 'calling') {
      const twilioStatus = await fetchTwilioCallStatus(job.twilio_call_sid);
      if (twilioStatus === 'in-progress') {
        await supabase.from('buzz_call_jobs').update({ status: 'connected', connected_at: new Date().toISOString() }).eq('id', job.id);
      } else if (twilioStatus && ['busy', 'failed', 'no-answer', 'canceled'].includes(twilioStatus)) {
        await supabase.from('buzz_call_jobs').update({ status: 'no_answer', completed_at: new Date().toISOString(), failure_reason: twilioStatus }).eq('id', job.id);
        await sendBuzzMessage(job.chat_id, `**Buzz couldn't reach them**\n\nThe call ended with status: ${twilioStatus}.`);
        continue;
      }
    }
    if (job.elevenlabs_conversation_id) {
      const conversation = await fetchElevenLabsConversation(job.elevenlabs_conversation_id);
      const status = String(conversation.status || '');
      if (status === 'done' || status === 'failed') {
        await completeJobFromConversation(job, conversation);
      }
    }
  }
  const nestResult = await pollNestOutboundCalls(limit);
  return { processed: processed + nestResult.processed };
}
