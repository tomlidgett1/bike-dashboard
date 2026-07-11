// ═══════════════════════════════════════════════════════════════
// Gemini REST API client — uses fetch directly for Deno compat
// ═══════════════════════════════════════════════════════════════

import type { BrandApiDebugCollector } from '../brand-api-debug.ts';
import { redactForLog, truncateForLog } from '../brand-api-debug.ts';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_TIMEOUT_MS = 60_000;

export function getGeminiApiKey(): string {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY not set');
  return key;
}

export function isGeminiModel(model: string): boolean {
  return model.startsWith('gemini-');
}

// ═══════════════════════════════════════════════════════════════
// Types — Gemini REST API shapes
// ═══════════════════════════════════════════════════════════════

export interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  thoughtSignature?: string;
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface GeminiTool {
  functionDeclarations?: GeminiFunctionDeclaration[];
  googleSearch?: Record<string, never>;
}

// Unified response shape that the agent loop can consume
export interface GeminiUnifiedResponse {
  outputText: string;
  functionCalls: Array<{
    callId: string;
    name: string;
    arguments: string;
  }>;
  usage: { inputTokens: number; outputTokens: number; cachedTokens: number };
  status: 'completed' | 'incomplete';
  rawModelParts: GeminiPart[];
}

export interface GeminiGroundingSource {
  title: string;
  url: string;
  domain: string;
  snippet?: string;
}

export interface GeminiGroundedSearchResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  sources: GeminiGroundingSource[];
}

// ═══════════════════════════════════════════════════════════════
// Gemini explicit context caching — cachedContents API
//
// Caches large static prompts (system instructions, tool defs)
// to reduce per-request input token cost and latency.
// Min 1024 tokens for Flash, 4096 for Pro models.
// ═══════════════════════════════════════════════════════════════

interface CachedContentEntry {
  name: string;        // e.g. "cachedContents/abc123"
  model: string;
  expiresAt: number;   // epoch ms
  contentHash: string; // to detect stale caches
}

// In-memory index of active caches (edge function lifetime)
const _cacheIndex = new Map<string, CachedContentEntry>();

function hashContent(text: string): string {
  // Fast djb2 hash — sufficient for change detection
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

/**
 * Create or reuse a Gemini CachedContent for the given system prompt.
 * Returns the cache name (e.g. "cachedContents/xyz") or null if the
 * prompt is too short or creation fails.
 *
 * @param cacheKey  Logical key for dedup (e.g. "classifier", "brand:ash")
 * @param model     Gemini model name (e.g. "gemini-3-flash-preview")
 * @param systemPrompt  The static system instruction text to cache
 * @param tools     Optional tool declarations to include in the cache
 * @param ttlSeconds  Cache TTL (default 300 = 5 minutes)
 */
export async function getOrCreateGeminiCache(opts: {
  cacheKey: string;
  model: string;
  systemPrompt: string;
  tools?: GeminiTool[];
  ttlSeconds?: number;
  brandApiDebug?: BrandApiDebugCollector;
}): Promise<string | null> {
  const { cacheKey, model, systemPrompt, tools, ttlSeconds = 300, brandApiDebug } = opts;
  const contentHash = hashContent(systemPrompt + JSON.stringify(tools ?? []));

  // Check in-memory index first
  const existing = _cacheIndex.get(cacheKey);
  if (existing && existing.contentHash === contentHash && existing.expiresAt > Date.now() + 30_000) {
    return existing.name;
  }

  // Rough token estimate — skip if clearly under minimum
  const estimatedTokens = Math.ceil(systemPrompt.length / 4);
  if (estimatedTokens < 900) {
    return null; // Too short to cache
  }

  const apiKey = getGeminiApiKey();
  const url = `${GEMINI_API_BASE}/cachedContents?key=${apiKey}`;

  // deno-lint-ignore no-explicit-any
  const body: Record<string, any> = {
    model: `models/${model}`,
    displayName: cacheKey,
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    ttl: `${ttlSeconds}s`,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const t0 = Date.now();
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      brandApiDebug?.record({
        service: 'gemini',
        operation: `POST /v1beta/cachedContents (create ${cacheKey})`,
        duration_ms: Date.now() - t0,
        http_status: resp.status,
        request: redactForLog(body),
        error: truncateForLog(errBody, 4000),
      });
      // Don't fail the request — just skip caching
      console.warn(`[gemini-cache] failed to create cache "${cacheKey}": ${resp.status} ${errBody.substring(0, 200)}`);
      return null;
    }

    // deno-lint-ignore no-explicit-any
    const data: any = await resp.json();
    const cacheName = data.name as string;
    const expiresAt = Date.now() + ttlSeconds * 1000;

    _cacheIndex.set(cacheKey, { name: cacheName, model, expiresAt, contentHash });
    brandApiDebug?.record({
      service: 'gemini',
      operation: `POST /v1beta/cachedContents (create ${cacheKey})`,
      duration_ms: Date.now() - t0,
      http_status: resp.status,
      request: {
        model: body.model,
        displayName: body.displayName,
        ttl: body.ttl,
        systemInstruction_chars: systemPrompt.length,
        tools_present: Boolean(tools && tools.length > 0),
      },
      response: redactForLog(data),
    });
    console.log(`[gemini-cache] created cache "${cacheKey}" → ${cacheName} (ttl=${ttlSeconds}s, ~${estimatedTokens} tokens)`);
    return cacheName;
  } catch (err) {
    brandApiDebug?.record({
      service: 'gemini',
      operation: `POST /v1beta/cachedContents (create ${cacheKey})`,
      duration_ms: Date.now() - t0,
      error: (err as Error).message,
    });
    console.warn(`[gemini-cache] cache creation error for "${cacheKey}":`, (err as Error).message);
    return null;
  }
}

/**
 * Delete a cached content by name (cleanup).
 */
export async function deleteGeminiCache(cacheName: string): Promise<void> {
  try {
    const apiKey = getGeminiApiKey();
    await fetch(`${GEMINI_API_BASE}/${cacheName}?key=${apiKey}`, { method: 'DELETE' });
    // Remove from index
    for (const [key, entry] of _cacheIndex) {
      if (entry.name === cacheName) {
        _cacheIndex.delete(key);
        break;
      }
    }
  } catch { /* best effort */ }
}

// ═══════════════════════════════════════════════════════════════
// Format converters — OpenAI shapes → Gemini shapes
// ═══════════════════════════════════════════════════════════════

// Convert OpenAI-style message history to Gemini contents
export function toGeminiContents(
  messages: Array<{ role: string; content?: string | unknown[] }>,
): GeminiContent[] {
  const contents: GeminiContent[] = [];

  for (const msg of messages) {
    // Skip system messages (handled via systemInstruction)
    if (msg.role === 'system') continue;

    // Handle function_call_output items from tool execution
    if ((msg as Record<string, unknown>).type === 'function_call_output') {
      const fco = msg as unknown as { call_id: string; output: string; _gemini_fn_name?: string };
      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: fco._gemini_fn_name ?? `fn_${fco.call_id}`,
            response: safeParseJson(fco.output),
          },
        }],
      });
      continue;
    }

    // Handle function_call items from model output (fed back into input)
    if ((msg as Record<string, unknown>).type === 'function_call') {
      const fc = msg as unknown as { name: string; arguments: string; call_id: string; thoughtSignature?: string };
      const parts: GeminiPart[] = [{
        functionCall: {
          name: fc.name,
          args: safeParseJsonObj(fc.arguments),
        },
      }];
      if (fc.thoughtSignature) {
        parts[0].thoughtSignature = fc.thoughtSignature;
      }
      contents.push({ role: 'model', parts });
      continue;
    }

    // Handle web_search_call items — skip (Gemini doesn't have this)
    if ((msg as Record<string, unknown>).type === 'web_search_call') continue;

    // Standard text messages
    const role: 'user' | 'model' = msg.role === 'assistant' ? 'model' : 'user';
    let textContent = '';

    if (typeof msg.content === 'string') {
      textContent = msg.content;
    } else if (Array.isArray(msg.content)) {
      // Extract text from content parts (InputContentPart[])
      for (const part of msg.content) {
        if (typeof part === 'string') {
          textContent += part;
        } else if (part && typeof part === 'object') {
          const p = part as Record<string, unknown>;
          if (p.type === 'input_text' && typeof p.text === 'string') {
            textContent += p.text;
          } else if (p.text && typeof p.text === 'string') {
            textContent += p.text;
          }
        }
      }
    }

    if (!textContent) continue;

    // Merge consecutive same-role messages (Gemini requires alternating roles)
    const last = contents[contents.length - 1];
    if (last && last.role === role && last.parts.every(p => p.text !== undefined)) {
      last.parts.push({ text: textContent });
    } else {
      contents.push({ role, parts: [{ text: textContent }] });
    }
  }

  return contents;
}

// Convert tool results (FunctionCallOutput[]) to Gemini format
// We need the function name for each call_id, so we accept a name map
export function toGeminiFunctionResponses(
  toolResults: Array<{ type: string; call_id: string; output: string }>,
  callIdToName: Map<string, string>,
): GeminiContent {
  const parts: GeminiPart[] = toolResults.map(tr => ({
    functionResponse: {
      name: callIdToName.get(tr.call_id) ?? `fn_${tr.call_id}`,
      response: safeParseJson(tr.output),
    },
  }));
  return { role: 'user', parts };
}

// Convert model's function call parts back to Gemini content for the next round
export function modelPartsToGeminiContent(parts: GeminiPart[]): GeminiContent {
  return { role: 'model', parts };
}

function safeParseJson(s: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(s);
    return typeof parsed === 'object' && parsed !== null ? parsed : { result: s };
  } catch {
    return { result: s };
  }
}

function safeParseJsonObj(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

// ═══════════════════════════════════════════════════════════════
// Core API call
// ═══════════════════════════════════════════════════════════════

let _callIdCounter = 0;

export type GeminiToolChoice =
  | string
  | { type: 'function'; name: string };

export async function geminiGenerateContent(opts: {
  model: string;
  systemPrompt: string;
  contents: GeminiContent[];
  tools?: GeminiTool[];
  toolChoice?: GeminiToolChoice;
  maxOutputTokens: number;
  /** Sampling temperature (0..2). Default left to model. Bump for variety. */
  temperature?: number;
  /** If provided, references a cachedContents resource. System prompt and tools
   *  are served from the cache — do NOT duplicate them in the request body. */
  cachedContent?: string;
  brandApiDebug?: BrandApiDebugCollector;
}): Promise<GeminiUnifiedResponse> {
  const apiKey = getGeminiApiKey();
  const url = `${GEMINI_API_BASE}/models/${opts.model}:generateContent?key=${apiKey}`;

  // Build request body
  // deno-lint-ignore no-explicit-any
  const body: Record<string, any> = {
    contents: opts.contents,
    generationConfig: {
      maxOutputTokens: opts.maxOutputTokens,
      ...(typeof opts.temperature === 'number' ? { temperature: opts.temperature } : {}),
    },
  };

  if (opts.cachedContent) {
    // When using a cache, system instruction and tools are already in the cache.
    // Only pass the cachedContent reference + new user contents.
    body.cachedContent = opts.cachedContent;
  } else {
    // No cache — include system prompt and tools inline as before
    if (opts.systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: opts.systemPrompt }],
      };
    }

    if (opts.tools && opts.tools.length > 0) {
      body.tools = opts.tools;
    }
  }

  if (
    typeof opts.toolChoice === 'object' &&
    opts.toolChoice?.type === 'function' &&
    opts.toolChoice.name
  ) {
    body.toolConfig = {
      functionCallingConfig: {
        mode: 'ANY',
        allowedFunctionNames: [opts.toolChoice.name],
      },
    };
  } else if (opts.toolChoice === 'required') {
    body.toolConfig = {
      functionCallingConfig: { mode: 'ANY' },
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  const dbg = opts.brandApiDebug;
  const genT0 = Date.now();

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      dbg?.record({
        service: 'gemini',
        operation: `POST /v1beta/models/${opts.model}:generateContent`,
        duration_ms: Date.now() - genT0,
        http_status: resp.status,
        request: redactForLog(body),
        error: truncateForLog(errBody, 8000),
      });
      throw new Error(`Gemini API ${resp.status}: ${errBody.substring(0, 500)}`);
    }

    // deno-lint-ignore no-explicit-any
    const data: any = await resp.json();

    // Parse response
    const candidate = data.candidates?.[0];
    if (!candidate) {
      throw new Error('Gemini returned no candidates');
    }

    const parts: GeminiPart[] = candidate.content?.parts ?? [];
    let outputText = '';
    const functionCalls: GeminiUnifiedResponse['functionCalls'] = [];

    for (const part of parts) {
      if (part.text) {
        outputText += part.text;
      }
      if (part.functionCall) {
        _callIdCounter++;
        const callId = `gemini_call_${_callIdCounter}_${Date.now()}`;
        functionCalls.push({
          callId,
          name: part.functionCall.name,
          arguments: JSON.stringify(part.functionCall.args ?? {}),
        });
      }
    }

    const usage = data.usageMetadata ?? {};
    const inputTokens = usage.promptTokenCount ?? 0;
    const outputTokens = usage.candidatesTokenCount ?? 0;
    const cachedTokens = usage.cachedContentTokenCount ?? 0;

    if (cachedTokens > 0) {
      console.log(`[gemini] cache hit: ${cachedTokens} cached tokens out of ${inputTokens} input tokens`);
    }

    const finishReason = candidate.finishReason;
    const status: 'completed' | 'incomplete' =
      finishReason === 'MAX_TOKENS' ? 'incomplete' : 'completed';

    dbg?.record({
      service: 'gemini',
      operation: `POST /v1beta/models/${opts.model}:generateContent`,
      duration_ms: Date.now() - genT0,
      http_status: 200,
      request: {
        cachedContent: opts.cachedContent ?? null,
        contents_count: opts.contents.length,
        system_prompt_chars: opts.cachedContent ? 0 : opts.systemPrompt.length,
        maxOutputTokens: opts.maxOutputTokens,
        tools_present: Boolean(opts.tools && opts.tools.length > 0),
        body_snapshot: truncateForLog(JSON.stringify(redactForLog(body)), 48_000),
      },
      response: {
        usageMetadata: data.usageMetadata ?? null,
        finishReason,
        outputText_chars: outputText.length,
        functionCalls_count: functionCalls.length,
        raw_json: truncateForLog(JSON.stringify(redactForLog(data)), 96_000),
      },
    });

    return {
      outputText,
      functionCalls,
      usage: { inputTokens, outputTokens, cachedTokens },
      status,
      rawModelParts: parts,
    };
  } catch (e) {
    opts.brandApiDebug?.record({
      service: 'gemini',
      operation: `POST /v1beta/models/${opts.model}:generateContent`,
      duration_ms: Date.now() - genT0,
      request: { body_snapshot: truncateForLog(JSON.stringify(redactForLog(body)), 24_000) },
      error: (e as Error).message,
    });
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ═══════════════════════════════════════════════════════════════
// Grounded web search — uses googleSearch tool in a dedicated call
// Returns search results text that can be fed back as tool output
// ═══════════════════════════════════════════════════════════════

export async function geminiGroundedSearch(opts: {
  model: string;
  query: string;
  conversationContext?: string;
}): Promise<GeminiGroundedSearchResult> {
  function extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "unknown";
    }
  }

  function extractGroundingSources(
    grounding: Record<string, unknown> | undefined,
  ): GeminiGroundingSource[] {
    if (!grounding) return [];

    const chunks = Array.isArray(grounding.groundingChunks)
      ? grounding.groundingChunks
      : [];
    const supports = Array.isArray(grounding.groundingSupports)
      ? grounding.groundingSupports
      : [];

    const snippetByChunk = new Map<number, string[]>();
    for (const support of supports) {
      const supportRecord = support && typeof support === "object"
        ? support as Record<string, unknown>
        : null;
      if (!supportRecord) continue;

      const segment = supportRecord.segment &&
          typeof supportRecord.segment === "object"
        ? supportRecord.segment as Record<string, unknown>
        : null;
      const segmentText = typeof segment?.text === "string"
        ? segment.text.trim()
        : "";
      if (!segmentText) continue;

      const indices = Array.isArray(supportRecord.groundingChunkIndices)
        ? supportRecord.groundingChunkIndices
        : [];
      for (const idx of indices) {
        if (typeof idx !== "number") continue;
        const snippets = snippetByChunk.get(idx) ?? [];
        snippets.push(segmentText);
        snippetByChunk.set(idx, snippets);
      }
    }

    const deduped = new Map<string, GeminiGroundingSource>();
    for (const [index, chunk] of chunks.entries()) {
      const chunkRecord = chunk && typeof chunk === "object"
        ? chunk as Record<string, unknown>
        : null;
      const web = chunkRecord?.web && typeof chunkRecord.web === "object"
        ? chunkRecord.web as Record<string, unknown>
        : null;
      const url = typeof web?.uri === "string" ? web.uri.trim() : "";
      if (!url) continue;

      const title = typeof web?.title === "string" && web.title.trim()
        ? web.title.trim()
        : extractDomain(url);
      const snippet = snippetByChunk.get(index)?.join(" ").trim();
      const key = `${extractDomain(url)}:${title.toLowerCase()}:${url}`;
      if (!deduped.has(key)) {
        deduped.set(key, {
          title,
          url,
          domain: extractDomain(url),
          ...(snippet ? { snippet } : {}),
        });
      }
    }

    return [...deduped.values()];
  }

  const apiKey = getGeminiApiKey();
  const url = `${GEMINI_API_BASE}/models/${opts.model}:generateContent?key=${apiKey}`;

  const userPrompt = opts.conversationContext
    ? `Based on this conversation context: ${opts.conversationContext}\n\nSearch the web for: ${opts.query}`
    : opts.query;

  const body = {
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    tools: [{ googleSearch: {} }],
    generationConfig: { maxOutputTokens: 2048 },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`Gemini search API ${resp.status}: ${errBody.substring(0, 300)}`);
    }

    // deno-lint-ignore no-explicit-any
    const data: any = await resp.json();
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    let text = '';
    for (const part of parts) {
      if (part.text) text += part.text;
    }

    // Also extract grounding metadata if available
    const grounding = candidate?.groundingMetadata &&
        typeof candidate.groundingMetadata === "object"
      ? candidate.groundingMetadata as Record<string, unknown>
      : undefined;
    const sources = extractGroundingSources(grounding);

    const usage = data.usageMetadata ?? {};
    return {
      text: text || 'No search results found.',
      inputTokens: usage.promptTokenCount ?? 0,
      outputTokens: usage.candidatesTokenCount ?? 0,
      sources,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ═══════════════════════════════════════════════════════════════
// Simple text-only helper for standalone callers
// ═══════════════════════════════════════════════════════════════

export async function geminiSimpleText(opts: {
  model: string;
  systemPrompt: string;
  userMessage: string;
  maxOutputTokens?: number;
  /** Sampling temperature (0..2). Default left to model. */
  temperature?: number;
  /** Optional cachedContent name to use instead of re-sending systemPrompt */
  cachedContent?: string;
  brandApiDebug?: BrandApiDebugCollector;
}): Promise<{ text: string; inputTokens: number; outputTokens: number; cachedTokens: number }> {
  const result = await geminiGenerateContent({
    model: opts.model,
    systemPrompt: opts.systemPrompt,
    contents: [{ role: 'user', parts: [{ text: opts.userMessage }] }],
    maxOutputTokens: opts.maxOutputTokens ?? 1024,
    temperature: opts.temperature,
    cachedContent: opts.cachedContent,
    brandApiDebug: opts.brandApiDebug,
  });
  return {
    text: result.outputText,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    cachedTokens: result.usage.cachedTokens,
  };
}
